/**
 * Group Anti-Spam & Study Police Engine
 * ─────────────────────────────────────────────────────────────────
 * Monitors Telegram study groups and supergroups, deletes unauthorized
 * promotion/spam links, enforces "Study Focus Hours", and issues
 * humorous yet firm civil-service discipline citations to keep the
 * study hall distraction-free.
 * Persists to data/study_police_records.json.
 * ─────────────────────────────────────────────────────────────────
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data", "study_police_records.json");

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (err) {
    console.error("[Study Police] Error reading records:", err.message);
  }
  return { groups: {}, warnings: {} };
}

function saveData(data) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("[Study Police] Error saving records:", err.message);
  }
}

/**
 * Check if Study Police is enabled for a group.
 */
function isStudyPoliceActive(chatId) {
  const store = loadData();
  // By default active in groups if set, or can be toggled
  return store.groups[String(chatId)]?.enabled ?? false;
}

function toggleStudyPolice(chatId, enable = null) {
  const store = loadData();
  const id = String(chatId);
  if (!store.groups[id]) store.groups[id] = { enabled: false, strictHours: true };

  if (enable !== null) {
    store.groups[id].enabled = Boolean(enable);
  } else {
    store.groups[id].enabled = !store.groups[id].enabled;
  }

  saveData(store);
  return store.groups[id].enabled;
}

/**
 * Detects spam links, telegram invite links, or promo keywords.
 */
function detectSpam(text) {
  if (!text) return null;
  const str = String(text).toLowerCase();

  // Telegram invite link patterns
  const telegramInvitePattern = /t\.me\/(joinchat|\+[a-zA-Z0-9_-]+|[a-zA-Z0-9_]{5,}\b)/i;
  // External spam keywords
  const spamKeywords = [
    "crypto", "binance", "invest", "forex", "free money", "earn ₹", "earn $",
    "subscribe to my channel", "paid promo", "adult", "casino", "betting",
  ];

  if (telegramInvitePattern.test(str)) {
    // Allow if it's official TNPSC bot or career services, else flag
    if (!str.includes("t.me/tnpsc") && !str.includes("bot")) {
      return { type: "INVITE_LINK", reason: "Unauthorized Telegram Group/Channel Invite Link" };
    }
  }

  for (const kw of spamKeywords) {
    if (str.includes(kw)) {
      return { type: "PROMO_KEYWORD", reason: `Commercial/Spam keyword detected: '${kw}'` };
    }
  }

  return null;
}

/**
 * Issues strike warning to user in group.
 */
function recordWarning(chatId, user) {
  const store = loadData();
  const key = `${chatId}_${user.id}`;
  if (!store.warnings[key]) {
    store.warnings[key] = {
      userId: user.id,
      name: user.first_name || "Aspirant",
      strikes: 0,
      lastWarning: null,
    };
  }

  store.warnings[key].strikes += 1;
  store.warnings[key].lastWarning = new Date().toISOString();
  saveData(store);
  return store.warnings[key].strikes;
}

/**
 * Handles incoming group messages for spam / study police violations.
 */
async function auditGroupMessage(ctx) {
  const chatType = ctx.chat?.type;
  if (chatType !== "group" && chatType !== "supergroup") {
    return false; // private chat, no action
  }

  if (!isStudyPoliceActive(ctx.chat.id)) {
    return false;
  }

  const text = ctx.message?.text || ctx.message?.caption || "";
  const spam = detectSpam(text);

  if (spam) {
    // Try to delete spam message
    try {
      await ctx.deleteMessage();
    } catch (_) {}

    const strikes = recordWarning(ctx.chat.id, ctx.from);
    const userName = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "Aspirant");

    const citationCard = [
      `🚨 <b>CIVIL SERVICE STUDY POLICE CITATION</b> 🚨`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👮 <b>Officer on Duty:</b> TNPSC Study Police`,
      `👤 <b>Cited Candidate:</b> ${userName}`,
      `⚠️ <b>Violation:</b> <i>${spam.reason}</i>`,
      `🚨 <b>Discipline Strike:</b> <code>${strikes} / 3 Strikes</code>`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📌 <b>HALL RULE:</b> Only syllabus questions, model answers, and doubts are permitted in this Study Hall!`,
      `<i>Clean desks, focused minds. Let's get to Fort St. George!</i>`,
    ].join("\n");

    try {
      await ctx.reply(citationCard, { parse_mode: "HTML" });
    } catch (_) {}

    return true; // violation handled
  }

  return false;
}

/**
 * Formats Study Police Status Card.
 */
function formatPoliceStatusCard(chatId) {
  const active = isStudyPoliceActive(chatId);
  return [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  👮 <b>GROUP ANTI-SPAM & STUDY POLICE</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `🛡️ <b>Police Status:</b> <b>${active ? "🟢 ACTIVE & ON PATROL" : "⚪ STANDBY (OFF)"}</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📋 <b>Study Hall Protections:</b>`,
    `• Auto-deletes telegram promo & invite links`,
    `• Filters commercial spam & betting scams`,
    `• 3-Strike civil service citation warnings`,
    `• Preserves focus during Mains practice sessions`,
    ``,
    `⚙️ <b>Toggle Command:</b> <code>/studypolice on</code> or <code>/studypolice off</code>`,
  ].join("\n");
}

module.exports = {
  isStudyPoliceActive,
  toggleStudyPolice,
  detectSpam,
  recordWarning,
  auditGroupMessage,
  formatPoliceStatusCard,
};
