require("dotenv").config();
const http = require("http");
const { Bot, InlineKeyboard, Keyboard, InputFile } = require("grammy");
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
const {
  EXAM_YEARS,
  loadArchive: loadPyqArchive,
  getStats: getPyqStats,
  generateSinglePYQ,
  compileMasterBookletPdf,
} = require("./pyq_archive_manager");
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
const {
  loadAccessState,
  isAdmin,
  hasAnyAdmin,
  addAdmin,
  isUserAllowed,
  getUserAccessInfo,
  addAllowedFriend,
  removeAllowedFriend,
  recordPendingRequest,
  approvePendingRequest,
  rejectPendingRequest,
  toggleRestriction,
  getAllAllowedFriends,
  getAllPendingRequests,
  formatAdminPanelCard,
  formatFriendsListCard,
  formatPendingRequestsCard,
  formatAccessDeniedCard,
} = require("./access_manager");

const { scanQCABPresentation, formatMarginScanCard } = require("./qcab_scanner");
const {
  MOCK_PAPERS,
  startMockHallSession,
  getActiveSession: getActiveMockHallSession,
  checkMilestone: checkMockHallMilestone,
  finishMockHallSession,
  formatMockHallEntryCard,
  formatMockHallStatusCard,
  formatMockHallCompletionCard,
} = require("./mock_hall_manager");
const { generateQuestionsFromNews, formatNewsToMainsCard } = require("./news_to_mains");
const { levelUpAnswer, formatLevelUpCard } = require("./answer_level_up");
const {
  recordSubmissionScore,
  getLeaderboard,
  getUserProfile: getLeaderboardProfile,
  formatLeaderboardCard,
  formatUserProfileCard,
} = require("./leaderboard_manager");
const {
  setPrinterEndpoint,
  getPrinterEndpoint,
  printQCABBooklet,
  formatPrinterDispatchCard,
} = require("./printer_dispatcher");
const {
  reactToMessage,
  reactForEvaluation,
  awardBadge,
  getUserBadges,
  formatBadgesShowcaseCard,
} = require("./badge_manager");
const {
  isStudyPoliceActive,
  toggleStudyPolice,
  detectSpam,
  recordWarning: recordStudyPoliceWarning,
  auditGroupMessage,
  formatPoliceStatusCard,
} = require("./study_police");
const {
  getChallengeForRoll,
  formatDartChallengeCard,
} = require("./gamified_picker");
const {
  extractHashtags,
  generateSyllabusHashtags,
  indexMessage: indexHashtagMessage,
  getTagItems,
  formatTagsListCard,
  formatTagResultsCard,
} = require("./hashtag_categorizer");

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

  // Prominent Admin Panel button in main menu
  kb.text("🛡️ ADMIN PANEL (Manage Friends & Access)", "action:admin_panel")
    .row();

  kb.text("🎯 Dart Topic Picker", "action:dart_picker")
    .text("🏛️ Sunday 3-Hr Mock", "action:mock_hall_menu")
    .row();

  kb.text("🏆 Leaderboard", "action:leaderboard")
    .text("🎖️ Badges & Honors", "action:view_badges")
    .row();

  kb.text("🚀 AI Answer Level-Up", "action:level_up_prompt")
    .text("📰 News to Mains", "action:news_to_mains")
    .row();

  kb.text("📐 Margin Scanner", "action:scanmargin_prompt")
    .text("🖨️ Wi-Fi Printer", "action:printer_settings")
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

  kb.text("👮 Study Police", "action:police_status")
    .text("🏷️ Hashtags Archive", "action:hashtag_archive")
    .row();

  kb.text("⚡ Auto-Generate for All 9 Units (GS I, II & III)", "action:auto_all_papers")
    .row()
    .text("📊 Health Meter", "action:view_status")
    .text("⚙️ API Keys & Updater", "action:api_settings")
    .row()
    .text("🛡️ Open Admin Panel", "action:admin_panel");

  return kb;
}

// ─────────────────────────────────────────────────────────────
// PERSISTENT BOTTOM BUTTON MENU (Docked at bottom of chat)
// ─────────────────────────────────────────────────────────────
function getMainReplyKeyboard(userId) {
  return new Keyboard()
    .text("📚 Syllabus Menu")
    .text("🎯 Dart Picker")
    .row()
    .text("⏱️ 12-Min Mock")
    .text("🏛️ 3-Hr Mock Hall")
    .row()
    .text("🏆 Leaderboard")
    .text("🎖️ Badges")
    .row()
    .text("🚀 Level-Up 13/15")
    .text("📰 News to Mains")
    .row()
    .text("📐 Margin Scanner")
    .text("🛡️ Admin Panel")
    .resized()
    .persistent();
}

// ─────────────────────────────────────────────────────────────
// ADMIN & FRIENDS ACCESS CONTROL KEYBOARDS
// ─────────────────────────────────────────────────────────────
function getAdminPanelKeyboard(user) {
  const state = loadAccessState();
  const friendsCount = Object.keys(state.allowedFriends || {}).length;
  const pendingCount = Object.keys(state.pendingRequests || {}).length;
  const modeText = state.restrictionEnabled ? "🟢 Whitelist Only" : "🌐 Public Open";

  return new InlineKeyboard()
    .text(`👥 Manage Friends (${friendsCount})`, "admin:list_friends:1")
    .text("➕ Add Friend", "admin:add_friend_prompt")
    .row()
    .text(`⏳ Pending Requests (${pendingCount})`, "admin:pending_requests")
    .text(`🔄 Mode: ${modeText}`, "admin:toggle_restriction")
    .row()
    .text("🔑 API Keys & Settings", "action:api_settings")
    .text("📊 Health Meter", "action:view_status")
    .row()
    .text("❌ Close Admin Panel", "admin:close");
}

function getFriendsListKeyboard(page = 1, totalPages = 1, pageFriends = []) {
  const kb = new InlineKeyboard();

  pageFriends.forEach((f) => {
    const displayName = (f.fullName || String(f.id)).slice(0, 16);
    kb.text(`❌ Remove ${displayName}`, `admin:confirm_remove:${f.id}`).row();
  });

  if (totalPages > 1) {
    if (page > 1) {
      kb.text("◀️ Prev", `admin:list_friends:${page - 1}`);
    }
    kb.text(`📄 ${page}/${totalPages}`, "admin:noop");
    if (page < totalPages) {
      kb.text("Next ▶️", `admin:list_friends:${page + 1}`);
    }
    kb.row();
  }

  kb.text("➕ Add Another Friend", "admin:add_friend_prompt")
    .text("⬅️ Back to Admin", "admin:main");

  return kb;
}

function getFriendConfirmRemoveKeyboard(friendId) {
  return new InlineKeyboard()
    .text("⚠️ Yes, Revoke Access", `admin:do_remove:${friendId}`)
    .text("❌ Cancel", "admin:list_friends:1");
}

function getPendingRequestsKeyboard(requests = []) {
  const kb = new InlineKeyboard();

  requests.forEach((r) => {
    const displayName = (r.fullName || String(r.id)).slice(0, 12);
    kb.text(`✅ Approve ${displayName}`, `admin:approve:${r.id}`)
      .text("❌ Reject", `admin:reject:${r.id}`)
      .row();
  });

  kb.text("🔄 Refresh Requests", "admin:pending_requests")
    .text("⬅️ Back to Admin", "admin:main");

  return kb;
}

function getAccessDeniedKeyboard(user) {
  return new InlineKeyboard()
    .text("📩 Request Access from Admin", "user:request_access")
    .row()
    .text("🔄 Check My Access Status", "user:check_status");
}

function getClaimAdminKeyboard() {
  return new InlineKeyboard()
    .text("👑 Claim Admin Ownership Now", "admin:claim_ownership");
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
    .text("🚀 Level-Up Answer (7➔13)", "action:levelup_active")
    .text("📐 Margin Scanner", "action:scanmargin_prompt")
    .row()
    .text("🗺️ Answer Diagram", "action:diagram")
    .text("📑 Printable QCAB PDF", "action:qcab_pdf")
    .row()
    .text("🖨️ Direct Print QCAB", "action:print_active_qcab")
    .text("🏆 Leaderboard", "action:leaderboard")
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
    .text("🖨️ Direct Wi-Fi Print", "action:print_active_qcab")
    .text("🚀 Level-Up This Answer", "action:level_up_prompt")
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

  // Detect PYQ Exam Year
  const yearMatch = cleanQ.match(/\[(?:TNPSC[^\d\]]*)?(\b(?:19|20)\d{2}\b)[^\]]*\]/i) || cleanQ.match(/\b(199\d|20[0-2]\d)\b/);
  const examYear = (isPYQ || /\[.*PYQ.*\]/i.test(cleanQ)) && yearMatch ? yearMatch[1] : null;

  const lines = [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  🏛️ <b>TNPSC GROUP-1 MAINS SPECIALIST</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `🏷️ <b>Category:</b> <code>${badge}</code>`,
  ];

  if (examYear) {
    lines.push(`📅 <b>Exam Year:</b> <code>TNPSC Group-1 Mains (${examYear})</code>`);
  }

  lines.push(
    `📚 <b>Paper & Unit:</b> <i>${unitTitle}</i>`,
    `🎯 <b>Syllabus Topic:</b> <b>${topic}</b>`,
    `⚖️ <b>Weightage:</b> <code>${marks} MARKS • ~${words} WORDS</code>`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📌 <b>QUESTION - ${questionNumber}:</b>`,
    `<b>${cleanQ}</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `⚡ <i>Official Tamil Nadu Career Services 12-Rule Model Answer below:</i>`
  );

  return lines.join("\n");
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
  const q1 = res.question1 || res.question || "";
  const q2 = res.question2 || "";
  const y1 = (q1.match(/\[.*?(\b(?:19|20)\d{2}\b).*?\]/) || q1.match(/\b(199\d|20[0-2]\d)\b/))?.[1];
  const y2 = (q2.match(/\[.*?(\b(?:19|20)\d{2}\b).*?\]/) || q2.match(/\b(199\d|20[0-2]\d)\b/))?.[1];

  return [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  ⏰ <b>TNPSC MAINS DAILY 9:00 AM SUITE</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `🎯 <b>Topic:</b> <b>${res.topic}</b>`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📌 <b>QUESTION 1 (PYQ${y1 ? ` • ${y1}` : ""}):</b>`,
    `<i>${q1}</i>`,
    ``,
    `📌 <b>QUESTION 2 (PYQ${y2 ? ` • ${y2}` : ""}):</b>`,
    `<i>${q2}</i>`,
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
// FEATURE HANDLER HELPERS
// ─────────────────────────────────────────────────────────────

async function handleGamifiedDartPicker(ctx) {
  const diceMsg = await ctx.replyWithDice({ emoji: "🎯" });
  const score = diceMsg.dice?.value || 6;
  const challenge = getChallengeForRoll(score);

  if (score === 6 && ctx.from?.id) {
    awardBadge(ctx.from.id, "DART_BULLSEYE");
  }

  const anim = await createProgressAnimator(ctx, "DART SYLLABUS CHALLENGE");
  let question = "";
  try {
    await anim.step(`🎯 [1/2] Bullseye Landed: ${score}/6...`, 40, `Selecting ${challenge.theme}...`);
    const qRaw = await llm.generateQuestion(`Tamil Nadu & India: ${challenge.theme}`, challenge.marks);
    question = qRaw.replace(/<[^>]+>/g, "").trim();
    await anim.delete();
  } catch (err) {
    await anim.delete();
    question = `Critically examine the significance of ${challenge.theme} with special reference to Tamil Nadu.`;
  }

  sessions.set(ctx.chat.id, {
    question,
    marks: challenge.marks,
    words: wordsFor(challenge.marks),
    topic: challenge.theme,
    unitId: null,
  });

  const card = formatDartChallengeCard(score, challenge, question);
  const kb = new InlineKeyboard()
    .text("⏱️ Start 12-Min Challenge", "action:start_mock_exam")
    .text("📑 Blank QCAB PDF", "action:qcab_pdf")
    .row()
    .text("🎯 Roll Again", "action:dart_picker")
    .text("📚 Syllabus Menu", "action:pick_topic");

  return ctx.reply(card, { parse_mode: "HTML", reply_markup: kb });
}

async function handleMockHallMenu(ctx) {
  const active = getActiveMockHallSession(ctx.from?.id);
  if (active && active.status === "IN_PROGRESS") {
    return ctx.reply(formatMockHallStatusCard(active), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🏁 Submit Mock Booklet", "mockhall:submit")
        .text("🔄 Refresh Status", "mockhall:status"),
    });
  }

  const welcomeText = [
    `🏛️ <b>SUNDAY 3-HOUR FULL MOCK EXAMINATION HALL</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Simulate the authentic 3-Hour (180 Minutes, 250 Marks) TNPSC Group-1 Mains Examination under strict exam hall conditions!`,
    ``,
    `📋 <b>Features:</b>`,
    `• Progressive milestone proctoring (45m, 90m, 150m, 165m, 180m alerts)`,
    `• Full 250-mark paper syllabus coverage`,
    `• Endurance scoring & Marathoner Badges`,
    `• Official QCAB booklet submission & presentation audit`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `👉 <i>Select a General Studies Paper to enter the 3-Hour Mock Hall:</i>`,
  ].join("\n");

  const kb = new InlineKeyboard()
    .text("📜 Paper II (GS 1: History, Social, Aptitude)", "mockhall:start:GS1").row()
    .text("⚖️ Paper III (GS 2: Polity, S&T, Tamil Society)", "mockhall:start:GS2").row()
    .text("📈 Paper IV (GS 3: Geography, Environment, Economy)", "mockhall:start:GS3").row()
    .text("📚 Back to Main Menu", "action:pick_topic");

  return ctx.reply(welcomeText, { parse_mode: "HTML", reply_markup: kb });
}

async function handleNewsToMainsPrompt(ctx) {
  userState.set(ctx.chat.id, { state: "WAITING_FOR_NEWS_INPUT" });
  return ctx.reply(
    [
      `📰 <b>INSTANT NEWS-TO-MAINS QUESTION GENERATOR</b>`,
      `────────────────────────────────────`,
      `Send or paste any recent news headline, newspaper editorial, or current affairs snippet!`,
      ``,
      `<i>Example:</i>`,
      `<code>Tamil Nadu government announces new Green Hydrogen and Semiconductor Subsidies Policy 2024</code>`,
      ``,
      `<i>The AI Question Paper Setter will immediately map it to the syllabus, frame 10M & 15M questions with directive words, and generate a topper value-addition blueprint!</i>`,
    ].join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("❌ Cancel", "action:pick_topic"),
    }
  );
}

async function handleLevelUpPrompt(ctx) {
  const s = sessions.get(ctx.chat.id);
  if (s && s.answer && s.answer.length > 20) {
    return runAnswerLevelUp(ctx, s.question, s.answer, s.marks || 15);
  }

  userState.set(ctx.chat.id, { state: "WAITING_FOR_LEVELUP_INPUT" });
  return ctx.reply(
    [
      `🚀 <b>AI ANSWER LEVEL-UP ENGINE (7 ➔ 13 / 15 MARKS)</b>`,
      `────────────────────────────────────`,
      `Please paste your draft answer (or any average answer scoring 6–8 marks)!`,
      ``,
      `The Level-Up Engine will:`,
      `1. Diagnose why it scored 7/15`,
      `2. Inject Tamil Nadu statistics, flagship schemes, constitutional articles, and visual diagrams`,
      `3. Deliver a transformed, state-topper 13/15 answer in full 12-rule format!`,
    ].join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("❌ Cancel", "action:pick_topic"),
    }
  );
}

async function runAnswerLevelUp(ctx, question, answerText, marks = 15) {
  const anim = await createProgressAnimator(ctx, "AI ANSWER LEVEL-UP ENGINE");
  try {
    await anim.step("🔍 [1/3] Diagnosing ~7/15 Shortcomings...", 25, "Scanning for missing TN data & schemes...");
    await anim.step("⚡ [2/3] Injecting 4-Pillar Value Additions...", 60, "Adding NITI Aayog stats, Articles & Flowchart...");
    const result = await levelUpAnswer(question, answerText, marks);
    await anim.step("🏆 [3/3] Compiling Transformed 13/15 Model...", 90, "Applying 12-rule structure...");
    await anim.delete();

    const card = formatLevelUpCard(result, { question, marks });
    return reply(ctx, card, new InlineKeyboard()
      .text("📑 Blank QCAB PDF", "action:qcab_pdf")
      .text("🏆 Leaderboard", "action:leaderboard")
      .row()
      .text("📚 Syllabus Menu", "action:pick_topic")
    );
  } catch (err) {
    await anim.delete();
    return ctx.reply(`⚠️ Level-Up Error: ${err.message}`);
  }
}

async function handleMarginScanPrompt(ctx) {
  userState.set(ctx.chat.id, { state: "WAITING_FOR_MARGIN_SCAN" });
  return ctx.reply(
    [
      `📐 <b>QCAB SPACE & MARGIN SCANNER</b>`,
      `────────────────────────────────────`,
      `Upload your scanned QCAB Answer Sheet (PDF or Photo) now!`,
      ``,
      `The Presentation Auditor will audit:`,
      `• Left & Right margin discipline (no text bleed)`,
      `• Vertical space density & void voids (~1.5p or ~2.5p)`,
      `• Underlined keywords, callout boxes & schematics`,
      `• Baseline stability & handwriting legibility`,
      ``,
      `🎯 <i>Receive an official Presentation Marks Score (/10.0) & deduction warnings!</i>`,
    ].join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("❌ Cancel", "action:pick_topic"),
    }
  );
}

// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// TELEGRAM BOT COMMAND & MESSAGE REGISTRATION
// ─────────────────────────────────────────────────────────────
function registerBotHandlers(bot) {
  // Global Middleware: Access Control & Live Activity Tracker
  bot.use(async (ctx, next) => {
    // 0. Group Anti-Spam & Study Police check
    try {
      const handledSpam = await auditGroupMessage(ctx);
      if (handledSpam) return;
    } catch (_) {}

    // Auto-index hashtags in text
    if (ctx.message?.text && ctx.chat?.id) {
      try {
        indexHashtagMessage(ctx.chat.id, ctx.message.message_id, {
          text: ctx.message.text,
          author: [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "Aspirant",
        });
      } catch (_) {}
    }

    // 1. Record user profile if available
    if (ctx.from) {
      try {
        recordTelegramUser(ctx.from);
      } catch (_) {}
    }

    const userId = ctx.from?.id;
    const isAllowed = isUserAllowed(userId);

    // 2. Exception routes that any user can trigger even if not whitelisted yet
    const text = (ctx.message?.text || "").trim();
    const isIdCmd = text.startsWith("/myid") || text.startsWith("/id") || text.startsWith("/whoami");
    const isAdminCmd = text.startsWith("/admin") || text.startsWith("/panel") || text.startsWith("/adminpanel") || text === "🛡️ Admin Panel" || text === "Admin Panel";
    const isAdminCallback = ctx.callbackQuery?.data?.startsWith("admin:") || ctx.callbackQuery?.data === "action:admin_panel";
    const isUserCallback = ctx.callbackQuery?.data?.startsWith("user:") || ctx.callbackQuery?.data === "admin:claim_ownership";

    // Admin routes & buttons: always pass through to admin handlers
    // (Handlers independently enforce isAdmin(id) checks or prompt claim ownership setup)
    if (isAdminCmd || isAdminCallback) {
      return next();
    }

    // Always allow checking personal ID & access status
    if (isIdCmd) {
      return next();
    }

    // Always allow user access request buttons
    if (isUserCallback) {
      return next();
    }

    // If access restriction is ON and user is NOT allowed
    if (!isAllowed) {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({
          text: "🔒 Access Restricted. Please tap 'Request Access from Admin' on the welcome screen.",
          show_alert: true,
        }).catch(() => {});
        return;
      }

      // If user sends /start or any message: show Access Restricted Screen
      return ctx.reply(formatAccessDeniedCard(ctx.from), {
        parse_mode: "HTML",
        reply_markup: getAccessDeniedKeyboard(ctx.from),
      });
    }

    // 3. User is allowed: auto-subscribe to daily alerts
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

    // Attach the persistent bottom button menu
    await ctx.reply("🎯 <b>Welcome to TNPSC Group-1 Mains Specialist Bot</b>", {
      parse_mode: "HTML",
      reply_markup: getMainReplyKeyboard(ctx.from?.id),
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
      "• 🏛️ <b>PYQ Archive 2012–Present (/pyqs):</b> Authentic questions, model answers & PDF booklet",
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

  // ─────────────────────────────────────────────────────────────
  // 🛡️ ADMIN PANEL & FRIEND ACCESS CONTROL COMMANDS
  // ─────────────────────────────────────────────────────────────

  // /admin, /panel, /adminpanel
  bot.command(["admin", "panel", "adminpanel"], async (ctx) => {
    userState.delete(ctx.chat.id);

    // If no admin exists yet anywhere, allow this user to claim ownership
    if (!hasAnyAdmin()) {
      const claimText = [
        `👑 <b>ADMIN OWNERSHIP SETUP</b>`,
        `────────────────────────────────────`,
        `No Administrator has been configured for this bot yet!`,
        ``,
        `👤 <b>Your Name:</b> ${ctx.from.first_name || "User"}`,
        `🆔 <b>Your Telegram ID:</b> <code>${ctx.from.id}</code>`,
        ``,
        `👉 <i>Tap the button below to claim ownership and activate the Admin Panel:</i>`,
      ].join("\n");

      return ctx.reply(claimText, {
        parse_mode: "HTML",
        reply_markup: getClaimAdminKeyboard(),
      });
    }

    // Verify admin permissions
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply(
        `⛔ <b>Admin Access Denied</b>\n\nThis Admin Panel is restricted to authorized bot administrators.\n\n🆔 <b>Your Telegram User ID:</b> <code>${ctx.from.id}</code>`,
        { parse_mode: "HTML" }
      );
    }

    const card = formatAdminPanelCard(ctx.from);
    await ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: getAdminPanelKeyboard(ctx.from),
    });
  });

  // /addfriend <id> [note] or /allow <id>
  bot.command(["addfriend", "allow", "add_friend"], async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply(`⛔ <b>Admin Access Denied.</b>`, { parse_mode: "HTML" });
    }

    const text = (ctx.message.text || "").trim();
    const parts = text.split(/\s+/).slice(1);

    if (parts.length === 0) {
      userState.set(ctx.chat.id, { state: "WAITING_FOR_FRIEND_INPUT" });
      return ctx.reply(
        [
          `➕ <b>ADD AUTHORIZED FRIEND</b>`,
          `────────────────────────────────────`,
          `Please send your friend's <b>Telegram User ID</b> (e.g. <code>123456789</code>), or forward any message from them to this chat!`,
          ``,
          `<i>Tip: You can also use:</i>`,
          `<code>/addfriend 123456789 Friend Name</code>`,
          ``,
          `<i>Tap Cancel below to abort:</i>`,
        ].join("\n"),
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text("❌ Cancel", "admin:main"),
        }
      );
    }

    const idMatch = parts[0].match(/\b\d{5,15}\b/);
    if (!idMatch) {
      return ctx.reply("⚠️ <b>Invalid Telegram ID.</b> Please provide a numeric ID, e.g.: <code>/addfriend 123456789</code>", {
        parse_mode: "HTML",
      });
    }

    const friendId = idMatch[0];
    const note = parts.slice(1).join(" ") || "Authorized Study Friend";

    const res = addAllowedFriend({
      id: friendId,
      addedBy: ctx.from.first_name || `Admin (${ctx.from.id})`,
      note,
    });

    if (res.success) {
      const f = res.friend;
      // Try to notify the friend
      try {
        await ctx.api.sendMessage(
          f.id,
          `🎉 <b>ACCESS GRANTED!</b>\n\nHello <b>${f.fullName}</b>! The admin has granted you access to <b>TNPSC Group-1 Mains Specialist Bot</b>.\n\nTap /start to begin!`,
          { parse_mode: "HTML" }
        );
      } catch (_) {}

      return ctx.reply(
        `✅ <b>Friend Access Granted!</b>\n\n👤 <b>${f.fullName}</b> ${f.username ? `(${f.username})` : ""}\n🆔 <code>${f.id}</code>\n📝 <i>${f.note}</i>\n\nYour friend now has full access.`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("👥 View Friends List", "admin:list_friends:1")
            .text("➕ Add Another", "admin:add_friend_prompt")
            .row()
            .text("🛡️ Admin Panel", "admin:main"),
        }
      );
    } else {
      return ctx.reply(`⚠️ Could not add friend: ${res.error}`);
    }
  });

  // /removefriend <id> or /revoke <id>
  bot.command(["removefriend", "revoke", "remove_friend"], async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply(`⛔ <b>Admin Access Denied.</b>`, { parse_mode: "HTML" });
    }

    const text = (ctx.message.text || "").trim();
    const parts = text.split(/\s+/).slice(1);

    if (parts.length === 0) {
      const all = getAllAllowedFriends();
      const card = formatFriendsListCard(1, 5);
      const kb = getFriendsListKeyboard(1, Math.ceil(all.length / 5) || 1, all.slice(0, 5));
      return ctx.reply(card, { parse_mode: "HTML", reply_markup: kb });
    }

    const idMatch = parts[0].match(/\b\d{5,15}\b/);
    if (!idMatch) {
      return ctx.reply("⚠️ Invalid Telegram ID. Please provide a numeric ID, e.g.: <code>/removefriend 123456789</code>", {
        parse_mode: "HTML",
      });
    }

    const res = removeAllowedFriend(idMatch[0]);
    if (res.success) {
      return ctx.reply(`🗑️ <b>Access Revoked:</b> Removed <b>${res.removed.fullName}</b> (ID: <code>${idMatch[0]}</code>) from authorized friends list.`, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text("👥 View Friends List", "admin:list_friends:1")
          .text("🛡️ Admin Panel", "admin:main"),
      });
    } else {
      return ctx.reply(`⚠️ ${res.error}`);
    }
  });

  // /friends, /allowed, /whitelist
  bot.command(["friends", "allowed", "whitelist"], async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply(`⛔ <b>Admin Access Denied.</b>`, { parse_mode: "HTML" });
    }
    const all = getAllAllowedFriends();
    const totalPages = Math.ceil(all.length / 5) || 1;
    const card = formatFriendsListCard(1, 5);
    const kb = getFriendsListKeyboard(1, totalPages, all.slice(0, 5));
    await ctx.reply(card, { parse_mode: "HTML", reply_markup: kb });
  });

  // /requests, /pending
  bot.command(["requests", "pending"], async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply(`⛔ <b>Admin Access Denied.</b>`, { parse_mode: "HTML" });
    }
    const reqs = getAllPendingRequests();
    const card = formatPendingRequestsCard();
    const kb = getPendingRequestsKeyboard(reqs);
    await ctx.reply(card, { parse_mode: "HTML", reply_markup: kb });
  });

  // /myid, /id, /whoami (available to all users)
  bot.command(["myid", "id", "whoami"], async (ctx) => {
    const info = getUserAccessInfo(ctx.from.id);
    const fullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || "User";
    const text = [
      `🆔 <b>TELEGRAM USER IDENTITY</b>`,
      `────────────────────────────────────`,
      `👤 <b>Name:</b> <b>${fullName}</b>`,
      ctx.from.username ? `🔖 <b>Username:</b> @${ctx.from.username}` : `🔖 <b>Username:</b> (None)`,
      `🆔 <b>Telegram User ID:</b> <code>${ctx.from.id}</code>`,
      `👑 <b>Role:</b> <b>${info.role}</b>`,
      `🔒 <b>Access Status:</b> ${info.isAllowed ? "🟢 <b>Granted (Full Access)</b>" : "🔴 <b>Restricted (Pending Approval)</b>"}`,
      `🌐 <b>Bot Mode:</b> <i>${info.restrictionEnabled ? "Private Whitelist Mode" : "Public Mode"}</i>`,
      ``,
      `<i>Tip: Share your ID <code>${ctx.from.id}</code> with the bot admin to get access!</i>`,
    ].join("\n");

    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: info.isAllowed ? getPapersInlineKeyboard() : getAccessDeniedKeyboard(ctx.from),
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
bot.on("message:text", async (ctx, next) => {
  if (ctx.message.text.startsWith("/")) return await next();

  const trimmedText = ctx.message.text.trim();

  // 0. Handle Persistent Bottom Button Menu clicks
  if (trimmedText === "🛡️ Admin Panel" || trimmedText === "Admin Panel") {
    userState.delete(ctx.chat.id);
    if (!hasAnyAdmin()) {
      return ctx.reply(
        [
          `👑 <b>ADMIN OWNERSHIP SETUP</b>`,
          `────────────────────────────────────`,
          `No Administrator has been configured for this bot yet!`,
          ``,
          `👤 <b>Your Name:</b> ${ctx.from.first_name || "User"}`,
          `🆔 <b>Your Telegram ID:</b> <code>${ctx.from.id}</code>`,
          ``,
          `👉 Tap below to claim ownership as the Primary Bot Admin:`,
        ].join("\n"),
        { parse_mode: "HTML", reply_markup: getClaimAdminKeyboard() }
      );
    }
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply(
        `⛔ <b>Admin Access Denied</b>\n\nThis Admin Panel is restricted to the bot administrator.\nYour Telegram User ID is: <code>${ctx.from.id}</code>`,
        { parse_mode: "HTML" }
      );
    }
    const card = formatAdminPanelCard(ctx.from);
    return ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: getAdminPanelKeyboard(ctx.from),
    });
  }

  if (trimmedText === "👥 Friends List" || trimmedText === "Friends List") {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply(`⛔ <b>Admin Access Denied.</b>`, { parse_mode: "HTML" });
    }
    const all = getAllAllowedFriends();
    const totalPages = Math.ceil(all.length / 5) || 1;
    const card = formatFriendsListCard(1, 5);
    const kb = getFriendsListKeyboard(1, totalPages, all.slice(0, 5));
    return ctx.reply(card, { parse_mode: "HTML", reply_markup: kb });
  }

  if (trimmedText === "📚 Syllabus Menu" || trimmedText === "Syllabus Menu") {
    userState.delete(ctx.chat.id);
    return ctx.reply("📚 <b>TNPSC Mains Syllabus Navigation:</b>\n\nSelect a General Studies Paper to practice:", {
      parse_mode: "HTML",
      reply_markup: getPapersInlineKeyboard(),
    });
  }

  if (trimmedText === "🆔 My ID" || trimmedText === "My ID") {
    const info = getUserAccessInfo(ctx.from.id);
    const fullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || "User";
    const text = [
      `🆔 <b>TELEGRAM USER IDENTITY</b>`,
      `────────────────────────────────────`,
      `👤 <b>Name:</b> <b>${fullName}</b>`,
      ctx.from.username ? `🔖 <b>Username:</b> @${ctx.from.username}` : `🔖 <b>Username:</b> (None)`,
      `🆔 <b>Telegram User ID:</b> <code>${ctx.from.id}</code>`,
      `👑 <b>Role:</b> <b>${info.role}</b>`,
      `🔒 <b>Access Status:</b> ${info.isAllowed ? "🟢 <b>Granted (Full Access)</b>" : "🔴 <b>Restricted (Pending Approval)</b>"}`,
      `🌐 <b>Bot Mode:</b> <i>${info.restrictionEnabled ? "Private Whitelist Mode" : "Public Mode"}</i>`,
      ``,
      `<i>Tip: Share your ID <code>${ctx.from.id}</code> with the bot admin to get access!</i>`,
    ].join("\n");

    return ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: info.isAllowed ? getPapersInlineKeyboard() : getAccessDeniedKeyboard(ctx.from),
    });
  }

  if (trimmedText === "⏱️ 12-Min Mock") {
    userState.delete(ctx.chat.id);
    return ctx.reply(
      `⏱️ <b>12-Minute Real-Time Exam Simulator</b>\n\nSelect a General Studies Paper to begin your timed 15-mark answer writing test:`,
      { parse_mode: "HTML", reply_markup: getPapersInlineKeyboard() }
    );
  }

  if (trimmedText === "📊 Analytics") {
    return ctx.reply(formatAnalyticsCard(ctx.chat.id), {
      parse_mode: "HTML",
      reply_markup: getPapersInlineKeyboard(),
    });
  }

  if (trimmedText === "🌟 Capsules") {
    return ctx.reply(formatCapsuleCard(SCHEME_CAPSULES[0]), {
      parse_mode: "HTML",
      reply_markup: getPapersInlineKeyboard(),
    });
  }

  if (trimmedText === "🎯 TN Stats") {
    return ctx.reply("🎯 <b>Tamil Nadu Official Policy & Stats Bank</b>\n\nSelect a category to view high-yield citations:", {
      parse_mode: "HTML",
      reply_markup: getStatsCategoriesKeyboard(),
    });
  }

  if (trimmedText === "🎯 Dart Picker" || trimmedText === "Dart Picker") {
    userState.delete(ctx.chat.id);
    return handleGamifiedDartPicker(ctx);
  }

  if (trimmedText === "🏛️ 3-Hr Mock Hall" || trimmedText === "3-Hr Mock Hall") {
    userState.delete(ctx.chat.id);
    return handleMockHallMenu(ctx);
  }

  if (trimmedText === "🏆 Leaderboard" || trimmedText === "Leaderboard") {
    return ctx.reply(formatLeaderboardCard(10, ctx.from?.id), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("👤 My Scorecard", "action:myrank")
        .text("📚 Syllabus Menu", "action:pick_topic"),
    });
  }

  if (trimmedText === "🎖️ Badges" || trimmedText === "Badges") {
    const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "Aspirant";
    return ctx.reply(formatBadgesShowcaseCard(ctx.from?.id, fullName), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🏆 Leaderboard", "action:leaderboard")
        .text("📚 Syllabus Menu", "action:pick_topic"),
    });
  }

  if (trimmedText === "🚀 Level-Up 13/15" || trimmedText === "Level-Up 13/15") {
    return handleLevelUpPrompt(ctx);
  }

  if (trimmedText === "📰 News to Mains" || trimmedText === "News to Mains") {
    return handleNewsToMainsPrompt(ctx);
  }

  if (trimmedText === "📐 Margin Scanner" || trimmedText === "Margin Scanner") {
    return handleMarginScanPrompt(ctx);
  }

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

  // 1E. Handle Friend Addition input for Admin Panel
  if (st && st.state === "WAITING_FOR_FRIEND_INPUT") {
    userState.delete(ctx.chat.id);
    const rawInput = (ctx.message.text || "").trim();

    if (rawInput.toLowerCase() === "cancel" || rawInput === "❌ Cancel") {
      return ctx.reply("❌ <b>Friend addition cancelled.</b> Returning to Admin Panel.", {
        parse_mode: "HTML",
        reply_markup: getAdminPanelKeyboard(ctx.from),
      });
    }

    let friendId = null;
    let friendFullName = "";
    let friendUsername = "";

    // 1. Check for Telegram forwarded message
    if (ctx.message.forward_from) {
      friendId = String(ctx.message.forward_from.id);
      friendFullName = [ctx.message.forward_from.first_name, ctx.message.forward_from.last_name].filter(Boolean).join(" ");
      friendUsername = ctx.message.forward_from.username ? `@${ctx.message.forward_from.username}` : "";
    } else if (ctx.message.forward_origin?.type === "user" && ctx.message.forward_origin.sender_user) {
      const u = ctx.message.forward_origin.sender_user;
      friendId = String(u.id);
      friendFullName = [u.first_name, u.last_name].filter(Boolean).join(" ");
      friendUsername = u.username ? `@${u.username}` : "";
    } else {
      // 2. Parse numeric ID from text
      const match = rawInput.match(/\b\d{5,15}\b/);
      if (match) {
        friendId = match[0];
      }
    }

    if (!friendId) {
      return ctx.reply(
        "⚠️ <b>Invalid Telegram User ID</b>\n\nCould not find a valid numeric User ID. Please send a numeric ID (e.g. <code>123456789</code>) or forward a message directly from your friend.",
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("🔁 Try Again", "admin:add_friend_prompt")
            .text("⬅️ Admin Panel", "admin:main"),
        }
      );
    }

    const note = rawInput.replace(friendId, "").replace(/^[\s\-:,]+/, "").trim() || "Authorized Study Friend";

    const res = addAllowedFriend({
      id: friendId,
      username: friendUsername,
      fullName: friendFullName,
      addedBy: ctx.from.first_name || `Admin (${ctx.from.id})`,
      note,
    });

    if (res.success) {
      const f = res.friend;
      const successMsg = [
        `╔════════════════════════════════════════╗`,
        `║  ✅ <b>FRIEND ACCESS GRANTED!</b>`,
        `╚════════════════════════════════════════╝`,
        `👤 <b>Name:</b> <b>${f.fullName}</b> ${f.username ? `(${f.username})` : ""}`,
        `🆔 <b>Telegram ID:</b> <code>${f.id}</code>`,
        `📝 <b>Note:</b> <i>${f.note}</i>`,
        `📅 <b>Added:</b> <i>${new Date(f.addedAt).toLocaleString("en-IN")}</i>`,
        ``,
        `🎉 Your friend now has <b>full, unlimited access</b> to the bot!`,
      ].join("\n");

      // Notify the friend via Telegram DM if reachable
      try {
        await ctx.api.sendMessage(
          f.id,
          [
            `🎉 <b>ACCESS GRANTED!</b>`,
            `────────────────────────────────────`,
            `Hello <b>${f.fullName}</b>! 👋`,
            `The administrator has granted you access to <b>TNPSC Group-1 Mains Specialist Bot</b>!`,
            ``,
            `You can now access:`,
            `• 🏛️ Authentic PYQs & 12-Rule Model Answers`,
            `• ⏱️ 12-Minute Real-Time Exam Simulator`,
            `• 📑 Official QCAB Answer Booklet & Revision PDFs`,
            `• 🌟 TN Policy & Scheme Capsule Vault`,
            ``,
            `👉 Tap /start below to begin!`,
          ].join("\n"),
          { parse_mode: "HTML" }
        );
      } catch (_) {}

      return ctx.reply(successMsg, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text("👥 View Friends List", "admin:list_friends:1")
          .text("➕ Add Another", "admin:add_friend_prompt")
          .row()
          .text("🛡️ Back to Admin Panel", "admin:main"),
      });
    } else {
      return ctx.reply(`⚠️ Could not add friend: ${res.error}`, {
        reply_markup: new InlineKeyboard().text("⬅️ Admin Panel", "admin:main"),
      });
    }
  }

  // 1F. Handle News-to-Mains text input
  if (st && st.state === "WAITING_FOR_NEWS_INPUT") {
    userState.delete(ctx.chat.id);
    const newsText = ctx.message.text.trim();
    const anim = await createProgressAnimator(ctx, "NEWS-TO-MAINS CONVERTER");
    try {
      await anim.step("🗞️ [1/2] Mapping News to TNPSC Syllabus...", 40, "Determining Paper & Unit...");
      const data = await generateQuestionsFromNews(newsText);
      await anim.step("✍️ [2/2] Framing 10M & 15M Directive Questions...", 85, "Crafting value blueprint & TN scheme linkages...");
      await anim.delete();

      sessions.set(ctx.chat.id, {
        question: data.question_15m,
        question10: data.question_10m,
        marks: 15,
        words: 250,
        topic: `${data.paper_code} - ${data.unit_name}: ${data.directive_word}`,
        unitId: data.unit_id || null,
      });

      const card = formatNewsToMainsCard(data, newsText);
      const kb = new InlineKeyboard()
        .text("✍️ Practice 15-Marker", "gen_topic:own:15")
        .text("✍️ Practice 10-Marker", "gen_topic:own:10")
        .row()
        .text("🎯 12-Rule Model Answer", "action:model")
        .text("📑 Blank QCAB PDF", "action:qcab_pdf")
        .row()
        .text("📚 Syllabus Menu", "action:pick_topic");

      return ctx.reply(card, { parse_mode: "HTML", reply_markup: kb });
    } catch (err) {
      await anim.delete();
      return ctx.reply(`⚠️ News conversion error: ${err.message}`);
    }
  }

  // 1G. Handle Level-Up text input
  if (st && st.state === "WAITING_FOR_LEVELUP_INPUT") {
    userState.delete(ctx.chat.id);
    const draftText = ctx.message.text.trim();
    const s = sessions.get(ctx.chat.id);
    const q = s?.question || "Evaluate the role of social welfare policies in Tamil Nadu with emphasis on inclusive growth.";
    return runAnswerLevelUp(ctx, q, draftText, s?.marks || 15);
  }

  // 1H. Handle Printer IP configuration input
  if (st && st.state === "WAITING_FOR_PRINTER_IP") {
    userState.delete(ctx.chat.id);
    const ipText = ctx.message.text.trim();
    const cleanUrl = setPrinterEndpoint(ctx.from?.id, ipText);
    return ctx.reply(
      `✅ <b>Wi-Fi Printer Configured!</b>\n\n🌐 <b>Endpoint:</b> <code>${cleanUrl}</code>\n⚡ <b>Protocol:</b> IPP (RFC 8011)\n\nYou can now print QCAB sheets directly with <b>/print</b>!`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text("🖨️ Test Print Current QCAB", "action:print_active_qcab")
          .text("📚 Main Menu", "action:pick_topic"),
      }
    );
  }

  // 1I. If the message contains one or more URLs, automatically process as IAS / Editorial website content ingestion!
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

  const isMarginScan = userState.get(ctx.chat.id)?.state === "WAITING_FOR_MARGIN_SCAN";
  if (isMarginScan) {
    userState.delete(ctx.chat.id);
    const anim = await createProgressAnimator(ctx, "QCAB SPACE & MARGIN SCANNER");
    try {
      await anim.step("📸 [1/2] Downloading sheet image...", 35);
      const photos = ctx.message.photo;
      const file = await ctx.api.getFile(photos[photos.length - 1].file_id);
      const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      const tmpPhoto = path.join(__dirname, "data", "generated_pdfs", `SCAN_${Date.now()}.jpg`);
      fs.writeFileSync(tmpPhoto, buf);

      await anim.step("📐 [2/2] Scanning Margins & Space Allocation...", 80, "Auditing text borders and density...");
      const scan = await scanQCABPresentation(tmpPhoto, s.marks || 15);
      await anim.delete();
      try { fs.unlinkSync(tmpPhoto); } catch (_) {}

      if (scan.total_presentation_score >= 8.5 && ctx.from?.id) {
        awardBadge(ctx.from.id, "QCAB_PRO");
      }

      const card = formatMarginScanCard(scan, s.marks || 15);
      return ctx.reply(card, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text("📑 Blank QCAB PDF", "action:qcab_pdf")
          .text("📚 Syllabus Menu", "action:pick_topic"),
      });
    } catch (err) {
      await anim.delete();
      return ctx.reply(`⚠️ Margin scan error: ${err.message}`);
    }
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

      // Leaderboard & Badges
      recordSubmissionScore(ctx.from, { score: numericScore, marks: s.marks, isMock: Boolean(s.isMock) });
      reactForEvaluation(ctx, numericScore, s.marks).catch(() => {});
      if (numericScore >= 12) awardBadge(ctx.from?.id, "TOPPER_SCORE");
      if (mockTiming && mockTiming.elapsed <= 720) awardBadge(ctx.from?.id, "SPEED_DEMON");
      s.lastScore = numericScore;
      s.lastEvaluatedAnswer = "(Handwritten photo answer)";
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

    // If user requested Space & Margin Scanner
    if (userState.get(ctx.chat.id)?.state === "WAITING_FOR_MARGIN_SCAN") {
      userState.delete(ctx.chat.id);
      await anim.step("📐 Scanning Margins & Space Allocation...", 50, "Auditing text borders and density...");
      const scan = await scanQCABPresentation(tmpPath, s.marks || 15);
      await anim.delete();
      try { fs.unlinkSync(tmpPath); } catch (_) {}

      if (scan.total_presentation_score >= 8.5 && ctx.from?.id) {
        awardBadge(ctx.from.id, "QCAB_PRO");
      }

      const card = formatMarginScanCard(scan, s.marks || 15);
      return ctx.reply(card, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text("📑 Blank QCAB PDF", "action:qcab_pdf")
          .text("📚 Syllabus Menu", "action:pick_topic"),
      });
    }

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

    // Leaderboard & Badges
    recordSubmissionScore(ctx.from, { score: total_marks, marks: s.marks, isMock: Boolean(s.isMock) });
    reactForEvaluation(ctx, total_marks, s.marks).catch(() => {});
    if (total_marks >= 12) awardBadge(ctx.from?.id, "TOPPER_SCORE");
    if (mockTiming && mockTiming.elapsed <= 720) awardBadge(ctx.from?.id, "SPEED_DEMON");
    s.lastScore = total_marks;
    s.lastEvaluatedAnswer = "(Scanned Handwritten QCAB PDF Answer)";
    s.lastPdfPath = mergedPath;

    const kb = new InlineKeyboard();
    if (notionPageUrl) {
      kb.url("📓 View in Notion", notionPageUrl).row();
    }
    kb.text("🚀 Level-Up This Answer", "action:levelup_active")
      .text("📐 Margin Scanner", "action:scanmargin_last")
      .row()
      .text("🖨️ Direct Wi-Fi Print", "action:print_active_qcab")
      .text("🏆 Leaderboard", "action:leaderboard")
      .row()
      .text("📑 New QCAB Sheet", "action:qcab_pdf")
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
// ─────────────────────────────────────────────────────────────
// PYQ ARCHIVE COMMANDS & HANDLERS (2012 - PRESENT)
// ─────────────────────────────────────────────────────────────

function formatPyqArchiveCard() {
  const stats = getPyqStats();
  const yearLines = EXAM_YEARS.map(
    (y) => `• <b>${y}:</b> <code>${stats.byYear[y] || 0} questions</code>`
  ).join("\n");

  return [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  🏛️ <b>TNPSC MAINS PYQ ARCHIVE (2012–PRESENT)</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `Official Previous Year Questions archive categorized across all 9 syllabus units with 12-Rule Model Answers, Notion pages & ruled QCAB PDFs.`,
    ``,
    `📊 <b>Archive Summary:</b>`,
    `• <b>Total PYQs Archived:</b> <code>${stats.total}</code>`,
    `• <b>Notion Pages Synced:</b> <code>${stats.totalNotion}</code>`,
    `• <b>Ruled QCAB PDFs:</b> <code>${stats.totalPdfs}</code>`,
    ``,
    `📅 <b>Breakdown by Exam Year:</b>`,
    yearLines,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `👇 <b>Select an Exam Year below to browse or generate authentic questions:</b>`,
  ].join("\n");
}

function getPyqYearsKeyboard() {
  const kb = new InlineKeyboard();
  kb.text("2024", "pyq:year:2024")
    .text("2023", "pyq:year:2023")
    .text("2022", "pyq:year:2022")
    .text("2019", "pyq:year:2019")
    .row();
  kb.text("2017", "pyq:year:2017")
    .text("2016", "pyq:year:2016")
    .text("2015", "pyq:year:2015")
    .text("2012", "pyq:year:2012")
    .row();
  kb.text("🎲 Generate Random PYQ (2012–2024)", "pyq:gen:random")
    .row()
    .text("📄 Download Master PDF Booklet", "pyq:compile_pdf")
    .row()
    .text("📚 Syllabus Menu", "action:pick_topic");
  return kb;
}

// /pyqs command - View or generate Previous Year Questions from 2012 to current years
bot.command(["pyqs", "pyq", "previous_years"], async (ctx) => {
  userState.delete(ctx.chat.id);
  const card = formatPyqArchiveCard();
  await ctx.reply(card, {
    parse_mode: "HTML",
    reply_markup: getPyqYearsKeyboard(),
  });
});

// Callback: Main PYQ Dashboard
bot.callbackQuery("pyq:browse", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const card = formatPyqArchiveCard();
  await ctx.reply(card, {
    parse_mode: "HTML",
    reply_markup: getPyqYearsKeyboard(),
  });
});

// Callback: View/Manage specific Year's PYQs
bot.callbackQuery(/^pyq:year:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const year = parseInt(ctx.match[1], 10);
  const archive = loadPyqArchive();
  const yearQuestions = (archive.questions || []).filter((q) => q.year === year);

  const textLines = [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  📅 <b>TNPSC GROUP-1 MAINS (${year})</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `Questions archived for <b>${year}</b>: <code>${yearQuestions.length}</code>`,
    ``,
  ];

  if (yearQuestions.length === 0) {
    textLines.push(`<i>No questions generated for ${year} yet. Tap below to architect an authentic ${year} PYQ with official 12-rule model answer!</i>`);
  } else {
    textLines.push(`<b>Archived Questions:</b>`);
    yearQuestions.slice(-3).forEach((item, i) => {
      textLines.push(`<b>${i + 1}.</b> <i>${item.question.slice(0, 110)}...</i>`);
      textLines.push(`   📚 <code>${item.paper} • ${item.topic}</code>\n`);
    });
  }

  const kb = new InlineKeyboard()
    .text(`⚡ Generate ${year} PYQ & Answer`, `pyq:gen:${year}`)
    .row()
    .text("📄 Compile Year PDF", `pyq:compile_year:${year}`)
    .row()
    .text("⬅️ Back to Years", "pyq:browse");

  await ctx.reply(textLines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: kb,
  });
});

// Callback: Generate on-demand PYQ for specific or random year
bot.callbackQuery(/^pyq:gen:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const rawYear = ctx.match[1];
  const targetYear = rawYear === "random"
    ? EXAM_YEARS[Math.floor(Math.random() * EXAM_YEARS.length)]
    : parseInt(rawYear, 10);

  const randomTopic = getRandomTopic();
  const anim = await createProgressAnimator(ctx, `PYQ GENERATOR (${targetYear})`);

  try {
    await anim.step(`🔍 Pulling authentic ${targetYear} PYQ for '${randomTopic.topic}'...`, 25, "Consulting TNPSC Exam Archives");
    const item = await generateSinglePYQ({
      year: targetYear,
      topicObj: randomTopic,
      marks: 15,
      saveToNotion: true,
      generatePdf: true,
      onProgress: async (msg) => {
        await anim.step(msg, 60, `Topic: ${randomTopic.topic}`);
      },
    });

    await anim.delete();

    // Set active session for candidate practice
    sessions.set(ctx.chat.id, {
      question: item.question,
      marks: item.marks,
      words: item.words,
      topic: item.topic,
      unitId: item.unitId,
      modelAnswer: item.modelAnswer,
      notionUrl: item.notionUrl,
      notionPageId: item.notionPageId,
    });

    const card = formatModernQuestionCard({
      question: item.question,
      marks: item.marks,
      words: item.words,
      topic: item.topic,
      unitTitle: `${item.paper} - ${item.unit}`,
      questionNumber: 1,
      examYear: targetYear,
    });

    const kb = new InlineKeyboard();
    if (item.notionUrl) {
      kb.url("🔗 Open in Notion", item.notionUrl).row();
    }
    kb.text("💡 View 12-Rule Model Answer", "action:view_model_answer")
      .row()
      .text("⏱️ Practice as 12-Min Mock", "action:start_mock_exam")
      .text("📑 QCAB PDF", "action:qcab_pdf")
      .row()
      .text(`🔄 Another ${targetYear} PYQ`, `pyq:gen:${targetYear}`)
      .text("⬅️ All Years", "pyq:browse");

    await ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: kb,
    });

    // Send QCAB PDF if generated
    if (item.pdfPath && fs.existsSync(item.pdfPath)) {
      try {
        const outFileName = `TNPSC_PYQ_${targetYear}_${Date.now().toString().slice(-4)}.pdf`;
        await ctx.replyWithDocument(new InputFile(item.pdfPath, outFileName), {
          caption: `📄 <b>Ruled QCAB Model Answer PDF (${targetYear})</b>\n\n📌 <i>${item.question.slice(0, 80)}...</i>`,
          parse_mode: "HTML",
        });
      } catch (docErr) {
        console.warn("Could not send PYQ PDF document:", docErr.message);
      }
    }
  } catch (err) {
    await anim.delete();
    console.error(`PYQ generation error (${targetYear}):`, err);
    await ctx.reply(`⚠️ PYQ generation encountered an issue: ${err.message}. Please try again.`);
  }
});

// Callback: Compile & Send Master Booklet PDF
bot.callbackQuery(["pyq:compile_pdf", /^pyq:compile_year:(\d+)$/], async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const yearMatch = ctx.callbackQuery.data.match(/^pyq:compile_year:(\d+)$/);
  const targetYear = yearMatch ? parseInt(yearMatch[1], 10) : null;

  const anim = await createProgressAnimator(ctx, "COMPILING PYQ MASTER BOOKLET");

  try {
    await anim.step("📚 Stitching ruled QCAB answer sheets into master booklet...", 50, targetYear ? `Year: ${targetYear}` : "All Years 2012–Present");
    const result = await compileMasterBookletPdf({ year: targetYear });
    await anim.delete();

    const title = targetYear ? `TNPSC Group-1 Mains (${targetYear}) PYQ Compendium` : `TNPSC Group-1 Mains (2012–Present) PYQ Compendium`;
    const docName = `TNPSC_PYQ_${targetYear || "2012_2024"}_Compendium.pdf`;

    await ctx.replyWithDocument(new InputFile(result.filePath, docName), {
      caption: `🏛️ <b>${title}</b>\n\n📄 <b>Total Pages:</b> <code>${result.totalPages}</code>\n📌 <b>Questions Included:</b> <code>${result.questionsIncluded}</code>\n\n<i>Rendered strictly on authentic TNPSC ruled answer booklet pages.</i>`,
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("⬅️ Back to PYQs", "pyq:browse")
        .text("📚 Main Menu", "action:pick_topic"),
    });
  } catch (err) {
    await anim.delete();
    console.error("Master booklet compilation error:", err);
    await ctx.reply(`⚠️ Could not compile PDF booklet: ${err.message}\n\n<i>Tip: Generate a few PYQs for this year first using the buttons above!</i>`, {
      reply_markup: new InlineKeyboard().text("⬅️ Back to PYQs", "pyq:browse"),
    });
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

  // ─────────────────────────────────────────────────────────────
  // 🛡️ ADMIN PANEL & ACCESS CALLBACK QUERIES
  // ─────────────────────────────────────────────────────────────

  bot.callbackQuery("action:admin_panel", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    if (!hasAnyAdmin()) {
      return ctx.reply(
        [
          `👑 <b>ADMIN OWNERSHIP SETUP</b>`,
          `────────────────────────────────────`,
          `No Administrator has been configured for this bot yet!`,
          ``,
          `👤 <b>Your Name:</b> ${ctx.from.first_name || "User"}`,
          `🆔 <b>Your Telegram ID:</b> <code>${ctx.from.id}</code>`,
          ``,
          `👉 Tap below to claim ownership as the Primary Bot Admin:`,
        ].join("\n"),
        { parse_mode: "HTML", reply_markup: getClaimAdminKeyboard() }
      );
    }

    if (!isAdmin(ctx.from.id)) {
      return ctx.reply(`⛔ <b>Admin Access Denied</b>\n\nThis Admin Panel is restricted to the bot administrator.\nYour Telegram User ID is: <code>${ctx.from.id}</code>`, {
        parse_mode: "HTML",
      });
    }

    userState.delete(ctx.chat.id);
    const card = formatAdminPanelCard(ctx.from);
    await ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: getAdminPanelKeyboard(ctx.from),
    });
  });

  bot.callbackQuery("admin:main", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    if (!isAdmin(ctx.from.id)) return;
    userState.delete(ctx.chat.id);
    const card = formatAdminPanelCard(ctx.from);
    try {
      await ctx.editMessageText(card, { parse_mode: "HTML", reply_markup: getAdminPanelKeyboard(ctx.from) });
    } catch (_) {
      await ctx.reply(card, { parse_mode: "HTML", reply_markup: getAdminPanelKeyboard(ctx.from) });
    }
  });

  bot.callbackQuery(/^admin:list_friends:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    if (!isAdmin(ctx.from.id)) return;
    const page = parseInt(ctx.match[1], 10) || 1;
    const all = getAllAllowedFriends();
    const pageSize = 5;
    const totalPages = Math.ceil(all.length / pageSize) || 1;
    const currPage = Math.max(1, Math.min(page, totalPages));
    const startIdx = (currPage - 1) * pageSize;
    const pageFriends = all.slice(startIdx, startIdx + pageSize);

    const card = formatFriendsListCard(currPage, pageSize);
    const kb = getFriendsListKeyboard(currPage, totalPages, pageFriends);
    try {
      await ctx.editMessageText(card, { parse_mode: "HTML", reply_markup: kb });
    } catch (_) {
      await ctx.reply(card, { parse_mode: "HTML", reply_markup: kb });
    }
  });

  bot.callbackQuery("admin:add_friend_prompt", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    if (!isAdmin(ctx.from.id)) return;
    userState.set(ctx.chat.id, { state: "WAITING_FOR_FRIEND_INPUT" });
    const prompt = [
      `➕ <b>ADD AUTHORIZED FRIEND</b>`,
      `────────────────────────────────────`,
      `👉 <b>Method 1 (Paste ID):</b>`,
      `Send your friend's numeric Telegram User ID (e.g. <code>123456789</code>).`,
      `You can also add a note: <code>123456789 - Senthil Study Partner</code>`,
      ``,
      `👉 <b>Method 2 (Forward Message):</b>`,
      `Simply forward any message from your friend into this chat!`,
      ``,
      `<i>Tap Cancel below to abort:</i>`,
    ].join("\n");

    await ctx.reply(prompt, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("❌ Cancel", "admin:main"),
    });
  });

  bot.callbackQuery(/^admin:confirm_remove:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    if (!isAdmin(ctx.from.id)) return;
    const friendId = ctx.match[1];
    const state = loadAccessState();
    const friend = state.allowedFriends[friendId];
    const name = friend?.fullName || `User ID ${friendId}`;

    const prompt = [
      `⚠️ <b>CONFIRM REVOKE ACCESS</b>`,
      `────────────────────────────────────`,
      `Are you sure you want to revoke access for:`,
      `👤 <b>${name}</b> ${friend?.username ? `(${friend.username})` : ""}`,
      `🆔 <code>${friendId}</code>`,
      ``,
      `This friend will immediately lose access to all bot features until re-added.`,
    ].join("\n");

    try {
      await ctx.editMessageText(prompt, {
        parse_mode: "HTML",
        reply_markup: getFriendConfirmRemoveKeyboard(friendId),
      });
    } catch (_) {
      await ctx.reply(prompt, {
        parse_mode: "HTML",
        reply_markup: getFriendConfirmRemoveKeyboard(friendId),
      });
    }
  });

  bot.callbackQuery(/^admin:do_remove:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const friendId = ctx.match[1];
    const res = removeAllowedFriend(friendId);
    if (res.success) {
      await ctx.answerCallbackQuery({ text: `Revoked access for ${res.removed.fullName || friendId}` });
      const msg = [
        `🗑️ <b>ACCESS REVOKED</b>`,
        `────────────────────────────────────`,
        `👤 <b>User:</b> <b>${res.removed.fullName}</b>`,
        `🆔 <b>Telegram ID:</b> <code>${friendId}</code>`,
        `✅ Successfully removed from authorized friends list.`,
      ].join("\n");
      try {
        await ctx.editMessageText(msg, {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("👥 View Friends List", "admin:list_friends:1")
            .text("🛡️ Admin Panel", "admin:main"),
        });
      } catch (_) {
        await ctx.reply(msg, {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("👥 View Friends List", "admin:list_friends:1")
            .text("🛡️ Admin Panel", "admin:main"),
        });
      }
    } else {
      await ctx.answerCallbackQuery({ text: `Error: ${res.error}`, show_alert: true });
    }
  });

  bot.callbackQuery("admin:pending_requests", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    if (!isAdmin(ctx.from.id)) return;
    const reqs = getAllPendingRequests();
    const card = formatPendingRequestsCard();
    const kb = getPendingRequestsKeyboard(reqs);
    try {
      await ctx.editMessageText(card, { parse_mode: "HTML", reply_markup: kb });
    } catch (_) {
      await ctx.reply(card, { parse_mode: "HTML", reply_markup: kb });
    }
  });

  bot.callbackQuery(/^admin:approve:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.answerCallbackQuery({ text: "⛔ Only administrators can approve requests.", show_alert: true });
    }
    const targetUserId = ctx.match[1];
    const res = approvePendingRequest(targetUserId, ctx.from.first_name || `Admin (${ctx.from.id})`);

    if (res.success) {
      await ctx.answerCallbackQuery({ text: `✅ Approved access for ID ${targetUserId}!` }).catch(() => {});
      try {
        await ctx.editMessageText(
          [
            `✅ <b>ACCESS APPROVED!</b>`,
            `────────────────────────────────────`,
            `👤 <b>Friend:</b> <b>${res.friend.fullName}</b> ${res.friend.username ? `(${res.friend.username})` : ""}`,
            `🆔 <b>Telegram ID:</b> <code>${res.friend.id}</code>`,
            `👑 <b>Approved By:</b> ${ctx.from.first_name || "Admin"}`,
            `📅 <b>Date:</b> <i>${new Date().toLocaleString("en-IN")}</i>`,
            ``,
            `<i>User has been added to authorized friends list and notified.</i>`,
          ].join("\n"),
          {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard()
              .text("👥 View Friends List", "admin:list_friends:1")
              .text("🛡️ Admin Panel", "admin:main"),
          }
        );
      } catch (_) {}

      // Notify friend directly
      try {
        await ctx.api.sendMessage(
          targetUserId,
          [
            `🎉 <b>ACCESS GRANTED!</b>`,
            `────────────────────────────────────`,
            `Hello <b>${res.friend.fullName}</b>! 👋`,
            `The administrator has approved your request!`,
            ``,
            `You now have <b>full access</b> to the <b>TNPSC Group-1 Mains Specialist Bot</b>!`,
            `• 🏛️ 12-Rule Model Answers & Authentic PYQs`,
            `• ⏱️ 12-Minute Real-Time Exam Simulator`,
            `• 📑 QCAB Answer Booklet & Revision Bible PDFs`,
            `• 🌟 TN Policy & Scheme Capsule Vault`,
            ``,
            `👉 Tap /start to begin your preparation!`,
          ].join("\n"),
          { parse_mode: "HTML" }
        );
      } catch (_) {}
    } else {
      await ctx.answerCallbackQuery({ text: `⚠️ Error: ${res.error}`, show_alert: true });
    }
  });

  bot.callbackQuery(/^admin:reject:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.answerCallbackQuery({ text: "⛔ Only administrators can reject requests.", show_alert: true });
    }
    const targetUserId = ctx.match[1];
    rejectPendingRequest(targetUserId);

    await ctx.answerCallbackQuery({ text: `❌ Request declined.` }).catch(() => {});
    try {
      await ctx.editMessageText(
        [
          `❌ <b>ACCESS REQUEST DECLINED</b>`,
          `────────────────────────────────────`,
          `🆔 <b>Telegram ID:</b> <code>${targetUserId}</code>`,
          `👑 <b>Declined By:</b> ${ctx.from.first_name || "Admin"}`,
          `📅 <b>Date:</b> <i>${new Date().toLocaleString("en-IN")}</i>`,
        ].join("\n"),
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text("🛡️ Back to Admin Panel", "admin:main"),
        }
      );
    } catch (_) {}
  });

  bot.callbackQuery("admin:toggle_restriction", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const newStatus = toggleRestriction();
    await ctx.answerCallbackQuery({
      text: newStatus ? "🔒 Restriction ON: Whitelist only" : "🌐 Restriction OFF: Open to public",
    }).catch(() => {});
    const card = formatAdminPanelCard(ctx.from);
    try {
      await ctx.editMessageText(card, {
        parse_mode: "HTML",
        reply_markup: getAdminPanelKeyboard(ctx.from),
      });
    } catch (_) {
      await ctx.reply(card, {
        parse_mode: "HTML",
        reply_markup: getAdminPanelKeyboard(ctx.from),
      });
    }
  });

  bot.callbackQuery("admin:claim_ownership", async (ctx) => {
    if (hasAnyAdmin() && !isAdmin(ctx.from.id)) {
      return ctx.answerCallbackQuery({ text: "⛔ An administrator has already claimed this bot.", show_alert: true });
    }
    addAdmin(ctx.from.id, true);
    await ctx.answerCallbackQuery({ text: "👑 Congratulations! You are now the Bot Administrator." }).catch(() => {});
    userState.delete(ctx.chat.id);
    const card = formatAdminPanelCard(ctx.from);
    await ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: getAdminPanelKeyboard(ctx.from),
    });
  });

  bot.callbackQuery("admin:close", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    userState.delete(ctx.chat.id);
    await ctx.deleteMessage().catch(() => {});
  });

  bot.callbackQuery("admin:noop", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
  });

  bot.callbackQuery("user:request_access", async (ctx) => {
    const res = recordPendingRequest(ctx.from);
    if (res?.status === "already_allowed") {
      return ctx.answerCallbackQuery({ text: "You already have access to the bot!", show_alert: true });
    }

    await ctx.answerCallbackQuery({ text: "✅ Access request submitted to Admin!", show_alert: true }).catch(() => {});

    try {
      await ctx.editMessageText(
        [
          `⏳ <b>ACCESS REQUEST SUBMITTED!</b>`,
          `────────────────────────────────────`,
          `Hello <b>${ctx.from.first_name || "Friend"}</b>! 👋`,
          ``,
          `Your access request has been sent to the Administrator.`,
          `🆔 <b>Your Telegram ID:</b> <code>${ctx.from.id}</code>`,
          ``,
          `You will receive an automatic notification here the moment the Admin approves your request!`,
        ].join("\n"),
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text("🔄 Check My Status", "user:check_status"),
        }
      );
    } catch (_) {}

    // Alert all admins
    const admins = loadAccessState().admins;
    const reqUser = ctx.from;
    const reqNotification = [
      `🔔 <b>NEW ACCESS REQUEST:</b>`,
      `────────────────────────────────────`,
      `👤 <b>Name:</b> <b>${[reqUser.first_name, reqUser.last_name].filter(Boolean).join(" ") || "Friend"}</b>`,
      reqUser.username ? `🔖 <b>Username:</b> @${reqUser.username}` : `🔖 <b>Username:</b> (No username)`,
      `🆔 <b>Telegram User ID:</b> <code>${reqUser.id}</code>`,
      `⏰ <b>Requested:</b> <i>${new Date().toLocaleString("en-IN")}</i>`,
      ``,
      `<i>Tap below to grant access immediately:</i>`,
    ].join("\n");

    for (const aId of admins) {
      try {
        await ctx.api.sendMessage(aId, reqNotification, {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("✅ Approve & Add Friend", `admin:approve:${reqUser.id}`)
            .text("❌ Reject", `admin:reject:${reqUser.id}`),
        });
      } catch (err) {
        console.warn(`[Access Manager] Failed to notify admin ${aId}:`, err.message);
      }
    }
  });

  bot.callbackQuery("user:check_status", async (ctx) => {
    const info = getUserAccessInfo(ctx.from.id);
    if (info.isAllowed) {
      await ctx.answerCallbackQuery({ text: "🎉 Access Approved! Welcome!", show_alert: true }).catch(() => {});
      userState.delete(ctx.chat.id);
      return ctx.reply("🎉 <b>Access Approved!</b> Welcome to TNPSC Group-1 Mains Specialist Bot.\n\nTap /start to begin practice.", {
        parse_mode: "HTML",
        reply_markup: getPapersInlineKeyboard(),
      });
    } else {
      await ctx.answerCallbackQuery({ text: "⏳ Request is still awaiting Admin approval.", show_alert: true }).catch(() => {});
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 🌟 10 NEW SUPERIOR EXAM FEATURES
  // ─────────────────────────────────────────────────────────────

  // FEATURE 1: QCAB SPACE & MARGIN SCANNER
  bot.command(["scanmargin", "margin", "presentation"], async (ctx) => {
    userState.delete(ctx.chat.id);
    const replyMsg = ctx.message?.reply_to_message;
    const doc = replyMsg?.document;

    if (doc && (doc.mime_type === "application/pdf" || doc.file_name?.toLowerCase().endsWith(".pdf"))) {
      const anim = await createProgressAnimator(ctx, "QCAB SPACE & MARGIN SCANNER");
      try {
        await anim.step("📥 [1/2] Downloading replied PDF...", 35);
        const file = await ctx.api.getFile(doc.file_id);
        const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
        const tmpPath = path.join(__dirname, "data", "generated_pdfs", `SCAN_${Date.now()}.pdf`);
        fs.writeFileSync(tmpPath, buf);

        await anim.step("📐 [2/2] Scanning Margins & Space Allocation...", 80, "Auditing text borders and density...");
        const s = sessions.get(ctx.chat.id);
        const scan = await scanQCABPresentation(tmpPath, s?.marks || 15);
        await anim.delete();
        try { fs.unlinkSync(tmpPath); } catch (_) {}

        if (scan.total_presentation_score >= 8.5 && ctx.from?.id) {
          awardBadge(ctx.from.id, "QCAB_PRO");
        }

        const card = formatMarginScanCard(scan, s?.marks || 15);
        return ctx.reply(card, {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("📑 Blank QCAB PDF", "action:qcab_pdf")
            .text("📚 Main Menu", "action:pick_topic"),
        });
      } catch (err) {
        await anim.delete();
        return ctx.reply(`⚠️ Margin scan error: ${err.message}`);
      }
    }

    const s = sessions.get(ctx.chat.id);
    if (s && s.lastPdfPath && fs.existsSync(s.lastPdfPath)) {
      const anim = await createProgressAnimator(ctx, "QCAB SPACE & MARGIN SCANNER");
      try {
        await anim.step("📐 Auditing Presentation on Evaluated Sheet...", 60);
        const scan = await scanQCABPresentation(s.lastPdfPath, s.marks || 15);
        await anim.delete();
        if (scan.total_presentation_score >= 8.5 && ctx.from?.id) {
          awardBadge(ctx.from.id, "QCAB_PRO");
        }
        const card = formatMarginScanCard(scan, s.marks || 15);
        return ctx.reply(card, {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("📑 Blank QCAB PDF", "action:qcab_pdf")
            .text("📚 Main Menu", "action:pick_topic"),
        });
      } catch (err) {
        await anim.delete();
        return ctx.reply(`⚠️ Margin scan error: ${err.message}`);
      }
    }

    return handleMarginScanPrompt(ctx);
  });

  bot.callbackQuery("action:scanmargin_prompt", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    return handleMarginScanPrompt(ctx);
  });

  bot.callbackQuery("action:scanmargin_last", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const s = sessions.get(ctx.chat.id);
    if (s && s.lastPdfPath && fs.existsSync(s.lastPdfPath)) {
      const anim = await createProgressAnimator(ctx, "QCAB SPACE & MARGIN SCANNER");
      try {
        await anim.step("📐 Auditing Space & Margins...", 60);
        const scan = await scanQCABPresentation(s.lastPdfPath, s.marks || 15);
        await anim.delete();
        if (scan.total_presentation_score >= 8.5 && ctx.from?.id) {
          awardBadge(ctx.from.id, "QCAB_PRO");
        }
        const card = formatMarginScanCard(scan, s.marks || 15);
        return ctx.reply(card, {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("📑 Blank QCAB PDF", "action:qcab_pdf")
            .text("📚 Main Menu", "action:pick_topic"),
        });
      } catch (err) {
        await anim.delete();
        return ctx.reply(`⚠️ Margin scan error: ${err.message}`);
      }
    }
    return handleMarginScanPrompt(ctx);
  });

  // FEATURE 2: SUNDAY 3-HOUR FULL MOCK HALL
  bot.command(["mockhall", "sundaymock", "3hrmock"], async (ctx) => {
    userState.delete(ctx.chat.id);
    return handleMockHallMenu(ctx);
  });

  bot.command("mockstatus", async (ctx) => {
    const active = getActiveMockHallSession(ctx.from?.id);
    if (!active || active.status !== "IN_PROGRESS") {
      return ctx.reply("⚠️ No active 3-Hour Mock Hall session! Enter the hall via <b>/mockhall</b>.", {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("🏛️ Enter 3-Hour Mock Hall", "action:mock_hall_menu"),
      });
    }
    return ctx.reply(formatMockHallStatusCard(active), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🏁 Submit Mock Booklet", "mockhall:submit")
        .text("🔄 Refresh Status", "mockhall:status"),
    });
  });

  bot.command(["mocksubmit", "finishmock"], async (ctx) => {
    const finished = finishMockHallSession(ctx.from?.id);
    if (!finished) {
      return ctx.reply("⚠️ No active 3-Hour Mock session to submit! Start one with <b>/mockhall</b>.", {
        parse_mode: "HTML",
      });
    }

    if (ctx.from?.id) {
      awardBadge(ctx.from.id, "MARATHONER_3HR");
      recordSubmissionScore(ctx.from, { score: 200, marks: 250, isMock: true });
    }

    const card = formatMockHallCompletionCard(finished);
    return ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🏆 View Leaderboard", "action:leaderboard")
        .text("🎖️ View Badges", "action:view_badges")
        .row()
        .text("📚 Syllabus Menu", "action:pick_topic"),
    });
  });

  bot.callbackQuery("action:mock_hall_menu", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    return handleMockHallMenu(ctx);
  });

  bot.callbackQuery(/^mockhall:start:(GS[123])$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const paperKey = ctx.match[1];
    const session = startMockHallSession(ctx.from?.id, { paperKey });
    const entryCard = formatMockHallEntryCard(session);

    await ctx.reply(entryCard, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("⏱️ Check Proctor Status", "mockhall:status")
        .text("🏁 Submit Mock Early", "mockhall:submit")
        .row()
        .text("📑 Download Blank Master QCAB", "action:qcab_pdf"),
    });
  });

  bot.callbackQuery("mockhall:status", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const active = getActiveMockHallSession(ctx.from?.id);
    if (!active || active.status !== "IN_PROGRESS") {
      return ctx.reply("⚠️ No active 3-Hour Mock session! Tap below to start:", {
        reply_markup: new InlineKeyboard().text("🏛️ Enter 3-Hour Mock Hall", "action:mock_hall_menu"),
      });
    }
    return ctx.reply(formatMockHallStatusCard(active), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🏁 Submit Mock Booklet", "mockhall:submit")
        .text("🔄 Refresh Status", "mockhall:status"),
    });
  });

  bot.callbackQuery("mockhall:submit", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const finished = finishMockHallSession(ctx.from?.id);
    if (!finished) {
      return ctx.reply("⚠️ No active 3-Hour Mock session to submit!");
    }
    if (ctx.from?.id) {
      awardBadge(ctx.from.id, "MARATHONER_3HR");
      recordSubmissionScore(ctx.from, { score: 200, marks: 250, isMock: true });
    }
    const card = formatMockHallCompletionCard(finished);
    return ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🏆 View Leaderboard", "action:leaderboard")
        .text("🎖️ View Badges", "action:view_badges")
        .row()
        .text("📚 Syllabus Menu", "action:pick_topic"),
    });
  });

  // FEATURE 3: INSTANT NEWS-TO-MAINS QUESTION GENERATOR
  bot.command(["newstomains", "news2mains", "headline"], async (ctx) => {
    const raw = (ctx.match || "").trim();
    if (raw.length > 10) {
      const anim = await createProgressAnimator(ctx, "NEWS-TO-MAINS CONVERTER");
      try {
        await anim.step("🗞️ [1/2] Mapping News to TNPSC Syllabus...", 40);
        const data = await generateQuestionsFromNews(raw);
        await anim.step("✍️ [2/2] Framing 10M & 15M Directive Questions...", 85);
        await anim.delete();

        sessions.set(ctx.chat.id, {
          question: data.question_15m,
          question10: data.question_10m,
          marks: 15,
          words: 250,
          topic: `${data.paper_code} - ${data.unit_name}: ${data.directive_word}`,
          unitId: data.unit_id || null,
        });

        const card = formatNewsToMainsCard(data, raw);
        const kb = new InlineKeyboard()
          .text("✍️ Practice 15-Marker", "gen_topic:own:15")
          .text("✍️ Practice 10-Marker", "gen_topic:own:10")
          .row()
          .text("🎯 12-Rule Model Answer", "action:model")
          .text("📑 Blank QCAB PDF", "action:qcab_pdf")
          .row()
          .text("📚 Main Menu", "action:pick_topic");

        return ctx.reply(card, { parse_mode: "HTML", reply_markup: kb });
      } catch (err) {
        await anim.delete();
        return ctx.reply(`⚠️ News conversion error: ${err.message}`);
      }
    }
    return handleNewsToMainsPrompt(ctx);
  });

  bot.callbackQuery("action:news_to_mains", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    return handleNewsToMainsPrompt(ctx);
  });

  // FEATURE 4: AI ANSWER LEVEL-UP (7/15 ➔ 13/15)
  bot.command(["levelup", "level_up"], async (ctx) => {
    const raw = (ctx.match || "").trim();
    const s = sessions.get(ctx.chat.id);
    if (raw.length > 30) {
      const q = s?.question || "Evaluate the role of social welfare policies in Tamil Nadu with emphasis on inclusive growth.";
      return runAnswerLevelUp(ctx, q, raw, s?.marks || 15);
    }
    if (s && s.answer && s.answer.length > 30) {
      return runAnswerLevelUp(ctx, s.question, s.answer, s.marks || 15);
    }
    return handleLevelUpPrompt(ctx);
  });

  bot.callbackQuery("action:level_up_prompt", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    return handleLevelUpPrompt(ctx);
  });

  bot.callbackQuery("action:levelup_active", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const s = sessions.get(ctx.chat.id);
    if (s && s.answer && s.answer.length > 20) {
      return runAnswerLevelUp(ctx, s.question, s.answer, s.marks || 15);
    }
    return handleLevelUpPrompt(ctx);
  });

  // FEATURE 5: LIVE STUDY GROUP LEADERBOARD
  bot.command(["leaderboard", "top", "rankings"], async (ctx) => {
    const card = formatLeaderboardCard(10, ctx.from?.id);
    return ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("👤 My Scorecard", "action:myrank")
        .text("📚 Syllabus Menu", "action:pick_topic"),
    });
  });

  bot.command(["myrank", "profile", "scorecard"], async (ctx) => {
    const card = formatUserProfileCard(ctx.from?.id);
    return ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🏆 Global Leaderboard", "action:leaderboard")
        .text("📚 Syllabus Menu", "action:pick_topic"),
    });
  });

  bot.callbackQuery("action:leaderboard", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const card = formatLeaderboardCard(10, ctx.from?.id);
    return ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("👤 My Scorecard", "action:myrank")
        .text("📚 Syllabus Menu", "action:pick_topic"),
    });
  });

  bot.callbackQuery("action:myrank", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const card = formatUserProfileCard(ctx.from?.id);
    return ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🏆 Global Leaderboard", "action:leaderboard")
        .text("📚 Syllabus Menu", "action:pick_topic"),
    });
  });

  // FEATURE 6: DIRECT-TO-PRINTER WI-FI AUTO-DISPATCH (IPP)
  bot.command(["print", "dispatchprint"], async (ctx) => {
    const s = sessions.get(ctx.chat.id);
    let targetPdf = s?.lastPdfPath;

    if (!targetPdf || !fs.existsSync(targetPdf)) {
      const anim = await createProgressAnimator(ctx, "PRINTER DISPATCH ENGINE");
      try {
        await anim.step("📑 Generating printable QCAB Booklet...", 50);
        targetPdf = await generateQCABPdf({
          question: s?.question || "Examine the salient features of Tamil Nadu's industrial and economic policies.",
          marks: s?.marks || 15,
          topic: s?.topic || "General Studies",
          paperCode: s?.unitId ? getPaperCodeForUnit(s.unitId) : "Paper II",
        });
        await anim.delete();
      } catch (err) {
        await anim.delete();
        return ctx.reply(`⚠️ PDF generation error: ${err.message}`);
      }
    }

    const res = await printQCABBooklet(ctx.from?.id, targetPdf, "TNPSC_QCAB_Booklet");
    const card = formatPrinterDispatchCard(res, "TNPSC QCAB Booklet");
    return ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("⚙️ Configure Printer IP", "action:printer_settings")
        .text("📚 Main Menu", "action:pick_topic"),
    });
  });

  bot.command("setprinter", async (ctx) => {
    const raw = (ctx.match || "").trim();
    if (raw.length > 5) {
      const cleanUrl = setPrinterEndpoint(ctx.from?.id, raw);
      return ctx.reply(
        `✅ <b>Wi-Fi Printer Linked!</b>\n\n🌐 <b>Endpoint:</b> <code>${cleanUrl}</code>\n⚡ <b>Protocol:</b> IPP (RFC 8011)\n\nDispatch booklets directly using <b>/print</b>!`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("🖨️ Test Print Current QCAB", "action:print_active_qcab")
            .text("📚 Main Menu", "action:pick_topic"),
        }
      );
    }
    userState.set(ctx.chat.id, { state: "WAITING_FOR_PRINTER_IP" });
    return ctx.reply(
      "🖨️ <b>Configure Wi-Fi Printer IP:</b>\n\nPlease enter your network printer's IP address (e.g. <code>192.168.1.50</code>):",
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("❌ Cancel", "action:pick_topic") }
    );
  });

  bot.callbackQuery("action:print_active_qcab", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const s = sessions.get(ctx.chat.id);
    let targetPdf = s?.lastPdfPath;
    if (!targetPdf || !fs.existsSync(targetPdf)) {
      targetPdf = await generateQCABPdf({
        question: s?.question || "Explain the socio-economic welfare schemes of Tamil Nadu.",
        marks: s?.marks || 15,
        topic: s?.topic || "General Studies",
        paperCode: "Paper II",
      });
    }
    const res = await printQCABBooklet(ctx.from?.id, targetPdf, "TNPSC_QCAB_Booklet");
    const card = formatPrinterDispatchCard(res, "TNPSC QCAB Booklet");
    return ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("⚙️ Configure Printer IP", "action:printer_settings")
        .text("📚 Main Menu", "action:pick_topic"),
    });
  });

  bot.callbackQuery("action:printer_settings", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    userState.set(ctx.chat.id, { state: "WAITING_FOR_PRINTER_IP" });
    const current = getPrinterEndpoint(ctx.from?.id) || "None configured";
    return ctx.reply(
      `🖨️ <b>WI-FI PRINTER SETTINGS</b>\n────────────────────────────────────\n🌐 <b>Current IPP Target:</b> <code>${current}</code>\n\nSend your printer's IP address (e.g. <code>192.168.1.50</code>) to link it:`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("❌ Cancel", "action:pick_topic") }
    );
  });

  // FEATURE 7: BOT EMOJI REACTIONS & FEEDBACK BADGES
  bot.command(["badges", "trophies", "achievements"], async (ctx) => {
    const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "Aspirant";
    const card = formatBadgesShowcaseCard(ctx.from?.id, fullName);
    return ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🏆 View Leaderboard", "action:leaderboard")
        .text("📚 Main Menu", "action:pick_topic"),
    });
  });

  bot.callbackQuery("action:view_badges", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "Aspirant";
    const card = formatBadgesShowcaseCard(ctx.from?.id, fullName);
    return ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🏆 View Leaderboard", "action:leaderboard")
        .text("📚 Main Menu", "action:pick_topic"),
    });
  });

  // FEATURE 8: GROUP ANTI-SPAM & STUDY POLICE
  bot.command(["studypolice", "police", "focusmode"], async (ctx) => {
    const raw = (ctx.match || "").trim().toLowerCase();
    if (raw === "on" || raw === "enable") {
      toggleStudyPolice(ctx.chat.id, true);
    } else if (raw === "off" || raw === "disable") {
      toggleStudyPolice(ctx.chat.id, false);
    }
    const card = formatPoliceStatusCard(ctx.chat.id);
    return ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🔄 Toggle Police On/Off", "action:toggle_police")
        .text("📚 Main Menu", "action:pick_topic"),
    });
  });

  bot.callbackQuery("action:police_status", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const card = formatPoliceStatusCard(ctx.chat.id);
    return ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🔄 Toggle Police On/Off", "action:toggle_police")
        .text("📚 Main Menu", "action:pick_topic"),
    });
  });

  bot.callbackQuery("action:toggle_police", async (ctx) => {
    const active = toggleStudyPolice(ctx.chat.id);
    await ctx.answerCallbackQuery({
      text: active ? "👮 Study Police ACTIVE! Hall protected." : "⚪ Study Police STANDBY.",
      show_alert: true,
    }).catch(() => {});
    const card = formatPoliceStatusCard(ctx.chat.id);
    return ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🔄 Toggle Police On/Off", "action:toggle_police")
        .text("📚 Main Menu", "action:pick_topic"),
    });
  });

  // FEATURE 9: THE GAMIFIED ANIMATED DICE/DART TOPIC PICKER
  bot.command(["dart", "dice", "spin"], async (ctx) => {
    userState.delete(ctx.chat.id);
    return handleGamifiedDartPicker(ctx);
  });

  bot.callbackQuery("action:dart_picker", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    return handleGamifiedDartPicker(ctx);
  });

  // FEATURE 10: TELEGRAM HASHTAG AUTO-CATEGORIZER
  bot.command(["tags", "hashtags"], async (ctx) => {
    const card = formatTagsListCard();
    return ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🏷️ View #Polity", "tag:polity")
        .text("🏷️ View #Economy", "tag:economy")
        .row()
        .text("📚 Main Menu", "action:pick_topic"),
    });
  });

  bot.command("tag", async (ctx) => {
    const tagArg = (ctx.match || "").trim();
    if (!tagArg) {
      return ctx.reply(formatTagsListCard(), { parse_mode: "HTML" });
    }
    const card = formatTagResultsCard(tagArg);
    return ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🏷️ View All Tags", "action:hashtag_archive")
        .text("📚 Main Menu", "action:pick_topic"),
    });
  });

  bot.callbackQuery("action:hashtag_archive", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const card = formatTagsListCard();
    return ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🏷️ View #Polity", "tag:polity")
        .text("🏷️ View #Economy", "tag:economy")
        .row()
        .text("📚 Main Menu", "action:pick_topic"),
    });
  });

  bot.callbackQuery(/^tag:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const tagName = ctx.match[1];
    const card = formatTagResultsCard(tagName);
    return ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🏷️ View All Tags", "action:hashtag_archive")
        .text("📚 Main Menu", "action:pick_topic"),
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
    { command: "start", description: "🎯 Start practice & view Health Meter" },
    { command: "menu", description: "📚 Open syllabus navigation & papers" },
    { command: "dart", description: "🎯 Gamified Animated Dart Topic Picker" },
    { command: "mockhall", description: "🏛️ Sunday 3-Hour Full Mock Hall (250M)" },
    { command: "mockstatus", description: "⏱️ Check 3-Hour Mock Hall Proctor Status" },
    { command: "mocksubmit", description: "🏁 Submit 3-Hour Full Mock Answer Booklet" },
    { command: "scanmargin", description: "📐 QCAB Space & Margin Presentation Scanner" },
    { command: "levelup", description: "🚀 AI Answer Level-Up (Transform 7/15 ➔ 13/15)" },
    { command: "newstomains", description: "📰 Instant News-to-Mains Question Generator" },
    { command: "leaderboard", description: "🏆 Live Study Group Leaderboard" },
    { command: "myrank", description: "👤 Aspirant Scorecard, Tier & Rank" },
    { command: "badges", description: "🎖️ Aspirant Achievement Badges & Honors" },
    { command: "print", description: "🖨️ Direct-to-Printer Wi-Fi Auto-Dispatch (IPP)" },
    { command: "setprinter", description: "⚙️ Configure Home Wi-Fi Printer IP" },
    { command: "studypolice", description: "👮 Group Anti-Spam & Study Police" },
    { command: "tags", description: "🏷️ Telegram Syllabus Hashtag Archive" },
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
    { command: "admin", description: "🛡️ Admin Panel (Manage Friends & Access)" },
    { command: "myid", description: "🆔 Check My Telegram ID & Access Status" },
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

  const accessState = loadAccessState();
  const envRows = [
    { name: "TELEGRAM_BOT_TOKEN", set: Boolean(process.env.TELEGRAM_BOT_TOKEN) },
    { name: "GEMINI_API_KEY", set: Boolean(process.env.GEMINI_API_KEY) },
    { name: "NOTION_TOKEN", set: Boolean(process.env.NOTION_TOKEN) },
    { name: "NOTION_DATABASE_ID", set: Boolean(process.env.NOTION_DATABASE_ID) },
    { name: "ADMIN_ID", set: Boolean(process.env.ADMIN_ID || accessState.admins.length > 0), value: accessState.admins.join(", ") || "Configured via Admin Panel" },
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
      <div class="card">
        <div class="card-title">👥 Friend Access Control</div>
        <div class="card-val" style="color: ${accessState.restrictionEnabled ? '#34d399' : '#60a5fa'};">${accessState.restrictionEnabled ? "Restricted (Whitelist)" : "Public Open"}</div>
        <div class="card-desc">${Object.keys(accessState.allowedFriends || {}).length} Friend(s) Whitelisted • ${accessState.admins.length} Admin(s)</div>
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
