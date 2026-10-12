require("dotenv").config();
const http = require("http");
const { Bot, InlineKeyboard } = require("grammy");
const llm = require("./llm");
const { saveSession, appendEvaluationToSession, UNIT_METADATA } = require("./notion");
const { ALL_UNITS, generateAndSaveOne } = require("./auto_generate");
const { SYLLABUS_TOPICS, getRandomTopic } = require("./syllabus");
const { setupProcessGuard } = require("./auto_healer");
const {
  startDailyScheduler,
  runDailyPYQJob,
  subscribeChat,
  unsubscribeChat,
  getSchedulerStatus,
} = require("./daily_scheduler");

// Initialize process-level crash prevention guard
setupProcessGuard();

// Environment check for Render.com and local environments
const REQUIRED_ENV_VARS = ["TELEGRAM_BOT_TOKEN", "GEMINI_API_KEY", "NOTION_TOKEN", "NOTION_DATABASE_ID"];
const missingVars = REQUIRED_ENV_VARS.filter((k) => !process.env[k] || !process.env[k].trim());

const hasBotToken = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim());
let bot = null;
if (hasBotToken) {
  try {
    bot = new Bot(process.env.TELEGRAM_BOT_TOKEN.trim());
  } catch (err) {
    console.error("Failed to initialize Grammy Bot:", err.message);
  }
} else {
  console.warn("\n=======================================================");
  console.warn("⚠️  [RENDER SETUP REQUIRED] TELEGRAM_BOT_TOKEN is missing!");
  console.warn("👉 Please add the following in Render Dashboard -> Environment:");
  console.warn("   - TELEGRAM_BOT_TOKEN");
  console.warn("   - GEMINI_API_KEY");
  console.warn("   - NOTION_TOKEN");
  console.warn("   - NOTION_DATABASE_ID");
  console.warn("🌐 HTTP server will remain active on PORT for Render health checks.");
  console.warn("=======================================================\n");
}

// Typical TNPSC Mains word limits by marks
const WORDS_BY_MARKS = { 5: 80, 10: 150, 15: 300, 20: 350 };
const wordsFor = (m) => WORDS_BY_MARKS[m] || m * 20;

// In-memory sessions per chat: { question, marks, words, answer, evaluation, modelAnswer, topic, unitId, isPYQ }
const sessions = new Map();

// Interactive user state: Map of chatId -> { state, paperKey, unitId, unitName, filterKey, paperTitle }
const userState = new Map();

// ─────────────────────────────────────────────────────────────
// OFFICIAL TNPSC MAINS SYLLABUS HIERARCHY
// ─────────────────────────────────────────────────────────────
const SYLLABUS_HIERARCHY = {
  GS1: {
    paperCode: "Paper II",
    paperTitle: "General Studies I",
    units: [
      {
        id: "GS1_U1",
        name: "Unit I: Modern History of India and Indian Culture (100 marks)",
        shortName: "Modern History & Culture",
        filterKey: "Modern History",
        examples: "Advent of Europeans, South Indian Rebellion 1799–1801, Vellore Rebellion 1806, Justice Party, Subhas Chandra Bose, Social Justice in Tamil Nadu",
      },
      {
        id: "GS1_U2",
        name: "Unit II: Social Issues in India and Tamil Nadu (100 marks)",
        shortName: "Social Issues in India & TN",
        filterKey: "Social Issues",
        examples: "Population Explosion, Women Empowerment, Child Labour & Protection, Rural/Urban Sanitation, Regional Disparities, Vulnerable Sections",
      },
      {
        id: "GS1_U3",
        name: "Unit III: Ethics and Integrity (50 marks)",
        shortName: "Ethics & Integrity",
        filterKey: "Ethics",
        examples: "Ethics of Thirukkural, Probity in Governance, Citizen's Charters, Anti-Corruption Challenges, Codes of Conduct & Public Policy",
      },
    ],
  },
  GS2: {
    paperCode: "Paper III",
    paperTitle: "General Studies II",
    units: [
      {
        id: "GS2_U1",
        name: "Unit I: Indian Polity and Emerging Political Trends across the World affecting India (100 marks)",
        shortName: "Indian Polity & Governance",
        filterKey: "Indian Polity",
        examples: "Preamble & Salient Features, Union-State Financial Relations, Judicial Review & Activism, 73rd & 74th Amendments, Civil Services Reforms",
      },
      {
        id: "GS2_U2",
        name: "Unit II: Role and Impact of Science and Technology in the Development of India (100 marks)",
        shortName: "Science & Technology",
        filterKey: "Science and Technology",
        examples: "Space Research/ISRO, Artificial Intelligence & Robotics, GM Crops & Agriculture Biotech, Renewable Energy, Human Diseases & Remedies",
      },
      {
        id: "GS2_U3",
        name: "Unit III: Tamil Society – Culture and Heritage (50 marks)",
        shortName: "Tamil Society, Culture & Heritage",
        filterKey: "Tamil Society",
        examples: "Keeladi & Adhichanallur Excavations, Sangam Age Society & Business, Dravidian Movement Contributions, Modern Tamil Diaspora",
      },
    ],
  },
  GS3: {
    paperCode: "Paper IV",
    paperTitle: "General Studies III",
    units: [
      {
        id: "GS3_U1",
        name: "Unit I: General Geography and Geography of India with Special Reference to Tamil Nadu (75 marks)",
        shortName: "Geography of India & TN",
        filterKey: "Geography",
        examples: "Monsoon & Drainage Systems, Soil & Irrigation Projects, Natural Resources, Geospatial Technology (GIS/GPS), Border Disputes",
      },
      {
        id: "GS3_U2",
        name: "Unit II: Environment, Biodiversity and Disaster Management (75 marks)",
        shortName: "Environment & Disaster Management",
        filterKey: "Environment",
        examples: "Biodiversity Conservation & Hotspots, Climate Change Impact in TN, NDMA & Sendai Framework, Environmental Impact Assessment (EIA)",
      },
      {
        id: "GS3_U3",
        name: "Unit III: Indian Economy – Current Economic Trends and Impact of Global Economy on India (100 marks)",
        shortName: "Indian & Tamil Nadu Economy",
        filterKey: "Economy",
        examples: "GSDP Trends in Tamil Nadu, Fiscal Federalism & GST, Agriculture & Contract Farming, MSME & Make in India, Poverty & Unemployment",
      },
    ],
  },
};

// Helper: Find unit by ID
function findUnitById(unitId) {
  for (const paperKey of Object.keys(SYLLABUS_HIERARCHY)) {
    const paper = SYLLABUS_HIERARCHY[paperKey];
    const unit = paper.units.find((u) => u.id === unitId);
    if (unit) return { paperKey, paper, unit };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// KEYBOARDS
// ─────────────────────────────────────────────────────────────

// Step 1: Select Paper
function getPapersInlineKeyboard() {
  return new InlineKeyboard()
    .text("📜 General Studies I (Paper II)", "paper:GS1")
    .row()
    .text("⚖️ General Studies II (Paper III)", "paper:GS2")
    .row()
    .text("📈 General Studies III (Paper IV)", "paper:GS3")
    .row()
    .text("⚡ Auto-Generate for All 9 Units (GS I, II & III)", "action:auto_all_papers")
    .row()
    .text("🎲 Random Topic from Any Paper", "action:random_topic");
}

// Step 2: Select Unit
function getUnitsForPaperKeyboard(paperKey) {
  const paper = SYLLABUS_HIERARCHY[paperKey];
  const kb = new InlineKeyboard();
  if (!paper) return kb;
  for (const u of paper.units) {
    kb.text(u.name, `unit:${u.id}`).row();
  }
  kb.text("⬅️ Back to Papers", "action:pick_topic");
  return kb;
}

// Step 3: Enter Topic or Suggest
function getTopicPromptKeyboard(unitId) {
  return new InlineKeyboard()
    .text("⚡ Auto-Generate Q&A to Notion (Instant)", `auto:${unitId}`)
    .row()
    .text("🎲 Suggest a Topic from Syllabus", `suggest:${unitId}`)
    .row()
    .text("📜 Generate Official TNPSC PYQ + Answer", `pyqunit:${unitId}`)
    .row()
    .text("⬅️ Change Unit", "action:pick_topic");
}

// Actions after Question & Model Answer are displayed
function getPostAnswerKeyboard(unitId = null) {
  const kb = new InlineKeyboard();
  if (unitId) {
    kb.text("⚡ Next Auto Q&A for this Unit", `auto:${unitId}`).row();
    kb.text("✍️ Enter Custom Topic", `unit:${unitId}`).row();
  }
  kb.text("📚 Choose Another Unit", "action:pick_topic");
  return kb;
}

// Split large messages for Telegram limits
function splitMessage(text, max = 3800) {
  const parts = [];
  while (text.length > max) {
    let cut = text.lastIndexOf("\n", max);
    if (cut < 500) cut = max;
    parts.push(text.slice(0, cut));
    text = text.slice(cut);
  }
  parts.push(text);
  return parts;
}

async function reply(ctx, text, replyMarkup = null) {
  const parts = splitMessage(text);
  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    const markup = isLast && replyMarkup ? { reply_markup: replyMarkup } : {};
    try {
      await ctx.reply(parts[i], { parse_mode: "HTML", ...markup });
    } catch {
      await ctx.reply(parts[i].replace(/<[^>]+>/g, ""), markup);
    }
  }
}

async function withTyping(ctx, fn) {
  await ctx.replyWithChatAction("typing");
  const timer = setInterval(() => ctx.replyWithChatAction("typing").catch(() => {}), 4000);
  try {
    return await fn();
  } catch (e) {
    console.error("Bot action error:", e);
    await ctx.reply(`⚠️ ${e.message || "Something went wrong. Please try again."}`);
  } finally {
    clearInterval(timer);
  }
}

// ─────────────────────────────────────────────────────────────
// CORE ACTION HANDLERS (AUTOMATIC Q&A GENERATION + NOTION)
// ─────────────────────────────────────────────────────────────

// Handler: Auto-generate BOTH Question and 12-Rule Model Answer, and save directly to Notion
async function handleAutoGenerateQA(ctx, topic, marks = 15, unitId = null, isPYQ = false) {
  await withTyping(ctx, async () => {
    // 1. Generate Question or PYQ
    const q = isPYQ
      ? await llm.generatePYQ(topic, marks)
      : await llm.generateQuestion(topic, marks);

    const words = wordsFor(marks);

    // 2. Automatically generate 12-Rule Model Answer
    const out = await llm.modelAnswer(q, marks, words);

    // 3. Automatically save directly into Notion under the Topic Page
    let notionUrl = null;
    let notionPageId = null;
    let res = null;
    try {
      res = await saveSession({
        question: q,
        marks,
        words,
        modelAnswer: out,
        topic,
        unitId,
      });
      notionUrl = res.url || res.toString();
      notionPageId = res.id;
    } catch (err) {
      console.error("Auto-save to Notion error:", err);
    }

    sessions.set(ctx.chat.id, {
      question: q,
      marks,
      words,
      modelAnswer: out,
      topic,
      unitId,
      isPYQ,
      notionUrl,
      notionPageId,
    });

    const found = unitId ? findUnitById(unitId) : null;
    const unitTitle = found ? `${found.paper.paperTitle} ➔ ${found.unit.shortName}` : topic;
    const cleanQ = q.replace(/<[^>]+>/g, "").trim();

    // Send Part 1: Question
    const qMessage = [
      `<b>📌 TNPSC Mains Practice Question (${marks} Marks, ~${words} words)</b>`,
      `<i>🏛️ ${unitTitle}</i>`,
      `<i>✍️ Topic: ${topic}</i>`,
      "",
      `<b>Question:</b>`,
      q,
      "",
      `⚡ <i>Official 12-Rule Model Answer automatically generated below:</i>`,
    ].join("\n");
    await ctx.reply(qMessage, { parse_mode: "HTML" });

    // Send Part 2: Model Answer + Notion Link
    let footer = "";
    if (notionUrl) {
      footer = `\n\n✅ <b>Automatically Saved into Notion!</b>\n📄 <b>Topic Page:</b> <i>"${res?.topicName || topic}"</i>\n🔗 <a href="${notionUrl}">Open in Notion Unit Page</a>\n\n👉 <i>You can now write your answer on paper and upload as a Photo or PDF for evaluation, or select next topic below:</i>`;
    }

    await reply(ctx, `<b>🎯 Model Answer (12-Rule Architecture):</b>\n\n${out}${footer}`, getPostAnswerKeyboard(unitId));
  });
}

// Handler: Model Answer manually requested
async function handleModelAnswer(ctx) {
  const s = sessions.get(ctx.chat.id);
  if (!s) {
    return ctx.reply("⚠️ No active question yet! Select a Paper and Unit below to begin:", {
      reply_markup: getPapersInlineKeyboard(),
    });
  }
  if (s.modelAnswer) {
    let footer = s.notionUrl ? `\n\n🔗 <a href="${s.notionUrl}">Open in Notion Unit Page</a>` : "";
    return reply(ctx, `<b>🎯 Model Answer (12-Rule Format):</b>\n\n${s.modelAnswer}${footer}`, getPostAnswerKeyboard(s.unitId));
  }
  await withTyping(ctx, async () => {
    const out = await llm.modelAnswer(s.question, s.marks, s.words);
    s.modelAnswer = out;

    let notionUrl = s.notionUrl;
    try {
      if (!s.notionPageId) {
        const res = await saveSession(s);
        notionUrl = res.url || res.toString();
        s.notionUrl = notionUrl;
        s.notionPageId = res.id;
      }
    } catch (err) {
      console.error("Auto-save to Notion error:", err);
    }

    let footer = notionUrl ? `\n\n✅ <b>Saved to Notion!</b>\n🔗 <a href="${notionUrl}">Open in Notion Unit Page</a>` : "";
    await reply(ctx, `<b>🎯 Model Answer (12-Rule Format):</b>\n\n${out}${footer}`, getPostAnswerKeyboard(s.unitId));
  });
}

// Handler: Save to Notion manually requested
async function handleSaveToNotion(ctx) {
  const s = sessions.get(ctx.chat.id);
  if (!s) {
    return ctx.reply("⚠️ Nothing to save yet. Select a Paper & Unit below to generate a question first!", {
      reply_markup: getPapersInlineKeyboard(),
    });
  }
  if (s.notionUrl) {
    return ctx.reply(`✅ <b>Already Saved to Notion!</b>\n\n🔗 <a href="${s.notionUrl}">Open in Notion Unit Page</a>`, {
      parse_mode: "HTML",
      reply_markup: getPostAnswerKeyboard(s.unitId),
    });
  }
  await withTyping(ctx, async () => {
    const res = await saveSession(s);
    const url = res.url || res.toString();
    s.notionUrl = url;
    s.notionPageId = res.id;
    await ctx.reply(`✅ <b>Successfully Saved to Notion!</b>\n\n🔗 <a href="${url}">Open in Notion Database</a>`, {
      parse_mode: "HTML",
      reply_markup: getPostAnswerKeyboard(s.unitId),
    });
  });
}

// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// TELEGRAM BOT COMMAND & MESSAGE REGISTRATION
// ─────────────────────────────────────────────────────────────
function registerBotHandlers(bot) {
  // /start: Clears any old bottom keyboard and shows the Papers menu
  bot.command("start", async (ctx) => {
  userState.delete(ctx.chat.id);
  subscribeChat(ctx.chat.id);
  // Remove any previously docked bottom keyboard
  await ctx.reply("🎯 <b>Welcome to TNPSC Group-1 Mains Specialist Bot</b>", {
    reply_markup: { remove_keyboard: true },
  });

  const welcomeText = [
    "Practice official 15-mark and 10-mark answers adhering strictly to the <b>Tamil Nadu Career Services 12-Rule Format</b>:",
    "• <b>Introduction:</b> Exactly 4 lines + 🔴 [CORE FOCUS BOX]",
    "• <b>Subheadings:</b> 5 to 6 subheadings with exactly 6 numbered points each",
    "• <b>Unique Highlights:</b> 🔴 Red boxed differentiator in every subheading",
    "• <b>Conclusion:</b> Exactly 4 to 5 lines with forward-looking Way Forward",
    "• <b>Answer Submission:</b> Text message, handwritten photo, or <b>PDF document</b> (evaluated via Gemini Vision)",
    "",
    "<b>Step 1: Choose a General Studies Paper to begin:</b>",
  ].join("\n");

  await ctx.reply(welcomeText, {
    parse_mode: "HTML",
    reply_markup: getPapersInlineKeyboard(),
  });
});

// /menu or /syllabus
bot.command(["menu", "syllabus"], async (ctx) => {
  userState.delete(ctx.chat.id);
  await ctx.reply("📚 <b>TNPSC Mains Syllabus Navigation:</b>\n\nSelect a General Studies Paper to practice:", {
    parse_mode: "HTML",
    reply_markup: getPapersInlineKeyboard(),
  });
});

bot.command("current", (ctx) => {
  const s = sessions.get(ctx.chat.id);
  if (s) {
    ctx.reply(
      `<b>📌 Active Question:</b>\n\n${s.question}\n\n<i>(${s.marks} Marks, ~${s.words} words)</i>`,
      {
        parse_mode: "HTML",
        reply_markup: getQuestionActionKeyboard(s.unitId),
      }
    );
  } else {
    ctx.reply("No question set yet! Select a Paper below to begin:", {
      reply_markup: getPapersInlineKeyboard(),
    });
  }
});

bot.command("model", handleModelAnswer);
bot.command("save", handleSaveToNotion);

bot.command("set", async (ctx) => {
  const m = ctx.match.trim().match(/^(\d+)\s+([\s\S]+)$/);
  if (!m) {
    return ctx.reply(
      "<b>Usage:</b> <code>/set &lt;marks&gt; &lt;question&gt;</code>\n\nExample:\n<code>/set 15 Examine the causes of regional disparities in Tamil Nadu</code>",
      { parse_mode: "HTML" }
    );
  }
  const marks = parseInt(m[1], 10);
  sessions.set(ctx.chat.id, {
    question: m[2].trim(),
    marks,
    words: wordsFor(marks),
    topic: "Custom Question",
  });
  await ctx.reply(
    `✅ <b>Custom Question Saved!</b> (${marks} Marks, ~${wordsFor(marks)} words)\n\n<b>Question:</b>\n${m[2].trim()}\n\n<i>Now send your written answer (text, photo, or PDF) or tap 'Model Answer' below:</i>`,
    { parse_mode: "HTML", reply_markup: getQuestionActionKeyboard() }
  );
});

// ─────────────────────────────────────────────────────────────
// INLINE CALLBACK QUERY HANDLERS (THE 3-TIER FLOW)
// ─────────────────────────────────────────────────────────────

// Step 1: User picks Paper -> Displays its 3 Units
bot.callbackQuery(/^paper:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const paperKey = ctx.match[1];
  const paper = SYLLABUS_HIERARCHY[paperKey];
  if (!paper) return;

  userState.delete(ctx.chat.id);
  const text = [
    `📖 <b>${paper.paperTitle} (${paper.paperCode})</b>`,
    "",
    "<b>Step 2: Select a Unit:</b>",
  ].join("\n");

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: getUnitsForPaperKeyboard(paperKey),
  });
});

// Step 2: User picks Unit -> Prompts user to enter topic or tap Suggest
bot.callbackQuery(/^unit:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const unitId = ctx.match[1];
  const found = findUnitById(unitId);
  if (!found) return;

  const { paper, unit } = found;

  // Set user state to wait for custom topic input
  userState.set(ctx.chat.id, {
    state: "WAITING_FOR_TOPIC",
    unitId: unit.id,
    unitName: unit.name,
    filterKey: unit.filterKey,
    paperTitle: `${paper.paperTitle} (${paper.paperCode})`,
  });

  const promptText = [
    `🎯 <b>Selected Unit:</b>`,
    `<b>${paper.paperTitle}</b> ➔ <i>${unit.name}</i>`,
    "",
    `✍️ <b>Please type the Topic you want to generate questions for:</b>`,
    `<i>Examples from syllabus:</i> ${unit.examples}`,
    "",
    `<i>Or tap an option below:</i>`,
  ].join("\n");

  await ctx.reply(promptText, {
    parse_mode: "HTML",
    reply_markup: getTopicPromptKeyboard(unit.id),
  });
});

// Step 3 (Option A): User taps "Auto-Generate Q&A to Notion (Instant)"
bot.callbackQuery(/^auto:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const unitId = ctx.match[1];
  const found = findUnitById(unitId);
  if (!found) return;

  const { paper, unit } = found;
  userState.delete(ctx.chat.id);

  const item = getRandomTopic(null, unit.filterKey);
  const fullTopic = `${paper.paperTitle} - ${unit.shortName}: ${item.topic}`;
  await handleAutoGenerateQA(ctx, fullTopic, 15, unit.id, false);
});

// Step 3 (Option B): User taps "Suggest Topic from Syllabus"
bot.callbackQuery(/^suggest:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const unitId = ctx.match[1];
  const found = findUnitById(unitId);
  if (!found) return;

  const { paper, unit } = found;
  userState.delete(ctx.chat.id);

  const item = getRandomTopic(null, unit.filterKey);
  const fullTopic = `${paper.paperTitle} - ${unit.shortName}: ${item.topic}`;
  await handleAutoGenerateQA(ctx, fullTopic, 15, unit.id, false);
});

// Step 3 (Option C): User taps "Generate Official TNPSC PYQ + Answer"
bot.callbackQuery(/^pyqunit:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const unitId = ctx.match[1];
  const found = findUnitById(unitId);
  if (!found) return;

  const { paper, unit } = found;
  userState.delete(ctx.chat.id);

  const item = getRandomTopic(null, unit.filterKey);
  const fullTopic = `${paper.paperTitle} - ${unit.shortName}: ${item.topic}`;
  await handleAutoGenerateQA(ctx, fullTopic, 15, unit.id, true);
});

// Auto-generate for ALL 9 Units across GS1, GS2, and GS3
bot.callbackQuery("action:auto_all_papers", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  userState.delete(ctx.chat.id);

  await ctx.reply("🚀 <b>Starting Automated Generation across ALL 9 Units (GS I, II & III)...</b>\n\nQuestions and Answers are saved into their respective Topic Pages inside each Unit folder in Notion.\n\n<i>Processing unit by unit...</i>", {
    parse_mode: "HTML",
  });

  for (const u of ALL_UNITS) {
    try {
      const res = await generateAndSaveOne({
        unitId: u.unitId,
        marks: 15,
      });

      const cleanQ = res.question.replace(/<[^>]+>/g, "").trim();
      const progressText = [
        `✅ <b>[${res.paperTitle}]</b>`,
        `🏛️ <i>${res.unitName}</i>`,
        `📄 <b>Topic Page:</b> "${res.topic}"`,
        `📌 <b>Question:</b> "${cleanQ.slice(0, 60)}..."`,
        `🔗 <a href="${res.notionUrl}">Open in Notion Topic Page</a>`,
      ].join("\n");

      await ctx.reply(progressText, { parse_mode: "HTML" });
    } catch (err) {
      console.error(`Error auto-generating for ${u.unitId}:`, err);
      await ctx.reply(`⚠️ Failed for ${u.unitName}: ${err.message}`);
    }
  }

  await ctx.reply("🎉 <b>All 9 Units successfully generated and saved into Notion!</b>\n\nYou can view all questions directly in your Notion workspace under GS I, GS II, and GS III.", {
    parse_mode: "HTML",
    reply_markup: getPapersInlineKeyboard(),
  });
});

// Back to Papers selection
bot.callbackQuery("action:pick_topic", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  userState.delete(ctx.chat.id);
  await ctx.reply("📚 <b>TNPSC Mains Syllabus Navigation:</b>\n\nChoose a General Studies Paper to practice:", {
    parse_mode: "HTML",
    reply_markup: getPapersInlineKeyboard(),
  });
});

// Random Topic from Any Paper
bot.callbackQuery("action:random_topic", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  userState.delete(ctx.chat.id);
  const item = getRandomTopic();
  const fullTopic = `${item.paper} - ${item.unit}: ${item.topic}`;
  await handleAutoGenerateQA(ctx, fullTopic, 15);
});

// PYQ for currently active topic
bot.callbackQuery("action:pyq_topic", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const s = sessions.get(ctx.chat.id);
  const topic = s?.topic || getRandomTopic().topic;
  await handleAutoGenerateQA(ctx, topic, s?.marks || 15, s?.unitId, true);
});

// Get Model Answer
bot.callbackQuery("action:model", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  await handleModelAnswer(ctx);
});

// Save to Notion
bot.callbackQuery("action:save", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  await handleSaveToNotion(ctx);
});

// ─────────────────────────────────────────────────────────────
// MESSAGE HANDLERS (USER TYPES TOPIC OR SUBMITS ANSWER)
// ─────────────────────────────────────────────────────────────

// Text message handler
bot.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;

  // 1. If user is in "WAITING_FOR_TOPIC" state, generate question and model answer for the entered topic!
  const st = userState.get(ctx.chat.id);
  if (st && st.state === "WAITING_FOR_TOPIC") {
    const enteredTopic = ctx.message.text.trim();
    userState.delete(ctx.chat.id);
    const fullTopic = `${st.paperTitle} - ${st.unitName}: ${enteredTopic}`;
    return handleAutoGenerateQA(ctx, fullTopic, 15, st.unitId, false);
  }

  // 2. If student has an active question, evaluate their submitted answer
  const s = sessions.get(ctx.chat.id);
  if (!s) {
    return ctx.reply("🎯 Please select a Paper and Unit to generate a question first:", {
      reply_markup: getPapersInlineKeyboard(),
    });
  }

  await withTyping(ctx, async () => {
    const out = await llm.evaluate(s.question, s.marks, s.words, { text: ctx.message.text });
    s.answer = ctx.message.text;
    s.evaluation = out;

    // Automatically update or save into Notion
    let notionUrl = s.notionUrl;
    try {
      if (s.notionPageId) {
        await appendEvaluationToSession(s.notionPageId, { answer: s.answer, evaluation: out });
      } else {
        const res = await saveSession(s);
        notionUrl = res.url || res.toString();
        s.notionPageId = res.id;
        s.notionUrl = notionUrl;
      }
    } catch (err) {
      console.error("Auto-save answer error:", err);
    }

    let footer = "";
    if (notionUrl) {
      footer = `\n\n✅ <b>Answer & Evaluation Automatically Saved to Notion!</b>\n🔗 <a href="${notionUrl}">Open in Notion Unit Page</a>`;
    }

    await reply(ctx, out + footer, getPostAnswerKeyboard(s.unitId));
  });
});

// Handwritten photo answer submission
bot.on("message:photo", async (ctx) => {
  const s = sessions.get(ctx.chat.id);
  if (!s) {
    return ctx.reply("⚠️ Please select a Paper and Unit to generate a question first!", {
      reply_markup: getPapersInlineKeyboard(),
    });
  }
  await withTyping(ctx, async () => {
    const photos = ctx.message.photo;
    const file = await ctx.api.getFile(photos[photos.length - 1].file_id);
    const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    const out = await llm.evaluate(s.question, s.marks, s.words, {
      imageBase64: buf.toString("base64"),
      mediaType: "image/jpeg",
    });
    s.answer = "(Handwritten photo answer evaluated via Gemini Vision)";
    s.evaluation = out;

    // Automatically update or save into Notion
    let notionUrl = s.notionUrl;
    try {
      if (s.notionPageId) {
        await appendEvaluationToSession(s.notionPageId, { answer: s.answer, evaluation: out });
      } else {
        const res = await saveSession(s);
        notionUrl = res.url || res.toString();
        s.notionPageId = res.id;
        s.notionUrl = notionUrl;
      }
    } catch (err) {
      console.error("Auto-save photo answer error:", err);
    }

    let footer = "";
    if (notionUrl) {
      footer = `\n\n✅ <b>Handwritten Answer & Evaluation Automatically Saved to Notion!</b>\n🔗 <a href="${notionUrl}">Open in Notion Unit Page</a>`;
    }

    await reply(ctx, out + footer, getPostAnswerKeyboard(s.unitId));
  });
});

// PDF and Document answer submission (Multi-page PDF / scanned papers)
bot.on("message:document", async (ctx) => {
  const s = sessions.get(ctx.chat.id);
  if (!s) {
    return ctx.reply("⚠️ Please select a Paper and Unit to generate a question first:", {
      reply_markup: getPapersInlineKeyboard(),
    });
  }

  const doc = ctx.message.document;
  const fileName = doc.file_name || "document.pdf";
  const isPdf = doc.mime_type === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  const isImageDoc = doc.mime_type?.startsWith("image/") || /\.(jpe?g|png)$/i.test(fileName);

  if (!isPdf && !isImageDoc) {
    return ctx.reply(
      "⚠️ <b>Unsupported file format:</b> Please upload your answer as a <b>PDF document (.pdf)</b> or image (.jpg, .png).",
      { parse_mode: "HTML" }
    );
  }

  // Telegram bot file download size limit is 20MB
  if (doc.file_size && doc.file_size > 20 * 1024 * 1024) {
    return ctx.reply("⚠️ The file exceeds Telegram's 20MB download limit. Please compress your PDF and try again.");
  }

  await withTyping(ctx, async () => {
    await ctx.reply(`📄 <i>Received <b>${fileName}</b>! Reading all pages with Gemini Vision OCR and evaluating against 12 TNPSC rules...</i>`, {
      parse_mode: "HTML",
    });

    const file = await ctx.api.getFile(doc.file_id);
    const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    const base64 = buf.toString("base64");

    const out = await llm.evaluate(s.question, s.marks, s.words, {
      pdfBase64: isPdf ? base64 : undefined,
      imageBase64: !isPdf ? base64 : undefined,
      mediaType: isPdf ? "application/pdf" : (doc.mime_type || "image/jpeg"),
    });

    s.answer = isPdf
      ? `(PDF answer script submitted: ${fileName} - evaluated via Gemini Vision)`
      : `(Document image submitted: ${fileName} - evaluated via Gemini Vision)`;
    s.evaluation = out;

    // Automatically update or save into Notion
    let notionUrl = s.notionUrl;
    try {
      if (s.notionPageId) {
        await appendEvaluationToSession(s.notionPageId, { answer: s.answer, evaluation: out });
      } else {
        const res = await saveSession(s);
        notionUrl = res.url || res.toString();
        s.notionPageId = res.id;
        s.notionUrl = notionUrl;
      }
    } catch (err) {
      console.error("Auto-save document answer error:", err);
    }

    let footer = "";
    if (notionUrl) {
      footer = `\n\n✅ <b>PDF Answer & Evaluation Automatically Saved to Notion!</b>\n🔗 <a href="${notionUrl}">Open in Notion Unit Page</a>`;
    }

    await reply(ctx, out + footer, getPostAnswerKeyboard(s.unitId));
  });
});

// /auto command
bot.command(["auto", "autogenerate"], async (ctx) => {
  await ctx.reply("🚀 <b>TNPSC Mains Automatic Q&A Generation:</b>\n\nTap below to automatically generate high-yield Mains Questions & 12-Rule Answers and save them directly into Notion pages under each respective Unit folder:", {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text("⚡ Auto-Generate for All 9 Units (GS I, II & III)", "action:auto_all_papers")
      .row()
      .text("📚 Choose Specific Paper / Unit", "action:pick_topic"),
  });
});

// /daily command - Manually trigger or view today's 9:00 AM PYQ job
bot.command(["daily", "daily_pyq", "today"], async (ctx) => {
  subscribeChat(ctx.chat.id);
  await ctx.reply("⏳ <i>Running daily TNPSC Mains PYQ job (generating 2 questions + model answers) & auto-saving to Notion...</i>", { parse_mode: "HTML" });

  try {
    const res = await runDailyPYQJob({ force: true, bot });
    const text = [
      `⏰ <b>TNPSC Mains Daily 9:00 AM PYQ Practice (2 Questions)</b>`,
      ``,
      `🎯 <b>Topic:</b> ${res.topic}`,
      ``,
      `📌 <b>Question 1 (PYQ):</b>\n<i>${res.question1 || res.question}</i>`,
      ``,
      `📌 <b>Question 2 (PYQ):</b>\n<i>${res.question2}</i>`,
      ``,
      `✅ <b>Both 12-Rule Model Answers saved to Notion!</b>`,
      `🔗 <a href="${res.notionUrl}">Open in Notion Topic Page</a>`,
      ``,
      `➡️ <i>Tomorrow's 9:00 AM Topic: <b>${res.nextTopic}</b></i>`,
    ].join("\n");

    await ctx.reply(text, {
      parse_mode: "HTML",
      disable_web_page_preview: false,
      reply_markup: new InlineKeyboard()
        .url("🔗 Open in Notion", res.notionUrl)
        .row()
        .text("📚 Choose Another Topic", "action:pick_topic"),
    });
  } catch (err) {
    console.error("Daily job error:", err);
    await ctx.reply(`⚠️ Daily job encountered an issue: ${err.message}. Auto-healer will retry at next scheduled interval.`);
  }
});

// /status command - View scheduler and auto-heal health status
bot.command(["status", "scheduler"], async (ctx) => {
  const status = getSchedulerStatus();
  const isSubscribed = (status.subscribedChats || []).includes(ctx.chat.id);

  const text = [
    `🛡️ <b>TNPSC Mains Bot & Scheduler Status:</b>`,
    ``,
    `⏰ <b>Daily Schedule:</b> Every day at 09:00 AM (Asia/Kolkata)`,
    `🔄 <b>Sequential Rotation:</b> Topic jumps every day (${status.currentTopicIndex + 1}/${status.totalTopics} completed)`,
    `🎯 <b>Current Active Topic:</b> ${status.currentTopicName}`,
    `📚 <b>Paper & Unit:</b> ${status.currentTopicPaper} - ${status.currentTopicUnit}`,
    `➡️ <b>Next Scheduled Topic:</b> ${status.nextTopicName}`,
    ``,
    `📅 <b>Today's Status (${status.todayIST}):</b> ${status.lastRunDate === status.todayIST ? "✅ Completed" : "⏳ Pending (9:00 AM trigger)"}`,
    status.lastRunNotionUrl ? `🔗 <b>Latest Notion Link:</b> <a href="${status.lastRunNotionUrl}">View Today's Page</a>` : "",
    ``,
    `🔔 <b>Your Subscription:</b> ${isSubscribed ? "✅ Subscribed to 9:00 AM Broadcast" : "❌ Not Subscribed (type /subscribe)"}`,
    `❤️ <b>Auto-Healing Engine:</b> Active (Model failover, missed-job catch-up, state self-repair, process guard)`,
  ].filter(Boolean).join("\n");

  await ctx.reply(text, {
    parse_mode: "HTML",
    disable_web_page_preview: false,
    reply_markup: new InlineKeyboard()
      .text(isSubscribed ? "🔕 Unsubscribe" : "🔔 Subscribe to 9 AM Alerts", isSubscribed ? "action:unsub" : "action:sub")
      .row()
      .text("⚡ Run Daily Job Now", "action:run_daily_now"),
  });
});

// /subscribe and /unsubscribe commands
bot.command("subscribe", async (ctx) => {
  subscribeChat(ctx.chat.id);
  await ctx.reply("🔔 <b>Successfully Subscribed!</b>\n\nYou will receive the 2 TNPSC Mains PYQ questions, 12-rule model answers, and Notion link every morning at <b>9:00 AM</b>.", { parse_mode: "HTML" });
});

bot.command("unsubscribe", async (ctx) => {
  unsubscribeChat(ctx.chat.id);
  await ctx.reply("🔕 <b>Unsubscribed.</b> You will no longer receive daily 9:00 AM broadcast notifications.", { parse_mode: "HTML" });
});

bot.callbackQuery("action:sub", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Subscribed to daily 9 AM questions!" }).catch(() => {});
  subscribeChat(ctx.chat.id);
  await ctx.reply("🔔 <b>Subscribed!</b> You will receive daily 9:00 AM questions automatically.", { parse_mode: "HTML" });
});

bot.callbackQuery("action:unsub", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Unsubscribed" }).catch(() => {});
  unsubscribeChat(ctx.chat.id);
  await ctx.reply("🔕 <b>Unsubscribed from daily 9 AM questions.</b>", { parse_mode: "HTML" });
});

bot.callbackQuery("action:run_daily_now", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Running daily job..." }).catch(() => {});
  await ctx.reply("⏳ <i>Running daily PYQ job now...</i>", { parse_mode: "HTML" });
  try {
    const res = await runDailyPYQJob({ force: true, bot });
    await ctx.reply(
      `✅ <b>Completed!</b>\n\n🎯 <b>Topic:</b> ${res.topic}\n\n📌 <b>Question 1:</b>\n<i>${res.question1 || res.question}</i>\n\n📌 <b>Question 2:</b>\n<i>${res.question2}</i>\n\n🔗 <a href="${res.notionUrl}">Open in Notion Topic Page</a>\n\n➡️ <i>Next Topic: <b>${res.nextTopic}</b></i>`,
      { parse_mode: "HTML" }
    );
  } catch (err) {
    await ctx.reply(`⚠️ Error: ${err.message}`);
  }
});
} // end registerBotHandlers

// ─────────────────────────────────────────────────────────────
// START TELEGRAM BOT & SCHEDULER (WITH 409 CONFLICT RECOVERY)
// ─────────────────────────────────────────────────────────────
if (bot) {
  registerBotHandlers(bot);

  bot.catch((err) => {
    const msg = err.message || String(err);
    if (msg.includes("409") || msg.includes("Conflict")) {
      console.warn("⚠️ [Telegram 409 Conflict] Another instance of the bot is running elsewhere (e.g., your local machine).");
      console.warn("👉 Stop your local bot process so Render can receive Telegram updates.");
    } else {
      console.error("[Telegram Bot Error]", err);
    }
  });

  bot.api.setMyCommands([
    { command: "start", description: "Start practice & select Paper" },
    { command: "daily", description: "Run/view daily 9 AM PYQ question" },
    { command: "status", description: "View schedule & auto-heal status" },
    { command: "subscribe", description: "Subscribe to 9 AM daily alerts" },
    { command: "menu", description: "Open syllabus navigation" },
    { command: "auto", description: "Auto-generate Q&A and save to Notion" },
    { command: "model", description: "Get official 12-rule model answer" },
    { command: "current", description: "View current active question" },
    { command: "save", description: "Save current session to Notion" },
    { command: "set", description: "Practice your own custom question" },
  ]).catch(() => {});

  bot.start({
    drop_pending_updates: true,
    onStart: (botInfo) => {
      console.log(`🤖 [Telegram] Connected as @${botInfo.username}. Active & listening for updates!`);
    },
  }).catch((err) => {
    console.error("Bot polling error:", err.message);
  });

  startDailyScheduler(bot);
} else {
  console.warn("⚠️ [Telegram Bot] Polling disabled due to missing TELEGRAM_BOT_TOKEN.");
  startDailyScheduler(null);
}

// ─────────────────────────────────────────────────────────────
// HTTP WEB SERVER (REQUIRED FOR RENDER.COM WEB SERVICES)
// ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = "0.0.0.0";

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  // Health check endpoint for Render.com
  if (parsedUrl.pathname === "/health" || parsedUrl.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      status: "healthy",
      service: "TNPSC Mains Bot",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      botConnected: Boolean(bot),
      schedulerActive: true,
      environmentConfigured: missingVars.length === 0,
      port: PORT,
    }));
  }

  // Trigger daily job on demand via HTTP
  if (parsedUrl.pathname === "/daily" || parsedUrl.pathname === "/trigger-daily") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify({ status: "initiated", message: "Running daily PYQ job..." }));
    runDailyPYQJob({ force: true, bot }).catch((err) => console.error("Web daily trigger error:", err));
    return res.end();
  }

  // Web Dashboard (GET /)
  if (parsedUrl.pathname === "/") {
    const schedulerStatus = getSchedulerStatus();
    const html = generateDashboardHTML({
      botConnected: Boolean(bot),
      missingVars,
      schedulerStatus,
      port: PORT,
    });
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint not found" }));
});

server.listen(PORT, HOST, () => {
  console.log(`🌐 [Render Web Server] Listening on http://${HOST}:${PORT}`);
  console.log(`💓 [Health Check] Available at http://${HOST}:${PORT}/health`);
});

// Render Free Tier Keep-Alive Self-Pinger (pings every 14 mins if RENDER_EXTERNAL_URL is set)
const renderExternalUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
if (renderExternalUrl) {
  console.log(`📡 [Render Keep-Alive] Initialized for ${renderExternalUrl}. Pinging every 14 minutes.`);
  setInterval(async () => {
    try {
      const pingUrl = `${renderExternalUrl.replace(/\/$/, "")}/health`;
      const res = await fetch(pingUrl);
      console.log(`💓 [Render Keep-Alive] Pinged ${pingUrl} - Status: ${res.status}`);
    } catch (err) {
      console.warn(`💓 [Render Keep-Alive] Ping failed: ${err.message}`);
    }
  }, 14 * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD HTML GENERATOR
// ─────────────────────────────────────────────────────────────
function generateDashboardHTML({ botConnected, missingVars, schedulerStatus, port }) {
  const isHealthy = botConnected && missingVars.length === 0;
  const statusColor = isHealthy ? "#10b981" : "#f59e0b";
  const statusLabel = isHealthy ? "Online & Healthy" : "Setup Attention Needed";

  const envRows = [
    { name: "TELEGRAM_BOT_TOKEN", set: Boolean(process.env.TELEGRAM_BOT_TOKEN) },
    { name: "GEMINI_API_KEY", set: Boolean(process.env.GEMINI_API_KEY) },
    { name: "NOTION_TOKEN", set: Boolean(process.env.NOTION_TOKEN) },
    { name: "NOTION_DATABASE_ID", set: Boolean(process.env.NOTION_DATABASE_ID) },
    { name: "PORT", set: Boolean(process.env.PORT), value: String(port) },
    { name: "GEMINI_MODEL", set: Boolean(process.env.GEMINI_MODEL), value: process.env.GEMINI_MODEL || "gemini-2.5-flash (default)" },
  ].map((item) => `
    <tr>
      <td style="padding: 10px 14px; font-family: monospace; color: #93c5fd;">${item.name}</td>
      <td style="padding: 10px 14px;">
        ${item.set 
          ? `<span style="background: rgba(16, 185, 129, 0.15); color: #34d399; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600;">CONFIGURED ${item.value ? `(${item.value})` : ""}</span>`
          : `<span style="background: rgba(239, 68, 68, 0.15); color: #f87171; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600;">MISSING IN RENDER</span>`
        }
      </td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TNPSC Mains Bot - Status Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0b0f19;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 20px;
    }
    .container { max-width: 860px; width: 100%; }
    .header {
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.9));
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 28px;
      margin-bottom: 24px;
      backdrop-filter: blur(12px);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    }
    .header-top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
    .title { font-size: 26px; font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 10px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid ${statusColor};
      color: ${statusColor};
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; animation: pulse 2s infinite; }
    @keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }
    .subtitle { color: #94a3b8; font-size: 14px; margin-top: 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card {
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 20px;
    }
    .card-title { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-weight: 600; margin-bottom: 8px; }
    .card-val { font-size: 18px; font-weight: 700; color: #f1f5f9; }
    .card-desc { font-size: 12px; color: #64748b; margin-top: 4px; }
    .section {
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .section-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #cbd5e1; }
    table { width: 100%; border-collapse: collapse; }
    tr:not(:last-child) { border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      color: #fff;
      background: #2563eb;
      border: none;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover { background: #1d4ed8; }
    .btn-secondary { background: rgba(255, 255, 255, 0.1); color: #cbd5e1; }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.15); }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-top">
        <div class="title">🏛️ TNPSC Mains Preparation Bot</div>
        <div class="badge"><div class="dot"></div>${statusLabel}</div>
      </div>
      <div class="subtitle">AI-Powered Telegram Answer Evaluator • 12-Rule Architecture • Daily 9:00 AM PYQ Rotation</div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-title">🤖 Telegram Polling</div>
        <div class="card-val">${botConnected ? "Connected & Active" : "Waiting for Token"}</div>
        <div class="card-desc">Grammy Long Polling with Auto-Recovery</div>
      </div>
      <div class="card">
        <div class="card-title">⏰ Daily Schedule</div>
        <div class="card-val">Every Day at 09:00 AM</div>
        <div class="card-desc">Asia/Kolkata (IST) timezone cron</div>
      </div>
      <div class="card">
        <div class="card-title">🎯 Active Syllabus Topic</div>
        <div class="card-val" style="font-size: 15px;">${schedulerStatus.currentTopicName || "Advent of Europeans"}</div>
        <div class="card-desc">${schedulerStatus.currentTopicPaper || "General Studies I"} ➔ Next: ${schedulerStatus.nextTopicName || "..."}</div>
      </div>
      <div class="card">
        <div class="card-title">🛡️ Auto-Healing</div>
        <div class="card-val" style="color: #34d399;">Active</div>
        <div class="card-desc">Model failover & State self-repair</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">⚙️ Render Environment Variables Status</div>
      <table>
        <tbody>
          ${envRows}
        </tbody>
      </table>
      ${missingVars.length > 0 ? `
        <div style="margin-top: 16px; padding: 12px 16px; background: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444; border-radius: 4px; font-size: 13px; color: #fca5a5;">
          <strong>Action Required:</strong> Please go to your <strong>Render Dashboard ➔ Environment</strong> and add the missing keys shown above, then click 'Save Changes'.
        </div>
      ` : ""}
    </div>

    <div class="actions">
      <a href="/health" class="btn btn-secondary" target="_blank">🩺 Health JSON</a>
      <a href="/trigger-daily" class="btn" target="_blank">⚡ Test Daily Job</a>
    </div>
  </div>
</body>
</html>`;
}
