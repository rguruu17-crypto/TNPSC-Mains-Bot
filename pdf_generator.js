/**
 * Official TNPSC QCAB (Question-cum-Answer Booklet) & Revision Bible PDF Generator
 * Uses PDFKit to produce authentic, high-resolution printable PDFs directly in Telegram.
 * 
 * Strict TNPSC Group-1 Mains Space Standards:
 * - 10-Mark Questions: Exactly 1 ½ Pages (~150 Words, 8 Minutes)
 * - 15-Mark Questions: Exactly 2 ½ Pages (~250 Words, 12 Minutes)
 */

const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "data", "generated_pdfs");
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ─────────────────────────────────────────────────────────────
// HELPER DRAWING FUNCTIONS
// ─────────────────────────────────────────────────────────────

function drawQCABHeader(doc, { paperCode = "PAPER II", pageNum = 1, totalPages = 2 }) {
  doc.lineWidth(1.5).rect(40, 36, 515, 60).stroke("#1e293b");

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#0f172a")
    .text("TAMIL NADU PUBLIC SERVICE COMMISSION", 45, 42, { align: "center", width: 505 });

  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor("#334155")
    .text("COMBINED CIVIL SERVICES EXAMINATION - I (GROUP - I SERVICES) (MAIN WRITTEN EXAMINATION)", 45, 57, {
      align: "center",
      width: 505,
    });

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#475569")
    .text(`${paperCode.toUpperCase()} • DEGREE STANDARD • QUESTION-CUM-ANSWER BOOKLET (QCAB)`, 45, 70, {
      align: "center",
      width: 505,
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor("#64748b")
    .text(`PAGE ${pageNum} OF ${totalPages}`, 45, 83, { align: "center", width: 505 });
}

function drawWritingGuides(doc, startY, endY, leftMarginX = 65, rightMarginX = 530) {
  // Margin border lines
  doc.lineWidth(0.8).strokeColor("#cbd5e1");
  doc.moveTo(leftMarginX, startY).lineTo(leftMarginX, endY).stroke();
  doc.moveTo(rightMarginX, startY).lineTo(rightMarginX, endY).stroke();

  // Side margin warning
  const midY = (startY + endY) / 2;
  doc
    .save()
    .rotate(-90, { origin: [48, midY] })
    .font("Helvetica-Bold")
    .fontSize(6)
    .fillColor("#94a3b8")
    .text("DO NOT WRITE IN THIS MARGIN", 48, midY)
    .restore();

  // Ruled writing lines
  doc.lineWidth(0.4).strokeColor("#e2e8f0");
  for (let y = startY + 16; y <= endY; y += 18) {
    doc.moveTo(leftMarginX, y).lineTo(rightMarginX, y).stroke();
  }
}

function drawCutoffDemarcation(doc, { marks = 15, pageAllotted = "2 ½" }) {
  const y = 435;
  // Red warning banner
  doc.rect(40, y, 515, 24).fillAndStroke("#fef2f2", "#b91c1c");
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor("#991b1b")
    .text(`⛔ END OF ANSWER SPACE (${pageAllotted} PAGES ALLOTTED AS PER TNPSC QCAB NORMS)`, 45, y + 5, {
      align: "center",
      width: 505,
    });
  doc
    .font("Helvetica-Oblique")
    .fontSize(7)
    .fillColor("#b91c1c")
    .text("DO NOT WRITE IN THIS REMAINING SPACE • SPACE RESERVED FOR EXAMINER EVALUATION & ROUGH WORK", 45, y + 14, {
      align: "center",
      width: 505,
    });
}

function drawExaminerMatrix(doc, marks = 15) {
  const startY = 468;
  const is15 = marks === 15;

  // Outer container box
  doc.lineWidth(0.8).rect(40, startY, 515, 320).stroke("#94a3b8");

  // Header
  doc.rect(40, startY, 515, 20).fill("#1e293b");
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor("#ffffff")
    .text(`OFFICIAL TNPSC EXAMINER EVALUATION MATRIX (${marks} MARKS)`, 45, startY + 5, {
      align: "center",
      width: 505,
    });

  // Rubric Rows
  const rows = is15
    ? [
        { criterion: "1. Direct Relevance & Introduction + [Current Affairs Box]", max: "2.0", marks: "____" },
        { criterion: "2. Content Depth, Multi-dimensional Subheadings (5-6) & Key Points", max: "8.0", marks: "____" },
        { criterion: "3. Visual Presentation (Flowchart / Cycle / Mind-Map Box)", max: "2.0", marks: "____" },
        { criterion: "4. Standout Differentiator [Unique Key / TN Stats Box]", max: "2.0", marks: "____" },
        { criterion: "5. Forward-Looking Conclusion & Pragmatic Way Forward", max: "1.0", marks: "____" },
      ]
    : [
        { criterion: "1. Direct Relevance & Introduction + [Current Affairs Box]", max: "2.0", marks: "____" },
        { criterion: "2. Content Depth & Distinct Subheadings (3-4) with Bold Keywords", max: "5.0", marks: "____" },
        { criterion: "3. Standout Differentiator [Unique Key / Value Addition Box]", max: "2.0", marks: "____" },
        { criterion: "4. Conclusion & Positive Policy Way Forward", max: "1.0", marks: "____" },
      ];

  let currentY = startY + 20;
  // Table header
  doc.rect(40, currentY, 515, 16).fill("#f1f5f9");
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#334155");
  doc.text("ASSESSMENT CRITERION (12-RULE FORMAT COMPLIANCE)", 50, currentY + 4);
  doc.text("MAX", 430, currentY + 4, { width: 35, align: "center" });
  doc.text("AWARDED", 475, currentY + 4, { width: 70, align: "center" });

  currentY += 16;
  rows.forEach((r, idx) => {
    const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
    doc.rect(40, currentY, 515, 17).fill(bg);
    doc.lineWidth(0.5).rect(40, currentY, 515, 17).stroke("#e2e8f0");

    doc.font("Helvetica").fontSize(7.5).fillColor("#1e293b").text(r.criterion, 50, currentY + 4);
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#475569").text(r.max, 430, currentY + 4, { width: 35, align: "center" });
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#0f172a").text(r.marks, 475, currentY + 4, { width: 70, align: "center" });
    currentY += 17;
  });

  // Total Row
  doc.rect(40, currentY, 515, 19).fill("#e2e8f0");
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#0f172a");
  doc.text("TOTAL MARKS AWARDED BY EXAMINER:", 50, currentY + 5);
  doc.text(`${marks}.0`, 430, currentY + 5, { width: 35, align: "center" });
  doc.text("[          / " + marks + " ]", 475, currentY + 5, { width: 70, align: "center" });

  currentY += 24;

  // Signature line
  doc.font("Helvetica").fontSize(7.5).fillColor("#64748b");
  doc.text("Examiner Code: ____________________", 50, currentY);
  doc.text("Signature: __________________________", 340, currentY);

  currentY += 18;

  // Rough Work Section
  doc.rect(40, currentY, 515, startY + 320 - currentY).stroke("#cbd5e1");
  doc
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor("#94a3b8")
    .text("SPACE FOR CANDIDATE ROUGH WORK / BRAINSTORMING (CROSS OUT BEFORE SUBMISSION)", 45, currentY + 4, {
      align: "center",
      width: 505,
    });
}

// ─────────────────────────────────────────────────────────────
// 1. QCAB PRINTABLE BOOKLET GENERATOR
// ─────────────────────────────────────────────────────────────

function generateQCABPdf({ question, marks = 15, topic = "General Studies", paperCode = "Paper II" }) {
  return new Promise((resolve, reject) => {
    try {
      const sanitizedName = `QCAB_${Date.now()}_${marks}M.pdf`;
      const filePath = path.join(OUTPUT_DIR, sanitizedName);
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 36, bottom: 36, left: 40, right: 40 },
        autoFirstPage: true,
      });

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      const is10 = marks === 10;
      const totalPages = is10 ? 2 : 3;
      const pageAllottedStr = is10 ? "1 ½" : "2 ½";

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        if (pageNum > 1) {
          doc.addPage();
        }

        drawQCABHeader(doc, { paperCode, pageNum, totalPages });

        if (pageNum === 1) {
          // Candidate Register Box
          doc.lineWidth(0.8).rect(40, 102, 330, 28).stroke("#94a3b8");
          doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#1e293b").text("CANDIDATE REGISTER NUMBER:", 46, 107);
          let boxX = 180;
          for (let i = 0; i < 8; i++) {
            doc.rect(boxX, 106, 16, 20).stroke("#64748b");
            boxX += 18;
          }

          // Marks and Time Box
          doc.lineWidth(0.8).rect(380, 102, 175, 28).stroke("#94a3b8");
          doc.font("Helvetica-Bold").fontSize(8).fillColor("#0f172a").text(`MAX MARKS: ${marks}  •  ${pageAllottedStr} PAGES`, 388, 107);
          doc.font("Helvetica").fontSize(7.5).fillColor("#475569").text(`TIME: ${is10 ? "8" : "12"} MINS  •  WORDS: ~${is10 ? "150" : "250"}`, 388, 117);

          // Question Box
          doc.lineWidth(1.2).rect(40, 138, 515, 68).stroke("#0f172a");
          doc
            .font("Helvetica-Bold")
            .fontSize(8.5)
            .fillColor("#b91c1c")
            .text(`QUESTION NO. 1 (${marks} MARKS • SPACE ALLOTTED: ${pageAllottedStr} PAGES)`, 48, 144);

          doc
            .font("Helvetica-Bold")
            .fontSize(9)
            .fillColor("#0f172a")
            .text(question, 48, 158, { width: 499, align: "left", lineGap: 2 });

          // Instructions Strip
          doc.lineWidth(0.5).rect(40, 212, 515, 18).fillAndStroke("#f8fafc", "#cbd5e1");
          doc
            .font("Helvetica-Oblique")
            .fontSize(6.5)
            .fillColor("#475569")
            .text(`Write only inside the margins. Adhere strictly to the 12-rule format. Allotted space: exactly ${pageAllottedStr} pages.`, 46, 217, {
              align: "center",
              width: 503,
            });

          // Page 1 lines from 236 to 780
          drawWritingGuides(doc, 236, 780);
        } else if (pageNum === totalPages) {
          // FINAL PAGE (Page 2 for 10M, Page 3 for 15M) -> Exactly 0.5 Page of Writing lines!
          doc.lineWidth(0.8).rect(40, 102, 515, 20).stroke("#cbd5e1");
          doc
            .font("Helvetica-Bold")
            .fontSize(7.5)
            .fillColor("#475569")
            .text(`Q.NO. 1 (CONTINUED) • ${marks} MARKS • FINAL ½ PAGE (COMPLETES ${pageAllottedStr} PAGES)`, 46, 108);

          // Lines from Y=128 to Y=428 (exactly 0.5 page)
          drawWritingGuides(doc, 128, 428);

          // Demarcation box at Y=435
          drawCutoffDemarcation(doc, { marks, pageAllotted: pageAllottedStr });

          // Examiner matrix + rough work from Y=468 to Y=788
          drawExaminerMatrix(doc, marks);
        } else {
          // MIDDLE PAGE (Page 2 for 15M) -> Full writing lines!
          doc.lineWidth(0.8).rect(40, 102, 515, 20).stroke("#cbd5e1");
          doc
            .font("Helvetica-Bold")
            .fontSize(7.5)
            .fillColor("#475569")
            .text(`Q.NO. 1 (CONTINUED) • 15 MARKS • PAGE 2 OF 2 ½ • TOPIC: ${topic.slice(0, 70)}...`, 46, 108);

          drawWritingGuides(doc, 128, 780);
        }

        // Bottom Footer
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .fillColor("#94a3b8")
          .text(`TNPSC Group-1 Mains Specialist Bot • Official QCAB ${pageAllottedStr} Page Standard`, 40, 800, {
            align: "center",
            width: 515,
          });
      }

      doc.end();

      writeStream.on("finish", () => {
        resolve(filePath);
      });

      writeStream.on("error", (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

// ─────────────────────────────────────────────────────────────
// 2. REVISION BIBLE PDF COMPILER (10M: 1 ½ PAGES, 15M: 2 ½ PAGES)
// ─────────────────────────────────────────────────────────────

function renderModelAnswerHeader(doc, { qNum, marks, timeMins, words, paper, unit, topic, pageAllotted, pageNum, totalPages }) {
  doc.rect(40, 36, 515, 52).lineWidth(1.2).stroke("#1e293b");

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#0f172a")
    .text("TNPSC GROUP-1 MAINS • 12-RULE MODEL ANSWER BLUEPRINT", 45, 42, { align: "center", width: 505 });

  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor("#2563eb")
    .text(`${paper.toUpperCase()} • ${unit.toUpperCase()} • TOPIC: ${topic.toUpperCase()}`, 45, 56, {
      align: "center",
      width: 505,
    });

  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor("#475569")
    .text(`Q.${qNum} • ${marks} MARKS • TIME: ${timeMins} MINS • ~${words} WORDS • ALLOTTED: ${pageAllotted} PAGES [PAGE ${pageNum} OF ${totalPages}]`, 45, 68, {
      align: "center",
      width: 505,
    });
}

/**
 * Compiles high-yield questions, 12-rule model answers, and policy capsules into a comprehensive print booklet.
 * Strictly adheres to:
 * - 10-Mark Questions: Exactly 1 ½ Pages
 * - 15-Mark Questions: Exactly 2 ½ Pages
 */
function generateRevisionBiblePdf({ items = [], capsules = [] }) {
  return new Promise((resolve, reject) => {
    try {
      const sanitizedName = `TNPSC_Revision_Bible_${Date.now()}.pdf`;
      const filePath = path.join(OUTPUT_DIR, sanitizedName);
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 36, bottom: 36, left: 40, right: 40 },
        autoFirstPage: true,
      });

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // ───────────────────────────────────────────────
      // COVER PAGE
      // ───────────────────────────────────────────────
      doc.rect(40, 36, 515, 755).lineWidth(2).stroke("#0f172a");
      doc.rect(45, 41, 505, 745).lineWidth(0.8).stroke("#2563eb");

      doc.moveDown(4);
      doc
        .font("Helvetica-Bold")
        .fontSize(22)
        .fillColor("#0f172a")
        .text("TNPSC GROUP-1 MAINS", { align: "center" });

      doc
        .font("Helvetica-Bold")
        .fontSize(15)
        .fillColor("#2563eb")
        .text("ULTIMATE REVISION BIBLE & COMPENDIUM", { align: "center" });

      doc.moveDown(0.8);
      doc
        .font("Helvetica")
        .fontSize(9.5)
        .fillColor("#475569")
        .text("12-Rule Mandatory Answer Architecture • Flagship Policy Vault • Master Model Answers", {
          align: "center",
        });

      doc.moveDown(3);

      // Standards Box
      const boxY = 280;
      doc.rect(60, boxY, 475, 175).fillAndStroke("#f8fafc", "#cbd5e1");
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#0f172a")
        .text("OFFICIAL TNPSC QCAB PAGE ALLOCATION STANDARDS:", 75, boxY + 14);

      const standards = [
        "• 10-Mark Questions: Exactly 1 ½ Pages (~150 Words • 8 Minutes Allotted)",
        "• 15-Mark Questions: Exactly 2 ½ Pages (~250 Words • 12 Minutes Allotted)",
        "• Introduction: Exactly 4 lines defining theme directly + [CURRENT AFFAIRS / CORE FOCUS BOX]",
        "• Body Subheadings: 3-4 subheadings for 10M, 5-6 subheadings for 15M (bold keywords in every point)",
        "• Value Addition: Exactly ONE [UNIQUE KEY / STANDOUT BOX] under every subheading",
        "• Visual Presentation: Clean flowchart, radial map, or timeline sketch in unruled space",
        "• Conclusion: Exactly 4 forward-looking lines with a pragmatic, optimistic Way Forward",
      ];
      let sy = boxY + 36;
      standards.forEach((s) => {
        doc.font("Helvetica").fontSize(8).fillColor("#334155").text(s, 75, sy);
        sy += 19;
      });

      // Bottom Cover Metadata
      doc
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .fillColor("#1e293b")
        .text("TAMIL NADU CAREER SERVICES BENCHMARK COMPLIANCE", 60, 680, { align: "center", width: 475 });
      doc
        .font("Helvetica-Oblique")
        .fontSize(7.5)
        .fillColor("#64748b")
        .text("Compiled automatically by TNPSC Mains Specialist Bot • Downloadable & Printable A4 Format", 60, 696, {
          align: "center",
          width: 475,
        });

      // ───────────────────────────────────────────────
      // SECTION I: TAMIL NADU FLAGSHIP SCHEME CAPSULES
      // ───────────────────────────────────────────────
      doc.addPage();
      doc
        .font("Helvetica-Bold")
        .fontSize(13)
        .fillColor("#0f172a")
        .text("SECTION I: TAMIL NADU FLAGSHIP SCHEME CAPSULES (8 SCHEMES)", { underline: true });
      doc.moveDown(0.8);

      capsules.forEach((c, idx) => {
        if (doc.y > 650) {
          doc.addPage();
        }

        doc.rect(40, doc.y, 515, 17).fill("#1e293b");
        doc
          .font("Helvetica-Bold")
          .fontSize(8.5)
          .fillColor("#ffffff")
          .text(`${idx + 1}. ${c.title.toUpperCase()}`, 45, doc.y - 13);

        doc.moveDown(0.5);
        doc
          .font("Helvetica-Bold")
          .fontSize(8)
          .fillColor("#0f172a")
          .text(`Nodal: ${c.nodal}  |  Outlay: ${c.outlay}  |  Beneficiaries: ${c.target}`);

        doc.moveDown(0.3);
        doc
          .font("Helvetica-Bold")
          .fontSize(7.5)
          .fillColor("#2563eb")
          .text("12-Rule Answer Insertion Points:");
        doc
          .font("Helvetica")
          .fontSize(7.5)
          .fillColor("#1e293b")
          .text(`• Current Affairs Hook: "${c.mainsPlacement.introHook}"`)
          .text(`• Unique Key Box: "${c.mainsPlacement.uniqueKey}"`)
          .text(`• Conclusion Way Forward: "${c.mainsPlacement.wayForward}"`);

        doc.moveDown(1);
      });

      // ───────────────────────────────────────────────
      // SECTION II: MASTER 10-MARK MODEL ANSWER (EXACTLY 1 ½ PAGES)
      // ───────────────────────────────────────────────
      doc.addPage();

      // Page 1 of 10M Model Answer (Full Page)
      renderModelAnswerHeader(doc, {
        qNum: 1,
        marks: 10,
        timeMins: 8,
        words: 150,
        paper: "General Studies Paper II",
        unit: "Unit II: Social Issues",
        topic: "Women Empowerment & Higher Education GER",
        pageAllotted: "1 ½",
        pageNum: 1,
        totalPages: 2,
      });

      // Question Box
      doc.rect(40, 96, 515, 42).lineWidth(1).stroke("#0f172a");
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#b91c1c").text("QUESTION (10 MARKS • WORD LIMIT: ~150 WORDS • SPACE: 1 ½ PAGES):", 46, 101);
      doc
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .fillColor("#0f172a")
        .text('Evaluate the role of the Pudhumai Penn scheme in addressing gender disparity and boosting female Gross Enrolment Ratio (GER) in higher education in Tamil Nadu.', 46, 113, { width: 503 });

      let curY = 146;

      // Introduction (Strictly 4 lines)
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text("Introduction", 40, curY);
      curY += 12;
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#334155")
        .text("Tamil Nadu's developmental trajectory has historically hinged on targeted social welfare interventions to foster inclusive growth. The Pudhumai Penn scheme represents a landmark affirmative intervention aimed at dismantling economic barriers that hinder adolescent girls from transitioning from secondary to tertiary education. By transforming female educational attainment into a tangible household entitlement, Tamil Nadu continues to lead India in social justice indicators.", 40, curY, { width: 515, lineGap: 1.5 });
      curY += 44;

      // Current Affairs Box
      doc.rect(40, curY, 515, 26).fillAndStroke("#eff6ff", "#3b82f6");
      doc
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor("#1d4ed8")
        .text("⚡ [CURRENT AFFAIRS / CORE FOCUS BOX]:", 46, curY + 4);
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor("#1e293b")
        .text("Pudhumai Penn (Moovalur Ramamirtham Ammaiyar Higher Education Assurance Scheme) allocates ₹1,000/month directly into bank accounts of girl students from government schools, backed by a ₹370 Cr budget outlay (2024-25), benefiting over 4.8 lakh collegiate girls.", 46, curY + 14, { width: 503 });
      curY += 34;

      // Subheading 1
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text("1. Financial Independence & Dropout Elimination", 40, curY);
      curY += 12;
      const sh1Points = [
        "1. Mitigates direct and incidental costs of collegiate education (bus fare, textbooks, examination fees).",
        "2. Incentivizes retention in government schools from classes 6 to 12, sharply curbing high-school female dropouts.",
        "3. Financial empowerment via Direct Benefit Transfer (DBT) directly into students' accounts fosters financial literacy.",
        "4. Shifts parental perception from viewing girl children as liabilities to recognizing them as future breadwinners.",
      ];
      sh1Points.forEach((pt) => {
        doc.font("Helvetica").fontSize(7.5).fillColor("#334155").text(pt, 46, curY, { width: 509 });
        curY += 12;
      });

      // Unique Key Box 1
      doc.rect(40, curY, 515, 22).fillAndStroke("#f0fdf4", "#16a34a");
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#15803d").text("💡 [UNIQUE KEY / VALUE ADDITION BOX]:", 46, curY + 3);
      doc.font("Helvetica").fontSize(7).fillColor("#14532d").text("AISHE 2021-22 report confirms Tamil Nadu's female GER reached 52.9%, almost double the national female GER of 27.9%, establishing the state as a national benchmark in gender parity.", 46, curY + 11, { width: 503 });
      curY += 28;

      // Subheading 2
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text("2. Demographic & Socio-Economic Transformation", 40, curY);
      curY += 12;
      const sh2Points = [
        "1. Acts as an institutional deterrent against child marriages by legally requiring continuous college enrollment.",
        "2. Elevates median marriage age, positively impacting maternal mortality (MMR) and infant health outcomes.",
        "3. Expands women's presence in high-wage professional streams, including Polytechnic, Nursing, and Engineering.",
        "4. Directly enhances Female Labour Force Participation Rate (FLFPR) across emerging industrial belts.",
      ];
      sh2Points.forEach((pt) => {
        doc.font("Helvetica").fontSize(7.5).fillColor("#334155").text(pt, 46, curY, { width: 509 });
        curY += 12;
      });

      // Unique Key Box 2
      doc.rect(40, curY, 515, 22).fillAndStroke("#fefce8", "#ca8a04");
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#854d0e").text("💡 [UNIQUE KEY / VALUE ADDITION BOX]:", 46, curY + 3);
      doc.font("Helvetica").fontSize(7).fillColor("#713f12").text("NFHS-5 survey indicates median age at first marriage in Tamil Nadu has risen to 23.4 years, directly correlated with tertiary education retention.", 46, curY + 11, { width: 503 });

      // Footer of Page 1
      doc.font("Helvetica").fontSize(7).fillColor("#94a3b8").text("Page 1 of 2 • 10-Mark Answer continues on next page...", 40, 800, { align: "center", width: 515 });

      // ───────────────────────────────────────────────
      // Page 2 of 10M Model Answer (Top Half = 0.5 Page, then QCAB Cutoff)
      // ───────────────────────────────────────────────
      doc.addPage();
      renderModelAnswerHeader(doc, {
        qNum: 1,
        marks: 10,
        timeMins: 8,
        words: 150,
        paper: "General Studies Paper II",
        unit: "Unit II: Social Issues",
        topic: "Women Empowerment & Higher Education GER",
        pageAllotted: "1 ½",
        pageNum: 2,
        totalPages: 2,
      });

      curY = 96;

      // Subheading 3
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text("3. Institutional Synergy & Future Horizons", 40, curY);
      curY += 12;
      const sh3Points = [
        "1. Complements 'Naan Mudhalvan' upskilling initiative to ensure college graduates possess job-ready digital capabilities.",
        "2. Synergy with 'Vidiyal Payanam' (free bus travel for women) removes daily transportation expenses for collegiate students.",
        "3. Needs integration with localized placement drives in tier-2/tier-3 districts to counter graduate underemployment.",
        "4. Expansion to cover aided school female students ensures complete horizontal equity across rural districts.",
      ];
      sh3Points.forEach((pt) => {
        doc.font("Helvetica").fontSize(7.5).fillColor("#334155").text(pt, 46, curY, { width: 509 });
        curY += 12;
      });

      // Unique Key Box 3
      doc.rect(40, curY, 515, 22).fillAndStroke("#fdf4ff", "#a855f7");
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#7e22ce").text("💡 [UNIQUE KEY / VALUE ADDITION BOX]:", 46, curY + 3);
      doc.font("Helvetica").fontSize(7).fillColor("#581c87").text("Vertical progression into STEM was catalyzed by 'Umayal Aachi' fellowship links, resulting in a 27% increase in women's admissions in government engineering colleges in 2023-24.", 46, curY + 11, { width: 503 });
      curY += 28;

      // Conclusion (Strictly 4 lines)
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text("Conclusion", 40, curY);
      curY += 12;
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#334155")
        .text("The Pudhumai Penn scheme represents a profound paradigm shift from passive social charity to active human capital investment. By guaranteeing sustained higher education for underprivileged women, the state addresses intergenerational poverty at its structural root. Augmenting this scheme with industry-aligned apprenticeships and entrepreneurship incubation will ensure Tamil Nadu's women transition seamlessly from degrees to leadership in economic growth.", 40, curY, { width: 515, lineGap: 1.5 });
      curY += 44;

      // Cutoff Demarcation Box at Y=435 (EXACTLY 1 ½ PAGES COMPLETED!)
      drawCutoffDemarcation(doc, { marks: 10, pageAllotted: "1 ½" });

      // Examiner Matrix & Rough Work
      drawExaminerMatrix(doc, 10);

      doc.font("Helvetica").fontSize(7).fillColor("#94a3b8").text("Page 2 of 2 • 10-Mark Answer Completed (Exactly 1 ½ Pages Allotted)", 40, 800, { align: "center", width: 515 });

      // ───────────────────────────────────────────────
      // SECTION III: MASTER 15-MARK MODEL ANSWER (EXACTLY 2 ½ PAGES)
      // ───────────────────────────────────────────────
      doc.addPage();

      // Page 1 of 15M (Full Page)
      renderModelAnswerHeader(doc, {
        qNum: 2,
        marks: 15,
        timeMins: 12,
        words: 250,
        paper: "General Studies Paper I",
        unit: "Unit I: Modern History of India",
        topic: "Early Uprisings against British Rule",
        pageAllotted: "2 ½",
        pageNum: 1,
        totalPages: 3,
      });

      // Question Box
      doc.rect(40, 96, 515, 42).lineWidth(1).stroke("#0f172a");
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#b91c1c").text("QUESTION (15 MARKS • WORD LIMIT: ~250 WORDS • SPACE: 2 ½ PAGES):", 46, 101);
      doc
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .fillColor("#0f172a")
        .text('Critically examine the South Indian Rebellion of 1799–1801 as the true precursor to the 1857 Sepoy Mutiny, highlighting the military confederacy and the Tiruchirappalli Proclamation.', 46, 113, { width: 503 });

      curY = 146;

      // Introduction
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text("Introduction", 40, curY);
      curY += 12;
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#334155")
        .text("The anti-colonial resistance in Tamil Nadu preceded the Great Uprising of 1857 by over half a century, characterized by armed rebellions that challenged East India Company dominance. Following the fall of Tipu Sultan in 1799 and the execution of Veerapandiya Kattabomman, indigenous chieftains forged a trans-peninsular military alliance. The South Indian Rebellion of 1799–1801 demonstrated military coordination, ideological clarity, and unified resistance against foreign hegemony.", 40, curY, { width: 515, lineGap: 1.5 });
      curY += 44;

      // Current Affairs Box
      doc.rect(40, curY, 515, 26).fillAndStroke("#eff6ff", "#3b82f6");
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#1d4ed8").text("⚡ [CURRENT AFFAIRS / CORE FOCUS BOX]:", 46, curY + 4);
      doc.font("Helvetica").fontSize(7.5).fillColor("#1e293b").text("Recent archaeological excavations at Sivagangai and Panchalankurichi forts, alongside Tamil Nadu State Archives publications, have reaffirmed the Tiruchirappalli Proclamation (June 1801) as the first pan-Indian call for united anti-British struggle.", 46, curY + 14, { width: 503 });
      curY += 34;

      // Subheading 1
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text("1. Genesis & Oppressive Poligar System Breakdown", 40, curY);
      curY += 12;
      const sh15_1 = [
        "1. Deprivation of traditional sovereign authority: The Nawab of Arcot ceded tax collection rights to the English Company.",
        "2. Coercive kist (tribute) collection by British collectors sparked acute agrarian discontent among ryots and poligars.",
        "3. Arbitrary abolition of the age-old 'Kaval' policing system dismantled traditional local security institutions.",
        "4. Demolition of poligar forts and confiscation of weapons provoked deep military resentment across Tirunelveli.",
        "5. Martyrdom of Kattabomman at Kayathar (October 1799) acted as an enduring emotional catalyst for widespread rebellion.",
      ];
      sh15_1.forEach((pt) => {
        doc.font("Helvetica").fontSize(7.5).fillColor("#334155").text(pt, 46, curY, { width: 509 });
        curY += 12;
      });

      // Unique Key Box 1
      doc.rect(40, curY, 515, 22).fillAndStroke("#f0fdf4", "#16a34a");
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#15803d").text("💡 [UNIQUE KEY / VALUE ADDITION BOX]:", 46, curY + 3);
      doc.font("Helvetica").fontSize(7).fillColor("#14532d").text("The Treaty of 1792 between the Nawab of Arcot and Company altered South Indian geopolitics by legalizing direct British armed intervention in internal poligar administration.", 46, curY + 11, { width: 503 });
      curY += 28;

      // Subheading 2
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text("2. The Trans-Peninsular Military Confederacy", 40, curY);
      curY += 12;
      const sh15_2 = [
        "1. Formed under the leadership of Marudu Pandiyar (Chinna Marudu) of Sivagangai, transcending clan rivalries.",
        "2. Allied with Gopala Nayak of Dindigul, commander of the Dindigul League, securing strategic hill fortress redoubts.",
        "3. Integrated Kerala Varma (Pazhassi Raja) of Malabar, expanding the war theater across the Western Ghats.",
        "4. Enlisted Krishnappa Nayak of Belur and Dhondia Wagh of Shimoga, cutting British supply corridors to Mysore.",
        "5. Seamless tactical liaison with Oomaithurai and Sevathaiah upon their dramatic escape from Palayamkottai prison.",
      ];
      sh15_2.forEach((pt) => {
        doc.font("Helvetica").fontSize(7.5).fillColor("#334155").text(pt, 46, curY, { width: 509 });
        curY += 12;
      });

      // Unique Key Box 2
      doc.rect(40, curY, 515, 22).fillAndStroke("#fefce8", "#ca8a04");
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#854d0e").text("💡 [UNIQUE KEY / VALUE ADDITION BOX]:", 46, curY + 3);
      doc.font("Helvetica").fontSize(7).fillColor("#713f12").text("Secret conclaves at Kamudhi and Dindigul in April 1800 established encrypted communication channels via couriers disguised as wandering Shaivite sanyasis.", 46, curY + 11, { width: 503 });

      doc.font("Helvetica").fontSize(7).fillColor("#94a3b8").text("Page 1 of 3 • 15-Mark Answer continues on next page...", 40, 800, { align: "center", width: 515 });

      // ───────────────────────────────────────────────
      // Page 2 of 15M (Full Page with Diagram Box)
      // ───────────────────────────────────────────────
      doc.addPage();
      renderModelAnswerHeader(doc, {
        qNum: 2,
        marks: 15,
        timeMins: 12,
        words: 250,
        paper: "General Studies Paper I",
        unit: "Unit I: Modern History of India",
        topic: "Early Uprisings against British Rule",
        pageAllotted: "2 ½",
        pageNum: 2,
        totalPages: 3,
      });

      curY = 96;

      // Subheading 3
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text("3. Ideological Zenith – The Tiruchirappalli Proclamation (June 1801)", 40, curY);
      curY += 12;
      const sh15_3 = [
        "1. Drafted by Marudu Pandiyar and affixed prominently on the gates of the Nawab's palace and the Srirangam Temple.",
        "2. Represented the earliest political manifesto explicitly calling on Hindus and Muslims to unite against English rule.",
        "3. Exhorted native soldiers serving in British regiments to turn their muskets against their alien commanding officers.",
        "4. Denounced the Company as usurpers depleting native wealth, contrasting foreign greed with indigenous dharma.",
      ];
      sh15_3.forEach((pt) => {
        doc.font("Helvetica").fontSize(7.5).fillColor("#334155").text(pt, 46, curY, { width: 509 });
        curY += 11;
      });

      // Visual Diagram Box
      doc.rect(40, curY, 515, 62).fillAndStroke("#f8fafc", "#475569");
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#1e293b").text("VISUAL ARCHITECTURE: THE 1799–1801 SOUTHERN CONFEDERACY AXIS", 45, curY + 4, { align: "center", width: 505 });
      
      const diagLines = [
        "   [ Sivagangai Base: Marudu Brothers ] ────── [ Dindigul League: Gopala Nayak ]",
        "                      │                                           │",
        "                      ▼                                           ▼",
        "   [ Tirunelveli: Oomaithurai / Kattabomman ] ──── [ Malabar Axis: Pazhassi Raja ]",
        "                      │                                           │",
        "                      ▼                                           ▼",
        "      ═══════════► IDEOLOGICAL MANIFESTO: TIRUCHIRAPPALLI PROCLAMATION (1801) ◄═══════════",
      ];
      let dy = curY + 16;
      diagLines.forEach((dl) => {
        doc.font("Courier-Bold").fontSize(6.8).fillColor("#0f172a").text(dl, 45, dy);
        dy += 9;
      });
      curY += 70;

      // Subheading 4
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text("4. Guerrilla Warfare & British Counter-Offensive", 40, curY);
      curY += 12;
      const sh15_4 = [
        "1. Insurgents utilized Kalayar Kovil dense forest jungles and Siruvayal hills for protracted hit-and-run guerrilla combat.",
        "2. British deployed veteran military forces commanded by Col. Agnew, Col. Innes, and Col. Macaulay with heavy artillery.",
        "3. Naval blockades sealed the Palk Strait, effectively severing supplies and ammunition shipments from Sri Lankan allies.",
        "4. Enforced scorched-earth tactics, burning standing crops and civilian hamlets to starve out rebel contingents.",
        "5. Panchalankurichi fort was besieged, stormed, and razed to the ground, with salt sown over its foundations.",
      ];
      sh15_4.forEach((pt) => {
        doc.font("Helvetica").fontSize(7.5).fillColor("#334155").text(pt, 46, curY, { width: 509 });
        curY += 11;
      });

      // Unique Key Box 4
      doc.rect(40, curY, 515, 22).fillAndStroke("#fef2f2", "#ef4444");
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#b91c1c").text("💡 [UNIQUE KEY / VALUE ADDITION BOX]:", 46, curY + 3);
      doc.font("Helvetica").fontSize(7).fillColor("#7f1d1d").text("Col. Agnew admitted in military dispatches that the insurgents displayed artillery precision and tactical synchronization exceeding any resistance previously encountered.", 46, curY + 11, { width: 503 });
      curY += 28;

      // Subheading 5
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text("5. Suppression & Annexation: The Carnatic Treaty of 1801", 40, curY);
      curY += 12;
      const sh15_5 = [
        "1. Marudu Pandiyar brothers captured and executed at Tiruppathur Fort on 24 October 1801 alongside their lieutenants.",
        "2. Oomaithurai and Sevathaiah beheaded at Panchalankurichi; over 73 rebel commanders deported to Penang (Prince of Wales Island).",
        "3. Carnatic Treaty signed on 31 July 1801: British completely annexed Tamil Nadu, dissolving the Nawab's political rule.",
        "4. Complete demilitarization of poligars, with hereditary armed retinues abolished and replaced by Zamindari settlements.",
      ];
      sh15_5.forEach((pt) => {
        doc.font("Helvetica").fontSize(7.5).fillColor("#334155").text(pt, 46, curY, { width: 509 });
        curY += 11;
      });

      // Unique Key Box 5
      doc.rect(40, curY, 515, 20).fillAndStroke("#f0fdf4", "#16a34a");
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#15803d").text("💡 [UNIQUE KEY / VALUE ADDITION BOX]:", 46, curY + 2);
      doc.font("Helvetica").fontSize(7).fillColor("#14532d").text("The Carnatic Treaty of 1801 formally terminated sovereign Tamil poligar rule, bringing Tamil Nadu directly under the Madras Presidency.", 46, curY + 10, { width: 503 });

      doc.font("Helvetica").fontSize(7).fillColor("#94a3b8").text("Page 2 of 3 • 15-Mark Answer concludes on next half page...", 40, 800, { align: "center", width: 515 });

      // ───────────────────────────────────────────────
      // Page 3 of 15M (Top Half = 0.5 Page, then QCAB Cutoff)
      // ───────────────────────────────────────────────
      doc.addPage();
      renderModelAnswerHeader(doc, {
        qNum: 2,
        marks: 15,
        timeMins: 12,
        words: 250,
        paper: "General Studies Paper I",
        unit: "Unit I: Modern History of India",
        topic: "Early Uprisings against British Rule",
        pageAllotted: "2 ½",
        pageNum: 3,
        totalPages: 3,
      });

      curY = 96;

      // Subheading 6
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text("6. Historiographical Significance as Precursor to 1857", 40, curY);
      curY += 12;
      const sh15_6 = [
        "1. Demolishes the colonial narrative that armed resistance began only in 1857; South India fought a unified war 56 years earlier.",
        "2. Shared military DNA: Disbanded poligar soldiers formed the core of the native sepoy regiments that triggered the 1806 Vellore Mutiny.",
        "3. Pan-religious fraternity: Anticipated the Hindu-Muslim unity of the 1857 revolt by synthesizing local faiths into a joint anti-British crusade.",
        "4. Transition from localized feudal protests into a broader ideological war for self-determination and territorial sovereignty.",
      ];
      sh15_6.forEach((pt) => {
        doc.font("Helvetica").fontSize(7.5).fillColor("#334155").text(pt, 46, curY, { width: 509 });
        curY += 12;
      });

      // Unique Key Box 6
      doc.rect(40, curY, 515, 22).fillAndStroke("#fdf4ff", "#a855f7");
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#7e22ce").text("💡 [UNIQUE KEY / VALUE ADDITION BOX]:", 46, curY + 3);
      doc.font("Helvetica").fontSize(7).fillColor("#581c87").text("Eminent historian Prof. K. Rajayyan in 'South Indian Rebellion: The First War of Independence' conclusively proved the rebellion was a synchronized national war.", 46, curY + 11, { width: 503 });
      curY += 28;

      // Conclusion (Strictly 4 lines)
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text("Conclusion", 40, curY);
      curY += 12;
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#334155")
        .text("The South Indian Rebellion of 1799–1801 was not an isolated outburst of discontent, but an organized revolutionary war against European colonialism. Though crushed by superior British naval resources and artillery, the spirit of defiance survived through songs and folk ballads. It directly ignited the spark for the 1806 Vellore Mutiny, cementing Tamil Nadu's rightful place in the frontline of India's long march to freedom.", 40, curY, { width: 515, lineGap: 1.5 });
      curY += 44;

      // Cutoff Demarcation Box at Y=435 (EXACTLY 2 ½ PAGES COMPLETED!)
      drawCutoffDemarcation(doc, { marks: 15, pageAllotted: "2 ½" });

      // Examiner Matrix & Rough Work
      drawExaminerMatrix(doc, 15);

      doc.font("Helvetica").fontSize(7).fillColor("#94a3b8").text("Page 3 of 3 • 15-Mark Answer Completed (Exactly 2 ½ Pages Allotted)", 40, 800, { align: "center", width: 515 });

      // ───────────────────────────────────────────────
      // SECTION IV: CANDIDATE'S ACTIVE SESSION ANSWER (IF PRESENT)
      // ───────────────────────────────────────────────
      if (items.length > 0) {
        items.forEach((item, itemIdx) => {
          const is10M = item.marks === 10;
          const allottedStr = is10M ? "1 ½" : "2 ½";
          const pagesForThisItem = is10M ? 2 : 3;

          for (let pNum = 1; pNum <= pagesForThisItem; pNum++) {
            doc.addPage();
            renderModelAnswerHeader(doc, {
              qNum: itemIdx + 3,
              marks: item.marks || 15,
              timeMins: is10M ? 8 : 12,
              words: is10M ? 150 : 250,
              paper: item.paper || "General Studies",
              unit: item.unit || "Syllabus Practice",
              topic: item.topic || "Current Practice Topic",
              pageAllotted: allottedStr,
              pageNum: pNum,
              totalPages: pagesForThisItem,
            });

            if (pNum === 1) {
              // Question Box
              doc.rect(40, 96, 515, 42).lineWidth(1).stroke("#0f172a");
              doc.font("Helvetica-Bold").fontSize(8).fillColor("#b91c1c").text(`QUESTION (${item.marks || 15} MARKS • SPACE: ${allottedStr} PAGES):`, 46, 101);
              doc
                .font("Helvetica-Bold")
                .fontSize(8.5)
                .fillColor("#0f172a")
                .text(item.question, 46, 113, { width: 503 });

              // Render text chunk
              if (item.modelAnswer) {
                const clean = item.modelAnswer.replace(/<[^>]+>/g, "").trim();
                const part1 = clean.slice(0, 1100);
                doc.font("Helvetica").fontSize(7.5).fillColor("#334155").text(part1, 40, 146, { width: 515, lineGap: 1.5 });
              }
              doc.font("Helvetica").fontSize(7).fillColor("#94a3b8").text(`Page 1 of ${pagesForThisItem} • Continued on next page...`, 40, 800, { align: "center", width: 515 });
            } else if (pNum === pagesForThisItem) {
              // Final Page (Top Half = 0.5 page, then Cutoff)
              if (item.modelAnswer) {
                const clean = item.modelAnswer.replace(/<[^>]+>/g, "").trim();
                const partFinal = clean.slice(is10M ? 1100 : 2200, is10M ? 2000 : 3300);
                doc.font("Helvetica").fontSize(7.5).fillColor("#334155").text(partFinal || clean.slice(0, 800), 40, 96, { width: 515, lineGap: 1.5 });
              }

              drawCutoffDemarcation(doc, { marks: item.marks || 15, pageAllotted: allottedStr });
              drawExaminerMatrix(doc, item.marks || 15);
              doc.font("Helvetica").fontSize(7).fillColor("#94a3b8").text(`Page ${pNum} of ${pagesForThisItem} • Completed (${allottedStr} Pages Allotted)`, 40, 800, { align: "center", width: 515 });
            } else {
              // Middle Page (Page 2 for 15M)
              if (item.modelAnswer) {
                const clean = item.modelAnswer.replace(/<[^>]+>/g, "").trim();
                const part2 = clean.slice(1100, 2200);
                doc.font("Helvetica").fontSize(7.5).fillColor("#334155").text(part2, 40, 96, { width: 515, lineGap: 1.5 });
              }
              doc.font("Helvetica").fontSize(7).fillColor("#94a3b8").text(`Page 2 of 3 • Concludes on next half page...`, 40, 800, { align: "center", width: 515 });
            }
          }
        });
      }

      doc.end();

      writeStream.on("finish", () => {
        resolve(filePath);
      });

      writeStream.on("error", (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateQCABPdf,
  generateRevisionBiblePdf,
};
