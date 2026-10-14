const fs = require("fs");
const path = require("path");
const { subscribeChat } = require("./daily_scheduler");

const USERS_FILE = path.join(__dirname, "data", "registered_users.json");

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, "utf8").trim();
      if (raw) return JSON.parse(raw);
    }
  } catch (err) {
    console.error("[User Manager] Error reading users file:", err.message);
  }
  return {};
}

function saveUsers(users) {
  try {
    const dir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const tmp = `${USERS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(users, null, 2), "utf8");
    fs.renameSync(tmp, USERS_FILE);
  } catch (err) {
    console.error("[User Manager] Error saving users file:", err.message);
  }
}

/**
 * Saves or updates a Telegram user, recording their identity, active status,
 * and any IAS URLs they submit for content ingestion.
 */
function recordTelegramUser(user, extra = {}) {
  if (!user || !user.id) return null;

  const users = loadUsers();
  const id = String(user.id);
  const now = new Date().toISOString();

  if (!users[id]) {
    users[id] = {
      id: user.id,
      username: user.username ? `@${user.username}` : null,
      firstName: user.first_name || "",
      lastName: user.last_name || "",
      fullName: [user.first_name, user.last_name].filter(Boolean).join(" ") || "TNPSC Aspirant",
      firstSeen: now,
      lastSeen: now,
      totalUrlsIngested: 0,
      ingestedHistory: [],
      subscribedToDaily: true,
    };
  } else {
    users[id].lastSeen = now;
    if (user.username) users[id].username = `@${user.username}`;
    if (user.first_name) users[id].firstName = user.first_name;
    if (user.last_name) users[id].lastName = user.last_name;
    users[id].fullName = [user.first_name || users[id].firstName, user.last_name || users[id].lastName].filter(Boolean).join(" ");
  }

  // If a URL was ingested by this user, record it
  if (extra.url) {
    users[id].totalUrlsIngested = (users[id].totalUrlsIngested || 0) + 1;
    users[id].ingestedHistory.unshift({
      url: extra.url,
      website: extra.website || detectWebsiteName(extra.url),
      topic: extra.topic || "General Studies Topic",
      unitId: extra.unitId || null,
      paper: extra.paper || null,
      notionUrl: extra.notionUrl || null,
      timestamp: now,
    });
    // Keep last 50 submissions per user
    if (users[id].ingestedHistory.length > 50) {
      users[id].ingestedHistory = users[id].ingestedHistory.slice(0, 50);
    }
  }

  saveUsers(users);

  // Auto-subscribe user to 9:00 AM daily topic questions
  try {
    subscribeChat(user.id);
  } catch (_) {}

  return users[id];
}

function detectWebsiteName(url) {
  if (!url) return "Web Article";
  const u = url.toLowerCase();
  if (u.includes("drishtiias.com")) return "Drishti IAS";
  if (u.includes("vajiramandravi.com")) return "Vajiram & Ravi";
  if (u.includes("visionias.in")) return "Vision IAS";
  if (u.includes("insightsonindia.com")) return "InsightsIAS";
  if (u.includes("thehindu.com")) return "The Hindu";
  if (u.includes("forumias.com")) return "ForumIAS";
  if (u.includes("pib.gov.in")) return "PIB India";
  return new URL(url).hostname.replace(/^www\./, "");
}

function getAllUsers() {
  return loadUsers();
}

function getUser(id) {
  const users = loadUsers();
  return users[String(id)] || null;
}

module.exports = {
  recordTelegramUser,
  detectWebsiteName,
  getAllUsers,
  getUser,
};
