/**
 * "AI Answer Level-Up" (Transform 7/15 into 13/15)
 * ─────────────────────────────────────────────────────────────────
 * Takes a candidate's average answer (scoring 6-8 marks out of 15),
 * diagnoses the exact shortcomings (lack of TN data, missing schemes,
 * generic points, no visual diagrams), and transforms it into a
 * topper-grade 13/15 answer following official 12-Rule standards.
 * ─────────────────────────────────────────────────────────────────
 */

const { ask } = require("./llm");
const { FORMAT_RULES, TELEGRAM_HTML } = require("./prompts");

const LEVEL_UP_SYSTEM = `You are a legendary TNPSC Group-1 Mains Topper Mentor and Senior Evaluator.
Your mission is to perform an "AI Answer Level-Up" on a student's answer, transforming a mediocre 7/15 answer into a state-rank-scoring 13/15 answer.

CRITICAL LANGUAGE CONSTRAINT: All output MUST be written 100% in ENGLISH ONLY. Never use Tamil script.

${FORMAT_RULES}
${TELEGRAM_HTML}

LEVEL-UP METHODOLOGY:
1. DIAGNOSIS (Why was it 7/15?):
   - Pinpoint: generic statements, missing Tamil Nadu economic/social statistics, missing flagship government schemes, lack of constitutional/legal articles, absent visual structure.

2. 4-PILLAR VALUE INJECTIONS:
   - Pillar 1 (Data & Stats): Exact metrics, NITI Aayog ranks, GSVA, SDG indicators.
   - Pillar 2 (TN Pioneer Schemes): Flagship Tamil Nadu government initiatives.
   - Pillar 3 (Legal & Constitutional Anchors): Landmark Articles, Acts, Supreme Court judgments, or High-Level Committees.
   - Pillar 4 (Visual Schematic Blueprint): Recommend a high-impact ASCII/box diagram.

3. THE TRANSFORMED 13/15 MODEL ANSWER:
   - Fully rewritten version adhering strictly to the 12-Rule format.
   - Bold keywords, Current Affairs Box after Intro, 5-6 subheadings with regular points and Unique Key / Value Addition boxes.

Format your response in this exact JSON structure:
{
  "diagnostic_critique": [
    "<Shortcoming 1: Why it was 7/15>",
    "<Shortcoming 2: Why it was 7/15>",
    "<Shortcoming 3: Why it was 7/15>"
  ],
  "injected_value_additions": {
    "tn_statistics": "<Key TN facts injected>",
    "tn_schemes": "<Key TN schemes injected>",
    "legal_anchors": "<Articles / Committees injected>",
    "diagram_blueprint": "<ASCII or structural diagram description>"
  },
  "score_jump_rationale": "<1-2 sentences summarizing how the additions pushed the score from 7/15 to 13/15>",
  "transformed_model_answer": "<The complete, polished 13/15 answer in Telegram HTML format adhering strictly to 12-rule structure>"
}`;

/**
 * Runs the AI Answer Level-Up engine.
 * @param {string} question - Question text
 * @param {string} studentAnswer - The candidate's draft answer
 * @param {number} marks - 10 or 15
 * @returns {Promise<object>}
 */
async function levelUpAnswer(question, studentAnswer, marks = 15) {
  const prompt = `QUESTION (${marks} MARKS):
"${question}"

STUDENT'S ORIGINAL DRAFT ANSWER (CURRENT SCORE ~7/15):
"${studentAnswer.trim()}"

Execute the "AI Answer Level-Up" transformation to boost this answer to 13/15 standards. Output strictly valid JSON.`;

  const raw = await ask(LEVEL_UP_SYSTEM, prompt, 6144);
  const clean = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return JSON.parse(clean);
}

/**
 * Formats the Level-Up Diagnostic Card.
 */
function formatLevelUpCard(result, { question, marks = 15 }) {
  const diag = result.diagnostic_critique || [];
  const val = result.injected_value_additions || {};

  const lines = [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  🚀 <b>AI ANSWER LEVEL-UP ENGINE</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `🎯 <b>Target:</b> <code>Transform 7/15 ➔ 13/15 Marks</code>`,
    `📋 <b>Question:</b> <i>"${question.length > 90 ? question.slice(0, 87) + "..." : question}"</i>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `🔍 <b>WHY WAS THE ORIGINAL ANSWER ~7/15? (DIAGNOSTIC):</b>`,
  ];

  diag.forEach((d, i) => lines.push(`• <b>Issue ${i + 1}:</b> <i>${d}</i>`));

  lines.push(``);
  lines.push(`⚡ <b>THE 4-PILLAR VALUE-ADDITION INJECTIONS:</b>`);
  if (val.tn_statistics) lines.push(`📊 <b>1. TN Data & Stats:</b> ${val.tn_statistics}`);
  if (val.tn_schemes) lines.push(`🌾 <b>2. TN Pioneer Schemes:</b> ${val.tn_schemes}`);
  if (val.legal_anchors) lines.push(`🏛️ <b>3. Constitutional & Legal Anchors:</b> ${val.legal_anchors}`);
  if (val.diagram_blueprint) lines.push(`🗺️ <b>4. Recommended Diagram:</b> <code>${val.diagram_blueprint}</code>`);

  lines.push(``);
  lines.push(`📈 <b>SCORE JUMP RATIONALE:</b>`);
  lines.push(`<i>${result.score_jump_rationale || "Systematic incorporation of data, state-specific initiatives, and 12-rule visual hierarchy elevated this answer to top percentile."}</i>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(``);
  lines.push(`🏆 <b>TRANSFORMED 13/15 TOPPER ANSWER:</b>`);
  lines.push(``);
  lines.push(result.transformed_model_answer);

  return lines.join("\n");
}

module.exports = {
  levelUpAnswer,
  formatLevelUpCard,
};
