/**
 * Live Study Group Leaderboard & Aspirant Ranking Engine
 * ─────────────────────────────────────────────────────────────────
 * Tracks candidate submissions, score averages, mock completions,
 * and consistency streaks across peer study groups and individual chats.
 * Persists to data/study_leaderboard.json.
 * ─────────────────────────────────────────────────────────────────
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data", "study_leaderboard.json");

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (err) {
    console.error("[Leaderboard] Error reading data:", err.message);
  }
  return {};
}

function saveData(data) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("[Leaderboard] Error saving data:", err.message);
  }
}

/**
 * Calculates current tier title based on accumulated points.
 */
function getTier(points) {
  if (points >= 600) return { title: "👑 TNPSC Mains Rank 1 Contender", badge: "👑", level: 5 };
  if (points >= 300) return { title: "🌟 Deputy Collector Candidate", badge: "🌟", level: 4 };
  if (points >= 150) return { title: "🏛️ Sub-Collector Aspirant", badge: "🏛️", level: 3 };
  if (points >= 50)  return { title: "🛡️ DSP Aspirant", badge: "🛡️", level: 2 };
  return { title: "🔰 Cadre Trainee", badge: "🔰", level: 1 };
}

/**
 * Records an answer score or mock exam into the leaderboard.
 */
function recordSubmissionScore(user, { score = 0, marks = 15, isMock = false }) {
  if (!user || !user.id) return null;
  const store = loadData();
  const id = String(user.id);
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  if (!store[id]) {
    store[id] = {
      userId: id,
      name: [user.first_name, user.last_name].filter(Boolean).join(" ") || "Aspirant",
      username: user.username ? `@${user.username}` : null,
      totalSubmissions: 0,
      totalScore: 0,
      totalMaxMarks: 0,
      points: 0,
      mockExamsCount: 0,
      streakDays: 1,
      lastActiveDate: todayStr,
      history: [],
    };
  }

  const u = store[id];
  u.name = [user.first_name, user.last_name].filter(Boolean).join(" ") || u.name;
  if (user.username) u.username = `@${user.username}`;

  // Streak logic
  if (u.lastActiveDate !== todayStr) {
    const lastDate = new Date(u.lastActiveDate);
    const diffDays = Math.round((now - lastDate) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      u.streakDays += 1;
    } else if (diffDays > 1) {
      u.streakDays = 1;
    }
    u.lastActiveDate = todayStr;
  }

  u.totalSubmissions += 1;
  u.totalScore += Number(score) || 0;
  u.totalMaxMarks += Number(marks) || 15;

  if (isMock) {
    u.mockExamsCount += 1;
  }

  // Points formula: 10 base pts per submission + 2x score + 30 pts for mock + 5 pts per streak day
  const earnedPts = 10 + Math.round((Number(score) || 0) * 2) + (isMock ? 30 : 0) + (u.streakDays * 5);
  u.points += earnedPts;

  u.tier = getTier(u.points);

  saveData(store);
  return u;
}

/**
 * Returns sorted leaderboard users.
 */
function getLeaderboard(limit = 10) {
  const store = loadData();
  const list = Object.values(store);

  list.forEach(u => {
    u.avgPercentage = u.totalMaxMarks > 0 ? Math.round((u.totalScore / u.totalMaxMarks) * 100) : 0;
    u.tier = getTier(u.points);
  });

  list.sort((a, b) => b.points - a.points);
  return list.slice(0, limit);
}

/**
 * Gets specific user ranking and profile.
 */
function getUserProfile(userId) {
  const store = loadData();
  const id = String(userId);
  const u = store[id];
  if (!u) return null;

  const all = Object.values(store).sort((a, b) => b.points - a.points);
  const rank = all.findIndex(x => x.userId === id) + 1;

  u.rank = rank > 0 ? rank : all.length;
  u.totalAspirants = all.length;
  u.avgPercentage = u.totalMaxMarks > 0 ? Math.round((u.totalScore / u.totalMaxMarks) * 100) : 0;
  u.tier = getTier(u.points);
  return u;
}

/**
 * Formats Telegram HTML card for Leaderboard.
 */
function formatLeaderboardCard(limit = 10, currentUserId = null) {
  const leaders = getLeaderboard(limit);
  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

  const lines = [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  🏆 <b>LIVE STUDY GROUP LEADERBOARD</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `⚡ <i>Top TNPSC Mains Aspirants ranked by Points, Consistency & Accuracy:</i>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ];

  if (leaders.length === 0) {
    lines.push(``);
    lines.push(`<i>No submissions recorded yet! Write an answer or complete a mock to claim Rank 1!</i>`);
  } else {
    leaders.forEach((u, i) => {
      const isMe = currentUserId && String(currentUserId) === String(u.userId);
      const medal = medals[i] || `#${i + 1}`;
      const highlight = isMe ? "👉 <b>" : "• <b>";
      const highlightEnd = isMe ? "</b> (You)" : "</b>";

      lines.push(`${medal} ${highlight}${u.name}${highlightEnd}`);
      lines.push(`   <code>${u.points} Pts</code> • ${u.tier.badge} <i>${u.tier.title}</i>`);
      lines.push(`   📊 ${u.totalSubmissions} Answers | Avg: ${u.avgPercentage}% | Streak: 🔥 ${u.streakDays}d`);
      lines.push(``);
    });
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`💡 <i>Earn +10 pts per answer, +2x marks, +30 pts for 3-Hour Mocks, and daily streak multipliers!</i>`);

  return lines.join("\n");
}

/**
 * Formats individual Profile Card.
 */
function formatUserProfileCard(userId) {
  const u = getUserProfile(userId);
  if (!u) {
    return [
      `👤 <b>ASPIRANT PROFILE NOT FOUND</b>`,
      `────────────────────────────────────`,
      `You haven't submitted any answers or mock exams yet!`,
      `👉 Pick a syllabus unit or tap <b>/quick</b> to begin your ranking journey.`,
    ].join("\n");
  }

  return [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  👤 <b>ASPIRANT MAINS SCORECARD</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `👤 <b>Name:</b> <b>${u.name}</b> ${u.username || ""}`,
    `🏅 <b>State Rank:</b> <code>#${u.rank} of ${u.totalAspirants} Aspirants</code>`,
    `⭐ <b>Total Points:</b> <code>${u.points} Points</code>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🎖️ <b>Designation Tier:</b> ${u.tier.badge} <b>${u.tier.title}</b>`,
    `🔥 <b>Consistency Streak:</b> <code>${u.streakDays} Consecutive Days</code>`,
    `📝 <b>Answers Evaluated:</b> <code>${u.totalSubmissions} Submissions</code>`,
    `⏱️ <b>3-Hour Full Mocks:</b> <code>${u.mockExamsCount} Completed</code>`,
    `📊 <b>Aggregate Accuracy:</b> <code>${u.avgPercentage}%</code> (${u.totalScore.toFixed(1)} / ${u.totalMaxMarks})`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📌 <i>Keep practicing daily to level up your Cadre Tier and capture Top 10 on /leaderboard!</i>`,
  ].join("\n");
}

module.exports = {
  recordSubmissionScore,
  getLeaderboard,
  getUserProfile,
  formatLeaderboardCard,
  formatUserProfileCard,
};
