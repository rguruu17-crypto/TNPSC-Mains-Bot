require("dotenv").config();
const http = require("http");
const { Bot, InlineKeyboard, InputFile } = require("grammy");
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
const {
  maskKey,
  updateEnvFile,
  checkGeminiHealth,
  checkNotionHealth,
  checkAllApiHealth,
  formatApiSettingsCard,
} = require("./api_manager");
const {
  getStatCategories,
  formatCategoryCard,
  searchStats,
  formatSearchResultsCard,
} = require("./tn_stats");
const {
  recordSubmission,
  extractScoreFromEval,
  formatAnalyticsCard,
} = require("./analytics_manager");
const {
  SCHEME_CAPSULES,
  getAllCapsules,
  getCapsuleById,
  searchCapsules,
  formatCapsuleCard,
} = require("./capsule_vault");
const {
  generateQCABPdf,
  generateRevisionBiblePdf,
} = require("./pdf_generator");
const { evaluateQCABSheet, extractQuestionFromSheet } = require("./qcab_evaluator");

const {
  generateMarkedCoverPdf,
  generateModelAnswerPdf,
  mergeEvaluationPdfs,
} = require("./qcab_result_pdf");
const fs   = require("fs");
const path = require("path");

const {
  CURATED_EDITORIALS,
  getCuratedEditorials,
  getCuratedEditorialById,
  formatEditorialCard,
} = require("./editorial_linker");
const {
  BUDGET_MACRO,
  SECTORAL_GSVA,
  DEPARTMENT_ALLOCATIONS,
  formatBudgetSummaryCard,
  formatDepartmentAllocationsCard,
} = require("./economic_survey_budget");
const {
  fetchUrlText,
  ingestArticleContent,
  ingestUrlToNotion,
  ingestMultipleUrls,
} = require("./url_content_ingester");
const {
  recordTelegramUser,
  detectWebsiteName,
  getAllUsers,
} = require("./user_manager");

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
const WORDS_BY_MARKS = { 5: 80, 10: 150, 15: 250, 20: 350 };
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
    .row();

  kb.text("⏱️ 12-Min Mock Exam", "action:start_mock_exam")
    .text("📊 Mastery Radar", "action:analytics")
    .row();

  kb.text("🌟 Scheme Capsules", "action:capsule_menu")
    .text("📑 QCAB Answer Booklet", "action:qcab_pdf")
    .row();

  kb.text("📰 Editorial Linker", "action:editorial_menu")
    .text("💰 Budget & Survey", "action:budget_menu")
    .row();

  kb.text("📖 Revision Bible PDF", "action:revision_bible")
    .text("🎯 TN Stats Bank", "action:tn_stats")
    .row();

  kb.text("⚡ Auto-Generate for All 9 Units (GS I, II & III)", "action:auto_all_papers")
    .row()
    .text("📊 Health Meter", "action:view_status")
    .text("⚙️ API Keys & Updater", "action:api_settings");

  return kb;
}

// TN Official Policy & Stats Bank Categories Keyboard
function getStatsCategoriesKeyboard() {
  const categories = getStatCategories();
  const kb = new InlineKeyboard();
  for (let i = 0; i < categories.length; i += 2) {
    const c1 = categories[i];
    const c2 = categories[i + 1];
    if (c2) {
      kb.text(c1.name.split(" ")[0] + " " + c1.name.split(" ")[1], `stats:cat:${c1.key}`)
        .text(c2.name.split(" ")[0] + " " + c2.name.split(" ")[1], `stats:cat:${c2.key}`)
        .row();
    } else {
      kb.text(c1.name, `stats:cat:${c1.key}`).row();
    }
  }
  kb.text("⬅️ Back to Main Menu", "action:pick_topic");
  return kb;
}

// Tamil Nadu Scheme Capsules Keyboard
function getCapsulesKeyboard() {
  const capsules = getAllCapsules();
  const kb = new InlineKeyboard();
  for (let i = 0; i < capsules.length; i += 2) {
    const c1 = capsules[i];
    const c2 = capsules[i + 1];
    if (c2) {
      kb.text(c1.title.split(" ")[0] + " " + (c1.title.split(" ")[1] || ""), `capsule:view:${c1.id}`)
        .text(c2.title.split(" ")[0] + " " + (c2.title.split(" ")[1] || ""), `capsule:view:${c2.id}`)
        .row();
    } else {
      kb.text(c1.title, `capsule:view:${c1.id}`).row();
    }
  }
  kb.text("📖 Download Revision Bible PDF", "action:revision_bible").row();
  kb.text("⬅️ Back to Main Menu", "action:pick_topic");
  return kb;
}

// Daily Editorial Linker Keyboard
function getEditorialsKeyboard() {
  const list = getCuratedEditorials();
  const kb = new InlineKeyboard();
  list.forEach((e) => {
    kb.text(`📰 ${e.theme.slice(0, 34)}...`, `editorial:view:${e.id}`).row();
  });
  kb.text("✍️ Enter Custom Editorial Topic", "action:custom_editorial").row();
  kb.text("⬅️ Back to Main Menu", "action:pick_topic");
  return kb;
}

// Economic Survey & Budget Navigation Keyboard
function getBudgetMenuKeyboard() {
  return new InlineKeyboard()
    .text("📊 Macro Fiscal Indicators", "budget:macro")
    .text("🏛️ Departmental Outlays", "budget:depts")
    .row()
    .text("🌾 GSVA Sectoral Share", "budget:sectors")
    .text("🎯 High-Yield TN Stats", "action:tn_stats")
    .row()
    .text("⬅️ Back to Main Menu", "action:pick_topic");
}

// API Credentials & Health Settings Keyboard
function getApiSettingsKeyboard() {
  return new InlineKeyboard()
    .text("🩺 Run Live Health Check", "action:check_api_health")
    .row()
    .text("🔑 Update Gemini API Key", "action:update_gemini_key")
    .text("📓 Update Notion Token", "action:update_notion_key")
    .row()
    .text("📄 Update Notion Root Page ID", "action:update_notion_db")
    .row()
    .text("⬅️ Back to Main Menu", "action:pick_topic");
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
    .text("📜 Authentic PYQ (15 Marks • 2 ½p)", `pyqunit:${unitId}:15`)
    .text("📜 Authentic PYQ (10 Marks • 1 ½p)", `pyqunit:${unitId}:10`)
    .row()
    .text("✍️ Practice Q (15 Marks • 2 ½p)", `auto:${unitId}:15`)
    .text("✍️ Practice Q (10 Marks • 1 ½p)", `auto:${unitId}:10`)
    .row()
    .text("🎲 Suggest a Topic from Syllabus", `suggest:${unitId}`)
    .row()
    .text("⏱️ 12-Min Mock Exam for this Unit", `mockunit:${unitId}`)
    .row()
    .text("⬅️ Change Unit", "action:pick_topic");
}

// Actions after Question & Model Answer are displayed
function getPostAnswerKeyboard(unitId = null) {
  const kb = new InlineKeyboard()
    .text("🗺️ Answer Diagram", "action:diagram")
    .text("📑 Printable QCAB PDF", "action:qcab_pdf")
    .row()
    .text("📊 Mastery Radar", "action:analytics")
    .text("🌟 Scheme Capsule", "action:capsule_menu")
    .row();
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
    .text("🎯 12-Rule Model Answer", "action:model")
    .text("🗺️ Answer Diagram", "action:diagram")
    .row()
    .text("⏱️ 12-Min Mock Exam", "action:start_mock_exam")
    .text("📑 Printable QCAB PDF", "action:qcab_pdf")
    .row()
    .text("🌟 Scheme Capsule", "action:capsule_menu")
    .text("📓 Save to Notion", "action:save")
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

function formatModernEvaluationCard({ marks, evaluation, submissionType = "Text Answer", notionUrl = null, mockTiming = null }) {
  const headerLines = [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  ⚖️ <b>TNPSC 12-RULE EVALUATION REPORT</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `📝 <b>Submission Type:</b> <code>${submissionType}</code>`,
    `⚖️ <b>Evaluated Weightage:</b> <code>${marks} MARKS</code>`,
  ];

  if (mockTiming) {
    headerLines.push(`⏱️ <b>Exam Time Taken:</b> <code>${mockTiming.timeTakenStr}</code> (Limit: 12:00)`);
    headerLines.push(`⚡ <b>Speed Rating:</b> <b>${mockTiming.speedStatus}</b>`);
  }

  headerLines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  headerLines.push(``);
  headerLines.push(evaluation);
  headerLines.push(``);
  if (notionUrl) {
    headerLines.push(formatModernNotionSyncBanner({ topic: "Student Answer Evaluation", notionUrl, questionNumber: 1 }));
  }

  return headerLines.filter(Boolean).join("\n");
}

function formatModernDiagramCard({ question, diagram }) {
  return [
    `╭────────────────────────────────────────╮`,
    `│  🗺️ <b>TNPSC MAINS VISUAL ANSWER BLUEPRINT</b>  │`,
    `╰────────────────────────────────────────╯`,
    `📋 <b>Target Question:</b>`,
    `<i>${question}</i>`,
    `────────────────────────────────────────`,
    ``,
    diagram,
    ``,
    `────────────────────────────────────────`,
    `💡 <i>Reproduce this schematic on unruled paper to capture 1.5–2.5 presentation bonus marks!</i>`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────
// 12-MINUTE REAL-TIME MOCK EXAM SIMULATOR ENGINE
// ─────────────────────────────────────────────────────────────
const activeMockExams = new Map();

function formatMockTimerCard(mock) {
  const elapsed = Math.floor((Date.now() - mock.startTime) / 1000);
  const remaining = Math.max(0, mock.totalSeconds - elapsed);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const pctRemaining = Math.max(0, Math.min(100, Math.round((remaining / mock.totalSeconds) * 100)));
  const filled = Math.round((pctRemaining / 100) * 12);
  const bar = "█".repeat(filled) + "░".repeat(12 - filled);

  let phase = "Phase 1: Intro & Current Affairs Box (0-3 mins)";
  if (remaining <= 120) {
    phase = "Phase 4: Forward-Looking Conclusion (10-12 mins)";
  } else if (remaining <= 360) {
    phase = "Phase 3: Subheadings 4-6 & Unique Key Boxes (6-10 mins)";
  } else if (remaining <= 540) {
    phase = "Phase 2: Subheadings 1-3 with Keywords (3-6 mins)";
  }

  return [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  ⏱️ <b>12-MINUTE LIVE EXAM TIMER</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `⏳ <b>TIME REMAINING:</b> <code>${timeStr}</code> (${pctRemaining}%)`,
    `<code>[${bar}]</code>`,
    ``,
    `🎯 <b>Current Target:</b> <i>${phase}</i>`,
    `📝 <b>Standard:</b> 15 Marks (~250 words) • 12-Rule Structure`,
    `────────────────────────────────`,
    `✍️ <i>Write on paper now! When finished, tap 'Submit Answer Early' or send your photo/PDF directly!</i>`,
  ].join("\n");
}

function getMockTimerKeyboard() {
  return new InlineKeyboard()
    .text("📑 Printable QCAB PDF", "action:qcab_pdf")
    .text("⏹️ Submit Early", "mock:submit_early")
    .row()
    .text("❌ Abort Exam", "mock:abort");
}

function cleanupMockExam(chatId) {
  const mock = activeMockExams.get(chatId);
  if (mock) {
    if (mock.intervalId) clearInterval(mock.intervalId);
    activeMockExams.delete(chatId);
  }
}

function extractMockTiming(chatId) {
  const mock = activeMockExams.get(chatId);
  if (!mock) return null;

  if (mock.intervalId) clearInterval(mock.intervalId);
  const elapsed = mock.elapsedSeconds || Math.floor((Date.now() - mock.startTime) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeTakenStr = `${mins}m ${String(secs).padStart(2, "0")}s`;
  let speedStatus = "✅ Optimal Time Discipline (Finished within 12:00)";
  if (elapsed < 540) {
    speedStatus = "⚡ Lightning Fast Writing Speed (<9 mins)";
  } else if (elapsed > 720) {
    const overSecs = elapsed - 720;
    speedStatus = `⚠️ Overtime by +${Math.floor(overSecs / 60)}m ${overSecs % 60}s (Need faster pacing)`;
  }
  activeMockExams.delete(chatId);
  return { timeTakenStr, speedStatus, elapsed };
}

async function startMockExam(ctx, customTopic = null, unitId = null, existingQuestion = null) {
  const chatId = ctx.chat.id;
  cleanupMockExam(chatId);

  let question = existingQuestion;
  let topic = customTopic;

  if (!question) {
    const anim = await createProgressAnimator(ctx, "MOCK EXAM INITIALIZATION");
    await anim.step("🎲 [1/2] Selecting High-Yield 15-Mark Topic...", 40, "Scanning TNPSC Mains question bank...");
    const item = getRandomTopic(null, unitId ? findUnitById(unitId)?.unit.filterKey : null);
    topic = item ? `${item.paper} - ${item.unit}: ${item.topic}` : "TNPSC Mains GS Topic";

    await anim.step("✍️ [2/2] Generating Exam-Caliber Question...", 85, "Applying official TNPSC directives...");
    question = await llm.generateQuestion(topic, 15);
    await anim.delete();
  }

  // Set active session for the user
  sessions.set(chatId, {
    question,
    marks: 15,
    words: 250,
    topic,
    unitId: unitId || null,
    isMock: true,
  });

  const mock = {
    chatId,
    question,
    topic,
    unitId,
    startTime: Date.now(),
    totalSeconds: 12 * 60, // 720s
    milestoneHalfwaySent: false,
    milestoneFinalSent: false,
    elapsedSeconds: 0,
    intervalId: null,
    timerMsgId: null,
  };

  activeMockExams.set(chatId, mock);

  // Send Mock Question Card
  const qCard = [
    `╔════════════════════════════════════════╗`,
    `║  ⏱️ <b>12-MINUTE REAL-TIME MOCK EXAM</b>   ║`,
    `╚════════════════════════════════════════╝`,
    `🏛️ <b>Topic:</b> <i>${topic}</i>`,
    `⚖️ <b>Weightage:</b> <code>15 MARKS (~250 WORDS)</code>`,
    `⏱️ <b>Strict Time Limit:</b> <code>12 MINUTES (720 SECONDS)</code>`,
    `────────────────────────────────────────`,
    `📋 <b>QUESTION:</b>`,
    `<b>${question}</b>`,
    `────────────────────────────────────────`,
    `📌 <b>MANDATORY 12-RULE STRUCTURE:</b>`,
    `• <b>Intro:</b> 4 lines + 🔴 [CURRENT AFFAIRS BOX]`,
    `• <b>Body:</b> 5 to 6 subheadings with 6 points each & bold keywords`,
    `• <b>Differentiator:</b> 💡 [UNIQUE KEY BOX] in every subheading`,
    `• <b>Conclusion:</b> 4 lines with forward-looking Way Forward`,
    ``,
    `✍️ <b>PENS UP! START WRITING NOW!</b>`,
  ].join("\n");

  await ctx.reply(qCard, { parse_mode: "HTML" });

  // Send live countdown timer message
  const timerMsg = await ctx.reply(formatMockTimerCard(mock), {
    parse_mode: "HTML",
    reply_markup: getMockTimerKeyboard(),
  });
  mock.timerMsgId = timerMsg.message_id;

  // Run countdown ticker every 30 seconds
  mock.intervalId = setInterval(async () => {
    try {
      const cur = activeMockExams.get(chatId);
      if (!cur) return;

      const elapsed = Math.floor((Date.now() - cur.startTime) / 1000);
      const remaining = cur.totalSeconds - elapsed;

      // Milestone 1: 6 minutes remaining (Halfway)
      if (remaining <= 360 && remaining > 300 && !cur.milestoneHalfwaySent) {
        cur.milestoneHalfwaySent = true;
        await ctx.reply(
          `🔔 <b>[HALFWAY CHECKPOINT - 6:00 LEFT]</b>\n<i>You should be on Subheading 3 or 4 now! Ensure each has 6 points with bold keywords and 1 Unique Key box!</i>`,
          { parse_mode: "HTML" }
        ).catch(() => {});
      }

      // Milestone 2: 2 minutes remaining (Warning)
      if (remaining <= 120 && remaining > 60 && !cur.milestoneFinalSent) {
        cur.milestoneFinalSent = true;
        await ctx.reply(
          `⚠️ <b>[FINAL 2 MINUTES WARNING - 2:00 LEFT]</b>\n<i>Wrap up your body points immediately! Draft your 4-line positive Way Forward / Conclusion now!</i>`,
          { parse_mode: "HTML" }
        ).catch(() => {});
      }

      // Time Expired: 0 seconds
      if (remaining <= 0) {
        clearInterval(cur.intervalId);
        cur.intervalId = null;
        cur.elapsedSeconds = cur.totalSeconds;
        await ctx.reply(
          `🚨 <b>PENS DOWN! EXAM TIME EXPIRED (12:00)!</b>\n\n<i>Time is up! Snap a clear photo of your written answer sheet or upload your PDF/text now for evaluation!</i>`,
          { parse_mode: "HTML" }
        ).catch(() => {});
        return;
      }

      // Update timer message
      if (cur.timerMsgId) {
        await ctx.api.editMessageText(chatId, cur.timerMsgId, formatMockTimerCard(cur), {
          parse_mode: "HTML",
          reply_markup: getMockTimerKeyboard(),
        }).catch(() => {});
      }
    } catch (err) {
      console.warn("Mock timer update warning:", err.message);
    }
  }, 30000);
}

// Handler: Generate and deliver authentic TNPSC QCAB Answer Booklet PDF
async function handleQCABPdfRequest(ctx) {
  const s = sessions.get(ctx.chat.id);
  const question = s?.question || "Examine the role of the Justice Party in laying the foundation of social justice and affirmative action in Tamil Nadu.";
  const marks = s?.marks || 15;
  const topic = s?.topic || "Social Justice in Tamil Nadu";
  const found = s?.unitId ? findUnitById(s.unitId) : null;
  const paperCode = found ? found.paper.paperCode : "Paper II";

  const anim = await createProgressAnimator(ctx, "TNPSC QCAB COMPILER");
  try {
    await anim.step("📑 [1/2] Drafting Official Examination Booklet...", 50, "Formatting margins, barcode box & guidelines...");
    const pdfPath = await generateQCABPdf({
      question,
      marks,
      topic,
      paperCode,
    });
    await anim.step("🖨️ [2/2] Exporting High-Resolution Printable PDF...", 90, "Finalizing page coordinates...");
    await anim.delete();

    const fileName = `TNPSC_QCAB_${marks}M_${Date.now().toString().slice(-4)}.pdf`;
    await ctx.replyWithDocument(new InputFile(pdfPath, fileName), {
      caption: [
        `📑 <b>OFFICIAL TNPSC QCAB ANSWER BOOKLET</b>`,
        `────────────────────────────────────`,
        `🏛️ <b>Standard:</b> Group-1 Mains (${paperCode})`,
        `⚖️ <b>Weightage:</b> ${marks} Marks • ~${marks === 15 ? "250" : "150"} Words`,
        `📄 <b>QCAB Allotment:</b> Exactly ${marks === 15 ? "2 ½ Pages" : "1 ½ Pages"}`,
        `⛔ <b>Official Cutoff:</b> Lined guide stops at ${marks === 15 ? "2 ½" : "1 ½"} pages + Examiner Matrix`,
        `────────────────────────────────────`,
        `🖨️ <i>Print this booklet, write your answer with a ballpoint pen within ${marks === 15 ? "12" : "8"} minutes, and upload a photo for evaluation!</i>`,
      ].join("\n"),
      parse_mode: "HTML",
    });
  } catch (err) {
    await anim.delete();
    console.error("QCAB generation error:", err);
    await ctx.reply(`⚠️ QCAB generation error: ${err.message}`);
  }
}

// Handler: Compile and deliver comprehensive Revision Bible PDF
async function handleRevisionBibleRequest(ctx) {
  const anim = await createProgressAnimator(ctx, "REVISION BIBLE COMPILER");
  try {
    await anim.step("📖 [1/3] Compiling Syllabus & Scheme Capsules...", 35, "Ingesting 8 flagship scheme dossiers...");
    const capsules = getAllCapsules();

    await anim.step("🧠 [2/3] Bundling 10M (1 ½p) & 15M (2 ½p) Model Answers...", 70, "Formatting official QCAB page limits...");
    const s = sessions.get(ctx.chat.id);
    const items = [];
    if (s && s.question && s.modelAnswer) {
      items.push({
        question: s.question,
        marks: s.marks,
        topic: s.topic,
        modelAnswer: s.modelAnswer,
      });
    }

    await anim.step("🖨️ [3/3] Compiling Master Printable Compendium...", 95, "Enforcing 1 ½ page (10M) & 2 ½ page (15M) boundaries...");
    const pdfPath = await generateRevisionBiblePdf({ items, capsules });
    await anim.delete();

    const fileName = `TNPSC_Mains_Revision_Bible_${Date.now().toString().slice(-4)}.pdf`;
    await ctx.replyWithDocument(new InputFile(pdfPath, fileName), {
      caption: [
        `📖 <b>TNPSC MAINS ULTIMATE REVISION BIBLE</b>`,
        `────────────────────────────────────`,
        `🌟 <b>Official QCAB Layout Standards:</b>`,
        `• <b>10-Mark Model Answer:</b> Exactly 1 ½ Pages (~150 Words)`,
        `• <b>15-Mark Model Answer:</b> Exactly 2 ½ Pages (~250 Words)`,
        `• <b>8 Flagship Scheme Capsules</b> with 12-rule insertion tags`,
        `• <b>Visual Flowchart / Diagram Box</b> & Examiner Marking Grids`,
        `────────────────────────────────────`,
        `🖨️ <i>Download, print, or review before your test series and exam day!</i>`,
      ].join("\n"),
      parse_mode: "HTML",
    });
  } catch (err) {
    await anim.delete();
    console.error("Bible generation error:", err);
    await ctx.reply(`⚠️ Revision Bible compiler error: ${err.message}`);
  }
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
async function handleAutoGenerateQA(ctx, topic, marks = 15, unitId = null, isPYQ = false, deliverQCAB = true) {
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

    // Part 2: Deliver Official TNPSC QCAB Answer Booklet PDF
    if (deliverQCAB) {
      try {
        const paperCode = found ? found.paper.paperCode : "Paper II";
        const pageAllotted = marks === 10 ? "1 ½" : "2 ½";
        const timeMins = marks === 10 ? 8 : 12;
        const pdfPath = await generateQCABPdf({
          question: q,
          marks,
          topic: res?.topicName || topic,
          paperCode,
        });
        const fileName = `TNPSC_QCAB_${marks}M_${Date.now().toString().slice(-4)}.pdf`;
        await ctx.replyWithDocument(new InputFile(pdfPath, fileName), {
          caption: [
            `📑 <b>OFFICIAL TNPSC QCAB ANSWER BOOKLET</b>`,
            `────────────────────────────────────`,
            `🏛️ <b>Standard:</b> Group-1 Mains (${paperCode})`,
            `⚖️ <b>Weightage:</b> ${marks} Marks • ~${words} Words`,
            `📄 <b>QCAB Allotment:</b> Exactly ${pageAllotted} Pages`,
            `⏱️ <b>Time Limit:</b> ${timeMins} Minutes`,
            `⛔ <b>Official Cutoff:</b> Lined guide stops at ${pageAllotted} pages + Examiner Matrix`,
            `────────────────────────────────────`,
            `🖨️ <i>Print this booklet, write your answer with a ballpoint pen within ${timeMins} minutes, and upload a photo for evaluation!</i>`,
          ].join("\n"),
          parse_mode: "HTML",
        });
      } catch (qcabErr) {
        console.error("Auto QCAB delivery error:", qcabErr);
      }
    }

    // Part 3: Modern Model Answer + Notion Banner
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
  // Global Middleware: Auto-subscribe any active user to daily scheduled questions
  bot.use(async (ctx, next) => {
    if (ctx.chat?.id) {
      subscribeChat(ctx.chat.id, { force: false });
    }
    await next();
  });

  // /start: Clears any old bottom keyboard and shows the Papers menu
  bot.command("start", async (ctx) => {
    userState.delete(ctx.chat.id);
    subscribeChat(ctx.chat.id, { force: true });

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
      "• <b>Unique Highlights:</b> 💡 Standout differentiator in every subheading",
      "• <b>Conclusion:</b> Exactly 4 to 5 lines with forward-looking Way Forward",
      "• <b>Answer Submission:</b> Text message, handwritten photo, or <b>PDF document</b> (evaluated via Gemini Vision)",
      "",
      "⚡ <b>ADVANCED EXAM CAPABILITIES:</b>",
      "• ⏱️ <b>12-Min Exam Simulator (/mock):</b> Real-time timer, speed tracker & milestone coaching",
      "• 🗺️ <b>Visual Answer Blueprints (/diagram):</b> ASCII flowcharts & diagrams to draw in paper",
      "• 🎯 <b>TN Stats & Schemes Bank (/tnstats):</b> Authoritative statistics & scheme citations",
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

// /mock or /exam command - Start 12-Minute Real-Time Exam Simulator
bot.command(["mock", "exam"], async (ctx) => {
  userState.delete(ctx.chat.id);
  const s = sessions.get(ctx.chat.id);
  await startMockExam(ctx, s?.topic || null, s?.unitId || null, null);
});

// /tnstats, /stats, /schemes command - Tamil Nadu high-yield data & scheme bank
bot.command(["tnstats", "stats", "schemes"], async (ctx) => {
  userState.delete(ctx.chat.id);
  const query = ctx.match ? ctx.match.trim() : "";
  if (!query) {
    await ctx.reply(
      `🏛️ <b>TAMIL NADU POLICY & SOCIO-ECONOMIC STATS BANK</b>\n\n` +
      `TNPSC Mains rank-holders substantiate answers with official Tamil Nadu statistics.\n` +
      `Select a high-yield syllabus domain below or search directly:\n\n` +
      `💡 <i>Quick Search:</i> <code>/tnstats health</code>, <code>/tnstats gsdp</code>, <code>/tnstats women</code>`,
      {
        parse_mode: "HTML",
        reply_markup: getStatsCategoriesKeyboard(),
      }
    );
  } else {
    const results = searchStats(query);
    const card = formatSearchResultsCard(query, results);
    await ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: getStatsCategoriesKeyboard(),
    });
  }
});

// /diagram, /flowchart, /mindmap command - Visual answer blueprint
bot.command(["diagram", "flowchart", "mindmap"], async (ctx) => {
  userState.delete(ctx.chat.id);
  const s = sessions.get(ctx.chat.id);
  const query = ctx.match ? ctx.match.trim() : "";
  const target = query || s?.question || (s?.topic ? `Syllabus Topic: ${s.topic}` : "Regional Disparities and Industrial Development in Tamil Nadu");

  const anim = await createProgressAnimator(ctx, "VISUAL DIAGRAM & FLOWCHART DESIGNER");
  try {
    const diagram = await anim.track(() => llm.generateDiagram(target), {
      text: "[2/3] Synthesizing ASCII Blueprint & Layout Guide...",
      basePct: 40,
      targetPct: 90,
      details: [
        "Analyzing structural presentation nodes...",
        "Formatting clean ASCII box connectors & arrows...",
        "Drafting exam paper margin positioning tips...",
      ],
    });
    const card = formatModernDiagramCard({ question: target, diagram });
    await reply(ctx, card, getPostAnswerKeyboard(s?.unitId || null));
  } catch (err) {
    console.error("Diagram error:", err);
    await ctx.reply(`⚠️ Diagram generation error: ${err.message}`);
  }
});

// /analytics, /radar, /scorecard - Aspirant performance & syllabus mastery radar
bot.command(["analytics", "radar", "scorecard"], async (ctx) => {
  userState.delete(ctx.chat.id);
  const card = formatAnalyticsCard(ctx.chat.id);
  await ctx.reply(card, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text("⏱️ Write 12-Min Mock", "action:start_mock_exam")
      .text("📑 Printable QCAB PDF", "action:qcab_pdf")
      .row()
      .text("📚 Syllabus Menu", "action:pick_topic"),
  });
});

// /capsule, /capsules, /vault - Tamil Nadu scheme and policy capsule vault
bot.command(["capsule", "capsules", "vault"], async (ctx) => {
  userState.delete(ctx.chat.id);
  const query = ctx.match ? ctx.match.trim() : "";
  if (!query) {
    await ctx.reply(
      `🌟 <b>TAMIL NADU SCHEME & POLICY CAPSULE VAULT</b>\n\n` +
      `Essential flagship schemes curated with exact 12-rule Mains answer insertion points (Intro box, Unique Key box, Way Forward).\n\n` +
      `Select a scheme below or search with <code>/capsule &lt;scheme-name&gt;</code>:`,
      {
        parse_mode: "HTML",
        reply_markup: getCapsulesKeyboard(),
      }
    );
  } else {
    const results = searchCapsules(query);
    if (results.length === 1) {
      await ctx.reply(formatCapsuleCard(results[0]), {
        parse_mode: "HTML",
        reply_markup: getCapsulesKeyboard(),
      });
    } else if (results.length > 1) {
      const kb = new InlineKeyboard();
      results.slice(0, 6).forEach((c) => {
        kb.text(`🌟 ${c.title.slice(0, 32)}...`, `capsule:view:${c.id}`).row();
      });
      kb.text("⬅️ Back to Capsules", "action:capsule_menu");
      await ctx.reply(
        `🔍 <b>Found ${results.length} Matching Policy Capsules:</b>\nSelect one to view the detailed 12-rule insertion guide:`,
        { parse_mode: "HTML", reply_markup: kb }
      );
    } else {
      await ctx.reply(`⚠️ No scheme found matching "<code>${query}</code>". Showing all capsules:`, {
        parse_mode: "HTML",
        reply_markup: getCapsulesKeyboard(),
      });
    }
  }
});

// /qcab, /booklet - Official TNPSC QCAB Printable PDF Generator
bot.command(["qcab", "booklet"], async (ctx) => {
  userState.delete(ctx.chat.id);
  await handleQCABPdfRequest(ctx);
});

// /bible, /revision - Revision Bible PDF Compiler
bot.command(["bible", "revision"], async (ctx) => {
  userState.delete(ctx.chat.id);
  await handleRevisionBibleRequest(ctx);
});

// /editorial, /editorials - Daily Editorial Syllabus Linker
bot.command(["editorial", "editorials"], async (ctx) => {
  userState.delete(ctx.chat.id);
  const query = ctx.match ? ctx.match.trim() : "";
  if (!query) {
    await ctx.reply(
      `📰 <b>DAILY EDITORIAL SYLLABUS LINKER</b>\n\n` +
      `Link current affairs & editorials from <i>The Hindu</i>, <i>Dinamani</i>, and <i>Frontline</i> to TNPSC Group-1 Mains syllabus topics.\n\n` +
      `Select a curated contemporary editorial below, or type <code>/editorial &lt;headline or topic&gt;</code>:`,
      {
        parse_mode: "HTML",
        reply_markup: getEditorialsKeyboard(),
      }
    );
  } else {
    const anim = await createProgressAnimator(ctx, "EDITORIAL SYLLABUS LINKER");
    try {
      const output = await anim.track(
        () => llm.linkEditorial(query),
        {
          text: "[1/2] Mapping Editorial to Syllabus Hierarchy...",
          basePct: 35,
          targetPct: 90,
          details: [
            "Parsing constitutional, economic & governance dimensions...",
            "Formulating high-caliber 15-mark Mains question...",
            "Synthesizing Tamil Nadu context and SC precedent anchors...",
          ],
        }
      );
      await anim.delete();
      const card = formatEditorialCard(output, query);
      await reply(ctx, card, new InlineKeyboard()
        .text("⏱️ Practice as 12-Min Mock", "action:start_mock_exam")
        .text("📑 QCAB PDF", "action:qcab_pdf")
        .row()
        .text("📰 More Editorials", "action:editorial_menu")
        .text("📚 Main Menu", "action:pick_topic")
      );
    } catch (err) {
      await anim.delete();
      console.error("Editorial analysis error:", err);
      await ctx.reply(`⚠️ Editorial analysis error: ${err.message}`);
    }
  }
});

// /budget, /survey - Economic Survey & Budget 2024-25 Stats Injector
bot.command(["budget", "survey"], async (ctx) => {
  userState.delete(ctx.chat.id);
  await ctx.reply(formatBudgetSummaryCard(), {
    parse_mode: "HTML",
    reply_markup: getBudgetMenuKeyboard(),
  });
});

// Function to handle ingestion of one or multiple IAS/editorial URLs
async function handleIngestUrls(ctx, rawText) {
  const urlMatches = (rawText || "").match(/https?:\/\/[^\s]+/gi);
  if (!urlMatches || urlMatches.length === 0) {
    return ctx.reply(
      `🌐 <b>IAS Website Content ➔ Notion Ingester</b>\n\n` +
      `<b>Usage:</b> <code>/url &lt;URL 1&gt; [URL 2]...</code>\n\n` +
      `Paste one or multiple URLs from any IAS coaching website, news editorial, or study portal (specifically <b>Drishti IAS</b>, <b>Vajiram & Ravi</b>, Vision IAS, InsightsIAS, The Hindu, etc.).\n\n` +
      `<b>⚡ What the Bot Does Automatically:</b>\n` +
      `1. 👤 <b>Saves User Profile:</b> Registers your account for syllabus updates\n` +
      `2. 📥 <b>Fetches Content:</b> Extracts article text from Drishti IAS / Vajiram & Ravi\n` +
      `3. 🎯 <b>Maps to Syllabus:</b> Identifies Paper & Unit (GS1, GS2, GS3)\n` +
      `4. ❓ <b>Formulates 15M Question:</b> Exam-ready TNPSC analytical question\n` +
      `5. ✍️ <b>Generates 12-Rule Answer:</b> Complete model answer with value additions\n` +
      `6. 📓 <b>Pushes to Notion:</b> Files directly into your Notion workspace!\n\n` +
      `<i>Examples:</i>\n` +
      `• <code>https://www.drishtiias.com/daily-updates/daily-news-analysis/...</code>\n` +
      `• <code>https://vajiramandravi.com/quest-upsc-notes/...</code>`,
      { parse_mode: "HTML" }
    );
  }

  // 1. Save user identity immediately upon entering URLs
  const userProfile = recordTelegramUser(ctx.from);
  console.log(`👤 [User Manager] Active Aspirant: ${userProfile?.fullName} (${userProfile?.username || userProfile?.id}) submitting ${urlMatches.length} URL(s)`);

  const urls = urlMatches.map((u) => u.trim());
  userState.delete(ctx.chat.id);
  const anim = await createProgressAnimator(ctx, "IAS URL ➔ NOTION INGESTER");

  try {
    const batch = await ingestMultipleUrls(urls, {
      onProgress: async (p) => {
        const text = p.text || `Processing URL ${p.index || 1}/${urls.length}...`;
        const pct = Math.min(95, Math.round(((p.index || 1) / (urls.length + 1)) * 90));
        await anim.step(text, pct, p.url || "");
      },
    });

    await anim.delete();

    if (batch.successCount === 0) {
      return ctx.reply(`⚠️ Could not ingest content from the provided URL(s):\n${batch.errors.map((e) => `• ${e.url}: ${e.error}`).join("\n")}`);
    }

    for (const item of batch.results) {
      const siteName = detectWebsiteName(item.sourceUrl);

      // Record this ingested URL in the user's permanent profile
      recordTelegramUser(ctx.from, {
        url: item.sourceUrl,
        website: siteName,
        topic: item.topic,
        unitId: item.unitId,
        paper: item.paper,
        notionUrl: item.notionUrl,
      });

      const card = [
        `🌐 <b>${siteName.toUpperCase()} CONTENT ➔ NOTION SYNC</b>`,
        `────────────────────────────────────`,
        `👤 <b>Aspirant:</b> <b>${userProfile?.fullName || "Student"}</b> ${userProfile?.username ? `(${userProfile.username})` : ""}`,
        `📚 <b>${item.paper}</b>`,
        `🏛️ <b>${item.unit}</b>`,
        `🎯 <b>Syllabus Topic:</b> <b>${item.topic}</b>`,
        `🔗 <b>Source Portal:</b> <a href="${item.sourceUrl}">${siteName} Article</a>`,
        ``,
        `📌 <b>Formulated 15-Mark Question:</b>`,
        `<i>${item.question}</i>`,
        ``,
        `✅ <b>12-Rule Model Answer generated and pushed directly to Notion!</b>`,
        `────────────────────────────────────`,
        `🔗 <a href="${item.notionUrl}"><b>👉 Open Topic in Notion ↗</b></a>`,
      ].join("\n");

      await ctx.reply(card, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: new InlineKeyboard()
          .url("🔗 Open in Notion", item.notionUrl)
          .row()
          .text("🎯 View 12-Rule Model Answer", "action:model")
          .text("📑 Printable QCAB PDF", "action:qcab_pdf")
          .row()
          .text("📚 Main Menu", "action:pick_topic"),
      });

      // Save as active question in session so user can write an answer or get PDF
      sessions.set(ctx.chat.id, {
        question: item.question,
        marks: 15,
        words: 250,
        modelAnswer: item.modelAnswer,
        topic: item.topic,
        unitId: item.unitId,
        notionUrl: item.notionUrl,
        notionPageId: item.notionPageId,
      });
    }

    if (batch.errors.length > 0) {
      await ctx.reply(`⚠️ Note: ${batch.errors.length} URL(s) could not be parsed:\n` + batch.errors.map((e) => `• ${e.url}: ${e.error}`).join("\n"));
    }
  } catch (err) {
    await anim.delete();
    console.error("URL ingestion error:", err);
    await ctx.reply(`⚠️ URL ingestion failed: ${err.message}`);
  }
}

// /url, /ingest, /link command
bot.command(["url", "ingest", "link"], async (ctx) => {
  await handleIngestUrls(ctx, ctx.match || "");
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

// Step 3 (Option A): User taps "Practice Q"
bot.callbackQuery(/^auto:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const parts = ctx.match[1].split(":");
  const unitId = parts[0];
  const marks = parts[1] ? parseInt(parts[1], 10) : 15;
  const found = findUnitById(unitId);
  if (!found) return;

  const { paper, unit } = found;
  userState.delete(ctx.chat.id);

  const item = getRandomTopic(null, unit.filterKey);
  const fullTopic = `${paper.paperTitle} - ${unit.shortName}: ${item.topic}`;
  await handleAutoGenerateQA(ctx, fullTopic, marks, unit.id, false, true);
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
  await handleAutoGenerateQA(ctx, fullTopic, 15, unit.id, false, true);
});

// Step 3 (Option C): User taps "Generate Official TNPSC PYQ + Answer"
bot.callbackQuery(/^pyqunit:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const parts = ctx.match[1].split(":");
  const unitId = parts[0];
  const marks = parts[1] ? parseInt(parts[1], 10) : 15;
  const found = findUnitById(unitId);
  if (!found) return;

  const { paper, unit } = found;
  userState.delete(ctx.chat.id);

  const item = getRandomTopic(null, unit.filterKey);
  const fullTopic = `${paper.paperTitle} - ${unit.shortName}: ${item.topic}`;
  await handleAutoGenerateQA(ctx, fullTopic, marks, unit.id, true, true);
});

// Step 4: User selected Question Type & Marks for custom entered topic
bot.callbackQuery(/^gen_topic:(pyq|own|blank):(10|15)$/, async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const type = ctx.match[1];
  const marks = parseInt(ctx.match[2], 10);
  const st = userState.get(ctx.chat.id);
  if (!st || !st.enteredTopic) {
    return ctx.reply("⚠️ Session expired. Please select a paper and unit:", {
      reply_markup: getPapersInlineKeyboard(),
    });
  }

  const topicName = st.enteredTopic;
  const fullTopic = `${st.paperTitle} - ${st.unitName}: ${topicName}`;
  const unitId = st.unitId;
  userState.delete(ctx.chat.id);

  if (type === "blank") {
    const found = unitId ? findUnitById(unitId) : null;
    const paperCode = found ? found.paper.paperCode : "Paper II";
    const pageAllotted = marks === 10 ? "1 ½" : "2 ½";
    const timeMins = marks === 10 ? 8 : 12;
    const words = marks === 10 ? 150 : 250;
    const anim = await createProgressAnimator(ctx, "TNPSC QCAB COMPILER");
    try {
      await anim.step("📑 [1/2] Drafting Official Examination Booklet...", 50, "Formatting margins, barcode box & guidelines...");
      const pdfPath = await generateQCABPdf({
        question: `Write an analytical answer on: "${topicName}" adhering to official TNPSC 12-rule standards.`,
        marks,
        topic: topicName,
        paperCode,
      });
      await anim.step("🖨️ [2/2] Exporting High-Resolution Printable PDF...", 90, "Finalizing page coordinates...");
      await anim.delete();
      const fileName = `TNPSC_QCAB_${marks}M_${Date.now().toString().slice(-4)}.pdf`;
      return ctx.replyWithDocument(new InputFile(pdfPath, fileName), {
        caption: [
          `📑 <b>OFFICIAL TNPSC QCAB ANSWER BOOKLET</b>`,
          `────────────────────────────────────`,
          `🏛️ <b>Standard:</b> Group-1 Mains (${paperCode})`,
          `⚖️ <b>Weightage:</b> ${marks} Marks • ~${words} Words`,
          `📄 <b>QCAB Allotment:</b> Exactly ${pageAllotted} Pages`,
          `⏱️ <b>Time Limit:</b> ${timeMins} Minutes`,
          `🎯 <b>Topic:</b> ${topicName}`,
          `⛔ <b>Official Cutoff:</b> Lined guide stops at ${pageAllotted} pages + Examiner Matrix`,
          `────────────────────────────────────`,
          `🖨️ <i>Print this booklet, write your answer with a ballpoint pen within ${timeMins} minutes, and upload a photo for evaluation!</i>`,
        ].join("\n"),
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text("📜 Generate PYQ for this Topic", `gen_topic:pyq:${marks}`)
          .text("✍️ Generate Practice Question", `gen_topic:own:${marks}`)
          .row()
          .text("📚 Unit Menu", unitId ? `unit:${unitId}` : "action:pick_topic"),
      });
    } catch (err) {
      await anim.delete();
      return ctx.reply(`⚠️ QCAB generation error: ${err.message}`);
    }
  }

  const isPYQ = type === "pyq";
  await handleAutoGenerateQA(ctx, fullTopic, marks, unitId, isPYQ, true);
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

// Start 12-Minute Mock Exam from question card or menu
bot.callbackQuery("action:start_mock_exam", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const s = sessions.get(ctx.chat.id);
  await startMockExam(ctx, s?.topic || null, s?.unitId || null, s?.question || null);
});

// Start Mock Exam specifically for a chosen Unit
bot.callbackQuery(/^mockunit:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const unitId = ctx.match[1];
  await startMockExam(ctx, null, unitId, null);
});

// Mock Exam: Submit Answer Early
bot.callbackQuery("mock:submit_early", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const mock = activeMockExams.get(ctx.chat.id);
  if (!mock) {
    return ctx.reply("⚠️ No active mock exam running! Start one via /mock.", {
      reply_markup: getPapersInlineKeyboard(),
    });
  }
  if (mock.intervalId) clearInterval(mock.intervalId);
  mock.elapsedSeconds = Math.floor((Date.now() - mock.startTime) / 1000);
  const mins = Math.floor(mock.elapsedSeconds / 60);
  const secs = mock.elapsedSeconds % 60;
  const timeTakenStr = `${mins}m ${String(secs).padStart(2, "0")}s`;

  await ctx.reply(
    `⏱️ <b>EXAM TIMER STOPPED EARLY!</b>\n\n` +
    `• Total Time Elapsed: <code>${timeTakenStr}</code> (Limit: 12:00)\n` +
    `• Status: <i>Waiting for answer submission</i>\n\n` +
    `📸 <b>Snap a photo of your handwritten paper or type your text now!</b>`,
    { parse_mode: "HTML" }
  );
});

// Mock Exam: Abort Exam
bot.callbackQuery("mock:abort", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  cleanupMockExam(ctx.chat.id);
  await ctx.reply("❌ <b>12-Minute Mock Exam Cancelled.</b>\nYou can resume practice anytime!", {
    parse_mode: "HTML",
    reply_markup: getPapersInlineKeyboard(),
  });
});

// Visual Diagram & Flowchart Generator
bot.callbackQuery("action:diagram", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const s = sessions.get(ctx.chat.id);
  const target = s?.question || (s?.topic ? `Syllabus Topic: ${s.topic}` : "Industrial Development and Welfare Policy in Tamil Nadu");

  const anim = await createProgressAnimator(ctx, "VISUAL DIAGRAM & FLOWCHART DESIGNER");
  try {
    const diagram = await anim.track(() => llm.generateDiagram(target), {
      text: "[2/3] Synthesizing ASCII Blueprint & Layout Guide...",
      basePct: 40,
      targetPct: 90,
      details: [
        "Analyzing structural presentation nodes...",
        "Formatting clean ASCII box connectors & arrows...",
        "Drafting exam paper margin positioning tips...",
      ],
    });
    const card = formatModernDiagramCard({ question: target, diagram });
    await reply(ctx, card, getPostAnswerKeyboard(s?.unitId || null));
  } catch (err) {
    console.error("Diagram error:", err);
    await ctx.reply(`⚠️ Diagram generation error: ${err.message}`);
  }
});

// Tamil Nadu Stats Bank Menu
bot.callbackQuery("action:tn_stats", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.reply(
    `🏛️ <b>TAMIL NADU POLICY & SOCIO-ECONOMIC STATS BANK</b>\n\n` +
    `Select a high-yield syllabus domain below to explore authoritative statistics:`,
    {
      parse_mode: "HTML",
      reply_markup: getStatsCategoriesKeyboard(),
    }
  );
});

// Tamil Nadu Stats: View specific Category
bot.callbackQuery(/^stats:cat:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const catKey = ctx.match[1];
  const card = formatCategoryCard(catKey);
  if (!card) {
    return ctx.reply("⚠️ Category not found.");
  }
  await ctx.reply(card, {
    parse_mode: "HTML",
    reply_markup: getStatsCategoriesKeyboard(),
  });
});

// Aspirant Analytics / Mastery Radar
bot.callbackQuery("action:analytics", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const card = formatAnalyticsCard(ctx.chat.id);
  await ctx.reply(card, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text("⏱️ Write 12-Min Mock", "action:start_mock_exam")
      .text("📑 Printable QCAB PDF", "action:qcab_pdf")
      .row()
      .text("📚 Syllabus Menu", "action:pick_topic"),
  });
});

// Tamil Nadu Scheme Capsules Menu
bot.callbackQuery("action:capsule_menu", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.reply(
    `🌟 <b>TAMIL NADU SCHEME & POLICY CAPSULE VAULT</b>\n\n` +
    `Select a flagship scheme below to view exact 12-rule Mains insertion guidance:`,
    {
      parse_mode: "HTML",
      reply_markup: getCapsulesKeyboard(),
    }
  );
});

// View specific Scheme Capsule
bot.callbackQuery(/^capsule:view:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const id = ctx.match[1];
  const c = getCapsuleById(id);
  if (!c) return ctx.reply("⚠️ Capsule not found.");

  sessions.set(ctx.chat.id, {
    question: `Examine the socio-economic impact and governance innovations of the ${c.title} in Tamil Nadu.`,
    marks: 15,
    words: 250,
    topic: c.title,
  });

  await ctx.reply(formatCapsuleCard(c), {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text("⏱️ Write 12-Min Mock", "action:start_mock_exam")
      .text("📑 Printable QCAB PDF", "action:qcab_pdf")
      .row()
      .text("🗺️ Answer Diagram", "action:diagram")
      .text("🌟 More Capsules", "action:capsule_menu")
      .row()
      .text("📚 Main Menu", "action:pick_topic"),
  });
});

// QCAB Answer Booklet PDF Download
bot.callbackQuery("action:qcab_pdf", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  await handleQCABPdfRequest(ctx);
});

// Revision Bible PDF Compilation Download
bot.callbackQuery("action:revision_bible", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  await handleRevisionBibleRequest(ctx);
});

// Editorial Linker Menu
bot.callbackQuery("action:editorial_menu", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.reply(
    `📰 <b>DAILY EDITORIAL SYLLABUS LINKER</b>\n\n` +
    `Select a high-yield contemporary editorial below to map into TNPSC Mains syllabus and formulate 15M questions:`,
    {
      parse_mode: "HTML",
      reply_markup: getEditorialsKeyboard(),
    }
  );
});

// View Curated Editorial
bot.callbackQuery(/^editorial:view:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const id = ctx.match[1];
  const e = getCuratedEditorialById(id);
  if (!e) return ctx.reply("⚠️ Editorial not found.");

  const anim = await createProgressAnimator(ctx, "EDITORIAL SYLLABUS LINKER");
  try {
    const prompt = `${e.title}\nTheme: ${e.theme}\nPaper: ${e.paper}\nSnippet: ${e.snippet}`;
    const output = await anim.track(
      () => llm.linkEditorial(prompt),
      {
        text: "[1/2] Mapping to Syllabus & Formulating Question...",
        basePct: 35,
        targetPct: 90,
        details: [
          "Parsing constitutional, economic & governance dimensions...",
          "Formulating official 15-mark directive question...",
          "Synthesizing state policy anchors and SC precedents...",
        ],
      }
    );
    await anim.delete();

    sessions.set(ctx.chat.id, {
      question: e.title,
      marks: 15,
      words: 250,
      topic: e.theme,
    });

    const card = formatEditorialCard(output, e.title);
    await reply(ctx, card, new InlineKeyboard()
      .text("⏱️ Practice as 12-Min Mock", "action:start_mock_exam")
      .text("📑 QCAB PDF", "action:qcab_pdf")
      .row()
      .text("📰 More Editorials", "action:editorial_menu")
      .text("📚 Main Menu", "action:pick_topic")
    );
  } catch (err) {
    await anim.delete();
    console.error("Editorial analysis error:", err);
    await ctx.reply(`⚠️ Editorial analysis error: ${err.message}`);
  }
});

// Custom Editorial input prompt
bot.callbackQuery("action:custom_editorial", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  userState.set(ctx.chat.id, { state: "WAITING_FOR_EDITORIAL" });
  await ctx.reply(
    `✍️ <b>Enter Custom Editorial Headline or Topic:</b>\n\n` +
    `Type or paste the headline, op-ed topic, or news issue below (e.g. <i>"One Nation One Election implications on Federalism"</i>):`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("❌ Cancel", "action:editorial_menu"),
    }
  );
});

// Economic Survey & Budget Menu
bot.callbackQuery("action:budget_menu", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.reply(formatBudgetSummaryCard(), {
    parse_mode: "HTML",
    reply_markup: getBudgetMenuKeyboard(),
  });
});

bot.callbackQuery("budget:macro", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.reply(formatBudgetSummaryCard(), {
    parse_mode: "HTML",
    reply_markup: getBudgetMenuKeyboard(),
  });
});

bot.callbackQuery("budget:depts", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.reply(formatDepartmentAllocationsCard(), {
    parse_mode: "HTML",
    reply_markup: getBudgetMenuKeyboard(),
  });
});

bot.callbackQuery("budget:sectors", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const lines = [
    `🌾 <b>TAMIL NADU GSVA SECTORAL DYNAMICS</b>`,
    `────────────────────────────────────────`,
    SECTORAL_GSVA.map((s, i) => `<b>${i + 1}. ${s.sector}:</b>\n• Share: <code>${s.share}</code>\n• <i>${s.highlights}</i>\n`).join("\n"),
    `💡 <i>Secondary Sector contributes 37.4% (vs ~29% India average), reflecting Tamil Nadu's industrial dominance!</i>`,
  ];
  await ctx.reply(lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: getBudgetMenuKeyboard(),
  });
});

// ─────────────────────────────────────────────────────────────
// MESSAGE HANDLERS (USER TYPES TOPIC OR SUBMITS ANSWER)
// ─────────────────────────────────────────────────────────────

// Text message handler
bot.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;

  // 1. If user is in "WAITING_FOR_TOPIC" state, prompt user to choose Question Type (PYQ vs Practice Question) & Marks (10M vs 15M)
  const st = userState.get(ctx.chat.id);
  if (st && st.state === "WAITING_FOR_TOPIC") {
    const enteredTopic = ctx.message.text.trim();
    userState.set(ctx.chat.id, {
      ...st,
      state: "CHOOSE_QUESTION_TYPE",
      enteredTopic,
    });

    const choiceText = [
      `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
      `┃  🏛️ <b>TNPSC QCAB & QUESTION ARCHITECT</b>`,
      `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
      `📚 <b>Paper:</b> ${st.paperTitle}`,
      `🏛️ <b>Unit:</b> <i>${st.unitName}</i>`,
      `🎯 <b>Entered Topic:</b> <code>${enteredTopic}</code>`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `⚖️ <b>Select Question Type & QCAB Allotment:</b>`,
      `• <b>10 Marks:</b> Exactly <b>1 ½ Pages</b> (~150 Words • 8 Mins)`,
      `• <b>15 Marks:</b> Exactly <b>2 ½ Pages</b> (~250 Words • 12 Mins)`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👉 <i>Select an option below to generate the Question and download your Official QCAB Booklet PDF:</i>`,
    ].join("\n");

    const kb = new InlineKeyboard()
      .text("📜 Authentic PYQ (10 Marks • 1 ½p)", "gen_topic:pyq:10")
      .text("📜 Authentic PYQ (15 Marks • 2 ½p)", "gen_topic:pyq:15")
      .row()
      .text("✍️ Own Practice Q (10 Marks • 1 ½p)", "gen_topic:own:10")
      .text("✍️ Own Practice Q (15 Marks • 2 ½p)", "gen_topic:own:15")
      .row()
      .text("📑 Blank QCAB (10 Marks • 1 ½p)", "gen_topic:blank:10")
      .text("📑 Blank QCAB (15 Marks • 2 ½p)", "gen_topic:blank:15")
      .row()
      .text("⬅️ Change Topic / Unit", st.unitId ? `unit:${st.unitId}` : "action:pick_topic");

    return ctx.reply(choiceText, {
      parse_mode: "HTML",
      reply_markup: kb,
    });
  }

  // 1A. Handle Editorial Input
  if (st && st.state === "WAITING_FOR_EDITORIAL") {
    const text = ctx.message.text.trim();
    userState.delete(ctx.chat.id);
    const anim = await createProgressAnimator(ctx, "EDITORIAL SYLLABUS LINKER");
    try {
      const output = await anim.track(() => llm.linkEditorial(text), {
        text: "[1/2] Analyzing Editorial & Mapping to Syllabus...",
        basePct: 35,
        targetPct: 90,
        details: [
          "Parsing constitutional & economic dimensions...",
          "Formulating official 15-mark Mains question...",
          "Synthesizing state policy anchors and SC precedents...",
        ],
      });
      await anim.delete();
      sessions.set(ctx.chat.id, { question: text, marks: 15, words: 250, topic: text });
      const card = formatEditorialCard(output, text);
      return reply(ctx, card, new InlineKeyboard()
        .text("⏱️ Practice as 12-Min Mock", "action:start_mock_exam")
        .text("📑 QCAB PDF", "action:qcab_pdf")
        .row()
        .text("📰 More Editorials", "action:editorial_menu")
        .text("📚 Main Menu", "action:pick_topic")
      );
    } catch (err) {
      await anim.delete();
      return ctx.reply(`⚠️ Editorial analysis error: ${err.message}`);
    }
  }

  // 1B. Handle Gemini API Key update input
  if (st && st.state === "WAITING_FOR_GEMINI_KEY") {
    await ctx.deleteMessage().catch(() => {});
    userState.delete(ctx.chat.id);
    const enteredKey = ctx.message.text.trim();

    const anim = await createProgressAnimator(ctx, "GEMINI KEY VERIFIER");
    try {
      await anim.step("🔍 [1/2] Testing live connection to Gemini...", 45, "Running ping against Google AI API...");
      const health = await checkGeminiHealth(enteredKey);

      if (health.ok) {
        await anim.step("💾 [2/2] Saving to backend .env file...", 90, "Updating disk & memory client...");
        updateEnvFile("GEMINI_API_KEY", enteredKey);
        await anim.delete();

        const successText = [
          `╔════════════════════════════════════════╗`,
          `║  ✅ <b>GEMINI API KEY UPDATED SUCCESSFULLY</b>`,
          `╚════════════════════════════════════════╝`,
          `🔑 <b>Active Key:</b> <code>${maskKey(enteredKey)}</code>`,
          `🟢 <b>Health:</b> Verified Operational (<code>${health.latency}ms</code> • ${health.model})`,
          `💾 <b>Backend File:</b> Written to <code>.env</code> on disk`,
          `🚀 <b>AI Engine:</b> Client re-initialized in-memory`,
          ``,
          `<i>You can now practice questions and generate 12-rule model answers immediately!</i>`,
        ].join("\n");

        return ctx.reply(successText, {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("⚡ Generate Practice Question", "action:pyq_topic")
            .row()
            .text("⚙️ View API Health", "action:api_settings")
            .text("📚 Main Menu", "action:pick_topic"),
        });
      } else {
        await anim.delete();
        const failText = [
          `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
          `┃  ❌ <b>GEMINI KEY VERIFICATION FAILED</b>`,
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
          `⚠️ <b>Issue:</b> <i>${health.error}</i>`,
          `🛡️ <b>Safety Guard:</b> Existing <code>.env</code> file was NOT overwritten.`,
          ``,
          `👉 <i>Get a fresh free API key from Google AI Studio and tap below to retry:</i>`,
          `https://aistudio.google.com/app/apikey`,
        ].join("\n");

        return ctx.reply(failText, {
          parse_mode: "HTML",
          disable_web_page_preview: false,
          reply_markup: new InlineKeyboard()
            .text("🔁 Try Again", "action:update_gemini_key")
            .text("⬅️ Cancel", "action:api_settings"),
        });
      }
    } catch (err) {
      await anim.delete();
      return ctx.reply(`⚠️ Verification error: ${err.message}`);
    }
  }

  // 1C. Handle Notion Token update input
  if (st && st.state === "WAITING_FOR_NOTION_TOKEN") {
    await ctx.deleteMessage().catch(() => {});
    userState.delete(ctx.chat.id);
    const enteredToken = ctx.message.text.trim();

    const anim = await createProgressAnimator(ctx, "NOTION TOKEN VERIFIER");
    try {
      await anim.step("🔍 [1/2] Verifying Notion Integration...", 45, "Testing users.me endpoint...");
      const health = await checkNotionHealth(enteredToken);

      if (health.ok) {
        await anim.step("💾 [2/2] Saving to backend .env file...", 90, "Persisting token to disk...");
        updateEnvFile("NOTION_TOKEN", enteredToken);
        await anim.delete();

        const successText = [
          `╔════════════════════════════════════════╗`,
          `║  ✅ <b>NOTION TOKEN UPDATED SUCCESSFULLY</b>`,
          `╚════════════════════════════════════════╝`,
          `📓 <b>Active Token:</b> <code>${maskKey(enteredToken)}</code>`,
          `🟢 <b>Health:</b> Connected (<code>${health.latency}ms</code> • Bot: <i>${health.botName}</i>)`,
          `💾 <b>Backend File:</b> Written to <code>.env</code> on disk`,
          `🚀 <b>Notion Client:</b> In-memory client refreshed`,
          ``,
          `<i>All questions and 12-rule model answers will sync directly to Notion!</i>`,
        ].join("\n");

        return ctx.reply(successText, {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("⚙️ View API Health", "action:api_settings")
            .text("📚 Main Menu", "action:pick_topic"),
        });
      } else {
        await anim.delete();
        const failText = [
          `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
          `┃  ❌ <b>NOTION TOKEN VERIFICATION FAILED</b>`,
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
          `⚠️ <b>Issue:</b> <i>${health.error}</i>`,
          `🛡️ <b>Safety Guard:</b> Existing <code>.env</code> file was NOT overwritten.`,
          ``,
          `<i>Make sure you created an Internal Integration Token (starts with ntn_ or secret_).</i>`,
        ].join("\n");

        return ctx.reply(failText, {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("🔁 Try Again", "action:update_notion_key")
            .text("⬅️ Cancel", "action:api_settings"),
        });
      }
    } catch (err) {
      await anim.delete();
      return ctx.reply(`⚠️ Verification error: ${err.message}`);
    }
  }

  // 1D. Handle Notion Root Database/Page ID update input
  if (st && st.state === "WAITING_FOR_NOTION_DB") {
    await ctx.deleteMessage().catch(() => {});
    userState.delete(ctx.chat.id);
    let enteredDb = ctx.message.text.trim();
    const urlMatch = enteredDb.match(/([a-f0-9]{32})/i) || enteredDb.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    if (urlMatch) {
      enteredDb = urlMatch[1].replace(/-/g, "");
    }

    const anim = await createProgressAnimator(ctx, "NOTION PAGE VERIFIER");
    try {
      await anim.step("🔍 [1/2] Checking Root Page Access in Notion...", 45);
      const health = await checkNotionHealth(null, enteredDb);

      await anim.step("💾 [2/2] Saving to backend .env file...", 90);
      updateEnvFile("NOTION_DATABASE_ID", enteredDb);
      await anim.delete();

      const successText = [
        `╔════════════════════════════════════════╗`,
        `║  ✅ <b>NOTION ROOT PAGE ID UPDATED</b>`,
        `╚════════════════════════════════════════╝`,
        `📄 <b>Root Page ID:</b> <code>${maskKey(enteredDb, 8, 4)}</code>`,
        `🟢 <b>Page Access:</b> ${health.dbAccessible ? "Verified Accessible" : "Saved (Ensure page is shared with bot)"}`,
        `💾 <b>Backend File:</b> Saved into <code>.env</code> on disk`,
      ].join("\n");

      return ctx.reply(successText, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text("⚙️ View API Health", "action:api_settings")
          .text("📚 Main Menu", "action:pick_topic"),
      });
    } catch (err) {
      await anim.delete();
      return ctx.reply(`⚠️ Update error: ${err.message}`);
    }
  }

  // 1E. If the message contains one or more URLs, automatically process as IAS / Editorial website content ingestion!
  if (ctx.message.text.match(/https?:\/\/[^\s]+/i)) {
    return await handleIngestUrls(ctx, ctx.message.text);
  }

  // 2. If student has an active question, evaluate their submitted answer
  const s = sessions.get(ctx.chat.id);
  if (!s) {
    return ctx.reply("🎯 Please select a Paper and Unit to generate a question first:", {
      reply_markup: getPapersInlineKeyboard(),
    });
  }

  const mockTiming = extractMockTiming(ctx.chat.id);
  const anim = await createProgressAnimator(ctx, "ANSWER EVALUATOR & NOTION SYNC");
  try {
    await anim.step("📝 [1/3] Parsing Submitted Text Answer...", 30, "Analyzing structure & word count...");
    const out = await llm.evaluate(s.question, s.marks, s.words, { text: ctx.message.text });
    s.answer = ctx.message.text;
    s.evaluation = out;

    try {
      const numericScore = extractScoreFromEval(out, s.marks);
      recordSubmission(ctx.chat.id, {
        marks: s.marks,
        score: numericScore,
        unitId: s.unitId,
        elapsedSeconds: mockTiming ? mockTiming.elapsed : null,
        submissionType: "Text Answer",
      });
    } catch (e) {
      console.warn("Analytics recording warning:", e.message);
    }

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

    const card = formatModernEvaluationCard({ marks: s.marks, evaluation: out, submissionType: "Text Answer", notionUrl, mockTiming });
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

  const mockTiming = extractMockTiming(ctx.chat.id);
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

    try {
      const numericScore = extractScoreFromEval(out, s.marks);
      recordSubmission(ctx.chat.id, {
        marks: s.marks,
        score: numericScore,
        unitId: s.unitId,
        elapsedSeconds: mockTiming ? mockTiming.elapsed : null,
        submissionType: "Handwritten Paper (Vision OCR)",
      });
    } catch (e) {
      console.warn("Analytics recording warning:", e.message);
    }

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
    const card = formatModernEvaluationCard({ marks: s.marks, evaluation: out, submissionType: "Handwritten Paper (Vision OCR)", notionUrl, mockTiming });
    await reply(ctx, card, getPostAnswerKeyboard(s.unitId));
  } catch (err) {
    await anim.delete();
    console.error("Photo eval error:", err);
    await ctx.reply(`⚠️ Photo evaluation error: ${err.message}`);
  }
});

// Helpers to detect unit & paper from questions for uploaded QCAB answer sheets
function detectUnitFromQuestion(text) {
  const t = (text || "").toLowerCase();
  if (/macaulay|british|oriental|colonial|revolt|mutiny|congress|nehru|gandhi|patel|ambedkar|tagore|freedom|rebellion|justice party|periyar|kamarajar|renaissance|sangam|history|culture/i.test(t)) {
    return "GS1_U1";
  }
  if (/social|poverty|population|child|women|sanitation|dowry|domestic violence|health|illiteracy|unemployment|caste/i.test(t)) {
    return "GS1_U2";
  }
  if (/ethics|integrity|aptitude|corruption|moral|civil services values|code of conduct|conflict of interest|probity/i.test(t)) {
    return "GS1_U3";
  }
  if (/polity|constitution|parliament|governor|president|fundamental rights|directive principles|judiciary|election|federalism|panchayat|center-state/i.test(t)) {
    return "GS2_U1";
  }
  if (/science|technology|space|isro|defence|biotechnology|ai|nuclear|nano|cyber|drdo|semiconductor/i.test(t)) {
    return "GS2_U2";
  }
  if (/tamil nadu society|thirukkural|chola|pandya|pallava|sangam literature|heritage|temple architecture/i.test(t)) {
    return "GS2_U3";
  }
  if (/geography|monsoon|climate|soil|rivers|cyclone|el nino|western ghats|minerals|cauvery|vaigai/i.test(t)) {
    return "GS3_U1";
  }
  if (/environment|biodiversity|disaster|pollution|wildlife|climate change|wetlands|cop\d+|paris agreement|forest/i.test(t)) {
    return "GS3_U2";
  }
  if (/economy|gdp|inflation|rbi|budget|fiscal|tax|gst|banking|agriculture|industry|trade|msme|export|fdi/i.test(t)) {
    return "GS3_U3";
  }
  return "GS1_U1";
}

function getPaperCodeForUnit(unitId) {
  if (!unitId) return "Paper II";
  if (unitId.startsWith("GS1")) return "Paper II";
  if (unitId.startsWith("GS2")) return "Paper III";
  if (unitId.startsWith("GS3")) return "Paper IV";
  return "Paper II";
}

// PDF QCAB Answer Sheet submission — AI evaluate + generate merged result PDF
bot.on("message:document", async (ctx) => {
  let s = sessions.get(ctx.chat.id);

  // ── No session? Create a default context for verification uploads ──
  if (!s) {
    s = {
      question: "General TNPSC Group-1 Mains answer sheet",
      marks: 15,
      words: 250,
      topic: "General Studies",
      unitId: null,
    };
    sessions.set(ctx.chat.id, s);
  }

  const docMsg  = ctx.message.document;
  const fileName = docMsg.file_name || "document.pdf";
  const isPdf   = docMsg.mime_type === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  const isImage = docMsg.mime_type?.startsWith("image/") || /\.(jpe?g|png)$/i.test(fileName);

  if (!isPdf && !isImage) {
    return ctx.reply(
      "⚠️ <b>Unsupported format:</b> Please upload your QCAB answer sheet as a <b>PDF (.pdf)</b>.\n" +
      "📌 Scan your handwritten sheet and save as PDF, then upload here.",
      { parse_mode: "HTML" }
    );
  }

  if (docMsg.file_size && docMsg.file_size > 20 * 1024 * 1024) {
    return ctx.reply("⚠️ File exceeds Telegram's 20MB limit. Please compress your PDF and retry.");
  }

  const mockTiming = extractMockTiming(ctx.chat.id);
  const anim = await createProgressAnimator(ctx, "QCAB AI EVALUATION ENGINE");

  try {
    // ── STEP 1: Download the uploaded PDF ───────────────────────
    await anim.step("📥 [1/6] Downloading uploaded answer sheet...", 10, "Streaming PDF from Telegram servers...");
    const file   = await ctx.api.getFile(docMsg.file_id);
    const dlUrl  = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const buf    = Buffer.from(await (await fetch(dlUrl)).arrayBuffer());

    // Save to disk so evaluator can read it
    const tmpPath = path.join(__dirname, "data", "generated_pdfs", `UPLOAD_${Date.now()}.pdf`);
    fs.writeFileSync(tmpPath, buf);

    // ── STEP 1B: Inspect Page Count & Auto-Detect Marks ─────────
    // TNPSC Group-1 Mains Space Standards:
    // • 10-Mark Question: Exactly 1 ½ Writing Pages (2-page booklet, ~150 words)
    // • 15-Mark Question: Exactly 2 ½ Writing Pages (3-page booklet, ~250 words)
    let pageCount = 0;
    if (isPdf) {
      try {
        const { PDFDocument: LibPDF } = require("pdf-lib");
        const loadedPdf = await LibPDF.load(buf, { ignoreEncryption: true });
        pageCount = loadedPdf.getPageCount();
      } catch (e) {
        console.warn("[QCAB] Could not inspect uploaded PDF page count:", e.message);
      }
    } else {
      pageCount = 1;
    }

    // Default based on official booklet page count: <= 2 pages = 10M, >= 3 pages = 15M
    let autoDetectedMarks = pageCount <= 2 ? 10 : 15;

    // ── STEP 2: Read the QUESTION & Marks from the sheet ─────────
    await anim.step("🔍 [2/6] Reading question & detecting marks from sheet...", 22,
      "Gemini Vision scanning Q.No. area for question and marks...");
    const detectedQuestion = await extractQuestionFromSheet(tmpPath);

    // Check if the question text or header explicitly specifies marks (e.g. "[10 Marks]" or "15 Marks")
    if (detectedQuestion) {
      const marksMatch = /(?:\[|\()?\b(10|15)\s*(?:marks?|m\b)/i.exec(detectedQuestion);
      if (marksMatch) {
        autoDetectedMarks = parseInt(marksMatch[1], 10);
      }
    }

    // Apply auto-detected marks to session
    s.marks = autoDetectedMarks;
    s.words = s.marks === 10 ? 150 : 250;

    // Use detected question if found; fallback to session question
    const evalQuestion = (detectedQuestion && detectedQuestion.length > 15)
      ? detectedQuestion
      : s.question;

    // Update session with the real question
    if (detectedQuestion && detectedQuestion.length > 15) {
      s.question = detectedQuestion;
      s.topic    = detectedQuestion.split(" ").slice(0, 6).join(" ") + "...";
    }

    const pagesDesc = pageCount > 0
      ? `• <b>Booklet Length:</b> <code>${pageCount} Page${pageCount === 1 ? "" : "s"} (${s.marks === 10 ? "1 ½" : "2 ½"} writing pages)</code>\n`
      : "";

    await ctx.reply(
      `🔍 <b>QCAB Sheet Auto-Detected:</b>\n` +
      pagesDesc +
      `• <b>Standard:</b> <code>${s.marks} MARKS (${s.marks === 10 ? "~150 words • 8 mins" : "~250 words • 12 mins"})</code>\n` +
      `• <b>Question:</b> <i>"${evalQuestion}"</i>`,
      { parse_mode: "HTML" }
    );

    // ── STEP 3: AI Evaluate via Gemini Vision ────────────────────
    await anim.step("👁️ [3/6] Gemini Vision — Reading handwriting & scoring...", 40,
      `OCR + 12-Rule criteria (${s.marks}M scale): intro / body / conclusion / format / language...`);
    const evaluation = await evaluateQCABSheet(tmpPath, evalQuestion, s.marks);
    s.evaluation = evaluation;

    // Record analytics
    try {
      const cleanScore = Math.round((Number(evaluation.total_marks) || 0) * 10) / 10;
      recordSubmission(ctx.chat.id, {
        marks: s.marks,
        score: cleanScore,
        unitId: s.unitId,
        elapsedSeconds: mockTiming ? mockTiming.elapsed : null,
        submissionType: "QCAB PDF (Handwritten)",
      });
    } catch (e) { console.warn("Analytics:", e.message); }

    // ── STEP 4: Generate AI Model Answer (plain-text, PDF format)
    await anim.step("🧠 [4/6] Generating structured 12-rule model answer...", 58,
      "Building Introduction → Subheadings → Value Addition Boxes → Conclusion...");
    const words = s.marks === 10 ? 150 : 250;
    // Generate 12-rule model answer using the exact same structure as Notion Saver
    const modelAnswerText = await llm.modelAnswer(evalQuestion, s.marks, words);
    s.modelAnswer = modelAnswerText;



    // ── STEP 5: Build the PDFs ───────────────────────────────────
    await anim.step("📄 [5/6] Generating marked cover page + model answer PDF...", 78,
      "Compiling evaluation matrix, criteria breakdown & feedback...");

    const targetUnitId = s.unitId || detectUnitFromQuestion(evalQuestion);
    const paperCode    = getPaperCodeForUnit(targetUnitId);
    const topic        = s.topic || evalQuestion.split(" ").slice(0, 5).join(" ");

    const [markedCoverPath, modelAnswerPath] = await Promise.all([
      generateMarkedCoverPdf({
        question: evalQuestion, marks: s.marks, topic, paperCode,
        qNum: 1, evaluation,
      }),
      generateModelAnswerPdf({
        question: evalQuestion, marks: s.marks, topic, paperCode,
        qNum: 1, modelAnswer: modelAnswerText,
      }),
    ]);

    // ── STEP 5B: Save Model Answer & Evaluation to Notion ────────
    let notionPageUrl = null;
    try {
      const { total_marks: rawTMarks, max_marks: rawMMarks, overall_feedback: oFeedback, evaluation: evData } = evaluation;
      const tMarks     = Math.round((Number(rawTMarks) || 0) * 10) / 10;
      const mMarks     = Math.round((Number(rawMMarks) || s.marks || 15) * 10) / 10;
      const pctScore   = Math.round((tMarks / mMarks) * 100);
      const gradeStr   = pctScore >= 80 ? "A+" : pctScore >= 65 ? "A" : pctScore >= 50 ? "B" : "C";
      const labelStr   = pctScore >= 80 ? "EXCELLENT 🏆" : pctScore >= 65 ? "GOOD ✅" : pctScore >= 50 ? "SATISFACTORY 📊" : "NEEDS IMPROVEMENT ⚠️";

      const fmtScoreItem = (item) => {
        const aw = Math.round((Number(item?.marks_awarded) || 0) * 10) / 10;
        const mx = Math.round((Number(item?.max_marks) || 0) * 10) / 10;
        return `${aw}/${mx}`;
      };

      const evalSummary = [
        `Score: ${tMarks} / ${mMarks} Marks (${gradeStr} - ${labelStr})`,
        `Introduction: ${fmtScoreItem(evData?.introduction)}`,
        `Main Content: ${fmtScoreItem(evData?.body)}`,
        `Conclusion: ${fmtScoreItem(evData?.conclusion)}`,
        `12-Rule Format: ${fmtScoreItem(evData?.format)}`,
        `Language: ${fmtScoreItem(evData?.language)}`,
        `Feedback: ${oFeedback || "Satisfactory attempt."}`,
      ].join("\n");

      const notionRes = await saveSession({
        question: evalQuestion,
        marks: s.marks,
        words,
        modelAnswer: modelAnswerText,
        evaluation: evalSummary,
        topic: s.topic || evalQuestion.split(" ").slice(0, 6).join(" "),
        unitId: targetUnitId,
      });

      if (notionRes && notionRes.url) {
        notionPageUrl = notionRes.url;
        console.log(`[Notion] Saved uploaded PDF model answer: ${notionPageUrl}`);
      }
    } catch (nErr) {
      console.warn("[Notion] Could not save uploaded PDF session to Notion:", nErr.message);
    }

    // ── STEP 6: Merge: marked cover + user's sheet + model answer
    await anim.step("📎 [6/6] Merging all pages into one PDF...", 92,
      "Stitching: Marked Cover → User Answer Pages → Model Answer...");
    const mergedPath = await mergeEvaluationPdfs({
      markedCoverPath,
      userAnswerPath: tmpPath,
      modelAnswerPath,
    });


    await anim.delete();

    // ── Send the merged PDF ──────────────────────────────────────
    const { total_marks: rawTotalMarks, max_marks: rawMaxMarks, overall_feedback, evaluation: ev } = evaluation;
    const total_marks = Math.round((Number(rawTotalMarks) || 0) * 10) / 10;
    const max_marks   = Math.round((Number(rawMaxMarks) || s.marks || 15) * 10) / 10;
    const pct   = Math.round((total_marks / max_marks) * 100);
    const grade = pct >= 80 ? "A+" : pct >= 65 ? "A" : pct >= 50 ? "B" : "C";
    const label = pct >= 80 ? "EXCELLENT 🏆" : pct >= 65 ? "GOOD ✅" : pct >= 50 ? "SATISFACTORY 📊" : "NEEDS IMPROVEMENT ⚠️";

    const formatCrit = (item) => {
      const aw = Math.round((Number(item?.marks_awarded) || 0) * 10) / 10;
      const mx = Math.round((Number(item?.max_marks) || 0) * 10) / 10;
      return `${aw}/${mx}`;
    };

    const caption = [
      `📋 <b>QCAB EVALUATION RESULT</b>`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🏆 <b>Score:</b> <code>${total_marks} / ${max_marks} MARKS</code>`,
      `🎓 <b>Grade:</b> <code>${grade} — ${label}</code>`,
      ``,
      `📊 <b>Criteria Breakdown:</b>`,
      `• Introduction: <b>${formatCrit(ev.introduction)}</b>`,
      `• Main Content: <b>${formatCrit(ev.body)}</b>`,
      `• Conclusion: <b>${formatCrit(ev.conclusion)}</b>`,
      `• 12-Rule Format: <b>${formatCrit(ev.format)}</b>`,
      `• Language: <b>${formatCrit(ev.language)}</b>`,
      ``,
      `💬 <b>Feedback:</b> <i>${(overall_feedback || "").slice(0, 200)}</i>`,
      ``,
      notionPageUrl ? `📓 <b>Saved to Notion:</b> <a href="${notionPageUrl}">Open in Notion Workspace</a>\n` : ``,
      `📄 <i>PDF contains: Marked Cover Page + Your Answer Sheet + Model Answer</i>`,
    ].filter(Boolean).join("\n");

    const kb = new InlineKeyboard();
    if (notionPageUrl) {
      kb.url("📓 View in Notion", notionPageUrl).row();
    }
    kb.text("📑 New QCAB Sheet", "action:qcab_pdf")
      .text("📊 My Analytics", "action:analytics")
      .row()
      .text("📚 Next Question", "action:pick_topic");

    const outFileName = `QCAB_Evaluated_${s.marks}M_${Date.now().toString().slice(-4)}.pdf`;
    await ctx.replyWithDocument(new InputFile(mergedPath, outFileName), {
      caption,
      parse_mode: "HTML",
      reply_markup: kb,
    });

    // Cleanup temp files
    try { fs.unlinkSync(markedCoverPath); } catch (_) {}
    try { fs.unlinkSync(modelAnswerPath); } catch (_) {}
    try { fs.unlinkSync(tmpPath); } catch (_) {}

  } catch (err) {
    await anim.delete();
    console.error("QCAB PDF eval error:", err);
    await ctx.reply(`⚠️ Evaluation error: ${err.message}`);
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
      .text("📚 Choose Paper", "action:pick_topic")
      .text("⚙️ API Keys & Updater", "action:api_settings"),
  });
});

// /subscribe and /unsubscribe commands
bot.command("subscribe", async (ctx) => {
  subscribeChat(ctx.chat.id, { force: true });
  await ctx.reply("🔔 <b>Successfully Subscribed!</b>\n\nYou will receive the 2 TNPSC Mains PYQ questions, 12-rule model answers, and Notion link every morning at <b>9:00 AM</b>.", { parse_mode: "HTML" });
});

bot.command("unsubscribe", async (ctx) => {
  unsubscribeChat(ctx.chat.id);
  await ctx.reply("🔕 <b>Unsubscribed.</b> You will no longer receive daily 9:00 AM broadcast notifications.", { parse_mode: "HTML" });
});

bot.callbackQuery("action:sub", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Subscribed to daily 9 AM questions!" }).catch(() => {});
  subscribeChat(ctx.chat.id, { force: true });
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

// ─────────────────────────────────────────────────────────────
// API KEY UPDATER & LIVE HEALTH CHECK HANDLERS
// ─────────────────────────────────────────────────────────────

// /keys, /api, /settings command
bot.command(["keys", "api", "settings", "updater"], async (ctx) => {
  userState.delete(ctx.chat.id);
  const anim = await createProgressAnimator(ctx, "API HEALTH AUDIT");
  await anim.step("🔍 [1/2] Auditing Google Gemini API...", 40, "Checking quota & latency...");
  const gemini = await checkGeminiHealth();
  await anim.step("📓 [2/2] Auditing Notion Workspace...", 80, "Checking bot user & page access...");
  const notion = await checkNotionHealth();
  await anim.delete();

  const card = formatApiSettingsCard({ gemini, notion });
  await ctx.reply(card, {
    parse_mode: "HTML",
    reply_markup: getApiSettingsKeyboard(),
  });
});

bot.callbackQuery("action:api_settings", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  userState.delete(ctx.chat.id);
  const anim = await createProgressAnimator(ctx, "API HEALTH AUDIT");
  await anim.step("🔍 [1/2] Auditing Google Gemini API...", 40, "Checking quota & latency...");
  const gemini = await checkGeminiHealth();
  await anim.step("📓 [2/2] Auditing Notion Workspace...", 80, "Checking bot user & page access...");
  const notion = await checkNotionHealth();
  await anim.delete();

  const card = formatApiSettingsCard({ gemini, notion });
  await ctx.reply(card, {
    parse_mode: "HTML",
    reply_markup: getApiSettingsKeyboard(),
  });
});

bot.callbackQuery("action:check_api_health", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Testing API health live..." }).catch(() => {});
  const anim = await createProgressAnimator(ctx, "LIVE HEALTH AUDIT");
  await anim.step("🔍 [1/2] Pinging Google Gemini AI...", 45, "Testing response time...");
  const gemini = await checkGeminiHealth();
  await anim.step("📓 [2/2] Pinging Notion Workspace API...", 85, "Testing token & page...");
  const notion = await checkNotionHealth();
  await anim.delete();

  const card = formatApiSettingsCard({ gemini, notion });
  await ctx.reply(card, {
    parse_mode: "HTML",
    reply_markup: getApiSettingsKeyboard(),
  });
});

bot.callbackQuery("action:update_gemini_key", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  userState.set(ctx.chat.id, { state: "WAITING_FOR_GEMINI_KEY" });
  const promptCard = [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  🔑 <b>UPDATE GEMINI API KEY</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `Current Key: <code>${maskKey(process.env.GEMINI_API_KEY)}</code>`,
    ``,
    `✍️ <b>Please paste your new Google Gemini API Key:</b>`,
    `<i>Get your free key from Google AI Studio:</i>`,
    `https://aistudio.google.com/app/apikey`,
    ``,
    `🔒 <b>Security & Auto-Save:</b>`,
    `• Your key is tested live against Gemini API before saving`,
    `• Successfully verified keys are written to <code>.env</code> on disk`,
    `• Your Telegram message with the key is instantly deleted for safety`,
    ``,
    `<i>Tap Cancel below to abort:</i>`,
  ].join("\n");

  await ctx.reply(promptCard, {
    parse_mode: "HTML",
    disable_web_page_preview: false,
    reply_markup: new InlineKeyboard().text("❌ Cancel", "action:cancel_key_update"),
  });
});

bot.callbackQuery("action:update_notion_key", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  userState.set(ctx.chat.id, { state: "WAITING_FOR_NOTION_TOKEN" });
  const promptCard = [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  📓 <b>UPDATE NOTION TOKEN</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `Current Token: <code>${maskKey(process.env.NOTION_TOKEN || process.env.NOTION_API_KEY)}</code>`,
    ``,
    `✍️ <b>Please paste your Notion Internal Integration Token:</b>`,
    `<i>Starts with <code>ntn_...</code> or <code>secret_...</code> from Notion Developer Portal:</i>`,
    `https://www.notion.so/profile/integrations`,
    ``,
    `🔒 <b>Security & Auto-Save:</b>`,
    `• Token is verified live via Notion API (<code>users.me</code>)`,
    `• Saved automatically into backend <code>.env</code> file`,
    `• Your Telegram message will be deleted immediately for privacy`,
    ``,
    `<i>Tap Cancel below to abort:</i>`,
  ].join("\n");

  await ctx.reply(promptCard, {
    parse_mode: "HTML",
    disable_web_page_preview: false,
    reply_markup: new InlineKeyboard().text("❌ Cancel", "action:cancel_key_update"),
  });
});

bot.callbackQuery("action:update_notion_db", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  userState.set(ctx.chat.id, { state: "WAITING_FOR_NOTION_DB" });
  const promptCard = [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  📄 <b>UPDATE NOTION ROOT PAGE ID</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `Current Root Page ID: <code>${maskKey(process.env.NOTION_DATABASE_ID, 8, 4)}</code>`,
    ``,
    `✍️ <b>Please paste your Notion Root Page URL or 32-digit ID:</b>`,
    `<i>Example:</i> <code>3f6bdc8a71e0800e8640e6b0ee0c3d60</code>`,
    ``,
    `📌 <i>Important: Ensure you invited your integration bot to this Notion page via Page Settings ➔ Connections.</i>`,
    ``,
    `<i>Tap Cancel below to abort:</i>`,
  ].join("\n");

  await ctx.reply(promptCard, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text("❌ Cancel", "action:cancel_key_update"),
  });
});

bot.callbackQuery("action:cancel_key_update", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Update cancelled" }).catch(() => {});
  userState.delete(ctx.chat.id);
  await ctx.reply("❌ <b>Key update cancelled.</b> Existing configuration retained.", {
    parse_mode: "HTML",
    reply_markup: getPapersInlineKeyboard(),
  });
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
    { command: "mock", description: "⏱️ 12-Minute Real-Time Exam Simulator" },
    { command: "analytics", description: "📊 Aspirant Analytics & Mastery Radar" },
    { command: "capsule", description: "🌟 TN Scheme & Policy Capsule Vault" },
    { command: "qcab", description: "📑 Download Printable QCAB Answer Booklet PDF" },
    { command: "bible", description: "📖 Compile & Download Revision Bible PDF" },
    { command: "editorial", description: "📰 Daily Editorial Syllabus Linker" },
    { command: "budget", description: "🎯 TN Economic Survey & Budget 2024-25 Injector" },
    { command: "diagram", description: "🗺️ Visual answer diagram & flowchart" },
    { command: "tnstats", description: "🎯 Tamil Nadu official stats & schemes" },
    { command: "pyq", description: "Instant PYQ + 12-rule answer generation" },
    { command: "quick", description: "Rapid syllabus question generation" },
    { command: "tomorrow", description: "View tomorrow's scheduled topic (9 AM)" },
    { command: "daily", description: "Run/view today's 9 AM PYQ questions" },
    { command: "status", description: "System Health Meter & syllabus progress" },
    { command: "keys", description: "API credentials updater & live health" },
    { command: "subscribe", description: "Subscribe to 9 AM daily alerts" },
    { command: "menu", description: "Open syllabus navigation" },
    { command: "auto", description: "Auto-generate Q&A and save to Notion" },
    { command: "url", description: "🌐 Ingest IAS article URL(s) directly to Notion" },
    { command: "model", description: "Get official 12-rule model answer" },
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
