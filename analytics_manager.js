/**
 * Aspirant Analytics & Syllabus Mastery Radar for TNPSC Mains
 * Tracks candidate submissions, score progression, paper balance, and time pacing.
 * Persists data to data/aspirant_analytics.json.
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data", "aspirant_analytics.json");

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (err) {
    console.error("Error reading analytics file:", err.message);
  }
  return {};
}

function saveData(data) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Error saving analytics file:", err.message);
  }
}

/**
 * Record an evaluation submission
 */
function recordSubmission(chatId, { marks = 15, score = 0, unitId = null, elapsedSeconds = null, submissionType = "Text" }) {
  const store = loadData();
  const id = String(chatId);

  if (!store[id]) {
    store[id] = {
      chatId: id,
      totalSubmitted: 0,
      totalMarksPossible: 0,
      totalScoreEarned: 0,
      mockExamsCompleted: 0,
      totalSecondsSpent: 0,
      papers: { GS1: { count: 0, scoreSum: 0, maxScoreSum: 0 }, GS2: { count: 0, scoreSum: 0, maxScoreSum: 0 }, GS3: { count: 0, scoreSum: 0, maxScoreSum: 0 } },
      units: {},
      history: [],
      lastActive: new Date().toISOString(),
    };
  }

  const u = store[id];
  u.totalSubmitted += 1;
  u.totalMarksPossible += marks;
  u.totalScoreEarned += score;
  u.lastActive = new Date().toISOString();

  if (elapsedSeconds) {
    u.mockExamsCompleted += 1;
    u.totalSecondsSpent += elapsedSeconds;
  }

  // Deduce paper from unitId (e.g. GS1_U1 -> GS1)
  let paperKey = "GS1";
  if (unitId && unitId.startsWith("GS2")) paperKey = "GS2";
  else if (unitId && unitId.startsWith("GS3")) paperKey = "GS3";

  if (!u.papers[paperKey]) {
    u.papers[paperKey] = { count: 0, scoreSum: 0, maxScoreSum: 0 };
  }
  u.papers[paperKey].count += 1;
  u.papers[paperKey].scoreSum += score;
  u.papers[paperKey].maxScoreSum += marks;

  if (unitId) {
    if (!u.units[unitId]) u.units[unitId] = { count: 0, scoreSum: 0, maxScoreSum: 0 };
    u.units[unitId].count += 1;
    u.units[unitId].scoreSum += score;
    u.units[unitId].maxScoreSum += marks;
  }

  u.history.push({
    date: new Date().toISOString().slice(0, 10),
    marks,
    score,
    unitId,
    paperKey,
    elapsedSeconds,
    submissionType,
  });

  // Keep last 50 submissions
  if (u.history.length > 50) u.history = u.history.slice(-50);

  saveData(store);
  return u;
}

/**
 * Parse numeric score out of LLM evaluation output (e.g. "Score: 11 / 15" or "10/15")
 */
function extractScoreFromEval(evalText, defaultMarks = 15) {
  if (!evalText) return Math.round(defaultMarks * 0.65);
  const m = evalText.match(/Score:\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+)/i) || evalText.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+)/);
  if (m) {
    const earned = parseFloat(m[1]);
    return Math.min(earned, defaultMarks);
  }
  return Math.round(defaultMarks * 0.65);
}

/**
 * Format the Aspirant Analytics Card with Visual ASCII Radar and Mastery Heatmap
 */
function formatAnalyticsCard(chatId) {
  const store = loadData();
  const u = store[String(chatId)];

  if (!u || u.totalSubmitted === 0) {
    return [
      `📊 <b>ASPIRANT PERFORMANCE & MASTERY RADAR</b>`,
      `────────────────────────────────────`,
      `<i>No answers evaluated yet!</i>`,
      ``,
      `✍️ Submit an answer to a question (text, handwritten photo, or PDF) or start a 12-minute mock exam via <code>/mock</code> to initialize your real-time mastery analytics!`,
    ].join("\n");
  }

  const overallPct = u.totalMarksPossible > 0 ? Math.round((u.totalScoreEarned / u.totalMarksPossible) * 100) : 0;
  const avgScorePer15 = ((overallPct / 100) * 15).toFixed(1);

  function makeBar(pct, len = 10) {
    const filled = Math.min(len, Math.max(0, Math.round((pct / 100) * len)));
    return "█".repeat(filled) + "░".repeat(len - filled);
  }

  function getPaperStats(pKey) {
    const p = u.papers[pKey] || { count: 0, scoreSum: 0, maxScoreSum: 0 };
    const pct = p.maxScoreSum > 0 ? Math.round((p.scoreSum / p.maxScoreSum) * 100) : 0;
    return { count: p.count, pct, bar: makeBar(pct) };
  }

  const gs1 = getPaperStats("GS1");
  const gs2 = getPaperStats("GS2");
  const gs3 = getPaperStats("GS3");

  let avgPacingStr = "N/A";
  if (u.mockExamsCompleted > 0) {
    const avgSec = Math.round(u.totalSecondsSpent / u.mockExamsCompleted);
    avgPacingStr = `${Math.floor(avgSec / 60)}m ${String(avgSec % 60).padStart(2, "0")}s`;
  }

  // Find strongest & weakest papers
  const paperPcts = [
    { name: "GS 1 (Paper II)", pct: gs1.pct, count: gs1.count },
    { name: "GS 2 (Paper III)", pct: gs2.pct, count: gs2.count },
    { name: "GS 3 (Paper IV)", pct: gs3.pct, count: gs3.count },
  ].filter((x) => x.count > 0);

  paperPcts.sort((a, b) => b.pct - a.pct);
  const strongest = paperPcts[0]?.name || "GS 1 (Paper II)";
  const weakest = paperPcts[paperPcts.length - 1]?.name || "GS 2 (Paper III)";

  return [
    `╔════════════════════════════════════════════════╗`,
    `║    📊 <b>ASPIRANT SYLLABUS MASTERY RADAR</b>    ║`,
    `╚════════════════════════════════════════════════╝`,
    `🎯 <b>Cumulative Evaluated Submissions:</b> <code>${u.totalSubmitted} Answers</code>`,
    `🏆 <b>Average Performance:</b> <code>${overallPct}%</code> (~<b>${avgScorePer15} / 15 Marks</b>)`,
    `⏱️ <b>Timed 12-Min Mocks Written:</b> <code>${u.mockExamsCompleted} Sessions</code>`,
    `⚡ <b>Average Writing Pacing:</b> <code>${avgPacingStr}</code> (Limit: 12:00)`,
    `────────────────────────────────────────────────`,
    `📈 <b>SYLLABUS DOMAIN MASTERY HEATMAP:</b>`,
    ``,
    `📜 <b>GS 1 (Paper II):</b>  <code>[${gs1.bar}] ${gs1.pct}%</code> (<i>${gs1.count} submitted</i>)`,
    `   • Modern History, Social Issues & Ethics`,
    ``,
    `⚖️ <b>GS 2 (Paper III):</b> <code>[${gs2.bar}] ${gs2.pct}%</code> (<i>${gs2.count} submitted</i>)`,
    `   • Polity, Science & Technology, Tamil Society`,
    ``,
    `📈 <b>GS 3 (Paper IV):</b>  <code>[${gs3.bar}] ${gs3.pct}%</code> (<i>${gs3.count} submitted</i>)`,
    `   • Geography, Environment & Indian Economy`,
    `────────────────────────────────────────────────`,
    `🌟 <b>Strength Domain:</b> <i>${strongest}</i>`,
    `🎯 <b>Target Growth Area:</b> <i>${weakest}</i>`,
    `────────────────────────────────────────────────`,
    `💡 <i>Tip: Maintain balanced answer practice across all 3 papers to ensure aggregate cutoff clearance!</i>`,
  ].join("\n");
}

module.exports = {
  recordSubmission,
  extractScoreFromEval,
  formatAnalyticsCard,
};
