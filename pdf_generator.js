/**
 * Official TNPSC QCAB (Question-cum-Answer Booklet) & Revision Bible PDF Generator
 * Uses PDFKit to produce authentic, high-resolution printable PDFs directly in Telegram.
 */

const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "data", "generated_pdfs");
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Generates an authentic TNPSC Group-1 Mains QCAB Printable Booklet PDF
 * Returns absolute path to the generated PDF file.
 */
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

      const totalPages = marks === 15 ? 3 : 2;

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        if (pageNum > 1) {
          doc.addPage();
        }

        // 1. Header Section
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

        if (pageNum === 1) {
          // Candidate Registration Barcode / Box Box
          doc.lineWidth(0.8).rect(40, 102, 330, 28).stroke("#94a3b8");
          doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#1e293b").text("CANDIDATE REGISTER NUMBER:", 46, 107);

          // 8 registration boxes
          let boxX = 180;
          for (let i = 0; i < 8; i++) {
            doc.rect(boxX, 106, 16, 20).stroke("#64748b");
            boxX += 18;
          }

          // Marks and Time Box
          doc.lineWidth(0.8).rect(380, 102, 175, 28).stroke("#94a3b8");
          doc.font("Helvetica-Bold").fontSize(8).fillColor("#0f172a").text(`MAX MARKS: ${marks}`, 388, 107);
          doc.font("Helvetica").fontSize(7.5).fillColor("#475569").text(`TIME ALLOTTED: ${marks === 15 ? "12" : "8"} MINS`, 388, 117);

          // Question Box
          doc.lineWidth(1.2).rect(40, 138, 515, 68).stroke("#0f172a");
          doc
            .font("Helvetica-Bold")
            .fontSize(8.5)
            .fillColor("#b91c1c")
            .text(`QUESTION NO. 1 (${marks} MARKS • ~${marks === 15 ? "250" : "150"} WORDS)`, 48, 144);

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
            .text("Write only inside the margins. Adhere strictly to the 12-rule format: Intro, 5-6 subheadings, unique key boxes, and conclusion.", 46, 217, {
              align: "center",
              width: 503,
            });

          // Draw Margin lines & Writing guide lines
          const startY = 236;
          const endY = 780;
          const leftMarginX = 65;
          const rightMarginX = 530;

          // Side margin lines
          doc.lineWidth(0.8).strokeColor("#cbd5e1");
          doc.moveTo(leftMarginX, startY).lineTo(leftMarginX, endY).stroke();
          doc.moveTo(rightMarginX, startY).lineTo(rightMarginX, endY).stroke();

          // Left margin warning
          doc
            .save()
            .rotate(-90, { origin: [48, 480] })
            .font("Helvetica-Bold")
            .fontSize(6)
            .fillColor("#94a3b8")
            .text("DO NOT WRITE IN THIS MARGIN", 48, 480)
            .restore();

          // Lined writing guides
          doc.lineWidth(0.4).strokeColor("#e2e8f0");
          for (let y = startY + 16; y <= endY; y += 18) {
            doc.moveTo(leftMarginX, y).lineTo(rightMarginX, y).stroke();
          }
        } else {
          // Continuation Pages
          doc.lineWidth(0.8).rect(40, 102, 515, 20).stroke("#cbd5e1");
          doc
            .font("Helvetica-Bold")
            .fontSize(7.5)
            .fillColor("#475569")
            .text(`Q.NO. 1 (CONTINUED) • TOPIC: ${topic.slice(0, 70)}...`, 46, 108);

          const startY = 130;
          const endY = 780;
          const leftMarginX = 65;
          const rightMarginX = 530;

          // Side margin lines
          doc.lineWidth(0.8).strokeColor("#cbd5e1");
          doc.moveTo(leftMarginX, startY).lineTo(leftMarginX, endY).stroke();
          doc.moveTo(rightMarginX, startY).lineTo(rightMarginX, endY).stroke();

          // Left margin warning
          doc
            .save()
            .rotate(-90, { origin: [48, 450] })
            .font("Helvetica-Bold")
            .fontSize(6)
            .fillColor("#94a3b8")
            .text("DO NOT WRITE IN THIS MARGIN", 48, 450)
            .restore();

          // Lined writing guides
          doc.lineWidth(0.4).strokeColor("#e2e8f0");
          for (let y = startY + 16; y <= endY; y += 18) {
            doc.moveTo(leftMarginX, y).lineTo(rightMarginX, y).stroke();
          }
        }

        // Bottom Footer
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .fillColor("#94a3b8")
          .text("TNPSC Group-1 Mains Specialist Bot • Official QCAB Answer Practice Format", 40, 800, {
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

/**
 * Generates the TNPSC Mains Revision Bible PDF compilation
 * Compiles high-yield questions, 12-rule model answers, and policy capsules into a comprehensive print booklet.
 */
function generateRevisionBiblePdf({ items = [], capsules = [] }) {
  return new Promise((resolve, reject) => {
    try {
      const sanitizedName = `TNPSC_Revision_Bible_${Date.now()}.pdf`;
      const filePath = path.join(OUTPUT_DIR, sanitizedName);
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 40, bottom: 40, left: 45, right: 45 },
        autoFirstPage: true,
      });

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // ── COVER PAGE ──
      doc.rect(45, 40, 505, 750).lineWidth(2).stroke("#0f172a");
      doc.rect(50, 45, 495, 740).lineWidth(0.8).stroke("#3b82f6");

      doc.moveDown(5);
      doc
        .font("Helvetica-Bold")
        .fontSize(22)
        .fillColor("#0f172a")
        .text("TNPSC GROUP-1 MAINS", { align: "center" });

      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .fillColor("#2563eb")
        .text("ULTIMATE REVISION BIBLE & CAPSULE COMPENDIUM", { align: "center" });

      doc.moveDown(1);
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#475569")
        .text("12-Rule Answer Writing Blueprint • High-Yield Question Bank • Tamil Nadu Policy Capsules", {
          align: "center",
        });

      doc.moveDown(4);

      // Feature boxes on cover
      const boxY = 320;
      doc.rect(70, boxY, 455, 140).fillAndStroke("#f8fafc", "#cbd5e1");
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#0f172a")
        .text("MANDATORY 12-RULE ANSWER ARCHITECTURE:", 85, boxY + 15);

      const rules = [
        "1. Introduction: Exactly 4 lines + [CURRENT AFFAIRS / CORE FOCUS BOX]",
        "2. Body: 5 to 6 distinct subheadings with 6 points each & bold keywords",
        "3. Standout Box: 1 Unique Key / Value Addition Box under every subheading",
        "4. Conclusion: Exactly 4 to 5 forward-looking lines with a positive Way Forward",
        "5. Visual Presentation: Flowchart, cycle or radial diagram in unruled sheets",
      ];
      let ry = boxY + 35;
      rules.forEach((r) => {
        doc.font("Helvetica").fontSize(8.5).fillColor("#334155").text(r, 90, ry);
        ry += 18;
      });

      doc.moveDown(8);
      doc
        .font("Helvetica-Oblique")
        .fontSize(8)
        .fillColor("#64748b")
        .text("Generated by TNPSC Mains Specialist Bot • Verified against Tamil Nadu Career Services Guidelines", 50, 720, {
          align: "center",
          width: 495,
        });

      // ── SECTION 1: SCHEME & POLICY CAPSULES ──
      doc.addPage();
      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .fillColor("#0f172a")
        .text("SECTION I: TAMIL NADU FLAGSHIP SCHEME CAPSULES", { underline: true });
      doc.moveDown(1);

      capsules.forEach((c, idx) => {
        if (doc.y > 660) doc.addPage();

        doc.rect(45, doc.y, 505, 18).fill("#1e293b");
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor("#ffffff")
          .text(`${idx + 1}. ${c.title.toUpperCase()}`, 50, doc.y - 14);

        doc.moveDown(0.5);
        doc
          .font("Helvetica-Bold")
          .fontSize(8)
          .fillColor("#0f172a")
          .text(`Nodal: ${c.nodal}  |  Outlay: ${c.outlay}`);
        doc.font("Helvetica-Oblique").fontSize(8).fillColor("#475569").text(`Target: ${c.target}`);

        doc.moveDown(0.3);
        doc
          .font("Helvetica-Bold")
          .fontSize(8)
          .fillColor("#2563eb")
          .text("Mains Answer Insertion Points:");
        doc
          .font("Helvetica")
          .fontSize(7.5)
          .fillColor("#1e293b")
          .text(`• Current Affairs Hook: "${c.mainsPlacement.introHook}"`)
          .text(`• Unique Key Differentiator: "${c.mainsPlacement.uniqueKey}"`)
          .text(`• Way Forward: "${c.mainsPlacement.wayForward}"`);

        doc.moveDown(1);
      });

      // ── SECTION 2: HIGH-YIELD MODEL ANSWERS & QUESTIONS ──
      if (items.length > 0) {
        doc.addPage();
        doc
          .font("Helvetica-Bold")
          .fontSize(14)
          .fillColor("#0f172a")
          .text("SECTION II: CURATED 12-RULE MODEL ANSWERS", { underline: true });
        doc.moveDown(1);

        items.forEach((item, idx) => {
          if (doc.y > 640) doc.addPage();

          doc.rect(45, doc.y, 505, 18).fill("#2563eb");
          doc
            .font("Helvetica-Bold")
            .fontSize(9)
            .fillColor("#ffffff")
            .text(`Q${idx + 1}. [${item.marks || 15} MARKS] ${item.topic || "General Studies"}`, 50, doc.y - 14);

          doc.moveDown(0.5);
          doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text(`Question: ${item.question}`);
          doc.moveDown(0.5);

          if (item.modelAnswer) {
            const cleanAnswer = item.modelAnswer.replace(/<[^>]+>/g, "");
            doc.font("Helvetica").fontSize(7.5).fillColor("#334155").text(cleanAnswer.slice(0, 1400) + "...", {
              lineGap: 1.5,
            });
          }

          doc.moveDown(1.5);
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
