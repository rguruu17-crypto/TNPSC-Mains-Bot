/**
 * QCAB Space & Margin Scanner (Presentation Marks Auditor)
 * ─────────────────────────────────────────────────────────────────
 * Focuses specifically on visual presentation, margin adherence,
 * space allocation, handwriting line flow, and layout hygiene for
 * TNPSC Group-1 Mains Answer Booklets.
 * ─────────────────────────────────────────────────────────────────
 */

const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");

function getAI() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL || "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
].filter(Boolean);

/**
 * Builds the Gemini Vision prompt for space & margin auditing.
 */
function buildMarginScanPrompt(marks = 15) {
  const targetPages = marks === 10 ? "1.5 pages" : "2.5 pages";
  return `You are a Chief TNPSC Group-1 Mains Presentation Auditor.
Examine this uploaded answer sheet image/PDF specifically for VISUAL PRESENTATION, SPACE UTILIZATION, and MARGIN DISCIPLINE.

TNPSC GROUP-1 QCAB STANDARDS:
- Target Space: ${targetPages}
- Left Margin: Reserved strictly for Question Number. Text must NOT bleed into the left margin.
- Right Margin: A strict 1.5 cm buffer must be respected. No text overflow over the right edge.
- Space Utilization: Answer must fill 80-90% of allotted space without artificial padding or excessive blank voids.
- Visual Layout: Prominent use of underlined keywords, boxed data/schemes, bullet indentation, and flowcharts/diagrams.
- Line Alignment: Consistent line spacing, steady baseline, clear separation between subheadings.

AUDIT TASKS:
1. MARGIN COMPLIANCE (Max: 3.0): Check left margin, right margin, and header/footer boundary violations.
2. SPACE UTILIZATION (Max: 3.0): Assess density, void gaps, and page coverage against standard.
3. VISUAL STRUCTURE & HIGHLIGHTS (Max: 2.0): Underlines, boxed facts, bullet spacing, schematics.
4. LINE FLOW & LEGIBILITY (Max: 2.0): Baseline stability, slant uniformity, neatness.

Return ONLY this strict JSON format (no markdown, no extra commentary):
{
  "margin_compliance": {
    "score": <number 0.0 to 3.0>,
    "left_margin_status": "PASS" | "WARNING" | "VIOLATION",
    "right_margin_status": "PASS" | "WARNING" | "VIOLATION",
    "observations": "<concise observation about margin discipline>"
  },
  "space_utilization": {
    "score": <number 0.0 to 3.0>,
    "density_percentage": <estimated percentage 50-100>,
    "coverage_status": "OPTIMAL" | "UNDERFILLED" | "OVERCROWDED",
    "observations": "<concise observation about page filling>"
  },
  "visual_structuring": {
    "score": <number 0.0 to 2.0>,
    "has_underlines": <true/false>,
    "has_boxes_or_diagrams": <true/false>,
    "observations": "<concise observation on visual elements>"
  },
  "line_flow_legibility": {
    "score": <number 0.0 to 2.0>,
    "legibility_rating": "EXCELLENT" | "GOOD" | "AVERAGE" | "POOR",
    "observations": "<concise observation on neatness>"
  },
  "total_presentation_score": <sum of all 4 scores, max 10.0, rounded to 1 decimal>,
  "detected_penalties": [
    "<specific penalty or deduction reason, e.g. -0.5: Text bleeding into right margin on page 1>"
  ],
  "presentation_tips": [
    "<actionable tip 1 to boost presentation marks>",
    "<actionable tip 2 to boost presentation marks>"
  ]
}`;
}

/**
 * Scans an answer sheet PDF/image for space, margins, and presentation.
 * @param {string} filePath - Absolute path to file (PDF or JPG/PNG)
 * @param {number} marks - 10 or 15
 * @returns {Promise<object>}
 */
async function scanQCABPresentation(filePath, marks = 15) {
  const fileBytes = fs.readFileSync(filePath);
  const base64Data = fileBytes.toString("base64");
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === ".pdf" ? "application/pdf" : (ext === ".png" ? "image/png" : "image/jpeg");

  const prompt = buildMarginScanPrompt(marks);
  const ai = getAI();

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
                { inlineData: { mimeType, data: base64Data } },
                { text: prompt },
              ],
            },
          ],
          config: { maxOutputTokens: 2048 },
        });

        const raw = (res.text || "").trim()
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();

        const result = JSON.parse(raw);

        // Compute total presentation score
        const mScore = Number(result.margin_compliance?.score) || 0;
        const sScore = Number(result.space_utilization?.score) || 0;
        const vScore = Number(result.visual_structuring?.score) || 0;
        const lScore = Number(result.line_flow_legibility?.score) || 0;
        result.total_presentation_score = Math.round((mScore + sScore + vScore + lScore) * 10) / 10;

        return result;
      } catch (err) {
        lastErr = err;
        const isQuota = err.status === 429 || (err.message || "").includes("quota");
        console.warn(`[QCAB Scanner] Model '${modelName}' attempt ${attempt} failed: ${err.status || err.message?.slice(0, 60)}`);
        if (isQuota) break;
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw lastErr || new Error("All candidate models failed during QCAB Presentation Scan");
}

/**
 * Formats the Presentation & Margin Report into a modern Telegram HTML Card.
 */
function formatMarginScanCard(scan, marks = 15) {
  const score = scan.total_presentation_score || 0;
  const ratingBadge = score >= 8.5 ? "🌟 TOPPER GRADE" : (score >= 6.5 ? "👍 SOLID AVERAGE" : "⚠️ NEEDS POLISHING");

  const m = scan.margin_compliance || {};
  const s = scan.space_utilization || {};
  const v = scan.visual_structuring || {};
  const l = scan.line_flow_legibility || {};

  const lines = [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  📐 <b>QCAB SPACE & MARGIN SCANNER</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `🎯 <b>Presentation Rating:</b> <code>${score} / 10.0</code> • <b>${ratingBadge}</b>`,
    `⚖️ <b>Question Standard:</b> <code>${marks} Marks Standard</code>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `📏 <b>1. MARGIN DISCIPLINE:</b> <code>${m.score || 0} / 3.0</code>`,
    `• Left Margin: <b>${m.left_margin_status === "PASS" ? "✅ Clean" : "⚠️ " + m.left_margin_status}</b>`,
    `• Right Margin: <b>${m.right_margin_status === "PASS" ? "✅ Buffer Respected" : "⚠️ " + m.right_margin_status}</b>`,
    `💬 <i>${m.observations || "Standard margin alignment observed."}</i>`,
    ``,
    `📄 <b>2. SPACE UTILIZATION:</b> <code>${s.score || 0} / 3.0</code>`,
    `• Page Density: <b>${s.density_percentage || 80}%</b> (Status: <i>${s.coverage_status || "OPTIMAL"}</i>)`,
    `💬 <i>${s.observations || "Well-proportioned space coverage."}</i>`,
    ``,
    `💡 <b>3. VISUAL ELEMENTS & SCHEMATICS:</b> <code>${v.score || 0} / 2.0</code>`,
    `• Underlined Keywords: <b>${v.has_underlines ? "✅ Present" : "❌ Missing"}</b>`,
    `• Callout Boxes / Schematics: <b>${v.has_boxes_or_diagrams ? "✅ Detected" : "❌ None"}</b>`,
    `💬 <i>${v.observations || "Visual hierarchy applied."}</i>`,
    ``,
    `✍️ <b>4. LINE FLOW & LEGIBILITY:</b> <code>${l.score || 0} / 2.0</code>`,
    `• Handwriting Quality: <b>${l.legibility_rating || "GOOD"}</b>`,
    `💬 <i>${l.observations || "Neat handwriting baseline."}</i>`,
  ];

  if (scan.detected_penalties && scan.detected_penalties.length > 0) {
    lines.push(``);
    lines.push(`🚨 <b>DETECTED EXAMINER PENALTIES:</b>`);
    scan.detected_penalties.forEach(p => lines.push(`• <i>${p}</i>`));
  }

  if (scan.presentation_tips && scan.presentation_tips.length > 0) {
    lines.push(``);
    lines.push(`💡 <b>TOPPER PRESENTATION SECRETS:</b>`);
    scan.presentation_tips.forEach(t => lines.push(`• ${t}`));
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`📌 <i>In TNPSC Mains, visual hygiene accounts for 2–3 marks per question (= 30–45 marks total)!</i>`);

  return lines.join("\n");
}

module.exports = {
  scanQCABPresentation,
  formatMarginScanCard,
  buildMarginScanPrompt,
};
