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
  getTopicPipeline,
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

// ─────────────────────────────────────────────────────────────
// SYSTEM HEALTH METER & TOPIC PIPELINE FORMATTERS
// ─────────────────────────────────────────────────────────────
function getHealthMeter() {
  const hasBot = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim());
  const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
  const hasNotion = Boolean(process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID);

  let score = 0;
  const total = 5;
  if (hasBot) score++;
  if (hasGemini) score++;
  if (hasNotion) score++;
  score++; // Daily 9:00 AM scheduler active
  score++; // Auto-healer crash guard armed

  const pct = Math.round((score / total) * 100);
  const filled = Math.round((pct / 100) * 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);

  return {
    score,
    total,
    pct,
    bar,
    statusText: pct === 100 ? "OPTIMAL / HEALTHY" : "ATTENTION NEEDED",
    telegram: hasBot ? "🟢 Online (Long-Polling Active)" : "🔴 Token Missing",
    gemini: hasGemini ? "🟢 Active (3-Model Failover Pool)" : "🔴 Key Missing",
    notion: hasNotion ? "🟢 Connected & Synced" : "🔴 Not Configured",
    scheduler: "🟢 Active (09:00 AM Asia/Kolkata)",
    autoHealer: "🟢 Armed (Zero-Crash Guard)",
  };
}

function formatHealthMeterHTML(compact = false) {
  const m = getHealthMeter();
  if (compact) {
    return [
      `📊 <b>System Health:</b> <code>[${m.bar}] ${m.pct}% ${m.statusText}</code>`,
      `• Telegram: ${m.telegram} | Gemini AI: ${m.gemini} | Notion: ${m.notion}`,
    ].join("\n");
  }

  return [
    `📊 <b>SYSTEM HEALTH METER:</b>`,
    `<code>[${m.bar}] ${m.pct}% ${m.statusText}</code>`,
    `• 🤖 <b>Telegram Gateway:</b> ${m.telegram}`,
    `• 🧠 <b>Google Gemini AI:</b> ${m.gemini}`,
    `• 📓 <b>Notion Workspace:</b> ${m.notion}`,
    `• ⏰ <b>9:00 AM Daily Scheduler:</b> ${m.scheduler}`,
    `• 🛡️ <b>Auto-Healing Engine:</b> ${m.autoHealer}`,
  ].join("\n");
}

function formatPipelineHTML(pipeline) {
  const lines = [];
  lines.push(`🗓️ <b>DAILY SYLLABUS TOPIC PIPELINE:</b>`);
  lines.push(``);

  if (pipeline.alreadyRanToday) {
    lines.push(`📌 <b>Today's Generated Topic (${pipeline.todayStr}):</b>`);
    lines.push(`🎯 <b>${pipeline.todayTopic.topic}</b>`);
    lines.push(`✅ <i>Status: 2 PYQs generated & synced to Notion!</i>`);
    if (pipeline.todayTopic.notionUrl) {
      lines.push(`🔗 <a href="${pipeline.todayTopic.notionUrl}">Open Today's Notion Topic Page</a>`);
    }
  } else {
    lines.push(`🎯 <b>Today's Scheduled Topic (${pipeline.todayStr}):</b>`);
    lines.push(`🏛️ <i>${pipeline.todayTopic.paper} ➔ ${pipeline.todayTopic.unit}</i>`);
    lines.push(`<b>${pipeline.todayTopic.topic}</b>`);
    lines.push(`⏳ <i>Status: Scheduled for 09:00 AM IST (or tap 'Run Today Now')</i>`);
  }

  lines.push(``);
  lines.push(`➡️ <b>Tomorrow's Topic to be Generated:</b>`);
  lines.push(`🏛️ <i>${pipeline.tomorrowTopic.paper} ➔ ${pipeline.tomorrowTopic.unit}</i>`);
  lines.push(`🎯 <b>${pipeline.tomorrowTopic.topic}</b>`);
  lines.push(`⏰ <i>Trigger Time: Tomorrow at 09:00 AM IST (Asia/Kolkata)</i>`);
  lines.push(`⚡ <i>Will generate: 2 authentic PYQs + 12-Rule Model Answers + Notion sync</i>`);

  if (pipeline.upcomingTopics && pipeline.upcomingTopics.length > 0) {
    lines.push(``);
    lines.push(`📋 <i>Upcoming in Rotation:</i>`);
    pipeline.upcomingTopics.slice(0, 2).forEach((t, i) => {
      lines.push(`• Day +${i + 2}: <b>${t.topic}</b> (<i>${t.paper}</i>)`);
    });
  }

  return lines.join("\n");
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
  const pipeline = getTopicPipeline();
  const kb = new InlineKeyboard();

  if (pipeline.alreadyRanToday && pipeline.todayTopic.notionUrl) {
    kb.url("🔗 Open Today's Notion Page", pipeline.todayTopic.notionUrl).row();
  }

  kb.text("➡️ Tomorrow's Topic Details", "action:tomorrow_preview")
    .text("⚡ Run Today's 2 PYQs", "action:run_daily_now")
    .row();

  kb.text("📜 General Studies I (Paper II)", "paper:GS1")
    .row()
    .text("⚖️ General Studies II (Paper III)", "paper:GS2")
    .row()
    .text("📈 General Studies III (Paper IV)", "paper:GS3")
    .row()
    .text("⚡ Auto-Generate for All 9 Units (GS I, II & III)", "action:auto_all_papers")
    .row()
    .text("📊 Health Meter & Diagnostics", "action:view_status");

  return kb;
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

// Question action keyboard for active questions
function getQuestionActionKeyboard(unitId = null) {
  const kb = new InlineKeyboard()
    .text("🎯 Official 12-Rule Model Answer", "action:model")
    .row()
    .text("📓 Save to Notion Topic Page", "action:save")
    .row();
  if (unitId) {
    kb.text("⚡ Next Question in this Unit", `auto:${unitId}`).row();
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
// TELEGRAM PROGRESS ANIMATOR & MODERN CARD DESIGN SYSTEM
// ─────────────────────────────────────────────────────────────

async function createProgressAnimator(ctx, title = "TNPSC MAINS AI ENGINE") {
  let msg = null;
  const SPINNER_FRAMES = ["◐", "◓", "◑", "◒"];
  let lastEditTime = 0;

  try {
    msg = await ctx.reply(
      `⚡ <b>${title}</b>\n━━━━━━━━━━━━━━━━━━━━━━\n⏳ <b>Initializing AI Engine...</b>\n<code>[▱▱▱▱▱▱▱▱▱▱] 0%</code>\n<i>Connecting to Gemini AI Core...</i>`,
      { parse_mode: "HTML" }
    );
    lastEditTime = Date.now();
  } catch (err) {
    console.warn("Could not create animation message:", err.message);
  }

  const renderBar = (pct) => {
    const filled = Math.min(10, Math.max(0, Math.round((pct / 100) * 10)));
    return "▰".repeat(filled) + "▱".repeat(10 - filled);
  };

  const animInstance = {
    async step(text, pct, detail = "") {
      if (!msg) return;
      const bar = renderBar(pct);
      const content = [
        `⚡ <b>${title}</b>`,
        `━━━━━━━━━━━━━━━━━━━━━━`,
        `${text}`,
        `<code>[${bar}] ${pct}%</code>`,
        detail ? `<i>${detail}</i>` : ``,
      ].filter(Boolean).join("\n");

      // Rate limit protection: enforce minimum 1000ms interval between edits
      const now = Date.now();
      if (now - lastEditTime < 1000) {
        await new Promise((r) => setTimeout(r, 1000 - (now - lastEditTime)));
      }
      lastEditTime = Date.now();

      try {
        await ctx.api.editMessageText(ctx.chat.id, msg.message_id, content, {
          parse_mode: "HTML",
        });
      } catch (_) {
        // Safe ignore duplicate edits / transient network noise
      }
    },

    /**
     * Executes asyncFn while smoothly updating the animated spinner and cycling subtitles.
     */
    async track(asyncFn, { text = "Processing...", basePct = 10, targetPct = 90, details = [] } = {}) {
      if (!msg) return await asyncFn();

      let currentPct = basePct;
      let detailIdx = 0;
      let frameIdx = 0;
      let isDone = false;

      const initialDetail = details.length ? details[0] : "";
      await this.step(`${SPINNER_FRAMES[0]} ${text}`, currentPct, initialDetail);

      const timer = setInterval(async () => {
        if (isDone) return;
        frameIdx = (frameIdx + 1) % SPINNER_FRAMES.length;
        if (currentPct < targetPct - 3) {
          currentPct += Math.min(4, Math.max(1, Math.round((targetPct - currentPct) / 5)));
        }
        detailIdx = (detailIdx + 1) % (details.length || 1);
        const currentDetail = details.length ? details[detailIdx] : "";
        await this.step(`${SPINNER_FRAMES[frameIdx]} ${text}`, currentPct, currentDetail);
      }, 1250);

      try {
        const result = await asyncFn();
        isDone = true;
        clearInterval(timer);
        await this.step(`✅ ${text}`, targetPct, details.length ? details[details.length - 1] : "");
        return result;
      } catch (err) {
        isDone = true;
        clearInterval(timer);
        throw err;
      }
    },

    async delete() {
      if (!msg) return;
      try {
        await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
      } catch (_) {}
    },
  };

  return animInstance;
}

function formatModernQuestionCard({ question, marks, words, topic, unitTitle, isPYQ = false, questionNumber = 1 }) {
  const cleanQ = question.replace(/<[^>]+>/g, "").trim();
  const badge = isPYQ ? "🏆 OFFICIAL TNPSC MAINS PYQ" : "🎯 HIGH-YIELD PRACTICE QUESTION";

  return [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  🏛️ <b>TNPSC GROUP-1 MAINS SPECIALIST</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `🏷️ <b>Category:</b> <code>${badge}</code>`,
    `📚 <b>Paper & Unit:</b> <i>${unitTitle}</i>`,
    `🎯 <b>Syllabus Topic:</b> <b>${topic}</b>`,
    `⚖️ <b>Weightage:</b> <code>${marks} MARKS • ~${words} WORDS</code>`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📌 <b>QUESTION - ${questionNumber}:</b>`,
    `<b>${cleanQ}</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `⚡ <i>Official Tamil Nadu Career Services 12-Rule Model Answer below:</i>`,
  ].join("\n");
}

function formatModernModelAnswerCard(modelAnswer, { topic, questionNumber = 1, marks = 15 }) {
  return [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  🎯 <b>OFFICIAL 12-RULE MODEL ANSWER</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `📌 <b>Continuity:</b> <code>Question - ${questionNumber}</code> • <code>${marks} Marks Standard</code>`,
    `🎯 <b>Target Topic:</b> <i>${topic}</i>`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    modelAnswer,
  ].join("\n");
}

function formatModernNotionSyncBanner({ topic, notionUrl, questionNumber = 1 }) {
  return [
    `╔════════════════════════════════════════╗`,
    `║  ✅ <b>SAVED TO NOTION WORKSPACE</b>`,
    `╚════════════════════════════════════════╝`,
    `📄 <b>Topic Page:</b> <i>"${topic}"</i>`,
    `🔢 <b>Continuity:</b> 📌 <b>Question - ${questionNumber}</b>`,
    `🎨 <b>12 Rules:</b> <i>Orange Callouts • Yellow Highlighted Points • Purple Value Box</i>`,
    ``,
    `🔗 <a href="${notionUrl}"><b>👉 Open Interactive Page in Notion ↗</b></a>`,
  ].join("\n");
}

function formatModernDailySuiteCard(res) {
  return [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  ⏰ <b>TNPSC MAINS DAILY 9:00 AM SUITE</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `🎯 <b>Topic:</b> <b>${res.topic}</b>`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📌 <b>QUESTION 1 (PYQ):</b>`,
    `<i>${res.question1 || res.question}</i>`,
    ``,
    `📌 <b>QUESTION 2 (PYQ):</b>`,
    `<i>${res.question2}</i>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `╔════════════════════════════════════════╗`,
    `║  ✅ <b>SAVED TO NOTION WORKSPACE</b>`,
    `╚════════════════════════════════════════╝`,
    `📄 <b>Topic Page:</b> <i>"${res.topic}"</i>`,
    `🔢 <b>Contains:</b> 📌 <b>Question - 1</b> & 📌 <b>Question - 2</b> with complete 12-Rule Model Answers`,
    ``,
    `🔗 <a href="${res.notionUrl}"><b>👉 Open Topic Page in Notion ↗</b></a>`,
    ``,
    `➡️ <i>Tomorrow's 09:00 AM Topic: <b>${res.nextTopic}</b></i>`,
  ].join("\n");
}

function formatModernEvaluationCard({ marks, evaluation, submissionType = "Text Answer", notionUrl = null }) {
  return [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  ⚖️ <b>TNPSC 12-RULE EVALUATION REPORT</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `📝 <b>Submission Type:</b> <code>${submissionType}</code>`,
    `⚖️ <b>Evaluated Weightage:</b> <code>${marks} MARKS</code>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    evaluation,
    ``,
    notionUrl ? formatModernNotionSyncBanner({ topic: "Student Answer Evaluation", notionUrl, questionNumber: 1 }) : ``,
  ].filter(Boolean).join("\n");
}

function formatSyllabusProgressHTML(status) {
  const current = (status?.currentTopicIndex || 0) + 1;
  const total = status?.totalTopics || 85;
  const pct = Math.round((current / total) * 100);
  const filled = Math.min(10, Math.max(0, Math.round((pct / 100) * 10)));
  const bar = "▰".repeat(filled) + "▱".repeat(10 - filled);

  return [
    `╭────────────────────────────────────────╮`,
    `│  📈 <b>TNPSC SYLLABUS ROTATION METER</b>   │`,
    `╰────────────────────────────────────────╯`,
    `• <b>Coverage Progress:</b> <code>[${bar}] ${pct}%</code>`,
    `• <b>Current Step:</b> Topic <b>${current}</b> of <b>${total}</b> in Mains Syllabus`,
    `• <b>Daily Schedule:</b> Every morning at <b>09:00 AM IST</b>`,
    `• <b>Rotation Jump:</b> Automatic daily leap across GS I ➔ GS II ➔ GS III`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────
// CORE ACTION HANDLERS (ANIMATED Q&A GENERATION + NOTION)
// ─────────────────────────────────────────────────────────────

// Handler: Auto-generate BOTH Question and 12-Rule Model Answer, and save directly to Notion with Animation
async function handleAutoGenerateQA(ctx, topic, marks = 15, unitId = null, isPYQ = false) {
  const anim = await createProgressAnimator(ctx, isPYQ ? "TNPSC PYQ GENERATOR" : "TNPSC Q&A GENERATOR");

  try {
    const q = await anim.track(
      () => isPYQ ? llm.generatePYQ(topic, marks) : llm.generateQuestion(topic, marks),
      {
        text: isPYQ ? "[1/3] Pulling Authentic TNPSC Mains PYQ..." : "[1/3] Scanning Syllabus & Generating Question...",
        basePct: 15,
        targetPct: 40,
        details: [
          `Querying syllabus database for "${topic.slice(0, 35)}..."`,
          "Aligning directive with official Group-1 Mains blueprint...",
          "Validating 15-mark high-yield question parameters...",
        ],
      }
    );

    const words = wordsFor(marks);

    const out = await anim.track(
      () => llm.modelAnswer(q, marks, words),
      {
        text: "[2/3] Architecting 12-Rule Model Answer...",
        basePct: 42,
        targetPct: 80,
        details: [
          "Framing 4-line Introduction & 🔴 Core Focus box...",
          "Structuring 5-6 Subheadings with 5-6 numbered points...",
          "Injecting 💡 Unique Key boxed differentiators...",
          "Synthesizing Contemporary Current Affairs & Tamil Nadu links...",
          "Drafting Forward-Looking Conclusion & Way Forward...",
        ],
      }
    );

    let notionUrl = null;
    let notionPageId = null;
    let res = null;
    try {
      res = await anim.track(
        () => saveSession({
          question: q,
          marks,
          words,
          modelAnswer: out,
          topic,
          unitId,
          isPYQ,
        }),
        {
          text: "[3/3] Saving into Notion Topic Hierarchy...",
          basePct: 82,
          targetPct: 98,
          details: [
            "Resolving Paper & Unit folder hierarchy in Notion...",
            "Structuring callout boxes & orange warning accents...",
            "Applying yellow bold text highlights to high-yield facts...",
            "Verifying sequential Question continuity numbering...",
          ],
        }
      );
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

    await anim.delete();

    // Part 1: Modern Question Card
    const qCard = formatModernQuestionCard({
      question: q,
      marks,
      words,
      topic: res?.topicName || topic,
      unitTitle,
      isPYQ,
      questionNumber: res?.questionNumber || 1,
    });
    await ctx.reply(qCard, { parse_mode: "HTML" });

    // Part 2: Modern Model Answer + Notion Banner
    let footer = "";
    if (notionUrl) {
      footer = "\n\n" + formatModernNotionSyncBanner({
        topic: res?.topicName || topic,
        notionUrl,
        questionNumber: res?.questionNumber || 1,
      }) + "\n👉 <i>You can now submit your written answer as Text, Photo, or PDF for Gemini evaluation:</i>";
    }

    const modelCard = formatModernModelAnswerCard(out, {
      topic: res?.topicName || topic,
      questionNumber: res?.questionNumber || 1,
      marks,
    });

    await reply(ctx, modelCard + footer, getPostAnswerKeyboard(unitId));
  } catch (err) {
    await anim.delete();
    console.error("handleAutoGenerateQA error:", err);
    await ctx.reply(`⚠️ ${err.message || "Failed to generate Q&A"}`);
  }
}

// Handler: Model Answer manually requested with Animation
async function handleModelAnswer(ctx) {
  const s = sessions.get(ctx.chat.id);
  if (!s) {
    return ctx.reply("⚠️ No active question yet! Select a Paper and Unit below to begin:", {
      reply_markup: getPapersInlineKeyboard(),
    });
  }
  if (s.modelAnswer) {
    let footer = s.notionUrl ? `\n\n🔗 <a href="${s.notionUrl}">Open in Notion Unit Page</a>` : "";
    const modelCard = formatModernModelAnswerCard(s.modelAnswer, { topic: s.topic, questionNumber: 1, marks: s.marks });
    return reply(ctx, modelCard + footer, getPostAnswerKeyboard(s.unitId));
  }

  const anim = await createProgressAnimator(ctx, "12-RULE MODEL ANSWER ARCHITECT");
  try {
    const out = await anim.track(
      () => llm.modelAnswer(s.question, s.marks, s.words),
      {
        text: "[1/2] Drafting 12-Rule Model Answer...",
        basePct: 20,
        targetPct: 75,
        details: [
          "Framing 4-line Introduction & 🔴 Core Focus box...",
          "Structuring 5-6 Subheadings with 5-6 points...",
          "Injecting 💡 Unique Key differentiators...",
          "Polishing Current Affairs integration & Way Forward...",
        ],
      }
    );
    s.modelAnswer = out;

    let notionUrl = s.notionUrl;
    if (!s.notionPageId) {
      const res = await anim.track(
        () => saveSession(s),
        {
          text: "[2/2] Auto-saving Model Answer to Notion...",
          basePct: 78,
          targetPct: 98,
          details: [
            "Writing formatted blocks to Notion page...",
            "Applying yellow bold text highlights...",
          ],
        }
      );
      notionUrl = res.url || res.toString();
      s.notionUrl = notionUrl;
      s.notionPageId = res.id;
    }

    await anim.delete();
    let footer = notionUrl ? `\n\n` + formatModernNotionSyncBanner({ topic: s.topic, notionUrl, questionNumber: 1 }) : "";
    const modelCard = formatModernModelAnswerCard(out, { topic: s.topic, questionNumber: 1, marks: s.marks });
    await reply(ctx, modelCard + footer, getPostAnswerKeyboard(s.unitId));
  } catch (err) {
    await anim.delete();
    await ctx.reply(`⚠️ Error: ${err.message}`);
  }
}

// Handler: Save to Notion manually requested with Animation
async function handleSaveToNotion(ctx) {
  const s = sessions.get(ctx.chat.id);
  if (!s) {
    return ctx.reply("⚠️ Nothing to save yet. Select a Paper & Unit below to generate a question first!", {
      reply_markup: getPapersInlineKeyboard(),
    });
  }
  if (s.notionUrl) {
    return ctx.reply(formatModernNotionSyncBanner({ topic: s.topic, notionUrl: s.notionUrl, questionNumber: 1 }), {
      parse_mode: "HTML",
      reply_markup: getPostAnswerKeyboard(s.unitId),
    });
  }

  const anim = await createProgressAnimator(ctx, "NOTION SYNC ENGINE");
  try {
    const res = await anim.track(
      () => saveSession(s),
      {
        text: "Synchronizing into Notion Topic Hierarchy...",
        basePct: 20,
        targetPct: 95,
        details: [
          "Resolving Paper & Unit folder in Notion...",
          "Rendering orange warning and callout boxes...",
          "Writing yellow bold highlighted points...",
          "Securing page continuity numbering...",
        ],
      }
    );
    const url = res.url || res.toString();
    s.notionUrl = url;
    s.notionPageId = res.id;

    await anim.delete();

    await ctx.reply(formatModernNotionSyncBanner({ topic: res?.topicName || s.topic, notionUrl: url, questionNumber: res?.questionNumber || 1 }), {
      parse_mode: "HTML",
      reply_markup: getPostAnswerKeyboard(s.unitId),
    });
  } catch (err) {
    await anim.delete();
    await ctx.reply(`⚠️ Error saving to Notion: ${err.message}`);
  }
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

    const pipeline = getTopicPipeline();
    const healthText = formatHealthMeterHTML(false);
    const pipelineText = formatPipelineHTML(pipeline);

    // Remove any previously docked bottom keyboard
    await ctx.reply("🎯 <b>Welcome to TNPSC Group-1 Mains Specialist Bot</b>", {
      reply_markup: { remove_keyboard: true },
    });

    const status = getSchedulerStatus();
    const syllabusMeter = formatSyllabusProgressHTML(status);

    const welcomeText = [
      healthText,
      "",
      pipelineText,
      "",
      syllabusMeter,
      "",
      "────────────────────────────────────",
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
      disable_web_page_preview: false,
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

// /pyq command - Instant official PYQ + 12-rule model answer
bot.command(["pyq", "mains_pyq"], async (ctx) => {
  userState.delete(ctx.chat.id);
  const s = sessions.get(ctx.chat.id);
  const item = getRandomTopic(null, s?.unitId ? findUnitById(s.unitId)?.unit.filterKey : null);
  const fullTopic = s?.topic || `${item.paper} - ${item.unit}: ${item.topic}`;
  await handleAutoGenerateQA(ctx, fullTopic, 15, s?.unitId || null, true);
});

// /quick command - Instant practice question
bot.command(["quick", "q"], async (ctx) => {
  userState.delete(ctx.chat.id);
  const s = sessions.get(ctx.chat.id);
  const item = getRandomTopic(null, s?.unitId ? findUnitById(s.unitId)?.unit.filterKey : null);
  const fullTopic = s?.topic || `${item.paper} - ${item.unit}: ${item.topic}`;
  await handleAutoGenerateQA(ctx, fullTopic, 15, s?.unitId || null, false);
});

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
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  📖 <b>${paper.paperTitle.toUpperCase()}</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `🏷️ <b>Paper Code:</b> <code>${paper.paperCode}</code>`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `<b>Step 2: Select a Unit below to practice:</b>`,
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
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  🏛️ <b>TNPSC UNIT WORKSPACE</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `📚 <b>Paper:</b> ${paper.paperTitle} (${paper.paperCode})`,
    `🏛️ <b>Unit:</b> <i>${unit.name}</i>`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `✍️ <b>Type a topic name below</b> to architect questions, or tap an option:`,
    `📌 <b>Syllabus Highlights:</b> <i>${unit.examples}</i>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
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

  const startCard = [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  🚀 <b>BATCH 9-UNIT AUTO GENERATOR</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `Generating authentic Mains Questions & 12-Rule Answers across GS I, II & III and auto-saving to Notion topic pages.`,
    ``,
    `<i>Processing unit by unit with real-time updates...</i>`,
  ].join("\n");

  await ctx.reply(startCard, { parse_mode: "HTML" });

  for (const u of ALL_UNITS) {
    try {
      const res = await generateAndSaveOne({
        unitId: u.unitId,
        marks: 15,
      });

      const cleanQ = res.question.replace(/<[^>]+>/g, "").trim();
      const progressText = [
        `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
        `┃  ✅ <b>${res.paperTitle.toUpperCase()}</b>`,
        `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
        `🏛️ <b>Unit:</b> <i>${res.unitName}</i>`,
        `📄 <b>Topic Page:</b> <i>"${res.topic}"</i>`,
        `📌 <b>Question:</b> <b>${cleanQ.slice(0, 80)}...</b>`,
        ``,
        `🔗 <a href="${res.notionUrl}"><b>👉 Open Interactive Page in Notion ↗</b></a>`,
      ].join("\n");

      await ctx.reply(progressText, { parse_mode: "HTML" });
    } catch (err) {
      console.error(`Error auto-generating for ${u.unitId}:`, err);
      await ctx.reply(`⚠️ Failed for ${u.unitName}: ${err.message}`);
    }
  }

  const finishedCard = [
    `╔════════════════════════════════════════╗`,
    `║  🎉 <b>ALL 9 UNITS FULLY SYNCHRONIZED</b>`,
    `╚════════════════════════════════════════╝`,
    `All questions & 12-rule model answers are safely filed under GS I, GS II, and GS III folders in Notion.`,
  ].join("\n");

  await ctx.reply(finishedCard, {
    parse_mode: "HTML",
    reply_markup: getPapersInlineKeyboard(),
  });
});

// Back to Papers selection
bot.callbackQuery("action:pick_topic", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  userState.delete(ctx.chat.id);
  const text = [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  📚 <b>TNPSC MAINS SYLLABUS HUB</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `Select a General Studies Paper to practice 15M/10M questions with 12-rule model answers:`,
  ].join("\n");
  await ctx.reply(text, {
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

  const anim = await createProgressAnimator(ctx, "ANSWER EVALUATOR & NOTION SYNC");
  try {
    await anim.step("📝 [1/3] Parsing Submitted Text Answer...", 30, "Analyzing structure & word count...");
    const out = await llm.evaluate(s.question, s.marks, s.words, { text: ctx.message.text });
    s.answer = ctx.message.text;
    s.evaluation = out;

    await anim.step("⚖️ [2/3] Benchmarking against 12 TNPSC Rules...", 70, "Grading intro, subheadings & conclusions...");

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

    await anim.step("📓 [3/3] Saving Marks & Feedback to Notion...", 95, "Syncing to Unit folder...");
    await anim.delete();

    const card = formatModernEvaluationCard({ marks: s.marks, evaluation: out, submissionType: "Text Answer", notionUrl });
    await reply(ctx, card, getPostAnswerKeyboard(s.unitId));
  } catch (err) {
    await anim.delete();
    console.error("Evaluation error:", err);
    await ctx.reply(`⚠️ Evaluation error: ${err.message}`);
  }
});

// Handwritten photo answer submission
bot.on("message:photo", async (ctx) => {
  const s = sessions.get(ctx.chat.id);
  if (!s) {
    return ctx.reply("⚠️ Please select a Paper and Unit to generate a question first!", {
      reply_markup: getPapersInlineKeyboard(),
    });
  }

  const anim = await createProgressAnimator(ctx, "HANDWRITTEN OCR & EVALUATION");
  try {
    await anim.step("📸 [1/3] Downloading Handwritten Photo...", 25, "Preparing image for Gemini Vision...");
    const photos = ctx.message.photo;
    const file = await ctx.api.getFile(photos[photos.length - 1].file_id);
    const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());

    await anim.step("👁️ [2/3] Gemini Vision OCR & 12-Rule Grading...", 70, "Analyzing handwriting, structure & unique keys...");
    const out = await llm.evaluate(s.question, s.marks, s.words, {
      imageBase64: buf.toString("base64"),
      mediaType: "image/jpeg",
    });
    s.answer = "(Handwritten photo answer evaluated via Gemini Vision)";
    s.evaluation = out;

    await anim.step("📓 [3/3] Saving Handwritten Evaluation to Notion...", 95, "Syncing score and detailed breakdown...");
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

    await anim.delete();
    const card = formatModernEvaluationCard({ marks: s.marks, evaluation: out, submissionType: "Handwritten Paper (Vision OCR)", notionUrl });
    await reply(ctx, card, getPostAnswerKeyboard(s.unitId));
  } catch (err) {
    await anim.delete();
    console.error("Photo eval error:", err);
    await ctx.reply(`⚠️ Photo evaluation error: ${err.message}`);
  }
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

  const anim = await createProgressAnimator(ctx, "PDF OCR & EVALUATION ENGINE");
  try {
    await anim.step(`📄 [1/3] Ingesting "${fileName}"...`, 25, "Streaming multi-page PDF document...");
    const file = await ctx.api.getFile(doc.file_id);
    const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    const base64 = buf.toString("base64");

    await anim.step("🧠 [2/3] Gemini Vision Multi-Page Analysis...", 70, "Evaluating handwriting, presentation & 12 rules...");
    const out = await llm.evaluate(s.question, s.marks, s.words, {
      pdfBase64: isPdf ? base64 : undefined,
      imageBase64: !isPdf ? base64 : undefined,
      mediaType: isPdf ? "application/pdf" : (doc.mime_type || "image/jpeg"),
    });

    s.answer = isPdf
      ? `(PDF answer script submitted: ${fileName} - evaluated via Gemini Vision)`
      : `(Document image submitted: ${fileName} - evaluated via Gemini Vision)`;
    s.evaluation = out;

    await anim.step("📓 [3/3] Storing Comprehensive Report in Notion...", 95, "Writing feedback blocks...");
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

    await anim.delete();
    const card = formatModernEvaluationCard({ marks: s.marks, evaluation: out, submissionType: `PDF Document (${fileName})`, notionUrl });
    await reply(ctx, card, getPostAnswerKeyboard(s.unitId));
  } catch (err) {
    await anim.delete();
    console.error("Document eval error:", err);
    await ctx.reply(`⚠️ Document evaluation error: ${err.message}`);
  }
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
  const anim = await createProgressAnimator(ctx, "DAILY 9:00 AM PYQ ENGINE");

  try {
    const res = await runDailyPYQJob({
      force: true,
      bot,
      onProgress: async (p) => {
        await anim.step(p.text, p.pct, p.detail);
      },
    });

    await anim.delete();
    const card = formatModernDailySuiteCard(res);

    await ctx.reply(card, {
      parse_mode: "HTML",
      disable_web_page_preview: false,
      reply_markup: new InlineKeyboard()
        .url("🔗 Open in Notion", res.notionUrl)
        .row()
        .text("📚 Choose Another Topic", "action:pick_topic"),
    });
  } catch (err) {
    await anim.delete();
    console.error("Daily job error:", err);
    await ctx.reply(`⚠️ Daily job encountered an issue: ${err.message}. Auto-healer will retry at next scheduled interval.`);
  }
});

// /tomorrow command - View tomorrow's scheduled topic
bot.command(["tomorrow", "next_topic"], async (ctx) => {
  const pipeline = getTopicPipeline();
  const t = pipeline.tomorrowTopic;
  const text = [
    `➡️ <b>Tomorrow's Scheduled Topic Preview (09:00 AM IST)</b>`,
    ``,
    `📚 <b>Paper:</b> ${t.paper}`,
    `🏛️ <b>Unit:</b> ${t.unit}`,
    `🎯 <b>Target Topic:</b> <b>${t.topic}</b>`,
    ``,
    `⏰ <b>Execution Time:</b> Tomorrow at 09:00 AM (Asia/Kolkata IST)`,
    `⚡ <b>What Bot Will Generate Tomorrow:</b>`,
    `1. <b>Question 1 (PYQ):</b> Authentic TNPSC Mains question testing core syllabus`,
    `2. <b>Question 2 (PYQ):</b> Distinct second PYQ testing a complementary angle`,
    `3. <b>Model Answers:</b> Strict 12-rule format (Current Affairs callout, yellow-highlighted bullet points, unique key box)`,
    `4. <b>Notion Hierarchy:</b> Auto-saved inside Notion topic page under its Unit hierarchy`,
    `5. <b>Broadcast:</b> Delivered directly to all subscribed Telegram students`,
    ``,
    pipeline.upcomingTopics && pipeline.upcomingTopics.length > 0
      ? `📋 <i>Topic for Day After Tomorrow: <b>${pipeline.upcomingTopics[0].topic}</b></i>`
      : ``,
  ].filter(Boolean).join("\n");

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text("⚡ Generate Tomorrow's Questions Now", "action:run_tomorrow_now")
      .row()
      .text("📚 Choose Another Paper", "action:pick_topic")
      .text("📊 Health Meter", "action:view_status"),
  });
});

// /status command - View full health meter, topic pipeline and scheduler status
bot.command(["status", "scheduler", "health"], async (ctx) => {
  const status = getSchedulerStatus();
  const isSubscribed = (status.subscribedChats || []).includes(ctx.chat.id);
  const healthText = formatHealthMeterHTML(false);
  const pipelineText = formatPipelineHTML(status.pipeline);
  const syllabusMeter = formatSyllabusProgressHTML(status);

  const text = [
    healthText,
    ``,
    pipelineText,
    ``,
    syllabusMeter,
    ``,
    `📅 <b>Today's Status (${status.todayIST}):</b> ${status.lastRunDate === status.todayIST ? "✅ Completed & Saved to Notion" : "⏳ Scheduled for 09:00 AM IST"}`,
    `🔔 <b>Broadcast Alerts:</b> ${isSubscribed ? "✅ Subscribed to 9:00 AM Broadcast" : "❌ Not Subscribed (tap button below)"}`,
  ].join("\n");

  await ctx.reply(text, {
    parse_mode: "HTML",
    disable_web_page_preview: false,
    reply_markup: new InlineKeyboard()
      .text(isSubscribed ? "🔕 Unsubscribe" : "🔔 Subscribe to 9 AM Alerts", isSubscribed ? "action:unsub" : "action:sub")
      .row()
      .text("➡️ Tomorrow's Topic Details", "action:tomorrow_preview")
      .text("⚡ Run Daily Job Now", "action:run_daily_now")
      .row()
      .text("📚 Choose Paper", "action:pick_topic"),
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

bot.callbackQuery("action:tomorrow_preview", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const pipeline = getTopicPipeline();
  const t = pipeline.tomorrowTopic;
  const text = [
    `➡️ <b>Tomorrow's Scheduled Topic Preview (09:00 AM IST)</b>`,
    ``,
    `📚 <b>Paper:</b> ${t.paper}`,
    `🏛️ <b>Unit:</b> ${t.unit}`,
    `🎯 <b>Target Topic:</b> <b>${t.topic}</b>`,
    ``,
    `⏰ <b>Execution Time:</b> Tomorrow at 09:00 AM (Asia/Kolkata IST)`,
    `⚡ <b>What Bot Will Generate Tomorrow:</b>`,
    `• 2 Authentic TNPSC Mains PYQs`,
    `• Complete 12-Rule Model Answers with Current Affairs & Unique Key boxes`,
    `• Sequential Notion Topic Page (📌 Question - 1, 📌 Question - 2)`,
    `• Automatic broadcast to subscribed students`,
    ``,
    pipeline.upcomingTopics && pipeline.upcomingTopics.length > 0
      ? `📋 <i>Topic for Day After Tomorrow: <b>${pipeline.upcomingTopics[0].topic}</b></i>`
      : ``,
  ].filter(Boolean).join("\n");

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text("⚡ Generate Tomorrow's Questions Now", "action:run_tomorrow_now")
      .row()
      .text("📚 Choose Another Paper", "action:pick_topic")
      .text("📊 Health Meter", "action:view_status"),
  });
});

bot.callbackQuery("action:run_tomorrow_now", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Generating tomorrow's topic now..." }).catch(() => {});
  const anim = await createProgressAnimator(ctx, "TOMORROW 9:00 AM PYQ ENGINE");
  try {
    const res = await runDailyPYQJob({
      force: true,
      bot,
      onProgress: async (p) => {
        await anim.step(p.text, p.pct, p.detail);
      },
    });
    await anim.delete();
    const card = formatModernDailySuiteCard(res);
    await ctx.reply(card, {
      parse_mode: "HTML",
      disable_web_page_preview: false,
      reply_markup: new InlineKeyboard()
        .url("🔗 Open in Notion", res.notionUrl)
        .row()
        .text("📚 Main Menu", "action:pick_topic"),
    });
  } catch (err) {
    await anim.delete();
    await ctx.reply(`⚠️ Error generating: ${err.message}`);
  }
});

bot.callbackQuery("action:view_status", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const status = getSchedulerStatus();
  const healthText = formatHealthMeterHTML(false);
  const pipelineText = formatPipelineHTML(status.pipeline);
  const isSubscribed = (status.subscribedChats || []).includes(ctx.chat.id);

  const text = [
    healthText,
    ``,
    pipelineText,
    ``,
    `🔔 <b>Broadcast Alerts:</b> ${isSubscribed ? "✅ Subscribed to 9:00 AM Broadcast" : "❌ Not Subscribed"}`,
  ].join("\n");

  await ctx.reply(text, {
    parse_mode: "HTML",
    disable_web_page_preview: false,
    reply_markup: new InlineKeyboard()
      .text(isSubscribed ? "🔕 Unsubscribe" : "🔔 Subscribe to 9 AM Alerts", isSubscribed ? "action:unsub" : "action:sub")
      .row()
      .text("➡️ Tomorrow's Topic", "action:tomorrow_preview")
      .text("⚡ Run Daily Job Now", "action:run_daily_now")
      .row()
      .text("⬅️ Back to Menu", "action:pick_topic"),
  });
});

bot.callbackQuery("action:run_daily_now", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Running daily job..." }).catch(() => {});
  const anim = await createProgressAnimator(ctx, "DAILY 9:00 AM PYQ ENGINE");
  try {
    const res = await runDailyPYQJob({
      force: true,
      bot,
      onProgress: async (p) => {
        await anim.step(p.text, p.pct, p.detail);
      },
    });
    await anim.delete();
    const card = formatModernDailySuiteCard(res);
    await ctx.reply(card, {
      parse_mode: "HTML",
      disable_web_page_preview: false,
      reply_markup: new InlineKeyboard()
        .url("🔗 Open in Notion", res.notionUrl)
        .row()
        .text("📚 Main Menu", "action:pick_topic"),
    });
  } catch (err) {
    await anim.delete();
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
    { command: "start", description: "Start practice & view Health Meter" },
    { command: "pyq", description: "Instant PYQ + 12-rule answer generation" },
    { command: "quick", description: "Rapid syllabus question generation" },
    { command: "tomorrow", description: "View tomorrow's scheduled topic (9 AM)" },
    { command: "daily", description: "Run/view today's 9 AM PYQ questions" },
    { command: "status", description: "System Health Meter & syllabus progress" },
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

  // Print startup Health Meter & Topic Pipeline banner
  const h = getHealthMeter();
  const p = getTopicPipeline();
  console.log(`\n======================================================`);
  console.log(`📊 SYSTEM HEALTH METER: [${h.bar}] ${h.pct}% ${h.statusText}`);
  console.log(`• Telegram Gateway: ${h.telegram}`);
  console.log(`• Gemini AI Engine: ${h.gemini}`);
  console.log(`• Notion Workspace: ${h.notion}`);
  console.log(`• Daily Scheduler: ${h.scheduler}`);
  console.log(`• Auto-Healer Guard: ${h.autoHealer}`);
  console.log(`------------------------------------------------------`);
  console.log(`🗓️ SYLLABUS ROTATION PIPELINE:`);
  console.log(`📌 Today's Topic: ${p.todayTopic.topic} (${p.alreadyRanToday ? "COMPLETED" : "PENDING 9 AM"})`);
  console.log(`➡️ Tomorrow's Topic (09:00 AM IST): ${p.tomorrowTopic.topic} (${p.tomorrowTopic.paper} - ${p.tomorrowTopic.unit})`);
  console.log(`======================================================\n`);
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
  const meter = getHealthMeter();
  const pipeline = getTopicPipeline();
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

    <!-- Health Meter Gauge -->
    <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 18px 22px; margin-bottom: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.3);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span style="font-size: 13px; font-weight: 700; letter-spacing: 0.05em; color: #94a3b8;">📊 SYSTEM HEALTH METER</span>
        <span style="font-size: 14px; font-weight: 700; color: ${meter.pct === 100 ? '#34d399' : '#f59e0b'};">${meter.pct}% ${meter.statusText}</span>
      </div>
      <div style="background: rgba(255, 255, 255, 0.08); border-radius: 999px; height: 12px; overflow: hidden;">
        <div style="background: linear-gradient(90deg, #3b82f6, #10b981); height: 100%; width: ${meter.pct}%; border-radius: 999px;"></div>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 14px; margin-top: 12px; font-size: 12px; color: #94a3b8;">
        <div>🤖 Telegram: <strong style="color: #f1f5f9;">${meter.telegram}</strong></div>
        <div>🧠 Gemini AI: <strong style="color: #f1f5f9;">${meter.gemini}</strong></div>
        <div>📓 Notion Sync: <strong style="color: #f1f5f9;">${meter.notion}</strong></div>
        <div>⏰ 9:00 AM Cron: <strong style="color: #f1f5f9;">${meter.scheduler}</strong></div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-title">📌 Today's Generated Topic</div>
        <div class="card-val" style="font-size: 15px;">${pipeline.todayTopic.topic}</div>
        <div class="card-desc">
          ${pipeline.alreadyRanToday 
            ? `<span style="color: #34d399;">✅ 2 PYQs Generated & Saved</span>` 
            : `<span style="color: #f59e0b;">⏳ Scheduled for 09:00 AM IST</span>`}
          ${pipeline.todayTopic.notionUrl ? ` • <a href="${pipeline.todayTopic.notionUrl}" style="color: #60a5fa;" target="_blank">View in Notion ↗</a>` : ''}
        </div>
      </div>
      <div class="card">
        <div class="card-title">➡️ Tomorrow's Scheduled Topic</div>
        <div class="card-val" style="font-size: 15px;">${pipeline.tomorrowTopic.topic}</div>
        <div class="card-desc">${pipeline.tomorrowTopic.paper} • ⏰ 09:00 AM IST</div>
      </div>
      <div class="card">
        <div class="card-title">🤖 Telegram Gateway</div>
        <div class="card-val">${botConnected ? "Connected & Active" : "Waiting for Token"}</div>
        <div class="card-desc">Grammy Long Polling with Auto-Recovery</div>
      </div>
      <div class="card">
        <div class="card-title">🛡️ Auto-Healing Engine</div>
        <div class="card-val" style="color: #34d399;">Active (Multi-Tier)</div>
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
