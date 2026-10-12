require("dotenv").config();
const llm = require("./llm");
const { saveSession, UNIT_METADATA } = require("./notion");
const { getRandomTopic } = require("./syllabus");

const ALL_UNITS = [
  // General Studies I (Paper II)
  {
    paperKey: "GS1",
    unitId: "GS1_U1",
    paperTitle: "General Studies I (Paper II)",
    unitName: "Unit I: Modern History of India and Indian Culture (100 marks)",
    filterKey: "Modern History",
  },
  {
    paperKey: "GS1",
    unitId: "GS1_U2",
    paperTitle: "General Studies I (Paper II)",
    unitName: "Unit II: Social Issues in India and Tamil Nadu (100 marks)",
    filterKey: "Social Issues",
  },
  {
    paperKey: "GS1",
    unitId: "GS1_U3",
    paperTitle: "General Studies I (Paper II)",
    unitName: "Unit III: Ethics and Integrity (50 marks)",
    filterKey: "Ethics",
  },

  // General Studies II (Paper III)
  {
    paperKey: "GS2",
    unitId: "GS2_U1",
    paperTitle: "General Studies II (Paper III)",
    unitName: "Unit I: Indian Polity and Emerging Political Trends across the World affecting India (100 marks)",
    filterKey: "Indian Polity",
  },
  {
    paperKey: "GS2",
    unitId: "GS2_U2",
    paperTitle: "General Studies II (Paper III)",
    unitName: "Unit II: Role and Impact of Science and Technology in the Development of India (100 marks)",
    filterKey: "Science and Technology",
  },
  {
    paperKey: "GS2",
    unitId: "GS2_U3",
    paperTitle: "General Studies II (Paper III)",
    unitName: "Unit III: Tamil Society – Culture and Heritage (50 marks)",
    filterKey: "Tamil Society",
  },

  // General Studies III (Paper IV)
  {
    paperKey: "GS3",
    unitId: "GS3_U1",
    paperTitle: "General Studies III (Paper IV)",
    unitName: "Unit I: General Geography and Geography of India with Special Reference to Tamil Nadu (75 marks)",
    filterKey: "Geography",
  },
  {
    paperKey: "GS3",
    unitId: "GS3_U2",
    paperTitle: "General Studies III (Paper IV)",
    unitName: "Unit II: Environment, Biodiversity and Disaster Management (75 marks)",
    filterKey: "Environment",
  },
  {
    paperKey: "GS3",
    unitId: "GS3_U3",
    paperTitle: "General Studies III (Paper IV)",
    unitName: "Unit III: Indian Economy – Current Economic Trends and Impact of Global Economy on India (100 marks)",
    filterKey: "Economy",
  },
];

/**
 * Automatically generates a high-yield Question and 12-Rule Model Answer
 * and saves it into the target Unit page in Notion with the Question as the page name.
 */
async function generateAndSaveOne({ unitId, specificTopic = null, marks = 15, onProgress = null }) {
  const unitConfig = ALL_UNITS.find((u) => u.unitId === unitId);
  if (!unitConfig) throw new Error(`Unknown unit ID: ${unitId}`);

  const item = specificTopic ? { topic: specificTopic } : getRandomTopic(null, unitConfig.filterKey);
  const fullTopic = `${unitConfig.paperTitle} - ${unitConfig.unitName}: ${item.topic}`;

  if (onProgress) onProgress(`Generating question for ${unitConfig.unitName}... (Topic: ${item.topic})`);
  const question = await llm.generateQuestion(fullTopic, marks);

  if (onProgress) onProgress(`Generating 12-rule model answer...`);
  const words = marks === 10 ? 150 : 250;
  const modelAnswer = await llm.modelAnswer(question, marks, words);

  if (onProgress) onProgress(`Saving to Notion under ${unitConfig.unitName}...`);
  const result = await saveSession({
    question,
    marks,
    words,
    modelAnswer,
    topic: fullTopic,
    unitId,
  });

  return {
    paperTitle: unitConfig.paperTitle,
    unitName: unitConfig.unitName,
    unitId,
    topic: item.topic,
    question,
    modelAnswer,
    notionUrl: result.url || result.toString(),
    notionPageId: result.id,
  };
}

/**
 * Automatically generates questions and answers for all units in GS1, GS2, and GS3
 */
async function generateForAllUnits({ marks = 15, countPerUnit = 1, onProgress = null } = {}) {
  const results = [];
  for (const unit of ALL_UNITS) {
    for (let i = 0; i < countPerUnit; i++) {
      if (onProgress) {
        onProgress(`\n▶ Starting [${unit.paperKey}] ${unit.unitName} (Q ${i + 1}/${countPerUnit})...`);
      }
      try {
        const item = await generateAndSaveOne({
          unitId: unit.unitId,
          marks,
          onProgress,
        });
        results.push(item);
        if (onProgress) {
          onProgress(`✔ Successfully saved to Notion: ${item.notionUrl}`);
        }
      } catch (err) {
        console.error(`Error generating for ${unit.unitId}:`, err);
        if (onProgress) onProgress(`✖ Failed for ${unit.unitId}: ${err.message}`);
      }
    }
  }
  return results;
}

module.exports = {
  ALL_UNITS,
  generateAndSaveOne,
  generateForAllUnits,
};

// Standalone CLI execution
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const paperArg = args.find((a) => a.startsWith("--paper="))?.split("=")[1];
    const unitArg = args.find((a) => a.startsWith("--unit="))?.split("=")[1];

    console.log("==================================================================");
    console.log("TNPSC MAINS AUTOMATIC QUESTION & ANSWER NOTION GENERATOR");
    console.log("==================================================================");

    if (unitArg) {
      console.log(`Generating for single unit: ${unitArg}`);
      const res = await generateAndSaveOne({
        unitId: unitArg,
        onProgress: (m) => console.log(`[INFO] ${m}`),
      });
      console.log(`\nDONE! Page Title: "${res.question.slice(0, 80)}..."`);
      console.log(`Notion Link: ${res.notionUrl}`);
    } else if (paperArg) {
      const unitsInPaper = ALL_UNITS.filter((u) => u.paperKey.toLowerCase() === paperArg.toLowerCase());
      console.log(`Generating for Paper: ${paperArg} (${unitsInPaper.length} units)...`);
      for (const u of unitsInPaper) {
        const res = await generateAndSaveOne({
          unitId: u.unitId,
          onProgress: (m) => console.log(`[INFO] ${m}`),
        });
        console.log(`✔ [${u.unitId}] Saved: ${res.notionUrl}`);
      }
    } else {
      console.log("Generating for ALL 9 Units across GS I, GS II, and GS III...");
      const allResults = await generateForAllUnits({
        onProgress: (m) => console.log(`[PROGRESS] ${m}`),
      });
      console.log(`\n==================================================================`);
      console.log(`Successfully generated and saved ${allResults.length} Questions & Answers in Notion!`);
      console.log(`==================================================================`);
      for (const r of allResults) {
        console.log(`• [${r.unitId}] ${r.question.slice(0, 60)}...`);
        console.log(`  🔗 ${r.notionUrl}\n`);
      }
    }
  })();
}
