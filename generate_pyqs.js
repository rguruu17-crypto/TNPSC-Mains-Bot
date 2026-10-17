#!/usr/bin/env node
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const {
  EXAM_YEARS,
  loadArchive,
  getStats,
  generateSinglePYQ,
  batchGeneratePYQs,
  compileMasterBookletPdf,
  STATE_FILE,
} = require("./pyq_archive_manager");
const { getRandomTopic, SYLLABUS_TOPICS } = require("./syllabus");

function printHelp() {
  console.log(`
========================================================================
🏛️  TNPSC MAINS PREVIOUS YEAR QUESTIONS (PYQ) ARCHIVE GENERATOR
========================================================================
Generates authentic TNPSC Group-1 Mains Previous Year Questions from 2012 
up to current years with official 12-rule model answers, Notion sync, 
ruled QCAB PDFs, and structured Markdown/JSON compendiums.

Usage:
  node generate_pyqs.js [options]
  npm run pyqs -- [options]

Options:
  --year=<YYYY>         Generate for a specific exam year (e.g. --year=2022)
  --years=<list>        Comma-separated exam years (e.g. --years=2012,2015,2019,2022)
  --startYear=<YYYY>    Start from this year (default: 2012)
  --endYear=<YYYY>      End at this year (default: 2024)
  --paper=<GS1|GS2|GS3> Filter by General Studies paper (default: all)
  --limit=<N>           Stop after generating N questions (useful for testing)
  --skip-notion         Skip saving to Notion workspace
  --skip-pdf            Skip generating ruled QCAB answer PDFs
  --compile-pdf         Compile all archived PDFs into a master booklet
  --stats               Print statistics of current PYQ archive
  --reset-state         Reset generator checkpoint state
  --sample              Generate 1 sample question per available exam year (2012-2024)
  --help                Show this help message

Exam Years Supported:
  ${EXAM_YEARS.join(", ")}
========================================================================
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  // 1. Stats command
  if (args.includes("--stats")) {
    const stats = getStats();
    console.log("\n========================================================");
    console.log("📊 TNPSC MAINS PYQ ARCHIVE STATISTICS");
    console.log("========================================================");
    console.log(`Total PYQs in Archive:   ${stats.total}`);
    console.log(`Notion Pages Synced:     ${stats.totalNotion}`);
    console.log(`QCAB PDFs Generated:     ${stats.totalPdfs}`);
    console.log(`\n📅 Breakdown by Exam Year:`);
    for (const y of stats.yearsCovered) {
      console.log(`  • ${y}: ${stats.byYear[y] || 0} questions`);
    }
    console.log(`\n📚 Breakdown by Paper:`);
    for (const [p, c] of Object.entries(stats.byPaper)) {
      console.log(`  • ${p}: ${c} questions`);
    }
    console.log(`\n📁 Archive Files:`);
    console.log(`  • JSON:     ${stats.archivePath}`);
    console.log(`  • Markdown: ${stats.markdownPath}`);
    console.log("========================================================\n");
    return;
  }

  // 2. Reset state
  if (args.includes("--reset-state")) {
    if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
      console.log("✔ Generator state reset successfully. Future runs will start fresh.");
    } else {
      console.log("✔ No existing state file found.");
    }
    return;
  }

  // 3. Compile Master PDF booklet
  if (args.includes("--compile-pdf")) {
    console.log("\n📄 Compiling Master QCAB Revision Booklet...");
    const yearArg = args.find((a) => a.startsWith("--year="))?.split("=")[1];
    const paperArg = args.find((a) => a.startsWith("--paper="))?.split("=")[1];

    try {
      const res = await compileMasterBookletPdf({
        year: yearArg,
        paper: paperArg,
      });
      console.log(`\n✅ Compilation Complete!`);
      console.log(`   Booklet:   ${res.filePath}`);
      console.log(`   Questions: ${res.questionsIncluded}`);
      console.log(`   Pages:     ${res.totalPages}\n`);
    } catch (err) {
      console.error(`❌ PDF Compilation Failed: ${err.message}`);
    }
    return;
  }

  // 4. Sample generation across years
  const isSample = args.includes("--sample");
  const saveToNotion = !args.includes("--skip-notion");
  const generatePdf = !args.includes("--skip-pdf");

  // Determine target years
  let targetYears = EXAM_YEARS;
  const yearArg = args.find((a) => a.startsWith("--year="))?.split("=")[1];
  const yearsArg = args.find((a) => a.startsWith("--years="))?.split("=")[1];
  const startYearArg = args.find((a) => a.startsWith("--startYear="))?.split("=")[1];
  const endYearArg = args.find((a) => a.startsWith("--endYear="))?.split("=")[1];

  if (yearArg) {
    targetYears = [parseInt(yearArg, 10)];
  } else if (yearsArg) {
    targetYears = yearsArg.split(",").map((y) => parseInt(y.trim(), 10));
  } else if (startYearArg || endYearArg) {
    const sYear = parseInt(startYearArg || "2012", 10);
    const eYear = parseInt(endYearArg || "2024", 10);
    targetYears = EXAM_YEARS.filter((y) => y >= sYear && y <= eYear);
  }

  // Determine target papers
  const paperArg = args.find((a) => a.startsWith("--paper="))?.split("=")[1];
  let targetPapers = null;
  if (paperArg) {
    targetPapers = [paperArg];
  }

  // Determine limit
  const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
  let limit = limitArg ? parseInt(limitArg, 10) : null;

  if (isSample && !limit) {
    limit = targetYears.length; // 1 per year
  }

  console.log("\n========================================================");
  console.log("🚀 STARTING TNPSC MAINS PYQ GENERATOR (2012 - PRESENT)");
  console.log("========================================================");
  console.log(`Target Years:      ${targetYears.join(", ")}`);
  console.log(`Target Papers:     ${targetPapers ? targetPapers.join(", ") : "All (GS I, GS II, GS III)"}`);
  console.log(`Questions Limit:   ${limit ? limit : "Full Coverage"}`);
  console.log(`Notion Sync:       ${saveToNotion ? "Enabled ✔" : "Disabled ✖"}`);
  console.log(`Ruled QCAB PDF:    ${generatePdf ? "Enabled ✔" : "Disabled ✖"}`);
  console.log("========================================================\n");

  if (isSample) {
    console.log(`[Sample Mode] Generating 1 authentic PYQ with model answer per target exam year...`);
    const results = [];
    for (let i = 0; i < targetYears.length; i++) {
      const year = targetYears[i];
      const randomTopic = getRandomTopic();
      console.log(`\n▶ [${i + 1}/${targetYears.length}] Generating ${year} PYQ for Topic: "${randomTopic.topic}"...`);

      try {
        const item = await generateSinglePYQ({
          year,
          topicObj: randomTopic,
          marks: 15,
          saveToNotion,
          generatePdf,
          onProgress: (m) => console.log(`   ${m}`),
        });
        results.push(item);
        console.log(`   ✔ Question: ${item.question}`);
        if (item.notionUrl) console.log(`   ✔ Notion: ${item.notionUrl}`);
        if (item.pdfPath) console.log(`   ✔ PDF: ${path.basename(item.pdfPath)}`);
      } catch (err) {
        console.error(`   ✖ Failed for ${year}:`, err.message);
      }
    }

    console.log("\n========================================================");
    console.log(`✅ Sample run completed: Generated ${results.length} PYQs across ${targetYears.length} years!`);
    console.log("========================================================\n");
    return;
  }

  // Standard Batch Run
  const outcome = await batchGeneratePYQs({
    years: targetYears,
    papers: targetPapers,
    limit,
    saveToNotion,
    generatePdf,
    onProgress: (info) => {
      if (info.message) {
        console.log(`\n${info.message}`);
      } else if (info.detail) {
        console.log(`   ${info.detail}`);
      }
    },
  });

  console.log("\n========================================================");
  console.log("🎉 BATCH GENERATION SUMMARY");
  console.log("========================================================");
  console.log(`New Questions Generated: ${outcome.generatedCount}`);
  console.log(`Total PYQs in Archive:   ${outcome.totalInArchive}`);
  console.log(`Archive JSON:            ${path.join(__dirname, "data", "pyqs_archive.json")}`);
  console.log(`Archive Markdown:        ${path.join(__dirname, "data", "pyqs_archive.md")}`);
  console.log("========================================================\n");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal generator error:", err);
    process.exit(1);
  });
}

module.exports = { main };
