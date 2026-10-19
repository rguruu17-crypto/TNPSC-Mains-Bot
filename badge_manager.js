/**
 * Bot Emoji Reactions & Feedback Badges Engine
 * ─────────────────────────────────────────────────────────────────
 * Handles Telegram native emoji reactions and maintains digital
 * achievement badges for TNPSC Mains aspirants.
 * Persists to data/user_badges.json.
 * ─────────────────────────────────────────────────────────────────
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data", "user_badges.json");

function loadBadges() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (err) {
    console.error("[Badge Manager] Error reading data:", err.message);
  }
  return {};
}

function saveBadges(data) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("[Badge Manager] Error saving data:", err.message);
  }
}

const BADGE_DEFINITIONS = {
  TOPPER_SCORE: {
    id: "TOPPER_SCORE",
    title: "Mains Topper",
    icon: "🏆",
    description: "Scored 12+ marks out of 15 on an authentic Mains question",
  },
  STREAK_7: {
    id: "STREAK_7",
    title: "Consistency Beast",
    icon: "🔥",
    description: "Maintained a 7-day uninterrupted answer-writing streak",
  },
  SPEED_DEMON: {
    id: "SPEED_DEMON",
    title: "Speed Demon",
    icon: "⚡",
    description: "Completed 15M answer in under 11 minutes with full 12-rule structure",
  },
  DIAGRAM_MASTER: {
    id: "DIAGRAM_MASTER",
    title: "Diagram Maestro",
    icon: "📊",
    description: "Incorporated visual flowcharts/schematics into evaluation",
  },
  CONSTITUTION_EAGLE: {
    id: "CONSTITUTION_EAGLE",
    title: "Constitution Eagle",
    icon: "🏛️",
    description: "Quoted constitutional articles and landmark Supreme Court rulings",
  },
  TN_SPECIALIST: {
    id: "TN_SPECIALIST",
    title: "Tamil Nadu Specialist",
    icon: "🌾",
    description: "Successfully cited pioneer Tamil Nadu government welfare schemes",
  },
  MARATHONER_3HR: {
    id: "MARATHONER_3HR",
    title: "3-Hour Mock Marathoner",
    icon: "🎖️",
    description: "Successfully endured and submitted the 3-Hour Full Mock Hall exam",
  },
  QCAB_PRO: {
    id: "QCAB_PRO",
    title: "QCAB Presentation Pro",
    icon: "📐",
    description: "Scored 8.5+ out of 10.0 on the QCAB Space & Margin Scanner",
  },
  DART_BULLSEYE: {
    id: "DART_BULLSEYE",
    title: "Bullseye Challenger",
    icon: "🎯",
    description: "Rolled a perfect 6 on the Gamified Dart and conquered a 15-Marker",
  },
};

/**
 * Triggers Telegram Bot Emoji Reaction safely.
 */
async function reactToMessage(ctx, emoji) {
  if (!ctx || !emoji) return;
  try {
    if (typeof ctx.react === "function") {
      await ctx.react(emoji);
    } else if (ctx.api?.setMessageReaction && ctx.chat?.id && ctx.message?.message_id) {
      await ctx.api.setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: "emoji", emoji }]);
    }
  } catch (err) {
    // Reactions might not be permitted in some supergroups or old clients
  }
}

/**
 * Automatically chooses appropriate emoji for score.
 */
async function reactForEvaluation(ctx, score, marks = 15) {
  const pct = marks > 0 ? (score / marks) * 100 : 0;
  let emoji = "👍";
  if (pct >= 80) emoji = "🏆";
  else if (pct >= 65) emoji = "🔥";
  else if (pct < 50) emoji = "💡";

  await reactToMessage(ctx, emoji);
  return emoji;
}

/**
 * Awards a badge to user if not already earned.
 */
function awardBadge(userId, badgeId) {
  const badgeDef = BADGE_DEFINITIONS[badgeId];
  if (!badgeDef) return null;

  const store = loadBadges();
  const id = String(userId);

  if (!store[id]) {
    store[id] = {
      userId: id,
      badges: [],
    };
  }

  const existing = store[id].badges.find(b => b.id === badgeId);
  if (existing) return null; // Already has it

  const awarded = {
    ...badgeDef,
    unlockedAt: new Date().toISOString(),
  };

  store[id].badges.push(awarded);
  saveBadges(store);
  return awarded;
}

/**
 * Gets all unlocked badges for a user.
 */
function getUserBadges(userId) {
  const store = loadBadges();
  return store[String(userId)]?.badges || [];
}

/**
 * Formats Badge Showcase Card for Telegram.
 */
function formatBadgesShowcaseCard(userId, userName = "Aspirant") {
  const unlocked = getUserBadges(userId);
  const unlockedIds = new Set(unlocked.map(b => b.id));
  const totalCount = Object.keys(BADGE_DEFINITIONS).length;

  const lines = [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  🎖️ <b>ASPIRANT BADGES & HONORS</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `👤 <b>Candidate:</b> <b>${userName}</b>`,
    `🏆 <b>Unlocked:</b> <code>${unlocked.length} of ${totalCount} Badges</code>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
  ];

  if (unlocked.length > 0) {
    lines.push(`🌟 <b>UNLOCKED TROPHIES:</b>`);
    unlocked.forEach(b => {
      const date = b.unlockedAt ? new Date(b.unlockedAt).toLocaleDateString("en-IN") : "Active";
      lines.push(`${b.icon} <b>${b.title}</b> (<i>Unlocked ${date}</i>)`);
      lines.push(`   └ <i>${b.description}</i>`);
    });
    lines.push(``);
  }

  const locked = Object.values(BADGE_DEFINITIONS).filter(b => !unlockedIds.has(b.id));
  if (locked.length > 0) {
    lines.push(`🔒 <b>LOCKED BADGES TO ACHIEVE:</b>`);
    locked.slice(0, 4).forEach(b => {
      lines.push(`▫️ ${b.icon} <b>${b.title}</b>`);
      lines.push(`   └ <i>${b.description}</i>`);
    });
    if (locked.length > 4) {
      lines.push(`   <i>...and ${locked.length - 4} more awaiting practice!</i>`);
    }
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`💡 <i>Submit handwritten QCABs, maintain streaks, and complete 3-hour mocks to unlock all badges!</i>`);

  return lines.join("\n");
}

module.exports = {
  BADGE_DEFINITIONS,
  reactToMessage,
  reactForEvaluation,
  awardBadge,
  getUserBadges,
  formatBadgesShowcaseCard,
};
