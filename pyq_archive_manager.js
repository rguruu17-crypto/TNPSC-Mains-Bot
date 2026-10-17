const fs = require("fs");
const path = require("path");
const { PDFDocument: LibPDF } = require("pdf-lib");
const llm = require("./llm");
const { saveSession, UNIT_METADATA } = require("./notion");
const { SYLLABUS_TOPICS } = require("./syllabus");
const { autoHealRetry, repairStateFile } = require("./auto_healer");
const { generateModelAnswerPdf } = require("./qcab_result_pdf");

// Authentic TNPSC Group-1 Mains Exam cycles from 2012 to current years
const EXAM_YEARS = [2012, 2015, 2016, 2017, 2019, 2022, 2023, 2024];

const DATA_DIR = path.join(__dirname, "data");
const ARCHIVE_FILE = path.join(DATA_DIR, "pyqs_archive.json");
const MARKDOWN_FILE = path.join(DATA_DIR, "pyqs_archive.md");
const STATE_FILE = path.join(DATA_DIR, "pyqs_generator_state.json");
const PDF_DIR = path.join(DATA_DIR, "generated_pdfs");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

const DEFAULT_ARCHIVE = {
  metadata: {
    title: "TNPSC Group-1 Mains Previous Year Questions (2012 - Current Years)",
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    totalQuestions: 0,
    yearsCovered: EXAM_YEARS,
  },
  questions: [],
};

const DEFAULT_STATE = {
  currentIndex: 0,
  completedKeys: {}, // key: `${year}_${topicName}`
  lastRunAt: null,
  totalGenerated: 0,
};

function resolveUnitId(topicObj) {
  const p = (topicObj.paper || "").toLowerCase();
  const u = (topicObj.unit || "").toLowerCase();

  if (p.includes("general studies i") || p.includes("gs1") || p.includes("paper ii")) {
    if (u.includes("history") || u.includes("culture")) return "GS1_U1";
    if (u.includes("social")) return "GS1_U2";
    if (u.includes("ethics")) return "GS1_U3";
    return "GS1_U1";
  }
  if (p.includes("general studies ii") || p.includes("gs2") || p.includes("paper iii")) {
    if (u.includes("polity")) return "GS2_U1";
    if (u.includes("science") || u.includes("technology")) return "GS2_U2";
    if (u.includes("tamil")) return "GS2_U3";
    return "GS2_U1";
  }
  if (p.includes("general studies iii") || p.includes("gs3") || p.includes("paper iv")) {
    if (u.includes("geography")) return "GS3_U1";
    if (u.includes("environment") || u.includes("biodiversity") || u.includes("disaster")) return "GS3_U2";
    if (u.includes("economy")) return "GS3_U3";
    return "GS3_U1";
  }
  return "GS1_U1";
}

function loadArchive() {
  return repairStateFile(ARCHIVE_FILE, DEFAULT_ARCHIVE);
}

function loadState() {
  return repairStateFile(STATE_FILE, DEFAULT_STATE);
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.error("[PYQ Archive] Failed to save state file:", err.message);
  }
}

/**
 * Syncs the in-memory archive to both JSON and formatted Markdown
 */
function saveArchive(archive) {
  archive.metadata.lastUpdated = new Date().toISOString();
  archive.metadata.totalQuestions = archive.questions.length;

  try {
    fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(archive, null, 2), "utf8");
  } catch (err) {
    console.error("[PYQ Archive] Failed to write archive JSON:", err.message);
  }

  // Generate / update Markdown Compendium
  try {
    const md = buildMarkdownCompendium(archive);
    fs.writeFileSync(MARKDOWN_FILE, md, "utf8");
  } catch (err) {
    console.error("[PYQ Archive] Failed to write archive Markdown:", err.message);
  }
}

function buildMarkdownCompendium(archive) {
  const { totalQuestions, lastUpdated } = archive.metadata;
  const questions = archive.questions || [];

  // Group by Year descending
  const byYear = {};
  for (const q of questions) {
    const y = q.year || "Unknown";
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(q);
  }

  const sortedYears = Object.keys(byYear).sort((a, b) => b - a);

  let md = `# 🏛️ TNPSC Group-1 Mains Previous Year Questions Compendium (2012 – Present)

> **Official 12-Rule Model Answers Archive**  
> Total PYQs Archived: **${totalQuestions}** | Last Updated: **${new Date(lastUpdated).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST**

---

## 📊 Overview Statistics by Exam Year

| Exam Year | Questions Archived | Papers Covered | Notion Synced | PDFs Available |
| :--- | :---: | :---: | :---: | :---: |
`;

  for (const y of sortedYears) {
    const list = byYear[y];
    const papers = [...new Set(list.map((item) => item.paper))].join(", ");
    const notionCount = list.filter((item) => item.notionUrl).length;
    const pdfCount = list.filter((item) => item.pdfPath && fs.existsSync(item.pdfPath)).length;
    md += `| **${y}** | ${list.length} | ${papers || "—"} | ${notionCount} | ${pdfCount} |\n`;
  }

  md += `\n---\n\n`;

  // Render question details
  for (const y of sortedYears) {
    md += `## 📅 Exam Year ${y}\n\n`;
    const list = byYear[y];

    list.forEach((item, idx) => {
      md += `### ${idx + 1}. ${item.question}\n\n`;
      md += `- **Paper:** ${item.paper} (${item.unit})\n`;
      md += `- **Syllabus Topic:** ${item.topic}\n`;
      md += `- **Marks:** ${item.marks} Marks | **Target Word Count:** ${item.marks === 10 ? 150 : 250} words\n`;
      if (item.notionUrl) {
        md += `- **Notion Workspace Link:** [Open in Notion](${item.notionUrl})\n`;
      }
      if (item.pdfPath) {
        const basename = path.basename(item.pdfPath);
        md += `- **QCAB Model Answer PDF:** \`data/generated_pdfs/${basename}\`\n`;
      }
      md += `\n#### ✍️ 12-Rule Model Answer:\n\n`;
      md += `\`\`\`text\n${item.modelAnswer.trim()}\n\`\`\`\n\n`;
      md += `---\n\n`;
    });
  }

  return md;
}

/**
 * Returns summary statistics for bot and CLI
 */
function getStats() {
  const archive = loadArchive();
  const questions = archive.questions || [];

  const byYear = {};
  const byPaper = {};
  let totalNotion = 0;
  let totalPdfs = 0;

  for (const q of questions) {
    const y = q.year || "Unknown";
    byYear[y] = (byYear[y] || 0) + 1;

    const p = q.paper || "Unknown";
    byPaper[p] = (byPaper[p] || 0) + 1;

    if (q.notionUrl) totalNotion++;
    if (q.pdfPath && fs.existsSync(q.pdfPath)) totalPdfs++;
  }

  return {
    total: questions.length,
    yearsCovered: EXAM_YEARS,
    byYear,
    byPaper,
    totalNotion,
    totalPdfs,
    archivePath: ARCHIVE_FILE,
    markdownPath: MARKDOWN_FILE,
  };
}

/**
 * Generates a single PYQ with 12-rule model answer, Notion sync, and PDF booklet
 */
async function generateSinglePYQ({
  year,
  topicObj,
  marks = 15,
  saveToNotion = true,
  generatePdf = true,
  onProgress = null,
}) {
  const unitId = resolveUnitId(topicObj);
  const unitMeta = UNIT_METADATA[unitId] || { paper: topicObj.paper, unit: topicObj.unit };
  const fullTopicContext = `${unitMeta.paper} - ${unitMeta.unit}: ${topicObj.topic}`;
  const words = marks === 10 ? 150 : 250;

  if (onProgress) {
    onProgress(`🔍 Pulling authentic ${year} PYQ for '${topicObj.topic}'...`);
  }

  // 1. Generate Authentic Question for Year
  const question = await autoHealRetry(
    async () => {
      return await llm.generatePYQ(fullTopicContext, marks, "", year);
    },
    { maxRetries: 3, operationName: `Pull PYQ (${year})` }
  );

  if (onProgress) {
    onProgress(`✍️ Architecting 12-rule model answer (~${words} words)...`);
  }

  // 2. Generate 12-Rule Model Answer
  const answer = await autoHealRetry(
    async () => {
      return await llm.modelAnswer(question, marks, words);
    },
    { maxRetries: 3, operationName: `Generate Model Answer (${year})` }
  );

  let notionUrl = null;
  let notionPageId = null;

  // 3. Save to Notion
  if (saveToNotion) {
    if (onProgress) onProgress(`📓 Saving to Notion under ${unitMeta.unit}...`);
    try {
      const notionRes = await autoHealRetry(
        async () => {
          return await saveSession({
            question,
            marks,
            words,
            modelAnswer: answer,
            topic: topicObj.topic,
            unitId,
            isPYQ: true,
          });
        },
        { maxRetries: 2, operationName: "Save to Notion" }
      );
      notionUrl = notionRes.url || notionRes.toString();
      notionPageId = notionRes.id;
    } catch (notionErr) {
      console.warn(`[PYQ Archive] Notion sync warning: ${notionErr.message}`);
    }
  }

  // 4. Generate QCAB Ruled Model Answer PDF
  let pdfPath = null;
  if (generatePdf) {
    if (onProgress) onProgress(`📄 Generating QCAB ruled model answer PDF...`);
    try {
      const paperCode = unitMeta.paper.includes("Paper") ? unitMeta.paper : "Paper II";
      pdfPath = await generateModelAnswerPdf({
        question,
        marks,
        topic: topicObj.topic,
        paperCode,
        qNum: 1,
        modelAnswer: answer,
      });
    } catch (pdfErr) {
      console.warn(`[PYQ Archive] PDF generation warning: ${pdfErr.message}`);
    }
  }

  const archiveItem = {
    id: `pyq_${year}_${unitId.toLowerCase()}_${Date.now()}`,
    year: parseInt(year, 10),
    paper: unitMeta.paper,
    unit: unitMeta.unit,
    unitId,
    topic: topicObj.topic,
    marks,
    words,
    question,
    modelAnswer: answer,
    notionUrl,
    notionPageId,
    pdfPath,
    createdAt: new Date().toISOString(),
  };

  // 5. Append to Archive and save
  const archive = loadArchive();
  archive.questions.push(archiveItem);
  saveArchive(archive);

  // 6. Update state
  const state = loadState();
  const compKey = `${year}_${topicObj.topic}`;
  state.completedKeys[compKey] = true;
  state.totalGenerated = (state.totalGenerated || 0) + 1;
  state.lastRunAt = new Date().toISOString();
  saveState(state);

  return archiveItem;
}

/**
 * Batch generate PYQs across years and syllabus topics with checkpoint resume
 */
async function batchGeneratePYQs({
  years = EXAM_YEARS,
  papers = null, // ['GS1', 'GS2', 'GS3']
  limit = null,
  saveToNotion = true,
  generatePdf = true,
  onProgress = null,
} = {}) {
  const archive = loadArchive();
  const state = loadState();

  let targetTopics = SYLLABUS_TOPICS;

  if (papers && papers.length > 0) {
    const paperFilters = papers.map((p) => p.toLowerCase());
    targetTopics = targetTopics.filter((t) => {
      const p = (t.paper || "").toLowerCase();
      return paperFilters.some((f) => p.includes(f));
    });
  }

  const generatedItems = [];
  let count = 0;

  for (const year of years) {
    if (limit && count >= limit) break;

    for (const topicObj of targetTopics) {
      if (limit && count >= limit) break;

      const compKey = `${year}_${topicObj.topic}`;
      // Check if already generated in state
      if (state.completedKeys && state.completedKeys[compKey]) {
        continue;
      }

      // Check if existing in archive
      const exists = (archive.questions || []).some(
        (q) => q.year === parseInt(year, 10) && q.topic.toLowerCase() === topicObj.topic.toLowerCase()
      );
      if (exists) {
        state.completedKeys[compKey] = true;
        saveState(state);
        continue;
      }

      count++;
      if (onProgress) {
        onProgress({
          index: count,
          limit,
          year,
          paper: topicObj.paper,
          unit: topicObj.unit,
          topic: topicObj.topic,
          message: `[${count}${limit ? `/${limit}` : ""}] Generating ${year} PYQ for '${topicObj.topic}'...`,
        });
      }

      try {
        const item = await generateSinglePYQ({
          year,
          topicObj,
          marks: 15,
          saveToNotion,
          generatePdf,
          onProgress: (m) => {
            if (onProgress) onProgress({ detail: m, year, topic: topicObj.topic });
          },
        });
        generatedItems.push(item);

        // Polite delay between Gemini calls to prevent quota exhaustion
        await new Promise((r) => setTimeout(r, 1200));
      } catch (err) {
        console.error(`[PYQ Archive] Error generating for ${year} - ${topicObj.topic}:`, err.message);
        if (onProgress) {
          onProgress({ error: true, message: `Failed: ${err.message}` });
        }
      }
    }
  }

  return {
    generatedCount: generatedItems.length,
    items: generatedItems,
    totalInArchive: loadArchive().questions.length,
  };
}

/**
 * Compiles all individual PDFs in archive into a unified Master Booklet
 */
async function compileMasterBookletPdf({ year = null, paper = null, outputPath = null } = {}) {
  const archive = loadArchive();
  let questions = archive.questions || [];

  if (year) {
    questions = questions.filter((q) => q.year === parseInt(year, 10));
  }
  if (paper) {
    questions = questions.filter((q) => (q.paper || "").toLowerCase().includes(paper.toLowerCase()));
  }

  const validPdfs = questions
    .map((q) => q.pdfPath)
    .filter((p) => p && fs.existsSync(p));

  if (validPdfs.length === 0) {
    throw new Error(`No existing generated PDF files found for compilation (Year: ${year || "All"}, Paper: ${paper || "All"}).`);
  }

  const merged = await LibPDF.create();

  for (const pdfPath of validPdfs) {
    try {
      const bytes = fs.readFileSync(pdfPath);
      const srcDoc = await LibPDF.load(bytes);
      const pageIndices = srcDoc.getPageIndices();
      const pages = await merged.copyPages(srcDoc, pageIndices);
      pages.forEach((page) => merged.addPage(page));
    } catch (err) {
      console.warn(`[PYQ Archive] Skipping corrupted PDF ${pdfPath}: ${err.message}`);
    }
  }

  const filename =
    outputPath ||
    path.join(
      PDF_DIR,
      `TNPSC_Mains_PYQ_Compendium_${year ? `${year}_` : "2012_2024_"}${Date.now().toString().slice(-4)}.pdf`
    );

  const mergedBytes = await merged.save();
  fs.writeFileSync(filename, mergedBytes);

  return {
    filePath: filename,
    totalPages: merged.getPageCount(),
    questionsIncluded: validPdfs.length,
  };
}

module.exports = {
  EXAM_YEARS,
  ARCHIVE_FILE,
  MARKDOWN_FILE,
  STATE_FILE,
  loadArchive,
  saveArchive,
  loadState,
  saveState,
  getStats,
  generateSinglePYQ,
  batchGeneratePYQs,
  compileMasterBookletPdf,
  resolveUnitId,
};
