/**
 * QCAB Answer Sheet AI Evaluator
 * ─────────────────────────────────────────────────────────────────
 * 1. Receives an uploaded PDF (scanned handwritten answer sheet)
 * 2. Extracts handwritten text using Gemini Vision
 * 3. Evaluates against TNPSC 12-rule criteria
 * 4. Returns structured evaluation: marks breakdown + feedback
 * ─────────────────────────────────────────────────────────────────
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs   = require("fs");
const path = require("path");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// ─────────────────────────────────────────────────────────────────
// EVALUATION CRITERIA (TNPSC Group 1 Mains 12-Rule Standard)
// ─────────────────────────────────────────────────────────────────

const CRITERIA_10M = [
  { key: "introduction",  label: "Introduction",             maxMarks: 2 },
  { key: "body",          label: "Main Content & Accuracy",  maxMarks: 5 },
  { key: "conclusion",    label: "Conclusion & Suggestion",  maxMarks: 1 },
  { key: "format",        label: "12-Rule Format Adherence", maxMarks: 1 },
  { key: "language",      label: "Language & Clarity",       maxMarks: 1 },
];

const CRITERIA_15M = [
  { key: "introduction",  label: "Introduction",             maxMarks: 2 },
  { key: "body",          label: "Main Content & Accuracy",  maxMarks: 8 },
  { key: "conclusion",    label: "Conclusion & Suggestion",  maxMarks: 2 },
  { key: "format",        label: "12-Rule Format Adherence", maxMarks: 2 },
  { key: "language",      label: "Language & Clarity",       maxMarks: 1 },
];

// ─────────────────────────────────────────────────────────────────
// BUILD EVALUATION PROMPT
// ─────────────────────────────────────────────────────────────────

function buildEvalPrompt(question, marks) {
  const criteria = marks === 10 ? CRITERIA_10M : CRITERIA_15M;
  const wordTarget = marks === 10 ? "~150 words" : "~250 words";
  const criteriaList = criteria
    .map(c => `  - ${c.label}: ${c.maxMarks} mark${c.maxMarks > 1 ? "s" : ""}`)
    .join("\n");

  return `You are a senior TNPSC Group-1 Mains examiner evaluating a handwritten answer sheet.

QUESTION (${marks} MARKS):
"${question}"

WORD TARGET: ${wordTarget}

TNPSC 12-RULE EVALUATION CRITERIA (Total: ${marks} marks):
${criteriaList}

INSTRUCTIONS:
1. First carefully OCR/read ALL handwritten text visible in the image(s).
2. Transcribe the full handwritten answer text.
3. Evaluate the answer strictly against TNPSC Group-1 Mains standards.
4. Be fair but strict. Partial marks are allowed.

Respond ONLY in this exact JSON format (no markdown, no extra text):
{
  "transcribed_text": "<full OCR transcription of handwritten answer>",
  "evaluation": {
    "introduction":  { "marks_awarded": <number>, "max_marks": ${criteria.find(c=>c.key==="introduction").maxMarks}, "comment": "<1 line>" },
    "body":          { "marks_awarded": <number>, "max_marks": ${criteria.find(c=>c.key==="body").maxMarks}, "comment": "<1 line>" },
    "conclusion":    { "marks_awarded": <number>, "max_marks": ${criteria.find(c=>c.key==="conclusion").maxMarks}, "comment": "<1 line>" },
    "format":        { "marks_awarded": <number>, "max_marks": ${criteria.find(c=>c.key==="format").maxMarks}, "comment": "<1 line>" },
    "language":      { "marks_awarded": <number>, "max_marks": ${criteria.find(c=>c.key==="language").maxMarks}, "comment": "<1 line>" }
  },
  "total_marks": <sum of all marks_awarded>,
  "max_marks": ${marks},
  "overall_feedback": "<3-4 sentences: strengths, weaknesses, improvement tips specific to TNPSC>",
  "word_count_estimate": <estimated word count of the answer>
}`;
}

// ─────────────────────────────────────────────────────────────────
// MAIN EVALUATION FUNCTION
// ─────────────────────────────────────────────────────────────────

/**
 * Evaluates a scanned QCAB PDF using Gemini Vision.
 * @param {string} pdfPath     - Absolute path to the uploaded PDF
 * @param {string} question    - The question text
 * @param {number} marks       - 10 or 15
 * @returns {Promise<object>}  - Evaluation result object
 */
async function evaluateQCABSheet(pdfPath, question, marks = 15) {
  const pdfBytes = fs.readFileSync(pdfPath);
  const base64Pdf = pdfBytes.toString("base64");

  const prompt = buildEvalPrompt(question, marks);

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType: "application/pdf",
        data: base64Pdf,
      },
    },
  ]);

  const responseText = result.response.text().trim();

  // Strip any markdown code fences if Gemini adds them
  const jsonText = responseText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let evaluation;
  try {
    evaluation = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`Gemini returned invalid JSON:\n${responseText}`);
  }

  // Validate total marks
  const criteria = marks === 10 ? CRITERIA_10M : CRITERIA_15M;
  let computedTotal = 0;
  for (const c of criteria) {
    const awarded = evaluation.evaluation?.[c.key]?.marks_awarded ?? 0;
    computedTotal += awarded;
  }
  evaluation.total_marks = computedTotal;
  evaluation.max_marks   = marks;

  return evaluation;
}

module.exports = { evaluateQCABSheet, CRITERIA_10M, CRITERIA_15M };
