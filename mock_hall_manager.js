/**
 * Sunday 3-Hour Full Mock Hall (Exam Endurance Training)
 * ─────────────────────────────────────────────────────────────────
 * Simulates the full 3-Hour (180 Minutes, 250 Marks) TNPSC Group-1
 * Mains examination under real exam hall conditions with progressive
 * time milestones, endurance tracking, and auto-proctored pacing.
 * ─────────────────────────────────────────────────────────────────
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data", "mock_hall_sessions.json");

function loadSessions() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (err) {
    console.error("[Mock Hall] Error reading session file:", err.message);
  }
  return {};
}

function saveSessions(data) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("[Mock Hall] Error saving session file:", err.message);
  }
}

/**
 * Curated 3-Hour Mock Paper blueprints across GS1, GS2, and GS3
 */
const MOCK_PAPERS = {
  GS1: {
    paperCode: "Paper II",
    title: "General Studies I (History, Social Issues, Mental Ability)",
    marks: 250,
    durationMinutes: 180,
    sections: [
      { unit: "Unit I (Modern History)", questions10M: 4, questions15M: 3 },
      { unit: "Unit II (Social Issues in India & TN)", questions10M: 4, questions15M: 3 },
      { unit: "Unit III (General Aptitude & Mental Ability)", questions10M: 2, questions15M: 2 },
    ],
  },
  GS2: {
    paperCode: "Paper III",
    title: "General Studies II (Polity, Ecology & Environment, Indian Economy)",
    marks: 250,
    durationMinutes: 180,
    sections: [
      { unit: "Unit I (Indian Polity & Constitution)", questions10M: 4, questions15M: 3 },
      { unit: "Unit II (Role & Impact of S&T)", questions10M: 4, questions15M: 3 },
      { unit: "Unit III (Tamil Society & Culture)", questions10M: 2, questions15M: 2 },
    ],
  },
  GS3: {
    paperCode: "Paper IV",
    title: "General Studies III (Geography, Environment, Economy of India & TN)",
    marks: 250,
    durationMinutes: 180,
    sections: [
      { unit: "Unit I (Geography of India & TN)", questions10M: 4, questions15M: 3 },
      { unit: "Unit II (Environment, Biodiversity & DM)", questions10M: 4, questions15M: 3 },
      { unit: "Unit III (Economy of India & Tamil Nadu)", questions10M: 2, questions15M: 2 },
    ],
  },
};

/**
 * Starts a 3-Hour Full Mock Hall session for a candidate.
 */
function startMockHallSession(userId, { paperKey = "GS1", customTitle = null }) {
  const store = loadSessions();
  const id = String(userId);
  const now = Date.now();
  const paper = MOCK_PAPERS[paperKey] || MOCK_PAPERS.GS1;

  store[id] = {
    userId: id,
    paperKey,
    paperTitle: customTitle || paper.title,
    paperCode: paper.paperCode,
    totalMarks: paper.marks,
    durationMinutes: 180,
    startedAt: now,
    targetEndAt: now + 180 * 60 * 1000,
    status: "IN_PROGRESS",
    checkpointsAlerted: [],
    completedAt: null,
    totalMinutesTaken: null,
  };

  saveSessions(store);
  return store[id];
}

/**
 * Gets active session for user.
 */
function getActiveSession(userId) {
  const store = loadSessions();
  const s = store[String(userId)];
  if (s && s.status === "IN_PROGRESS") {
    // Check if expired
    const elapsedMins = (Date.now() - s.startedAt) / (60 * 1000);
    if (elapsedMins > 210) { // 3 hours + 30 mins grace
      s.status = "EXPIRED";
      saveSessions(store);
    }
  }
  return store[String(userId)] || null;
}

/**
 * Checks milestone checkpoint status during 3-hour mock.
 */
function checkMilestone(session) {
  if (!session || session.status !== "IN_PROGRESS") return null;
  const elapsedMinutes = Math.floor((Date.now() - session.startedAt) / (60 * 1000));
  const remainingMinutes = Math.max(0, session.durationMinutes - elapsedMinutes);

  let checkpointMessage = null;
  let recommendedPace = "";

  if (elapsedMinutes >= 180) {
    recommendedPace = "🏁 PENS DOWN! 3-Hour Hall Closed. Upload your scanned QCAB answer booklet.";
  } else if (elapsedMinutes >= 165) {
    recommendedPace = "🚨 15 MINUTES REMAINING! Finish current sentence, check question numbering, and begin scanning.";
  } else if (elapsedMinutes >= 150) {
    recommendedPace = "⚡ FINAL 30 MINUTES! Wrap up remaining 15-markers. Ensure value addition boxes are highlighted.";
  } else if (elapsedMinutes >= 90) {
    recommendedPace = "⏱️ HALFWAY POINT (90 Mins Done): 10-mark section should be complete. Maintain 25 words/min on 15-markers.";
  } else if (elapsedMinutes >= 45) {
    recommendedPace = "📝 CHECKPOINT 1 (45 Mins Done): You should have completed Q1 to Q4. Handwriting and margins should be steady.";
  } else {
    recommendedPace = "🚀 START PHASE: Read instructions carefully. Allocate 8 mins for 10M, 12 mins for 15M.";
  }

  return {
    elapsedMinutes,
    remainingMinutes,
    recommendedPace,
    progressPct: Math.min(100, Math.round((elapsedMinutes / 180) * 100)),
  };
}

/**
 * Submits and finishes a 3-Hour Mock Hall session.
 */
function finishMockHallSession(userId) {
  const store = loadSessions();
  const id = String(userId);
  const s = store[id];
  if (!s) return null;

  const now = Date.now();
  const elapsedMins = Math.round((now - s.startedAt) / (60 * 1000));
  s.completedAt = now;
  s.totalMinutesTaken = elapsedMins;
  s.status = "COMPLETED";

  // Calculate endurance grade
  if (elapsedMins <= 185) {
    s.enduranceGrade = "A+ (EXAM READY • FLAWLESS ENDURANCE)";
    s.enduranceScore = 100;
  } else if (elapsedMins <= 200) {
    s.enduranceGrade = "A (STRONG • 10-MIN MARGIN OVERRUN)";
    s.enduranceScore = 88;
  } else {
    s.enduranceGrade = "B (PACE FATIGUE DETECTED)";
    s.enduranceScore = 72;
  }

  saveSessions(store);
  return s;
}

/**
 * Formats the 3-Hour Mock Hall Entry Card.
 */
function formatMockHallEntryCard(session) {
  const paper = MOCK_PAPERS[session.paperKey] || MOCK_PAPERS.GS1;
  const targetEnd = new Date(session.targetEndAt).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

  return [
    `🏛️ <b>SUNDAY 3-HOUR FULL MOCK EXAMINATION HALL</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📋 <b>Paper:</b> <b>${paper.paperCode} - ${paper.title}</b>`,
    `⚖️ <b>Total Marks:</b> <code>${paper.marks} Marks</code>`,
    `⏱️ <b>Exam Duration:</b> <code>180 Minutes (3 Hours)</code>`,
    `⏰ <b>Exam Ends At:</b> <code>${targetEnd} IST</code>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `📌 <b>OFFICIAL HALL INSTRUCTIONS:</b>`,
    `1. Sit in an uninterrupted quiet space with blue/black ballpoint pens.`,
    `2. Keep printed QCAB answer sheets ready (or standard ruled paper).`,
    `3. <b>Pacing Target:</b>`,
    `   • 10-Mark Questions: <b>8 Minutes</b> each (~150 words)`,
    `   • 15-Mark Questions: <b>12 Minutes</b> each (~250 words)`,
    `4. Check your status anytime with /mockstatus.`,
    `5. When done, scan and upload your complete answer sheet or tap <b>[🏁 Submit Mock Booklet]</b>.`,
    ``,
    `🔥 <i>"Success in TNPSC Mains is 40% knowledge and 60% endurance under fatigue!"</i>`,
  ].join("\n");
}

/**
 * Formats Mock Hall Status Card.
 */
function formatMockHallStatusCard(session) {
  const m = checkMilestone(session);
  const hours = Math.floor(m.elapsedMinutes / 60);
  const mins = m.elapsedMinutes % 60;
  const remHours = Math.floor(m.remainingMinutes / 60);
  const remMins = m.remainingMinutes % 60;

  const barFilled = Math.round((m.progressPct / 100) * 12);
  const bar = "█".repeat(barFilled) + "░".repeat(12 - barFilled);

  return [
    `⏱️ <b>LIVE 3-HOUR MOCK PROCTOR STATUS</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🏛️ <b>Paper:</b> ${session.paperTitle}`,
    `⏳ <b>Time Elapsed:</b> <code>${hours}h ${mins}m</code> / 3h 00m`,
    `⏰ <b>Time Remaining:</b> <code>${remHours}h ${remMins}m</code>`,
    `📊 <b>Progress:</b> <code>[${bar}] ${m.progressPct}%</code>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `🧭 <b>PROCTOR PACING ADVISORY:</b>`,
    `👉 <i>${m.recommendedPace}</i>`,
    ``,
    `📌 <i>Tap /mocksubmit when you have put down your pen and are ready to scan!</i>`,
  ].join("\n");
}

/**
 * Formats Endurance Completion Card.
 */
function formatMockHallCompletionCard(session) {
  const hours = Math.floor((session.totalMinutesTaken || 180) / 60);
  const mins = (session.totalMinutesTaken || 180) % 60;

  return [
    `╔════════════════════════════════════════╗`,
    `║  🎖️ <b>3-HOUR FULL MOCK COMPLETED!</b>`,
    `╚════════════════════════════════════════╝`,
    `🏛️ <b>Paper:</b> ${session.paperTitle}`,
    `⏱️ <b>Time Logged:</b> <code>${hours}h ${mins}m</code> (Official limit: 3h 00m)`,
    `🏆 <b>Endurance Rating:</b> <b>${session.enduranceGrade}</b>`,
    `📊 <b>Endurance Score:</b> <code>${session.enduranceScore} / 100</code>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `✅ <b>Achievement Unlocked:</b> 🎖️ <b>3-Hour Mains Marathoner</b>`,
    ``,
    `📄 <b>Next Step:</b>`,
    `Upload your scanned QCAB Answer Booklet PDF here for full AI evaluation and Presentation & Margin Audit!`,
  ].join("\n");
}

module.exports = {
  MOCK_PAPERS,
  startMockHallSession,
  getActiveSession,
  checkMilestone,
  finishMockHallSession,
  formatMockHallEntryCard,
  formatMockHallStatusCard,
  formatMockHallCompletionCard,
};
