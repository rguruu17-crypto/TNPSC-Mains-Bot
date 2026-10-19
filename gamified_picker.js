/**
 * The Gamified Animated Dice/Dart Topic Picker
 * ─────────────────────────────────────────────────────────────────
 * Uses Telegram's native physics-driven animated dice and darts
 * (🎯, 🎲, 🎰) to eliminate aspirant decision fatigue, assign instant
 * syllabus challenge levels, and trigger timed practice sprints.
 * ─────────────────────────────────────────────────────────────────
 */

const { getRandomTopic } = require("./syllabus");
const { generateQuestion } = require("./llm");

const DART_LEVELS = {
  6: {
    levelTitle: "🎯 BULLSEYE! MAXIMUM MARKS MARATHON",
    badge: "🔥 EXPERT LEVEL",
    marks: 15,
    timeLimitMins: 12,
    paperKey: "GS2",
    unitFilter: "Polity",
    theme: "Landmark Constitutional Federalism & Judicial Doctrines",
    description: "Highest difficulty! Tests analytical depth, critical evaluation, and landmark Supreme Court precedents.",
  },
  5: {
    levelTitle: "🏛️ CONSTITUTION & GOVERNANCE DRILL",
    badge: "⭐ ADVANCED",
    marks: 15,
    timeLimitMins: 12,
    paperKey: "GS2",
    unitFilter: "Polity",
    theme: "Governance, Social Audit & Citizen Charters in Tamil Nadu",
    description: "Evaluates institutional mechanisms, e-governance reforms, and state administrative innovations.",
  },
  4: {
    levelTitle: "🌾 SOCIAL JUSTICE & WELFARE PIONEERS",
    badge: "⭐ ADVANCED",
    marks: 15,
    timeLimitMins: 12,
    paperKey: "GS1",
    unitFilter: "Social Issues",
    theme: "Women Empowerment, Self-Help Groups & Vulnerable Sections in TN",
    description: "Focuses on inclusive growth, affirmative action, and Tamil Nadu's social welfare architectures.",
  },
  3: {
    levelTitle: "📈 TAMIL NADU ECONOMY & 1-TRILLION DOLLAR GOAL",
    badge: "⚡ INTERMEDIATE",
    marks: 15,
    timeLimitMins: 12,
    paperKey: "GS3",
    unitFilter: "Economy",
    theme: "GSVA Growth, Industrial Corridors & Green Energy Transition",
    description: "Tests macroeconomic mastery, fiscal indicators, and state industrial policies.",
  },
  2: {
    levelTitle: "🔬 SCIENCE & TECHNOLOGY INNOVATIONS",
    badge: "⚡ INTERMEDIATE",
    marks: 10,
    timeLimitMins: 8,
    paperKey: "GS2",
    unitFilter: "Science",
    theme: "Emerging Tech, Space Missions & Public Health Delivery",
    description: "Concise 10-marker testing application of technology in daily governance.",
  },
  1: {
    levelTitle: "📝 RAPID 10-MARKER WARMUP",
    badge: "🔰 SPEED WARMUP",
    marks: 10,
    timeLimitMins: 8,
    paperKey: "GS1",
    unitFilter: "Modern History",
    theme: "Freedom Movement in Tamil Nadu & Socio-Religious Reforms",
    description: "Fast 8-minute warmup question to calibrate your pen speed and keyword structuring.",
  },
};

/**
 * Maps dice/dart score (1-6) to a tailored syllabus challenge.
 */
function getChallengeForRoll(score = 6) {
  const s = Math.max(1, Math.min(6, Number(score) || 6));
  return DART_LEVELS[s] || DART_LEVELS[6];
}

/**
 * Formats Gamified Dart Challenge Card.
 */
function formatDartChallengeCard(score, challenge, question) {
  return [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  🎯 <b>GAMIFIED SYLLABUS CHALLENGE</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `🎲 <b>Dart Landed On:</b> <b>${score} of 6</b> ➔ <code>${challenge.badge}</code>`,
    `🏆 <b>Tier:</b> <b>${challenge.levelTitle}</b>`,
    `⚖️ <b>Weightage:</b> <code>${challenge.marks} Marks</code> • ⏱️ <b>Time Limit:</b> <code>${challenge.timeLimitMins} Minutes</code>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `📋 <b>YOUR MISSION QUESTION:</b>`,
    `<b>${question}</b>`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `💡 <i>${challenge.description}</i>`,
    `👉 <i>Print your QCAB or grab a ruled sheet, set your timer for ${challenge.timeLimitMins} mins, and write!</i>`,
  ].join("\n");
}

module.exports = {
  DART_LEVELS,
  getChallengeForRoll,
  formatDartChallengeCard,
};
