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
// GENERATE MODEL ANSWER PDF  (plain-text structured renderer)
// ─────────────────────────────────────────────────────────────────
function generateModelAnswerPdf({ question, marks, topic, paperCode = "Paper II", qNum = 1, modelAnswer }) {
  return new Promise((resolve, reject) => {
    try {
      const name     = `MODEL_ANS_${Date.now()}.pdf`;
      const filePath = path.join(OUTPUT_DIR, name);
      const doc      = new PDFDocument({ size: "A4", margins: { top: 36, bottom: 36, left: 44, right: 44 }, autoFirstPage: true });
      const ws       = fs.createWriteStream(filePath);
      doc.pipe(ws);

      const W = 507; // usable width

      // ── Header Banner ─────────────────────────────────────────
      doc.rect(20, 20, W + 24, 58).fillAndStroke("#0f172a", "#0f172a");
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#f8fafc")
         .text("TNPSC GROUP 1 MAINS — MODEL ANSWER (AI GENERATED)", 28, 30, { align: "center", width: W + 8 });
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#93c5fd")
         .text(`Q.NO. ${qNum}  |  ${marks} MARKS  |  TOPIC: ${topic}  |  ${paperCode}`, 28, 46, { align: "center", width: W + 8 });

      // ── Question box ──────────────────────────────────────────
      doc.rect(20, 82, W + 24, 30).fillAndStroke("#eff6ff", "#bfdbfe");
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#1e40af")
         .text("QUESTION:", 28, 88);
      doc.font("Helvetica").fontSize(7.5).fillColor("#1e40af")
         .text(question, 90, 88, { width: W - 60, lineBreak: false });

      doc.y = 122;
      doc.x = 44;

      // ── Parse & render structured content ────────────────────
      const lines = (modelAnswer || "").split("\n");

      for (const raw of lines) {
        const line = raw
          .replace(/<[^>]+>/g, "")   // strip any stray HTML tags
          .replace(/\*\*/g, "")       // strip markdown bold
          .replace(/\*/g, "");        // strip markdown italic

        if (!line.trim()) {
          if (doc.y < 760) doc.moveDown(0.3);
          continue;
        }

        // ── SECTION: INTRODUCTION / CONCLUSION ──────────────────
        if (/^(INTRODUCTION|CONCLUSION)$/i.test(line.trim())) {
          if (doc.y > 730) doc.addPage();
          const bg = /INTRO/i.test(line) ? "#1e3a5f" : "#14532d";
          doc.rect(44, doc.y, W, 18).fillAndStroke(bg, bg);
          doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff")
             .text(`▶  ${line.trim().toUpperCase()}`, 52, doc.y - 15, { width: W - 16 });
          doc.moveDown(0.6);
          continue;
        }

        // ── CURRENT AFFAIRS BOX ─────────────────────────────────
        if (/^\[CURRENT AFFAIRS BOX\]/i.test(line.trim())) {
          if (doc.y > 730) doc.addPage();
          const startY = doc.y;
          const content = line.replace(/^\[CURRENT AFFAIRS BOX\]:\s*/i, "").trim() ||
                          "Refer to recent national/state policy developments on this topic.";
          doc.rect(44, startY, W, 32).fillAndStroke("#fef3c7", "#f59e0b");
          doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#92400e")
             .text("⚡ CURRENT AFFAIRS:", 52, startY + 5);
          doc.font("Helvetica").fontSize(7.5).fillColor("#78350f")
             .text(content, 52, startY + 16, { width: W - 16, lineBreak: false });
          doc.y = startY + 36;
          doc.moveDown(0.4);
          continue;
        }

        // ── VALUE ADDITION BOX ──────────────────────────────────
        if (/^\[VALUE ADDITION\]/i.test(line.trim())) {
          if (doc.y > 730) doc.addPage();
          const startY = doc.y;
          const content = line.replace(/^\[VALUE ADDITION\]:\s*/i, "").trim();
          doc.rect(44, startY, W, 30).fillAndStroke("#f0fdf4", "#86efac");
          doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#15803d")
             .text("💡 VALUE ADDITION:", 52, startY + 5);
          doc.font("Helvetica").fontSize(7.5).fillColor("#166534")
             .text(content, 52, startY + 16, { width: W - 16, lineBreak: false });
          doc.y = startY + 34;
          doc.moveDown(0.5);
          continue;
        }

        // ── NUMBERED SUBHEADINGS (1. TITLE / 2. TITLE ...) ──────
        if (/^\d+\.\s+[A-Z]/.test(line.trim())) {
          if (doc.y > 730) doc.addPage();
          doc.rect(44, doc.y, W, 16).fillAndStroke("#1e293b", "#1e293b");
          doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#e2e8f0")
             .text(line.trim(), 52, doc.y - 12, { width: W - 16 });
          doc.moveDown(0.6);
          continue;
        }

        // ── BULLET POINTS ────────────────────────────────────────
        if (/^[•\-]/.test(line.trim())) {
          if (doc.y > 760) doc.addPage();
          doc.font("Helvetica").fontSize(8.5).fillColor("#1e293b")
             .text(line.trim(), 60, doc.y, { width: W - 20, lineGap: 1.5 });
          doc.moveDown(0.15);
          continue;
        }

        // ── SEPARATOR LINES ──────────────────────────────────────
        if (/^─{3,}/.test(line.trim())) {
          doc.moveDown(0.2);
          doc.lineWidth(0.4).strokeColor("#cbd5e1")
             .moveTo(44, doc.y).lineTo(44 + W, doc.y).stroke();
          doc.moveDown(0.3);
          continue;
        }

        // ── Word count line ──────────────────────────────────────
        if (/^word count/i.test(line.trim())) {
          doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#94a3b8")
             .text(line.trim(), 44, doc.y, { align: "right", width: W });
          doc.moveDown(0.4);
          continue;
        }

        // ── REGULAR PARAGRAPH ────────────────────────────────────
        if (doc.y > 760) doc.addPage();
        doc.font("Helvetica").fontSize(8.5).fillColor("#334155")
           .text(line.trim(), 44, doc.y, { width: W, lineGap: 2 });
        doc.moveDown(0.2);
      }

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
