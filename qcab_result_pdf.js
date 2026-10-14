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
// HANDWRITING FONTS (Topper Handwritten Style on Ruled Lines)
// ─────────────────────────────────────────────────────────────────
const FONT_REGULAR_HAND = path.join(__dirname, "fonts", "Kalam-Regular.ttf");
const FONT_BOLD_HAND    = path.join(__dirname, "fonts", "Kalam-Bold.ttf");
const HAS_HAND_FONT     = fs.existsSync(FONT_REGULAR_HAND) && fs.existsSync(FONT_BOLD_HAND);

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

      const { total_marks: rawTotal, max_marks: rawMax, evaluation: ev, overall_feedback, word_count_estimate } = evaluation;
      const total_marks = Math.round((Number(rawTotal) || 0) * 10) / 10;
      const max_marks = Math.round((Number(rawMax) || marks || 15) * 10) / 10;
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

      const scoreText = `${total_marks}/${max_marks}`;
      let scoreFontSize = 32;
      doc.font("Helvetica-Bold").fontSize(scoreFontSize);
      while (doc.widthOfString(scoreText) > (badgeW - 14) && scoreFontSize > 16) {
        scoreFontSize -= 2;
        doc.fontSize(scoreFontSize);
      }
      doc.font("Helvetica-Bold").fontSize(scoreFontSize).fillColor(color)
         .text(scoreText, badgeX, badgeY + 10, { align: "center", width: badgeW, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(14).fillColor(color)
         .text(`GRADE: ${grade}`, badgeX, badgeY + 50, { align: "center", width: badgeW });
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(color)
         .text(label, badgeX, badgeY + 65, { align: "center", width: badgeW });

      // ── Question block ──────────────────────────────────────────
      const qX = 40, qY = 108, qW = 345;
      const textInnerW = qW - 16;
      const qTopicText = `Q.NO. ${qNum} — ${marks} MARKS | TOPIC: ${_sanitizeForPdf(topic)}`;
      const cleanQuestion = _sanitizeForPdf(question);

      doc.font("Helvetica-Bold").fontSize(8);
      const topicH = doc.heightOfString(qTopicText, { width: textInnerW });
      doc.font("Helvetica").fontSize(8);
      const questionH = doc.heightOfString(cleanQuestion, { width: textInnerW, lineGap: 2 });

      const padY = 8;
      const contentH = padY + topicH + 5 + questionH + padY;
      const qH = Math.max(badgeH, Math.ceil(contentH));

      doc.lineWidth(0.8).rect(qX, qY, qW, qH).stroke(C.red);
      doc.font("Helvetica-Bold").fontSize(8).fillColor(C.red)
         .text(qTopicText, qX + 8, qY + padY, { width: textInnerW });
      doc.font("Helvetica").fontSize(8).fillColor(C.dark)
         .text(cleanQuestion, qX + 8, qY + padY + topicH + 5, { width: textInnerW, lineGap: 2 });

      // ── CRITERIA BREAKDOWN TABLE ─────────────────────────────────
      const boxBottom = Math.max(badgeY + badgeH, qY + qH);
      let tY = boxBottom + 26;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.dark)
         .text("EVALUATION CRITERIA BREAKDOWN", 40, tY - 12);
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
        const awarded = Math.round((Number(d.marks_awarded) || 0) * 10) / 10;
        const maxM    = Math.round((Number(d.max_marks) || 0) * 10) / 10;
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
           .text(_sanitizeForPdf(comment), 500, rowY + 5, { width: 48, lineBreak: false });
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
         .text(_sanitizeForPdf(overall_feedback) || "—", 48, rowY + 8, { width: 499, lineGap: 2 });
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
      const docEmojiDrawn = _drawEmoji(doc, "doc", 152, rowY + 5.5, 11);
      doc.font("Helvetica-Bold").fontSize(8).fillColor(C.blue)
         .text("MODEL ANSWER IS ATTACHED ON THE FOLLOWING PAGES", docEmojiDrawn ? 168 : 45, rowY + 7, {
           align: docEmojiDrawn ? "left" : "center",
           width: docEmojiDrawn ? 360 : 505,
         });

      doc.end();
      ws.on("finish", () => resolve(filePath));
      ws.on("error",  reject);
    } catch (e) { reject(e); }
  });
}

// ─────────────────────────────────────────────────────────────────
// GENERATE MODEL ANSWER PDF  — Rendered ON ruled QCAB lines
// (looks like a topper's completed answer booklet)
// ─────────────────────────────────────────────────────────────────

// Page geometry constants (must match pdf_generator.js exactly)
const PAGE_L        = 40;      // left border X
const PAGE_R        = 555;     // right border X
const PAGE_W        = PAGE_R - PAGE_L;  // 515pt
const LINE_SPACING  = 23;      // 23pt between ruled lines
const HEADER_H      = 20;      // writing area header strip height
const WRITE_START   = 100;     // Y where writing area starts (below QCAB header)
const FIRST_LINE_Y  = WRITE_START + HEADER_H + LINE_SPACING; // 143pt

// Text sits 5pt above each ruled line (so baseline lands on the line)
const TEXT_OFFSET   = -5;

// ── HELPER: draw lined QCAB writing page ─────────────────────────
function _drawLinedPage(doc, { paperCode, pageNum, totalPages, stripText, endY = 796 }) {
  // TNPSC header box (matches drawQCABHeader from pdf_generator.js)
  doc.lineWidth(1.5).rect(40, 36, 515, 60).stroke("#1e293b");
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a")
     .text("TAMIL NADU PUBLIC SERVICE COMMISSION", 45, 42, { align: "center", width: 505 });
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#334155")
     .text("COMBINED CIVIL SERVICES EXAMINATION - I (GROUP - I SERVICES) (MAIN WRITTEN EXAMINATION)", 45, 57, { align: "center", width: 505 });
  doc.font("Helvetica").fontSize(8).fillColor("#475569")
     .text(`${paperCode.toUpperCase()} • MODEL ANSWER — AI GENERATED`, 45, 70, { align: "center", width: 505 });
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#64748b")
     .text(`PAGE ${pageNum} OF ${totalPages}`, 45, 83, { align: "center", width: 505 });

  // Writing area outer border
  doc.lineWidth(0.8).strokeColor("#475569")
     .rect(PAGE_L, WRITE_START, PAGE_W, endY - WRITE_START).stroke();

  // Header row divider
  doc.lineWidth(0.5).strokeColor("#94a3b8")
     .moveTo(PAGE_L, WRITE_START + HEADER_H)
     .lineTo(PAGE_R, WRITE_START + HEADER_H).stroke();

  // Strip text inside header row
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#334155")
     .text(stripText, PAGE_L + 8, WRITE_START + 5, { width: PAGE_W - 16, lineBreak: false });

  // Ruled lines
  doc.lineWidth(0.35).strokeColor("#b0bec5");
  for (let y = FIRST_LINE_Y; y <= endY - 4; y += LINE_SPACING) {
    doc.moveTo(PAGE_L + 2, y).lineTo(PAGE_R - 2, y).stroke();
  }
}

// ── HELPER: advance curY to next line boundary ────────────────────
function _nextLine(curY, n = 1) { return curY + n * LINE_SPACING; }

// ── HELPER: Sanitize text for PDFKit WinAnsi fonts (prevents Ø=Ü; corruption) ──
function _sanitizeForPdf(text) {
  if (!text) return "";
  return text
    .replace(/[\u2023\u25E6\u2043\u2219]/g, "•")
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{26FF}]/gu, "")
    .replace(/[\u{2700}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, "")
    .replace(/[\u{1F600}-\u{1F64F}]/gu, "")
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, "")
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, "")
    .replace(/[\u{1FA00}-\u{1FAFF}]/gu, "")
    .replace(/[⚡💡📌⭐🔴▶✅⛔✓📄]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── HELPER: Real emoji image renderer (Twemoji PNG assets) ─────────
const EMOJI_DIR = path.join(__dirname, "assets", "emojis");
function _drawEmoji(doc, name, x, y, size = 11) {
  const p = path.join(EMOJI_DIR, `${name}.png`);
  if (fs.existsSync(p)) {
    try {
      doc.image(p, x, y, { width: size, height: size });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

// ── HELPER: Vector icons (crisp vector graphics, zero font corruption) ──
function _drawLightning(doc, x, y, color = "#d97706") {
  doc.save();
  doc.fillColor(color);
  doc.moveTo(x + 5, y)
     .lineTo(x + 1, y + 5)
     .lineTo(x + 4.5, y + 5)
     .lineTo(x + 2.5, y + 10)
     .lineTo(x + 7.5, y + 4.5)
     .lineTo(x + 4.5, y + 4.5)
     .fill();
  doc.restore();
}

function _drawBulb(doc, x, y, color = "#9333ea") {
  doc.save();
  doc.fillColor(color);
  doc.circle(x + 4.5, y + 3.8, 3.5).fill();
  doc.rect(x + 3.2, y + 6.5, 2.6, 2.5).fill();
  doc.fillColor("#ffffff").circle(x + 4.5, y + 3.5, 1.2).fill();
  doc.restore();
}

function _drawArrow(doc, x, y, color = "#ffffff") {
  doc.save();
  doc.fillColor(color);
  doc.moveTo(x, y)
     .lineTo(x + 6, y + 3.5)
     .lineTo(x, y + 7)
     .fill();
  doc.restore();
}

function _drawCheck(doc, x, y, color = "#15803d") {
  doc.save();
  doc.circle(x + 5, y + 5, 5).fill(color);
  doc.lineWidth(1.2).strokeColor("#ffffff");
  doc.moveTo(x + 2.5, y + 5)
     .lineTo(x + 4.5, y + 7)
     .lineTo(x + 7.5, y + 3)
     .stroke();
  doc.restore();
}

// ── MAIN FUNCTION ─────────────────────────────────────────────────
function generateModelAnswerPdf({ question, marks, topic, paperCode = "Paper II", qNum = 1, modelAnswer }) {
  return new Promise((resolve, reject) => {
    try {
      const name     = `MODEL_ANS_${Date.now()}.pdf`;
      const filePath = path.join(OUTPUT_DIR, name);
      const doc      = new PDFDocument({
        size: "A4",
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        autoFirstPage: true,
      });
      const ws = fs.createWriteStream(filePath);
      doc.pipe(ws);

      // Register handwritten fonts (Topper answer sheet handwriting)
      if (HAS_HAND_FONT) {
        doc.registerFont("Handwriting", FONT_REGULAR_HAND);
        doc.registerFont("Handwriting-Bold", FONT_BOLD_HAND);
      }
      const fontHand = HAS_HAND_FONT ? "Handwriting" : "Helvetica";
      const fontHandBold = HAS_HAND_FONT ? "Handwriting-Bold" : "Helvetica-Bold";

      // ── Decide page count (same as QCAB booklet writing pages) ──
      const is10       = marks === 10;
      const writePgs   = is10 ? 2 : 3;          // 10M→1½ pages, 15M→2½ pages
      const totalPages = writePgs;

      // Clean and split lines
      const rawLines = (modelAnswer || "")
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean);

      // ── State machine: iterate over text lines and render ────────
      let pageIdx = 0;   // 0-based page index
      let curY    = FIRST_LINE_Y;  // current Y position (starts at first ruled line)

      // Draw first page
      const endYForPage = (idx) => idx < writePgs - 1 ? 796 : (is10 ? 474 : 474);
      _drawLinedPage(doc, {
        paperCode,
        pageNum: 1,
        totalPages,
        stripText: `Q.NO. ${qNum} — ${marks} MARKS • MODEL ANSWER • ${topic} • ${paperCode.toUpperCase()}`,
        endY: endYForPage(0),
      });

      // ── Helper: add a new writing page ──────────────────────────
      function addWritingPage() {
        pageIdx++;
        doc.addPage();
        const endY = endYForPage(pageIdx);
        _drawLinedPage(doc, {
          paperCode,
          pageNum: pageIdx + 1,
          totalPages,
          stripText: `Q.NO. ${qNum} (CONTINUED) • ${marks} MARKS • MODEL ANSWER`,
          endY,
        });
        curY = FIRST_LINE_Y;
        return endY;
      }

      // ── Helper: check page space & add page if needed ────────────
      let curPageEndY = endYForPage(0);
      function ensureSpace(linesNeeded = 1) {
        if (curY + (linesNeeded - 1) * LINE_SPACING > curPageEndY - 10) {
          curPageEndY = addWritingPage();
        }
      }

      // ── Helper: draw a coloured callout box over the lines ───────
      function drawStripBox(text, bgColor, borderColor, labelText, textColor, labelColor, emojiName) {
        doc.font(fontHand).fontSize(10);
        const textW = PAGE_W - 20;
        const cleanBody = _sanitizeForPdf(text);
        const rawH = doc.heightOfString(cleanBody, { width: textW });
        const textLines = Math.max(1, Math.round(rawH / doc.currentLineHeight()));
        const linesNeeded = 1 + textLines;
        ensureSpace(linesNeeded);

        const boxH = linesNeeded * LINE_SPACING - 3;
        const boxTop = curY - LINE_SPACING + 2;
        doc.roundedRect(PAGE_L + 2, boxTop, PAGE_W - 4, boxH, 3)
           .fillAndStroke(bgColor, borderColor);

        // Draw real emoji image (or fallback crisp vector icon)
        const emojiX = PAGE_L + 8;
        const emojiY = boxTop + 4;
        const drew = _drawEmoji(doc, emojiName, emojiX, emojiY, 11);
        if (!drew) {
          if (emojiName === "lightning") _drawLightning(doc, emojiX, emojiY, "#d97706");
          else if (emojiName === "bulb") _drawBulb(doc, emojiX, emojiY, "#9333ea");
        }

        doc.font(fontHandBold).fontSize(9.5).fillColor(labelColor)
           .text(labelText, PAGE_L + 23, boxTop + 4, { width: textW - 17 });

        doc.font(fontHand).fontSize(10).fillColor(textColor)
           .text(cleanBody, PAGE_L + 8, boxTop + 17, { width: textW, lineGap: 2 });
        curY = _nextLine(curY, linesNeeded);
      }

      // ── Render each line adhering strictly to Notion Saver structure ─
      for (const line of rawLines) {
        const clean = line
          .replace(/<[^>]+>/g, "")   // strip HTML
          .replace(/\*\*/g, "")      // strip **bold**
          .replace(/\*/g, "")        // strip *italic*
          .trim();
        if (!clean) continue;

        // 1. INTRODUCTION HEADER (matches Notion's bold Introduction)
        const isIntro = /^(\d+\.\s*)?Introduction[:\s]*$/i.test(clean) ||
                        clean.toUpperCase() === "INTRODUCTION";
        if (isIntro) {
          ensureSpace(1);
          const barTop = curY - LINE_SPACING + 2;
          const barH = LINE_SPACING - 3;
          doc.roundedRect(PAGE_L + 2, barTop, PAGE_W - 4, barH, 2)
             .fillAndStroke("#1e3a5f", "#1e3a5f");
          _drawArrow(doc, PAGE_L + 10, barTop + 6, "#ffffff");
          doc.font(fontHandBold).fontSize(11).fillColor("#ffffff")
             .text("INTRODUCTION", PAGE_L + 20, barTop + 4, { width: PAGE_W - 30 });
          curY = _nextLine(curY);
          continue;
        }

        // 2. CONCLUSION HEADER (matches Notion's bold Conclusion)
        const isConclusion = /^(\d+\.\s*)?Conclusion(\s*&?\s*Way\s*Forward)?[:\s]*$/i.test(clean) ||
                             clean.toUpperCase() === "CONCLUSION";
        if (isConclusion) {
          ensureSpace(1);
          const barTop = curY - LINE_SPACING + 2;
          const barH = LINE_SPACING - 3;
          doc.roundedRect(PAGE_L + 2, barTop, PAGE_W - 4, barH, 2)
             .fillAndStroke("#14532d", "#14532d");
          _drawArrow(doc, PAGE_L + 10, barTop + 6, "#ffffff");
          doc.font(fontHandBold).fontSize(11).fillColor("#ffffff")
             .text("CONCLUSION", PAGE_L + 20, barTop + 4, { width: PAGE_W - 30 });
          curY = _nextLine(curY);
          continue;
        }

        // 3. CURRENT AFFAIRS / CORE FOCUS BOX (matches Notion's Orange Callout block)
        const isCurrentAffairs =
          /CURRENT\s*AFFAIRS|CORE\s*FOCUS|CONTEMPORARY\s*(CONTEXT|RELEVANCE)|RECENT\s*DEVELOPMENT/i.test(clean) ||
          /^(\s*⚡|\s*📰)/.test(clean);
        if (isCurrentAffairs) {
          let text = clean
            .replace(/^[\s⚡📰📌]+/, "")
            .replace(/^\[?(CURRENT\s*AFFAIRS(\s*\/\s*CORE\s*FOCUS)?(\s*BOX)?)\]?:?\s*/i, "")
            .trim() || "Recent policy context relevant to this topic.";
          drawStripBox(text, "#fef3c7", "#f59e0b", "CURRENT AFFAIRS / CORE FOCUS:", "#78350f", "#92400e", "lightning");
          continue;
        }

        // 4. UNIQUE KEY / VALUE ADDITION BOX (matches Notion's Purple Callout block)
        const isValueAddition =
          /UNIQUE\s*(KEY|HIGHLIGHT|INSIGHT)|VALUE\s*ADDITION|EXAMINER\s*DIFFERENTIATOR/i.test(clean) ||
          line.includes("🔴") ||
          /^(\s*💡|\s*⭐)/.test(clean);
        if (isValueAddition) {
          let text = clean
            .replace(/^[\s💡⭐🔴]+/, "")
            .replace(/^\[?(UNIQUE\s*KEY(\s*\/\s*VALUE\s*ADDITION)?|VALUE\s*ADDITION)\]?:?\s*/i, "")
            .trim();
          drawStripBox(text, "#f5f3ff", "#c084fc", "UNIQUE KEY / VALUE ADDITION:", "#581c87", "#6b21a8", "bulb");
          continue;
        }

        // 5. SUBHEADINGS (matches Notion's bold Subheadings: 1. Title)
        const isSubheading =
          /^(\d+\.|\bSubheading\s*\d+:?)\s+[A-Za-z]/i.test(clean) ||
          /<(b|u)>.*?<(b|u)>\s*\d+\./i.test(line) ||
          /<b>\s*\d+\.\s+[A-Za-z]/i.test(line);
        if (isSubheading && clean.length < 120 && !clean.endsWith(".")) {
          ensureSpace(1);
          const barTop = curY - LINE_SPACING + 2;
          const barH = LINE_SPACING - 3;
          doc.roundedRect(PAGE_L + 2, barTop, PAGE_W - 4, barH, 2)
             .fillAndStroke("#e8edf5", "#c7d2e8");
          const cleanSub = _sanitizeForPdf(clean);
          doc.font(fontHandBold).fontSize(11).fillColor("#0f172a")
             .text(cleanSub, PAGE_L + 10, barTop + 4, { width: PAGE_W - 20 });
          curY = _nextLine(curY);
          continue;
        }

        // 6. BULLET / NUMBERED POINTS (matches Notion's bulleted list items)
        const isPoint = /^\d+[\.\)]\s+/.test(clean) || /^[•\-\*]\s+/.test(clean);
        if (isPoint) {
          const pointText = clean.replace(/^(\d+[\.\)]|[•\-\*])\s*/, "").trim();
          const cleanPt = _sanitizeForPdf(pointText);
          doc.font(fontHand).fontSize(10.5);
          const textW = PAGE_W - 28;
          const rawH = doc.heightOfString(cleanPt, { width: textW });
          const linesNeeded = Math.max(1, Math.round(rawH / doc.currentLineHeight()));
          ensureSpace(linesNeeded);
          const lineGap = LINE_SPACING - doc.currentLineHeight();
          const textTop = curY - LINE_SPACING + 4;
          // Draw crisp round ink bullet dot
          doc.circle(PAGE_L + 10, textTop + 7, 1.8).fill("#0f2942");

          // Authentic pen ink color (#0f2942)
          doc.font(fontHand).fontSize(10.5).fillColor("#0f2942")
             .text(cleanPt, PAGE_L + 18, textTop, { width: textW, lineGap: Math.max(2, lineGap) });
          curY = _nextLine(curY, linesNeeded);
          continue;
        }

        // 7. SEPARATOR LINES ───
        if (/^─{3,}/.test(clean)) continue;

        // 8. WORD COUNT LINE
        if (/^(approx\.?\s*words?|word\s*count)/i.test(clean)) {
          ensureSpace(1);
          const textTop = curY - LINE_SPACING + 5;
          const cleanWc = _sanitizeForPdf(clean);
          doc.font(fontHand).fontSize(9).fillColor("#64748b")
             .text(cleanWc, PAGE_L + 8, textTop, { width: PAGE_W - 16, align: "right" });
          curY = _nextLine(curY);
          continue;
        }

        // 9. REGULAR PARAGRAPH TEXT (Introduction body, Conclusion body)
        const cleanPara = _sanitizeForPdf(clean);
        doc.font(fontHand).fontSize(10.5);
        const textW = PAGE_W - 16;
        const rawH = doc.heightOfString(cleanPara, { width: textW });
        const linesNeeded = Math.max(1, Math.round(rawH / doc.currentLineHeight()));
        ensureSpace(linesNeeded);
        const lineGap = LINE_SPACING - doc.currentLineHeight();
        const textTop = curY - LINE_SPACING + 4;
        doc.font(fontHand).fontSize(10.5).fillColor("#0f2942")
           .text(cleanPara, PAGE_L + 8, textTop, { width: textW, lineGap: Math.max(2, lineGap) });
        curY = _nextLine(curY, linesNeeded);
      }

      // ── END OF ANSWER SPACE banner on the last writing page ──────
      if (pageIdx < writePgs - 1) {
        while (pageIdx < writePgs - 1) {
          addWritingPage();
        }
      }
      const finalEndY = endYForPage(pageIdx);
      const bannerY   = finalEndY + 6;
      doc.roundedRect(PAGE_L, bannerY, PAGE_W, 24, 3).fillAndStroke("#f0fdf4", "#15803d");
      const checkDrawn = _drawEmoji(doc, "check", PAGE_L + 115, bannerY + 6, 12);
      if (!checkDrawn) _drawCheck(doc, PAGE_L + 115, bannerY + 6.5, "#15803d");
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#14532d")
         .text("END OF MODEL ANSWER  —  TNPSC 12-RULE FORMAT", PAGE_L + 132, bannerY + 7);

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
