const path = require("path");
const cron = require("node-cron");
const llm = require("./llm");
const { saveSession, UNIT_METADATA } = require("./notion");
const { SYLLABUS_TOPICS } = require("./syllabus");
const { autoHealRetry, repairStateFile, saveStateFile } = require("./auto_healer");

const STATE_FILE = path.join(__dirname, "data", "scheduler_state.json");

const DEFAULT_STATE = {
  currentTopicIndex: 2, // Topic 0 (Advent) and Topic 1 (Colonialism) already covered; Topic 2 next!
  lastRunDate: null,
  lastRunTime: null,
  lastRunStatus: null,
  lastRunTopic: null,
  lastRunQuestion: null,
  lastRunNotionUrl: null,
  subscribedChats: [],
  unsubscribedChats: [],
  totalRuns: 0,
  history: [],
};

// Maps a topic object from syllabus.js to its exact Notion Unit ID
function resolveUnitId(topicObj) {
  const p = (topicObj.paper || "").toLowerCase();
  const u = (topicObj.unit || "").toLowerCase();

  if (p.includes("general studies i") || p.includes("gs1") || p.includes("paper ii")) {
    if (u.includes("history") || u.includes("culture")) return "GS1_U1";
    if (u.includes("social")) return "GS1_U2";
    if (u.includes("ethics")) return "GS1_U3";
    return "GS1_U1";
  }
  if (p.includes("general studies ii") || p.includes("gs2") || p.includes("paper iii")) {
    if (u.includes("polity")) return "GS2_U1";
    if (u.includes("science") || u.includes("technology")) return "GS2_U2";
    if (u.includes("tamil")) return "GS2_U3";
    return "GS2_U1";
  }
  if (p.includes("general studies iii") || p.includes("gs3") || p.includes("paper iv")) {
    if (u.includes("geography")) return "GS3_U1";
    if (u.includes("environment") || u.includes("biodiversity") || u.includes("disaster")) return "GS3_U2";
    if (u.includes("economy")) return "GS3_U3";
    return "GS3_U1";
  }
  return "GS1_U1";
}

// Get current date string in IST (Asia/Kolkata)
function getTodayIST() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Get current hour in IST
function getHourIST() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hourPart = parts.find((p) => p.type === "hour");
  return hourPart ? parseInt(hourPart.value, 10) : new Date().getHours();
}

let activeBotInstance = null;

/**
 * Executes one daily PYQ generation & Notion save with auto-healing:
 * 1. Pulls the TNPSC Mains PYQ for the current syllabus topic
 * 2. Generates the 12-rule model answer (Current Affairs box, yellow bullets, unique key boxes)
 * 3. Saves into Notion topic page under its Unit hierarchy (with continuity: 📌 Question - N)
 * 4. Advances sequential topic pointer to jump to the next topic tomorrow
 * 5. Broadcasts to subscribed Telegram chats
 */
async function runDailyPYQJob({ force = false, bot = null, onProgress = null } = {}) {
  const state = repairStateFile(STATE_FILE, DEFAULT_STATE);
  const todayStr = getTodayIST();

  if (!force && state.lastRunDate === todayStr && state.lastRunStatus === "success") {
    console.log(`[Daily Scheduler] Today's job (${todayStr}) has already completed successfully. Skipping.`);
    return { skipped: true, topic: state.lastRunTopic, notionUrl: state.lastRunNotionUrl };
  }

  const topicIndex = (state.currentTopicIndex || 0) % SYLLABUS_TOPICS.length;
  const currentTopic = SYLLABUS_TOPICS[topicIndex];
  const unitId = resolveUnitId(currentTopic);
  const unitMeta = UNIT_METADATA[unitId] || { paper: currentTopic.paper, unit: currentTopic.unit };

  console.log(`\n======================================================`);
  console.log(`🚀 [Daily Scheduler] Running Daily TNPSC Mains PYQ Job`);
  console.log(`📅 Date: ${todayStr} | Topic Index: ${topicIndex + 1}/${SYLLABUS_TOPICS.length}`);
  console.log(`📚 Paper: ${unitMeta.paper}`);
  console.log(`🏛️ Unit: ${unitMeta.unit}`);
  console.log(`🎯 Topic: ${currentTopic.topic}`);
  console.log(`======================================================\n`);

  const fullTopicContext = `${unitMeta.paper} - ${unitMeta.unit}: ${currentTopic.topic}`;

  // ══════════════════════════════════════════════════════════
  // PYQ 1: Pull First Authentic Question & Generate Model Answer
  // ══════════════════════════════════════════════════════════
  if (onProgress) {
    await onProgress({
      step: 1,
      text: "🔍 [1/4] Pulling Authentic TNPSC Mains PYQ #1...",
      pct: 25,
      detail: `Topic: ${currentTopic.topic}`,
    }).catch(() => {});
  }
  console.log(`[Daily Scheduler] [1/2] Pulling TNPSC Mains PYQ #1 for '${currentTopic.topic}'...`);
  const pyq1 = await autoHealRetry(
    async () => {
      return await llm.generatePYQ(fullTopicContext, 15);
    },
    { maxRetries: 3, operationName: "Pull TNPSC Mains PYQ #1" }
  );
  console.log(`📌 Pulled PYQ #1:\n${pyq1}\n`);

  if (onProgress) {
    await onProgress({
      step: 2,
      text: "✍️ [2/4] Architecting 12-Rule Answer for PYQ #1...",
      pct: 50,
      detail: "Structuring Current Affairs callout & unique key boxes...",
    }).catch(() => {});
  }
  console.log(`[Daily Scheduler] [1/2] Generating 12-rule Model Answer for PYQ #1...`);
  const ans1 = await autoHealRetry(
    async () => {
      return await llm.modelAnswer(pyq1, 15, 250);
    },
    { maxRetries: 3, operationName: "Generate Model Answer #1" }
  );

  console.log(`[Daily Scheduler] [1/2] Saving PYQ #1 to Notion Topic Page '${currentTopic.topic}'...`);
  const res1 = await autoHealRetry(
    async () => {
      return await saveSession({
        question: pyq1,
        marks: 15,
        words: 250,
        modelAnswer: ans1,
        topic: currentTopic.topic,
        unitId,
      });
    },
    { maxRetries: 3, operationName: "Save PYQ #1 to Notion" }
  );
  console.log(`✅ Saved PYQ #1 to Notion (Question - ${res1.questionNumber})! URL: ${res1.url}`);

  // ══════════════════════════════════════════════════════════
  // PYQ 2: Pull Second Distinct Question & Generate Model Answer
  // ══════════════════════════════════════════════════════════
  if (onProgress) {
    await onProgress({
      step: 3,
      text: "🔍 [3/4] Pulling Distinct PYQ #2 & Model Answer...",
      pct: 75,
      detail: "Generating complementary syllabus sub-theme...",
    }).catch(() => {});
  }
  console.log(`[Daily Scheduler] [2/2] Pulling Distinct TNPSC Mains PYQ #2 for '${currentTopic.topic}'...`);
  const pyq2 = await autoHealRetry(
    async () => {
      return await llm.generatePYQ(fullTopicContext, 15, pyq1);
    },
    { maxRetries: 3, operationName: "Pull TNPSC Mains PYQ #2" }
  );
  console.log(`📌 Pulled PYQ #2:\n${pyq2}\n`);

  console.log(`[Daily Scheduler] [2/2] Generating 12-rule Model Answer for PYQ #2...`);
  const ans2 = await autoHealRetry(
    async () => {
      return await llm.modelAnswer(pyq2, 15, 250);
    },
    { maxRetries: 3, operationName: "Generate Model Answer #2" }
  );

  if (onProgress) {
    await onProgress({
      step: 4,
      text: "📓 [4/4] Saving Questions & Model Answers to Notion...",
      pct: 95,
      detail: `Topic Page: "${currentTopic.topic}"`,
    }).catch(() => {});
  }
  console.log(`[Daily Scheduler] [2/2] Saving PYQ #2 to Notion Topic Page '${currentTopic.topic}'...`);
  const res2 = await autoHealRetry(
    async () => {
      return await saveSession({
        question: pyq2,
        marks: 15,
        words: 250,
        modelAnswer: ans2,
        topic: currentTopic.topic,
        unitId,
      });
    },
    { maxRetries: 3, operationName: "Save PYQ #2 to Notion" }
  );
  console.log(`✅ Saved PYQ #2 to Notion (Question - ${res2.questionNumber})! URL: ${res2.url}`);

  // Step 4: Advance Topic Pointer (Jump to next topic for tomorrow)
  const nextIndex = (topicIndex + 1) % SYLLABUS_TOPICS.length;
  const nextTopic = SYLLABUS_TOPICS[nextIndex];

  state.currentTopicIndex = nextIndex;
  state.lastRunDate = todayStr;
  state.lastRunTime = new Date().toISOString();
  state.lastRunStatus = "success";
  state.lastRunTopic = currentTopic.topic;
  state.lastRunQuestions = [pyq1, pyq2];
  state.lastRunQuestion = pyq1;
  state.lastRunNotionUrl = res1.url;
  state.totalRuns = (state.totalRuns || 0) + 1;

  state.history.unshift({
    date: todayStr,
    timestamp: state.lastRunTime,
    topic: currentTopic.topic,
    unitId,
    paper: unitMeta.paper,
    unit: unitMeta.unit,
    questions: [
      { number: res1.questionNumber, text: pyq1 },
      { number: res2.questionNumber, text: pyq2 },
    ],
    notionUrl: res1.url,
  });
  if (state.history.length > 30) state.history = state.history.slice(0, 30);

  saveStateFile(STATE_FILE, state);
  console.log(`👉 Topic advanced for tomorrow: '${nextTopic.topic}' (${unitMeta.paper} - ${nextTopic.unit})`);

  // Step 5: Telegram Broadcast to Subscribed Chats
  const targetBot = bot || activeBotInstance;
  if (targetBot && state.subscribedChats && state.subscribedChats.length > 0) {
    const broadcastMsg =
      `⏰ <b>TNPSC Mains Daily 9:00 AM PYQ Practice (2 Questions)</b>\n\n` +
      `📚 <b>${unitMeta.paper}</b>\n` +
      `🏛️ <b>${unitMeta.unit}</b>\n` +
      `🎯 <b>Syllabus Topic:</b> ${currentTopic.topic}\n\n` +
      `📌 <b>Question 1 (PYQ):</b>\n<i>${pyq1}</i>\n\n` +
      `📌 <b>Question 2 (PYQ):</b>\n<i>${pyq2}</i>\n\n` +
      `✅ <b>Both 12-Rule Model Answers saved to Notion!</b>\n` +
      `🔗 <a href="${res1.url}">Open in Notion Topic Page</a>\n\n` +
      `➡️ <i>Tomorrow's 9:00 AM Topic: <b>${nextTopic.topic}</b></i>`;

    for (const chatId of state.subscribedChats) {
      try {
        await targetBot.api.sendMessage(chatId, broadcastMsg, {
          parse_mode: "HTML",
          disable_web_page_preview: false,
        });
        console.log(`[Daily Scheduler] Broadcast sent to chat: ${chatId}`);
      } catch (err) {
        console.warn(`[Daily Scheduler] Could not send to chat ${chatId}:`, err.message);
      }
    }
  }

  return {
    success: true,
    topic: currentTopic.topic,
    nextTopic: nextTopic.topic,
    questions: [pyq1, pyq2],
    question1: pyq1,
    question2: pyq2,
    notionUrl: res1.url,
    questionNumber1: res1.questionNumber,
    questionNumber2: res2.questionNumber,
  };
}

/**
 * Initializes the 9:00 AM Cron Schedule and runs Auto-Healing check
 */
function startDailyScheduler(botInstance) {
  activeBotInstance = botInstance;

  // 1. Cron Job: Runs at 09:00 AM every day in Indian Standard Time (Asia/Kolkata)
  cron.schedule(
    "0 9 * * *",
    async () => {
      console.log("\n⏰ [Daily Scheduler] 9:00 AM Cron triggered! Starting automated PYQ session...");
      try {
        await runDailyPYQJob({ bot: activeBotInstance });
      } catch (err) {
        console.error("[Daily Scheduler] Error during 9:00 AM job:", err);
      }
    },
    {
      timezone: "Asia/Kolkata",
    }
  );

  console.log("⏰ [Daily Scheduler] Scheduled to run every day at 09:00 AM (Asia/Kolkata timezone).");

  // 2. Auto-Healing: Missed-Run Recovery
  // If the server/bot starts up after 9:00 AM and today's run has not occurred yet, run catch-up immediately!
  setTimeout(async () => {
    try {
      const state = repairStateFile(STATE_FILE, DEFAULT_STATE);
      const todayStr = getTodayIST();
      const currentHour = getHourIST();

      if (currentHour >= 9 && state.lastRunDate !== todayStr) {
        console.log(`[Auto-Healer] ⚠️ Detected missed 9:00 AM run for today (${todayStr})! Triggering automatic catch-up now...`);
        await runDailyPYQJob({ bot: activeBotInstance });
      } else {
        const nextTopic = SYLLABUS_TOPICS[state.currentTopicIndex || 0];
        console.log(`[Daily Scheduler] State healthy. Today's run status: ${state.lastRunDate === todayStr ? 'COMPLETED' : 'PENDING (Will trigger at 9:00 AM)'}. Next topic: '${nextTopic?.topic}'`);
      }
    } catch (err) {
      console.error("[Auto-Healer] Error during startup recovery check:", err);
    }
  }, 3000);
}

// Subscription management for Telegram chats
function subscribeChat(chatId, { force = false } = {}) {
  const state = repairStateFile(STATE_FILE, DEFAULT_STATE);
  state.unsubscribedChats = state.unsubscribedChats || [];
  state.subscribedChats = state.subscribedChats || [];

  // If not forced and user explicitly opted out earlier, do not auto-subscribe
  if (!force && state.unsubscribedChats.includes(chatId)) {
    return false;
  }

  // If forced (e.g. /subscribe or /start), remove from unsubscribed list
  if (force) {
    const unIdx = state.unsubscribedChats.indexOf(chatId);
    if (unIdx !== -1) state.unsubscribedChats.splice(unIdx, 1);
  }

  if (!state.subscribedChats.includes(chatId)) {
    state.subscribedChats.push(chatId);
    saveStateFile(STATE_FILE, state);
    return true;
  }
  return false;
}

function unsubscribeChat(chatId) {
  const state = repairStateFile(STATE_FILE, DEFAULT_STATE);
  state.unsubscribedChats = state.unsubscribedChats || [];
  state.subscribedChats = state.subscribedChats || [];

  if (!state.unsubscribedChats.includes(chatId)) {
    state.unsubscribedChats.push(chatId);
  }

  const idx = state.subscribedChats.indexOf(chatId);
  if (idx !== -1) {
    state.subscribedChats.splice(idx, 1);
  }

  saveStateFile(STATE_FILE, state);
  return true;
}

function getTopicPipeline() {
  const state = repairStateFile(STATE_FILE, DEFAULT_STATE);
  const todayStr = getTodayIST();
  const alreadyRanToday = state.lastRunDate === todayStr && state.lastRunStatus === "success";

  let todayTopic = null;
  let tomorrowTopic = null;
  const upcomingTopics = [];

  if (alreadyRanToday) {
    todayTopic = {
      topic: state.lastRunTopic,
      status: "COMPLETED",
      questions: state.lastRunQuestions || (state.lastRunQuestion ? [state.lastRunQuestion] : []),
      notionUrl: state.lastRunNotionUrl,
      timestamp: state.lastRunTime,
    };
    const tomorrowIdx = (state.currentTopicIndex || 0) % SYLLABUS_TOPICS.length;
    tomorrowTopic = {
      ...SYLLABUS_TOPICS[tomorrowIdx],
      index: tomorrowIdx,
      status: "SCHEDULED_9AM_TOMORROW",
    };
    for (let i = 1; i <= 3; i++) {
      const idx = (tomorrowIdx + i) % SYLLABUS_TOPICS.length;
      upcomingTopics.push({ ...SYLLABUS_TOPICS[idx], dayOffset: i + 1 });
    }
  } else {
    const todayIdx = (state.currentTopicIndex || 0) % SYLLABUS_TOPICS.length;
    todayTopic = {
      ...SYLLABUS_TOPICS[todayIdx],
      index: todayIdx,
      status: "PENDING_9AM_TODAY",
      questions: [],
      notionUrl: null,
    };
    const tomorrowIdx = (todayIdx + 1) % SYLLABUS_TOPICS.length;
    tomorrowTopic = {
      ...SYLLABUS_TOPICS[tomorrowIdx],
      index: tomorrowIdx,
      status: "SCHEDULED_9AM_TOMORROW",
    };
    for (let i = 1; i <= 3; i++) {
      const idx = (tomorrowIdx + i) % SYLLABUS_TOPICS.length;
      upcomingTopics.push({ ...SYLLABUS_TOPICS[idx], dayOffset: i + 1 });
    }
  }

  return {
    alreadyRanToday,
    todayStr,
    todayTopic,
    tomorrowTopic,
    upcomingTopics,
    currentTopicIndex: state.currentTopicIndex,
    totalTopics: SYLLABUS_TOPICS.length,
    subscribedCount: (state.subscribedChats || []).length,
  };
}

function getSchedulerStatus() {
  const pipeline = getTopicPipeline();
  const state = repairStateFile(STATE_FILE, DEFAULT_STATE);

  return {
    ...state,
    pipeline,
    currentTopicName: pipeline.todayTopic.topic,
    currentTopicPaper: pipeline.todayTopic.paper || "General Studies I",
    currentTopicUnit: pipeline.todayTopic.unit || "Modern History of India and Indian Culture",
    nextTopicName: pipeline.tomorrowTopic.topic,
    nextTopicPaper: pipeline.tomorrowTopic.paper,
    nextTopicUnit: pipeline.tomorrowTopic.unit,
    totalTopics: SYLLABUS_TOPICS.length,
    todayIST: pipeline.todayStr,
    alreadyRanToday: pipeline.alreadyRanToday,
  };
}

module.exports = {
  startDailyScheduler,
  runDailyPYQJob,
  subscribeChat,
  unsubscribeChat,
  getSchedulerStatus,
  getTopicPipeline,
  resolveUnitId,
};

