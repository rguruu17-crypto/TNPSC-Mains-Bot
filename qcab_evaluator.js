/**
 * QCAB Answer Sheet AI Evaluator
 * ─────────────────────────────────────────────────────────────────
 * 1. Receives an uploaded PDF (scanned handwritten answer sheet)
 * 2. Extracts handwritten text using Gemini Vision
 * 3. Evaluates against TNPSC 12-rule criteria
 * 4. Returns structured evaluation: marks breakdown + feedback
 * ─────────────────────────────────────────────────────────────────
 */

const { GoogleGenAI } = require("@google/genai");
const fs   = require("fs");
const path = require("path");

// Reuse same SDK instance as llm.js (shares API key & model pool)
function getAI() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL || "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
].filter(Boolean);


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
 * Step 0: Extract the question text written on the uploaded QCAB sheet.
 * Gemini Vision reads the Q.No. / ANSWER header area and returns the question.
 * @param {string} pdfPath - Absolute path to the uploaded PDF
 * @returns {Promise<string>} - Extracted question text (or empty string)
 */
async function extractQuestionFromSheet(pdfPath) {
  const pdfBytes  = fs.readFileSync(pdfPath);
  const base64Pdf = pdfBytes.toString("base64");
  const ai        = getAI();

  const prompt = `Look at this TNPSC answer sheet PDF carefully.
Read the QUESTION written at the very top of the sheet (usually after "Q.No." or in the header/question area).
Return ONLY the question text, nothing else. No explanation. No preamble.
If you cannot find a clear question, return: NOT_FOUND`;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const res = await ai.models.generateContent({
        model: modelName,
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: "application/pdf", data: base64Pdf } },
            { text: prompt },
          ],
        }],
        config: { maxOutputTokens: 512 },
      });
      const text = (res.text || "").trim();
      if (text && text !== "NOT_FOUND" && text.length > 10) return text;
      return "";
    } catch (err) {
      console.warn(`[QCAB] extractQuestion failed on '${modelName}': ${err.status || err.message?.slice(0,60)}`);
    }
  }
  return "";
}

/**
 * Evaluates a scanned QCAB PDF using Gemini Vision.
 * @param {string} pdfPath     - Absolute path to the uploaded PDF
 * @param {string} question    - The question text
 * @param {number} marks       - 10 or 15
 * @returns {Promise<object>}  - Evaluation result object
 */
async function evaluateQCABSheet(pdfPath, question, marks = 15) {
  const pdfBytes  = fs.readFileSync(pdfPath);
  const base64Pdf = pdfBytes.toString("base64");
  const prompt    = buildEvalPrompt(question, marks);
  const ai        = getAI();

  let lastErr = null;
  for (const modelName of CANDIDATE_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType: "application/pdf", data: base64Pdf } },
                { text: prompt },
              ],
            },
          ],
          config: { maxOutputTokens: 4096 },
        });

        const raw = (res.text || "").trim()
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();

        const evaluation = JSON.parse(raw);

        // Recalculate total marks
        const criteria = marks === 10 ? CRITERIA_10M : CRITERIA_15M;
        let total = 0;
        for (const c of criteria) {
          total += evaluation.evaluation?.[c.key]?.marks_awarded ?? 0;
        }
        evaluation.total_marks = total;
        evaluation.max_marks   = marks;
        return evaluation;

      } catch (err) {
        lastErr = err;
        const isQuota = err.status === 429 || (err.message || "").includes("quota");
        console.warn(`[QCAB Evaluator] Model '${modelName}' attempt ${attempt} failed: ${err.status || err.message?.slice(0, 60)}`);
        if (isQuota) break; // failover immediately on quota
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw lastErr || new Error("All Gemini models failed for QCAB evaluation");
}


module.exports = { evaluateQCABSheet, extractQuestionFromSheet, CRITERIA_10M, CRITERIA_15M };

