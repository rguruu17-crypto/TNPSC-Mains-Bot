/**
 * QCAB Evaluation Result PDF Generator
 * ─────────────────────────────────────────────────────────────────
 * Takes evaluation results and generates:
 *   1. A "Marked Cover Page" PDF showing criteria scores + feedback
 *   2. A Model Answer PDF
 *   3. Merges: [marked cover] + [user's answer pages] + [model answer]
 * ─────────────────────────────────────────────────────────────────
 */

const PDFDocument = require("pdfkit");
const { PDFDocument: LibPDF } = require("pdf-lib");
const fs   = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "data", "generated_pdfs");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────
// COLOUR PALETTE
// ─────────────────────────────────────────────────────────────────
const C = {
  dark:    "#0f172a",
  blue:    "#1e40af",
  green:   "#15803d",
  red:     "#b91c1c",
  orange:  "#c2410c",
  slate:   "#475569",
  light:   "#f1f5f9",
  border:  "#cbd5e1",
  gold:    "#92400e",
};

// ─────────────────────────────────────────────────────────────────
// HELPER: Grade & colour from percentage
// ─────────────────────────────────────────────────────────────────
function gradeInfo(total, max) {
  const pct = (total / max) * 100;
  if (pct >= 80) return { grade: "A+", color: C.green,  label: "EXCELLENT" };
  if (pct >= 65) return { grade: "A",  color: C.blue,   label: "GOOD" };
  if (pct >= 50) return { grade: "B",  color: C.orange, label: "SATISFACTORY" };
  return            { grade: "C",  color: C.red,    label: "NEEDS IMPROVEMENT" };
}

// ─────────────────────────────────────────────────────────────────
// GENERATE MARKED COVER PAGE PDF (single page)
// ─────────────────────────────────────────────────────────────────
function generateMarkedCoverPdf({ question, marks, topic, paperCode = "Paper II", qNum = 1, evaluation }) {
  return new Promise((resolve, reject) => {
    try {
      const name     = `EVAL_COVER_${Date.now()}.pdf`;
      const filePath = path.join(OUTPUT_DIR, name);
      const doc      = new PDFDocument({ size: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 }, autoFirstPage: true });
      const ws       = fs.createWriteStream(filePath);
      doc.pipe(ws);

      const { total_marks, max_marks, evaluation: ev, overall_feedback, word_count_estimate } = evaluation;
      const { grade, color, label } = gradeInfo(total_marks, max_marks);
      const date = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

      // ── TNPSC Header ────────────────────────────────────────────
      doc.lineWidth(1.5).rect(40, 36, 515, 60).stroke(C.dark);
      doc.font("Helvetica-Bold").fontSize(11).fillColor(C.dark)
         .text("TAMIL NADU PUBLIC SERVICE COMMISSION", 45, 42, { align: "center", width: 505 });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.blue)
         .text("TNPSC GROUP 1 MAINS — QCAB EVALUATION RESULT", 45, 58, { align: "center", width: 505 });
      doc.font("Helvetica").fontSize(8).fillColor(C.slate)
         .text(`${paperCode.toUpperCase()} • DEGREE STANDARD • DATE: ${date}`, 45, 74, { align: "center", width: 505 });

      // ── SCORE BADGE ─────────────────────────────────────────────
      const badgeX = 395, badgeY = 108, badgeW = 160, badgeH = 80;
      doc.rect(badgeX, badgeY, badgeW, badgeH).fillAndStroke("#f8fafc", color);
      doc.font("Helvetica-Bold").fontSize(32).fillColor(color)
         .text(`${total_marks}/${max_marks}`, badgeX, badgeY + 10, { align: "center", width: badgeW });
      doc.font("Helvetica-Bold").fontSize(14).fillColor(color)
         .text(`GRADE: ${grade}`, badgeX, badgeY + 50, { align: "center", width: badgeW });
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(color)
         .text(label, badgeX, badgeY + 65, { align: "center", width: badgeW });

      // ── Question block ──────────────────────────────────────────
      const qY = 108;
      doc.lineWidth(0.8).rect(40, qY, 345, 28).stroke(C.red);
      doc.font("Helvetica-Bold").fontSize(8).fillColor(C.red)
         .text(`Q.NO. ${qNum} — ${marks} MARKS | TOPIC: ${topic}`, 48, qY + 5, { width: 328 });
      doc.font("Helvetica").fontSize(7.5).fillColor(C.dark)
         .text(question, 48, qY + 17, { width: 328, lineBreak: false });

      // ── CRITERIA BREAKDOWN TABLE ─────────────────────────────────
      let tY = 200;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.dark)
         .text("EVALUATION CRITERIA BREAKDOWN", 40, tY - 14);
      doc.lineWidth(0.5).rect(40, tY, 515, 18).fillAndStroke(C.dark, C.dark);
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff")
         .text("CRITERIA", 48, tY + 5)
         .text("AWARDED", 380, tY + 5, { align: "center", width: 60 })
         .text("MAX", 450, tY + 5, { align: "center", width: 40 })
         .text("COMMENT", 500, tY + 5, { width: 48 });
      doc.fillColor(C.dark);

      const rows = [
        { key: "introduction", label: "Introduction" },
        { key: "body",         label: "Main Content & Accuracy" },
        { key: "conclusion",   label: "Conclusion & Suggestion" },
        { key: "format",       label: "12-Rule Format Adherence" },
        { key: "language",     label: "Language & Clarity" },
      ];

      let rowY = tY + 18;
      rows.forEach((r, i) => {
        const d       = ev[r.key] || {};
        const awarded = d.marks_awarded ?? 0;
        const maxM    = d.max_marks    ?? 0;
        const comment = d.comment      ?? "";
        const bg      = i % 2 === 0 ? "#f8fafc" : "#ffffff";
        const aColor  = awarded >= maxM * 0.7 ? C.green : awarded >= maxM * 0.4 ? C.orange : C.red;

        doc.rect(40, rowY, 515, 20).fillAndStroke(bg, C.border);
        doc.font("Helvetica").fontSize(8).fillColor(C.dark)
           .text(r.label, 48, rowY + 6, { width: 320 });
        doc.font("Helvetica-Bold").fontSize(9).fillColor(aColor)
           .text(`${awarded}`, 380, rowY + 5, { align: "center", width: 60 });
        doc.font("Helvetica").fontSize(7.5).fillColor(C.slate)
           .text(`${maxM}`, 450, rowY + 6, { align: "center", width: 40 });
        doc.font("Helvetica-Oblique").fontSize(6.5).fillColor(C.slate)
           .text(comment, 500, rowY + 5, { width: 48, lineBreak: false });
        rowY += 20;
      });

      // Total row
      doc.rect(40, rowY, 515, 22).fillAndStroke(C.dark, C.dark);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff")
         .text("TOTAL MARKS", 48, rowY + 6)
         .text(`${total_marks} / ${max_marks}`, 380, rowY + 6, { align: "center", width: 120 });
      rowY += 22;

      // Word count
      doc.font("Helvetica").fontSize(7.5).fillColor(C.slate)
         .text(`Estimated word count: ${word_count_estimate ?? "N/A"}  (Target: ${max_marks === 10 ? "~150" : "~250"} words)`, 48, rowY + 5);
      rowY += 22;

      // ── OVERALL FEEDBACK ─────────────────────────────────────────
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(C.dark)
         .text("EXAMINER FEEDBACK", 40, rowY + 6);
      rowY += 20;

      const feedbackH = 70;
      doc.lineWidth(0.5).rect(40, rowY, 515, feedbackH).stroke(color);
      doc.font("Helvetica").fontSize(8).fillColor(C.dark)
         .text(overall_feedback || "—", 48, rowY + 8, { width: 499, lineGap: 2 });
      rowY += feedbackH + 12;

      // ── Examiner Signature Box ───────────────────────────────────
      doc.lineWidth(0.5).rect(40, rowY, 515, 50).stroke(C.border);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.slate)
         .text("EXAMINER SIGNATURE:", 48, rowY + 10)
         .text("DATE:", 200, rowY + 10)
         .text("EVALUATED BY: AI ASSISTANT (Gemini 1.5 Pro)", 280, rowY + 10, { width: 265 });
      doc.font("Helvetica-Oblique").fontSize(6.5).fillColor(C.slate)
         .text("This evaluation is AI-generated. Results are indicative of TNPSC standards.", 48, rowY + 35, { width: 505 });
      rowY += 60;

      // ── Model Answer Note ────────────────────────────────────────
      doc.rect(40, rowY, 515, 22).fillAndStroke("#eff6ff", C.blue);
      doc.font("Helvetica-Bold").fontSize(8).fillColor(C.blue)
         .text("📄 MODEL ANSWER IS ATTACHED ON THE FOLLOWING PAGES", 45, rowY + 7, { align: "center", width: 505 });

      doc.end();
      ws.on("finish", () => resolve(filePath));
      ws.on("error",  reject);
    } catch (e) { reject(e); }
  });
}

// ─────────────────────────────────────────────────────────────────
// GENERATE MODEL ANSWER PDF
// ─────────────────────────────────────────────────────────────────
function generateModelAnswerPdf({ question, marks, topic, paperCode = "Paper II", qNum = 1, modelAnswer }) {
  return new Promise((resolve, reject) => {
    try {
      const name     = `MODEL_ANS_${Date.now()}.pdf`;
      const filePath = path.join(OUTPUT_DIR, name);
      const doc      = new PDFDocument({ size: "A4", margins: { top: 40, bottom: 40, left: 50, right: 50 }, autoFirstPage: true });
      const ws       = fs.createWriteStream(filePath);
      doc.pipe(ws);

      // Header
      doc.lineWidth(1.2).rect(20, 20, 555, 55).stroke(C.dark);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(C.dark)
         .text("TNPSC GROUP 1 MAINS — MODEL ANSWER (AI GENERATED)", 25, 28, { align: "center", width: 545 });
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(C.blue)
         .text(`Q.NO. ${qNum} | ${marks} MARKS | TOPIC: ${topic} | ${paperCode}`, 25, 44, { align: "center", width: 545 });
      doc.font("Helvetica").fontSize(8).fillColor(C.slate)
         .text(`"${question}"`, 25, 58, { align: "center", width: 545 });

      doc.moveDown(1.5);

      // Model Answer Content
      const lines = (modelAnswer || "").split("\n").filter(l => l.trim());
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
          // Bold heading
          doc.font("Helvetica-Bold").fontSize(9.5).fillColor(C.dark)
             .text(trimmed.replace(/\*\*/g, ""), { lineGap: 2 });
        } else if (trimmed.startsWith("•") || trimmed.startsWith("-")) {
          // Bullet point
          doc.font("Helvetica").fontSize(9).fillColor(C.slate)
             .text(trimmed, { indent: 15, lineGap: 1.5 });
        } else {
          // Regular paragraph
          doc.font("Helvetica").fontSize(9).fillColor(C.dark)
             .text(trimmed, { lineGap: 2 });
        }
        doc.moveDown(0.3);
      }

      // Word count note
      doc.moveDown(1);
      const wordCount = (modelAnswer || "").split(/\s+/).filter(Boolean).length;
      doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(C.slate)
         .text(`[Model answer word count: ~${wordCount} words | Target: ${marks === 10 ? "~150" : "~250"} words]`, { align: "right" });

      doc.end();
      ws.on("finish", () => resolve(filePath));
      ws.on("error",  reject);
    } catch (e) { reject(e); }
  });
}

// ─────────────────────────────────────────────────────────────────
// MERGE PDFs: [marked cover] + [user answer pages] + [model answer]
// ─────────────────────────────────────────────────────────────────
async function mergeEvaluationPdfs({ markedCoverPath, userAnswerPath, modelAnswerPath }) {
  const merged   = await LibPDF.create();
  const sources  = [markedCoverPath, userAnswerPath, modelAnswerPath].filter(Boolean);

  for (const src of sources) {
    const bytes  = fs.readFileSync(src);
    const srcDoc = await LibPDF.load(bytes);
    const pages  = await merged.copyPages(srcDoc, srcDoc.getPageIndices());
    pages.forEach(p => merged.addPage(p));
  }

  const outName = `QCAB_EVALUATED_${Date.now()}.pdf`;
  const outPath = path.join(OUTPUT_DIR, outName);
  const outBytes = await merged.save();
  fs.writeFileSync(outPath, outBytes);
  return outPath;
}

module.exports = {
  generateMarkedCoverPdf,
  generateModelAnswerPdf,
  mergeEvaluationPdfs,
};
