/**
 * Telegram Hashtag Auto-Categorizer & Syllabus Archive Engine
 * ─────────────────────────────────────────────────────────────────
 * Automatically scans, extracts, and indexes syllabus hashtags from
 * messages, associates them with TNPSC Papers/Units, and generates
 * searchable tags for all bot-generated questions and model answers.
 * Persists to data/hashtag_archive.json.
 * ─────────────────────────────────────────────────────────────────
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data", "hashtag_archive.json");

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (err) {
    console.error("[Hashtag Categorizer] Error loading archive:", err.message);
  }
  return { tags: {}, history: [] };
}

function saveData(data) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("[Hashtag Categorizer] Error saving archive:", err.message);
  }
}

const SYLLABUS_TAG_MAP = {
  // Papers
  "#paper2": { paper: "Paper II", title: "General Studies I" },
  "#paper3": { paper: "Paper III", title: "General Studies II" },
  "#paper4": { paper: "Paper IV", title: "General Studies III" },
  "#gs1": { paper: "Paper II", title: "General Studies I" },
  "#gs2": { paper: "Paper III", title: "General Studies II" },
  "#gs3": { paper: "Paper IV", title: "General Studies III" },

  // Units
  "#history": { unit: "Unit I (Modern History & Culture)", paper: "Paper II" },
  "#modernhistory": { unit: "Unit I (Modern History & Culture)", paper: "Paper II" },
  "#socialissues": { unit: "Unit II (Social Issues in India & TN)", paper: "Paper II" },
  "#womenempowerment": { unit: "Unit II (Social Issues)", paper: "Paper II" },
  "#polity": { unit: "Unit I (Indian Polity & Constitution)", paper: "Paper III" },
  "#constitution": { unit: "Unit I (Indian Polity & Constitution)", paper: "Paper III" },
  "#sciencetech": { unit: "Unit II (Science & Technology)", paper: "Paper III" },
  "#science": { unit: "Unit II (Science & Technology)", paper: "Paper III" },
  "#tamilculture": { unit: "Unit III (Tamil Society & Culture)", paper: "Paper III" },
  "#geography": { unit: "Unit I (Geography of India & TN)", paper: "Paper IV" },
  "#environment": { unit: "Unit II (Environment & Disaster Management)", paper: "Paper IV" },
  "#economy": { unit: "Unit III (Economy of India & TN)", paper: "Paper IV" },
  "#tneconomy": { unit: "Unit III (Economy of India & TN)", paper: "Paper IV" },
  "#tnscheme": { category: "Tamil Nadu Welfare Scheme", paper: "Cross-Paper" },
  "#pyq": { category: "Previous Year Question", paper: "Archive" },
  "#modelanswer": { category: "12-Rule Model Answer", paper: "Exemplar" },
};

/**
 * Extracts hashtags from any string.
 */
function extractHashtags(text) {
  if (!text) return [];
  const matches = text.match(/#[a-zA-Z0-9_]+/g);
  if (!matches) return [];
  return [...new Set(matches.map(t => t.toLowerCase()))];
}

/**
 * Generates official syllabus hashtags for questions and answers.
 */
function generateSyllabusHashtags(paperCode = "Paper II", unitName = "", topic = "") {
  const tags = [];
  const cleanPaper = paperCode.replace(/\s+/g, "").toLowerCase();
  tags.push(`#${cleanPaper}`);

  const lowerUnit = unitName.toLowerCase();
  if (lowerUnit.includes("history")) tags.push("#History");
  if (lowerUnit.includes("social")) tags.push("#SocialIssues");
  if (lowerUnit.includes("polity") || lowerUnit.includes("constitution")) tags.push("#Polity");
  if (lowerUnit.includes("science")) tags.push("#ScienceTech");
  if (lowerUnit.includes("tamil") || lowerUnit.includes("culture")) tags.push("#TamilCulture");
  if (lowerUnit.includes("environment")) tags.push("#Environment");
  if (lowerUnit.includes("economy")) tags.push("#TNEconomy");

  tags.push("#TNPSCMains");
  return tags.join(" ");
}

/**
 * Indexes a message by its tags.
 */
function indexMessage(chatId, messageId, { text, author = "Aspirant" }) {
  const tags = extractHashtags(text);
  if (tags.length === 0) return 0;

  const store = loadData();
  const now = new Date().toISOString();

  tags.forEach(tag => {
    if (!store.tags[tag]) {
      store.tags[tag] = {
        tag,
        count: 0,
        mapping: SYLLABUS_TAG_MAP[tag] || null,
        items: [],
      };
    }

    const tObj = store.tags[tag];
    tObj.count += 1;
    tObj.items.push({
      chatId,
      messageId,
      preview: text.length > 150 ? text.slice(0, 147) + "..." : text,
      author,
      indexedAt: now,
    });

    if (tObj.items.length > 30) {
      tObj.items = tObj.items.slice(-30); // Keep last 30
    }
  });

  saveData(store);
  return tags.length;
}

/**
 * Gets all tagged items for a tag.
 */
function getTagItems(tag) {
  const store = loadData();
  const cleanTag = tag.startsWith("#") ? tag.toLowerCase() : `#${tag.toLowerCase()}`;
  return store.tags[cleanTag] || null;
}

/**
 * Formats tag list card.
 */
function formatTagsListCard() {
  const store = loadData();
  const tags = Object.values(store.tags);

  const lines = [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  🏷️ <b>TELEGRAM HASHTAG ARCHIVE</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `Automatic syllabus indexer for notes, questions, and answers:`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
  ];

  if (tags.length === 0) {
    lines.push(`<i>No hashtags indexed yet! Tag any answer with #Polity, #History, #Economy, or #SocialIssues.</i>`);
  } else {
    tags.sort((a, b) => b.count - a.count).slice(0, 15).forEach(t => {
      const mapStr = t.mapping?.unit || t.mapping?.paper || "General Tag";
      lines.push(`• <b>${t.tag}</b>: <code>${t.count} items</code> (<i>${mapStr}</i>)`);
    });
  }

  lines.push(``);
  lines.push(`🔍 <i>To retrieve tagged items, send: <code>/tag #Polity</code> or <code>/tag #SocialIssues</code></i>`);

  return lines.join("\n");
}

/**
 * Formats results for a specific tag.
 */
function formatTagResultsCard(tag) {
  const tObj = getTagItems(tag);
  if (!tObj || tObj.items.length === 0) {
    return `⚠️ No indexed items found for <b>${tag}</b>.\nTag your messages with ${tag} to index them!`;
  }

  const lines = [
    `🏷️ <b>HASHTAG ARCHIVE: ${tObj.tag.toUpperCase()}</b>`,
    `────────────────────────────────────`,
    `📁 <b>Syllabus Mapping:</b> <i>${tObj.mapping?.unit || tObj.mapping?.paper || "Community Archive"}</i>`,
    `📊 <b>Total Indexed Items:</b> <code>${tObj.count}</code>`,
    `────────────────────────────────────`,
    ``,
  ];

  tObj.items.slice(-5).reverse().forEach((item, i) => {
    lines.push(`📌 <b>Item ${i + 1}</b> (by <i>${item.author}</i>):`);
    lines.push(`"${item.preview}"`);
    lines.push(``);
  });

  return lines.join("\n");
}

module.exports = {
  extractHashtags,
  generateSyllabusHashtags,
  indexMessage,
  getTagItems,
  formatTagsListCard,
  formatTagResultsCard,
  SYLLABUS_TAG_MAP,
};
