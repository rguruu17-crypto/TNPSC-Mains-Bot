const fs = require("fs");
const path = require("path");
const { updateEnvFile } = require("./api_manager");
const { getUser, getAllUsers } = require("./user_manager");

const ACCESS_FILE = path.join(__dirname, "data", "access_control.json");

const DEFAULT_ACCESS_STATE = {
  restrictionEnabled: true, // When true, only admins & authorized friends can access
  admins: [],               // Telegram IDs of admins
  allowedFriends: {},       // map of userId -> { id, username, fullName, addedAt, addedBy, note }
  pendingRequests: {},      // map of userId -> { id, username, fullName, requestedAt }
};

/**
 * Loads the access control state from disk.
 * Falls back to default state and auto-migrates any ADMIN_ID / ADMIN_IDS from .env.
 */
function loadAccessState() {
  let state = { ...DEFAULT_ACCESS_STATE };

  try {
    if (fs.existsSync(ACCESS_FILE)) {
      const raw = fs.readFileSync(ACCESS_FILE, "utf8").trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        state = {
          ...DEFAULT_ACCESS_STATE,
          ...parsed,
          allowedFriends: parsed.allowedFriends || {},
          pendingRequests: parsed.pendingRequests || {},
          admins: Array.isArray(parsed.admins) ? parsed.admins.map(String) : [],
        };
      }
    }
  } catch (err) {
    console.error("[Access Manager] Error reading access file:", err.message);
  }

  // Sync admins from .env if present
  const envAdmin = process.env.ADMIN_ID || process.env.ADMIN_IDS || process.env.BOT_ADMIN_ID;
  if (envAdmin) {
    const envIds = envAdmin
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const id of envIds) {
      if (!state.admins.includes(id)) {
        state.admins.push(id);
      }
    }
  }

  return state;
}

/**
 * Saves access control state safely using atomic write.
 */
function saveAccessState(state) {
  try {
    const dir = path.dirname(ACCESS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const tmp = `${ACCESS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tmp, ACCESS_FILE);
  } catch (err) {
    console.error("[Access Manager] Error saving access file:", err.message);
  }
}

/**
 * Checks whether a given Telegram User ID is an administrator.
 */
function isAdmin(userId) {
  if (!userId) return false;
  const idStr = String(userId);
  const state = loadAccessState();
  return state.admins.includes(idStr);
}

/**
 * Checks if the system has any admin configured yet.
 */
function hasAnyAdmin() {
  const state = loadAccessState();
  return state.admins.length > 0;
}

/**
 * Adds an admin ID and optionally writes it to .env.
 */
function addAdmin(userId, persistToEnv = true) {
  if (!userId) return false;
  const idStr = String(userId);
  const state = loadAccessState();

  if (!state.admins.includes(idStr)) {
    state.admins.push(idStr);
    saveAccessState(state);
  }

  if (persistToEnv && (!process.env.ADMIN_ID || !process.env.ADMIN_ID.includes(idStr))) {
    try {
      const current = process.env.ADMIN_ID ? `${process.env.ADMIN_ID},${idStr}` : idStr;
      updateEnvFile("ADMIN_ID", current);
    } catch (err) {
      console.warn("[Access Manager] Failed to update ADMIN_ID in .env:", err.message);
    }
  }

  return true;
}

/**
 * Checks whether a user has permission to use the bot.
 * Allowed if:
 * 1. Restriction mode is OFF (Public mode)
 * 2. User is an Admin
 * 3. User is in the Allowed Friends whitelist
 */
function isUserAllowed(userId) {
  if (!userId) return false;
  const idStr = String(userId);
  const state = loadAccessState();

  // If public access is enabled, everyone is allowed
  if (!state.restrictionEnabled) return true;

  // Admins always have access
  if (state.admins.includes(idStr)) return true;

  // Check if whitelisted friend
  return Boolean(state.allowedFriends[idStr]);
}

/**
 * Returns access status information for a user.
 * Returns: { isAllowed, isAdmin, isFriend, role: 'Admin' | 'Friend' | 'Guest' }
 */
function getUserAccessInfo(userId) {
  const idStr = String(userId);
  const state = loadAccessState();
  const admin = state.admins.includes(idStr);
  const friend = Boolean(state.allowedFriends[idStr]);
  const allowed = !state.restrictionEnabled || admin || friend;

  let role = "Guest";
  if (admin) role = "Admin";
  else if (friend) role = "Authorized Friend";

  return {
    isAllowed: allowed,
    isAdmin: admin,
    isFriend: friend,
    role,
    friendData: friend ? state.allowedFriends[idStr] : null,
    restrictionEnabled: state.restrictionEnabled,
  };
}

/**
 * Adds a friend to the authorized whitelist.
 */
function addAllowedFriend({ id, username, firstName, lastName, fullName, addedBy = "Admin", note = "" }) {
  if (!id) return { success: false, error: "Missing user ID" };
  const idStr = String(id);
  const state = loadAccessState();
  const now = new Date().toISOString();

  // Try to enrich details from registered_users.json if available
  const existingUser = getUser(idStr);
  const resolvedFullName = fullName || [firstName, lastName].filter(Boolean).join(" ") || existingUser?.fullName || "Aspirant Friend";
  const resolvedUsername = username ? (username.startsWith("@") ? username : `@${username}`) : existingUser?.username || null;

  state.allowedFriends[idStr] = {
    id: Number(idStr) || idStr,
    username: resolvedUsername,
    fullName: resolvedFullName,
    addedAt: now,
    addedBy: String(addedBy),
    note: note || "Authorized Study Friend",
  };

  // Remove from pending requests if present
  if (state.pendingRequests[idStr]) {
    delete state.pendingRequests[idStr];
  }

  saveAccessState(state);
  return { success: true, friend: state.allowedFriends[idStr] };
}

/**
 * Removes a friend from the authorized whitelist.
 */
function removeAllowedFriend(userId) {
  if (!userId) return { success: false, error: "Missing user ID" };
  const idStr = String(userId);
  const state = loadAccessState();

  if (!state.allowedFriends[idStr]) {
    return { success: false, error: "User is not in the allowed friends list." };
  }

  const removed = state.allowedFriends[idStr];
  delete state.allowedFriends[idStr];
  saveAccessState(state);

  return { success: true, removed };
}

/**
 * Records a pending access request from a friend.
 */
function recordPendingRequest(user) {
  if (!user || !user.id) return null;
  const idStr = String(user.id);
  const state = loadAccessState();

  // If already an admin or friend, ignore
  if (state.admins.includes(idStr) || state.allowedFriends[idStr]) {
    return { status: "already_allowed" };
  }

  const now = new Date().toISOString();
  state.pendingRequests[idStr] = {
    id: user.id,
    username: user.username ? `@${user.username}` : null,
    firstName: user.first_name || "",
    lastName: user.last_name || "",
    fullName: [user.first_name, user.last_name].filter(Boolean).join(" ") || "TNPSC Aspirant",
    requestedAt: now,
  };

  saveAccessState(state);
  return { status: "recorded", request: state.pendingRequests[idStr] };
}

/**
 * Approves a pending access request.
 */
function approvePendingRequest(userId, approvedBy = "Admin") {
  const idStr = String(userId);
  const state = loadAccessState();
  const req = state.pendingRequests[idStr];

  if (!req) {
    // If not in pending, check if registered in users list
    const registered = getUser(idStr);
    return addAllowedFriend({
      id: idStr,
      username: registered?.username,
      fullName: registered?.fullName || "Friend",
      addedBy: approvedBy,
      note: "Directly Approved",
    });
  }

  return addAllowedFriend({
    id: req.id,
    username: req.username,
    fullName: req.fullName,
    addedBy: approvedBy,
    note: "Approved from Access Request",
  });
}

/**
 * Rejects a pending access request.
 */
function rejectPendingRequest(userId) {
  const idStr = String(userId);
  const state = loadAccessState();

  if (state.pendingRequests[idStr]) {
    const req = state.pendingRequests[idStr];
    delete state.pendingRequests[idStr];
    saveAccessState(state);
    return { success: true, rejected: req };
  }

  return { success: false, error: "No pending request found for this ID." };
}

/**
 * Toggles restriction mode (Whitelisted Friends only vs Public).
 */
function toggleRestriction(targetState = null) {
  const state = loadAccessState();
  if (typeof targetState === "boolean") {
    state.restrictionEnabled = targetState;
  } else {
    state.restrictionEnabled = !state.restrictionEnabled;
  }
  saveAccessState(state);
  return state.restrictionEnabled;
}

/**
 * Gets all allowed friends as an array.
 */
function getAllAllowedFriends() {
  const state = loadAccessState();
  return Object.values(state.allowedFriends || {});
}

/**
 * Gets all pending requests as an array.
 */
function getAllPendingRequests() {
  const state = loadAccessState();
  return Object.values(state.pendingRequests || {});
}

/**
 * Formats the Admin Panel Dashboard Card.
 */
function formatAdminPanelCard(adminUser) {
  const state = loadAccessState();
  const friendsCount = Object.keys(state.allowedFriends || {}).length;
  const pendingCount = Object.keys(state.pendingRequests || {}).length;
  const registeredCount = Object.keys(getAllUsers()).length;

  const modeBadge = state.restrictionEnabled
    ? "🟢 <b>RESTRICTED (Friends Whitelist Active)</b>"
    : "🌐 <b>PUBLIC (Open to Everyone)</b>";

  const adminName = adminUser?.first_name
    ? [adminUser.first_name, adminUser.last_name].filter(Boolean).join(" ")
    : "Administrator";

  const lines = [
    `🛡️ <b>TNPSC MAINS BOT — ADMIN CONTROL PANEL</b>`,
    `────────────────────────────────────`,
    `👑 <b>Active Admin:</b> <b>${adminName}</b> (<code>${adminUser?.id || "N/A"}</code>)`,
    `🔒 <b>Access Control:</b> ${modeBadge}`,
    ``,
    `👥 <b>Authorized Friends:</b> <b>${friendsCount}</b> friend(s) with full access`,
    `⏳ <b>Pending Access Requests:</b> <b>${pendingCount}</b> waiting approval`,
    `📊 <b>Total Registered Users:</b> <b>${registeredCount}</b> aspirants in database`,
    `👑 <b>Configured Admins:</b> <code>${state.admins.join(", ") || "(None)"}</code>`,
    ``,
    `📌 <b>How Friend Access Works:</b>`,
    `• When <b>RESTRICTED</b>: Only you and your added friends can practice questions, generate PDFs, and access model answers.`,
    `• Unapproved users see an access screen and can send a 1-click request to you.`,
    `• You can add friends anytime by Telegram ID, forwarded message, or from pending requests!`,
    `────────────────────────────────────`,
    `<i>Tap an action below to manage friends or configure settings:</i>`,
  ];

  return lines.join("\n");
}

/**
 * Formats the Friends List Card.
 */
function formatFriendsListCard(page = 1, pageSize = 5) {
  const friends = getAllAllowedFriends();
  const total = friends.length;

  if (total === 0) {
    return [
      `👥 <b>AUTHORIZED FRIENDS LIST</b>`,
      `────────────────────────────────────`,
      `<i>No friends added to the whitelist yet.</i>`,
      ``,
      `👉 Tap <b>➕ Add Friend</b> below to grant access by Telegram User ID or forwarded message!`,
    ].join("\n");
  }

  const totalPages = Math.ceil(total / pageSize) || 1;
  const currPage = Math.max(1, Math.min(page, totalPages));
  const startIdx = (currPage - 1) * pageSize;
  const pageItems = friends.slice(startIdx, startIdx + pageSize);

  const lines = [
    `👥 <b>AUTHORIZED FRIENDS LIST (Page ${currPage}/${totalPages})</b>`,
    `Total Whitelisted Friends: <b>${total}</b>`,
    `────────────────────────────────────`,
  ];

  pageItems.forEach((f, idx) => {
    const num = startIdx + idx + 1;
    const addedDate = f.addedAt ? new Date(f.addedAt).toLocaleDateString("en-IN") : "Recent";
    lines.push(
      `${num}. 👤 <b>${f.fullName || "Friend"}</b> ${f.username ? `(${f.username})` : ""}`,
      `   🆔 <code>${f.id}</code> • 📅 Added: <i>${addedDate}</i>`,
      `   📝 Note: <i>${f.note || "Authorized Friend"}</i>`,
      ``
    );
  });

  lines.push(`<i>Tap a friend's Remove button below to revoke their access.</i>`);
  return lines.join("\n");
}

/**
 * Formats the Pending Requests Card.
 */
function formatPendingRequestsCard() {
  const requests = getAllPendingRequests();

  if (requests.length === 0) {
    return [
      `⏳ <b>PENDING ACCESS REQUESTS</b>`,
      `────────────────────────────────────`,
      `✅ <i>No pending access requests! All friends have been processed.</i>`,
      ``,
      `When a friend attempts to use the bot, their request will appear here with instant Approve / Reject buttons.`,
    ].join("\n");
  }

  const lines = [
    `⏳ <b>PENDING ACCESS REQUESTS (${requests.length})</b>`,
    `────────────────────────────────────`,
  ];

  requests.forEach((r, idx) => {
    const reqTime = r.requestedAt ? new Date(r.requestedAt).toLocaleString("en-IN") : "Just now";
    lines.push(
      `${idx + 1}. 👤 <b>${r.fullName || "Aspirant"}</b> ${r.username ? `(${r.username})` : ""}`,
      `   🆔 <code>${r.id}</code> • ⏰ <i>${reqTime}</i>`,
      ``
    );
  });

  lines.push(`<i>Use the buttons below to approve or decline access:</i>`);
  return lines.join("\n");
}

/**
 * Formats the Access Restricted screen shown to unauthorized friends.
 */
function formatAccessDeniedCard(user) {
  const firstName = user?.first_name || "Friend";
  const userId = user?.id || "N/A";
  const username = user?.username ? `@${user.username}` : "";

  return [
    `🔒 <b>ACCESS RESTRICTED — PRIVATE STUDY BOT</b>`,
    `────────────────────────────────────`,
    `Hello <b>${firstName}</b>! 👋`,
    ``,
    `This <b>TNPSC Group-1 Mains Specialist Bot</b> is currently in <b>Private Study Circle Mode</b>. Access is reserved for authorized friends and students approved by the administrator.`,
    ``,
    `🆔 <b>Your Telegram User ID:</b> <code>${userId}</code>`,
    username ? `🔖 <b>Your Username:</b> ${username}` : "",
    ``,
    `✨ <b>How to get access:</b>`,
    `1. Tap <b>📩 Request Access from Admin</b> below (1-click request).`,
    `2. Or copy your Telegram ID <code>${userId}</code> and send it to your friend (the bot admin) so they can whitelist you!`,
    `────────────────────────────────────`,
  ].filter(Boolean).join("\n");
}

module.exports = {
  loadAccessState,
  saveAccessState,
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
};
