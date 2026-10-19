/**
 * Instant News-to-Mains Question Generator
 * ─────────────────────────────────────────────────────────────────
 * Converts any current affairs headline, newspaper article, or
 * editorial snippet directly into an authentic TNPSC Group-1 Mains
 * question mapped to the exact Paper and Unit with Directive Words,
 * TN scheme linkages, and model answering frameworks.
 * ─────────────────────────────────────────────────────────────────
 */

const { ask } = require("./llm");

const NEWS_TO_MAINS_SYSTEM = `You are a Senior Question Paper Setter for the Tamil Nadu Public Service Commission (TNPSC) Combined Civil Services Examination - I (Group-1 Mains).
LANGUAGE REQUIREMENT: All outputs must be 100% in English. Never use Tamil script.

Given a current news event, headline, or article excerpt:
1. Map the event to the exact TNPSC Mains Paper (Paper II, Paper III, or Paper IV) and specific Unit.
2. Frame an authentic 10-Mark Question using official TNPSC directive words (Examine, Discuss, Elucidate, Highlight).
3. Frame an authentic 15-Mark Question using high-order analytical directive words (Critically analyze, Evaluate, Assess with special reference to Tamil Nadu).
4. Provide a "Value Addition Blueprint" that top candidates must cite:
   - ⚡ Core Current Affairs context
   - 🌾 Pioneer Tamil Nadu Government Policies / Schemes to quote
   - 🏛️ Constitutional Articles / Landmark SC Cases / National Committees
   - 🧭 Pragmatic Way Forward

Respond ONLY with this valid JSON (no markdown, no extra commentary):
{
  "paper_code": "Paper II" | "Paper III" | "Paper IV",
  "paper_title": "<Full Paper Title>",
  "unit_id": "<Unit code e.g. GS1_U2>",
  "unit_name": "<Unit Title>",
  "question_10m": "<The framed 10-mark question>",
  "question_15m": "<The framed 15-mark question>",
  "directive_word": "<Directive used, e.g. 'Critically Analyze'>",
  "directive_meaning": "<1-line explanation of what the directive requires>",
  "value_blueprint": {
    "current_context": "<Key report / data / benchmark to cite in Introduction>",
    "tn_schemes": ["<Scheme 1>", "<Scheme 2>"],
    "legal_institutional_anchors": ["<Article / Committee / Act>"],
    "way_forward_tip": "<1-line strategic conclusion guidance>"
  }
}`;

/**
 * Converts news text into TNPSC Mains questions & blueprint.
 * @param {string} newsInput - News text, headline, or article summary
 * @returns {Promise<object>}
 */
async function generateQuestionsFromNews(newsInput) {
  const prompt = `NEWS / EDITORIAL SNIPPET TO CONVERT:
"${newsInput.trim()}"

Transform this into authentic TNPSC Group-1 Mains questions and high-scoring blueprint following the system instructions.`;

  const raw = await ask(NEWS_TO_MAINS_SYSTEM, prompt, 3072);
  const clean = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return JSON.parse(clean);
}

/**
 * Formats News-to-Mains card for Telegram.
 */
function formatNewsToMainsCard(data, newsInput) {
  const vb = data.value_blueprint || {};
  const previewNews = newsInput.length > 120 ? newsInput.slice(0, 117) + "..." : newsInput;

  const lines = [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  📰 <b>INSTANT NEWS-TO-MAINS GENERATOR</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `🗞️ <b>Source News:</b> <i>"${previewNews}"</i>`,
    `🏛️ <b>Mapped Syllabus:</b> <b>${data.paper_code}</b> ➔ <i>${data.unit_name}</i>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `📌 <b>10-MARK QUESTION (~150 Words | 8 Mins):</b>`,
    `<b>${data.question_10m}</b>`,
    ``,
    `📌 <b>15-MARK QUESTION (~250 Words | 12 Mins):</b>`,
    `<b>${data.question_15m}</b>`,
    ``,
    `🎯 <b>Directive Word:</b> <code>${data.directive_word}</code>`,
    `ℹ️ <i>${data.directive_meaning}</i>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `💡 <b>TOPPER VALUE-ADDITION BLUEPRINT:</b>`,
    `⚡ <b>Core Focus:</b> <i>${vb.current_context || "Recent contemporary data"}</i>`,
  ];

  if (vb.tn_schemes && vb.tn_schemes.length > 0) {
    lines.push(`🌾 <b>TN Schemes to Cite:</b> <code>${vb.tn_schemes.join(" • ")}</code>`);
  }

  if (vb.legal_institutional_anchors && vb.legal_institutional_anchors.length > 0) {
    lines.push(`🏛️ <b>Articles / Committees:</b> <code>${vb.legal_institutional_anchors.join(" • ")}</code>`);
  }

  if (vb.way_forward_tip) {
    lines.push(`🧭 <b>Way Forward:</b> <i>${vb.way_forward_tip}</i>`);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`👉 <i>Tap below to practice writing this question or download a blank QCAB booklet!</i>`);

  return lines.join("\n");
}

module.exports = {
  generateQuestionsFromNews,
  formatNewsToMainsCard,
};
