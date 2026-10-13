/**
 * END-TO-END TEST: Model Answer Font Size + Notion Save + PDF Merge
 * Run: node test_full_pipeline.js
 */
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { generateMarkedCoverPdf, generateModelAnswerPdf, mergeEvaluationPdfs } = require("./qcab_result_pdf");
const { saveSession } = require("./notion");

const SAMPLE_QUESTION = "Analyse the major recommendations of Macaulay's Minute of Indian Education.";
const SAMPLE_ANSWER = `INTRODUCTION
Macaulay's Minute of Education (1835) was a landmark colonial policy document that fundamentally transformed the Indian educational landscape. Lord Macaulay, as the Law Member of the Governor General's Council, argued for replacing traditional oriental learning with western scientific knowledge. It prioritised English as the medium of instruction and laid the foundation for modern Indian education. This document had both immediate administrative goals and long-term cultural consequences for colonial India.

[CURRENT AFFAIRS BOX]: The National Education Policy 2020 explicitly debates the colonial legacy of Macaulay's Minute, calling for mother tongue-based learning at primary levels — a direct reversal of Macaulay's English-medium doctrine.

1. ENGLISH AS MEDIUM OF INSTRUCTION
  • Macaulay advocated English replacing Persian and Sanskrit as the official and educational language.
  • Argued that a class of Indians "Indian in blood and colour, but English in taste, opinions, morals and intellect" was needed for administration.
  • Recommended that funds from the 1813 Charter Act be redirected from oriental to English education.
  • Warren Hastings' Calcutta Madrasa (1781) and Sanskrit College (1791) were effectively sidelined by this policy.
  [VALUE ADDITION]: Wood's Dispatch of 1854 built directly on Macaulay's Minute, establishing a formal university system in Calcutta, Bombay and Madras — making it the foundational document of modern Indian university education.

2. DOWNWARD FILTRATION THEORY
  • Education was to "filter down" from the elite English-educated class to the masses over time.
  • Priority was given to higher education over mass primary education — a major long-term failure.
  • Created a sharp divide between the English-educated babu class and vernacular-educated rural masses.
  • Led to acute urban-rural educational disparity that persisted well into post-independence India.
  [VALUE ADDITION]: The Sergeant Report (1944) later critiqued the filtration theory, recommending universal primary education — acknowledging the failures of Macaulay's top-down approach.

3. REJECTION OF ORIENTAL KNOWLEDGE
  • Macaulay famously claimed "a single shelf of a good European library is worth the whole native literature of India."
  • Oriental classics in Arabic, Sanskrit and Persian were deemed inferior to western scientific literature.
  • Traditional gurukul, madrasa and pathshala systems lost state patronage and funding.
  • Indigenous knowledge systems in astronomy, medicine (Ayurveda) and mathematics were marginalised.
  [VALUE ADDITION]: Raja Ram Mohan Roy, despite supporting English education, criticised Macaulay's wholesale rejection of Sanskrit learning, demanding a balanced synthesis of eastern and western knowledge.

4. CREATION OF ADMINISTRATIVE CLASS
  • The minute aimed to produce English-literate Indians to fill lower rungs of colonial bureaucracy cost-effectively.
  • Government service was tied to English proficiency — incentivising elite adoption of English medium schools.
  • Led to the emergence of the Indian middle class as a distinct socio-political entity by the late 19th century.
  • This educated class eventually became the leadership backbone of the Indian independence movement.
  [VALUE ADDITION]: Ironically, Macaulay's minute produced the very educated class — Gokhale, Tilak, Gandhi, Nehru — that articulated and led the demand for self-rule from the colonisers.

5. IMPACT ON VERNACULAR LANGUAGES
  • Regional languages were denied official recognition in higher education and government functions.
  • Vernacular press and literature movements emerged as counter-movements (e.g., Tamil Sangam revival).
  • The 1882 Hunter Commission later acknowledged vernacular education needs — a partial correction.
  • Language-based identity movements in Maharashtra, Bengal and Tamil Nadu trace roots to this period.
  [VALUE ADDITION]: The formation of the Sahitya Akademi (1954) post-independence was partly a deliberate effort to restore dignity to regional languages that Macaulay's minute had systematically marginalised.

CONCLUSION
Macaulay's Minute, while pragmatically efficient for colonial administration, imposed a civilisational hierarchy that devalued India's own intellectual traditions. It created an educated class that paradoxically became the instrument of national liberation. The NEP 2020's emphasis on mother tongue learning and integration of traditional knowledge systems (STEM + classical arts) represents a conscious post-colonial corrective. A truly inclusive education system must honour both scientific temper and India's diverse knowledge heritage.

Word count: ~310 words`;

const SAMPLE_EVALUATION = {
  total_marks: 11.5,
  max_marks: 15,
  overall_feedback: "Well-structured answer with good historical context. The downward filtration theory and impact on vernaculars were well articulated. Value additions were accurate.",
  evaluation: {
    introduction: { marks_awarded: 2.5, max_marks: 3, feedback: "Clear theme establishment." },
    body:         { marks_awarded: 5.5, max_marks: 7, feedback: "Good subheadings and points coverage." },
    conclusion:   { marks_awarded: 2.0, max_marks: 3, feedback: "Forward looking with NEP 2020 connection." },
    format:       { marks_awarded: 0.8, max_marks: 1, feedback: "Proper 12-rule structure adhered." },
    language:     { marks_awarded: 0.7, max_marks: 1, feedback: "Academic and precise." },
  },
};

async function runEndToEndTest() {
  console.log("==================================================================");
  console.log("🧪 TESTING: MODEL ANSWER SHEET (INCREASED FONT) + NOTION SAVE");
  console.log("==================================================================");

  // 1. Generate Marked Cover PDF
  console.log("\n📄 1/3: Generating Marked Cover PDF...");
  const markedCoverPath = await generateMarkedCoverPdf({
    question: SAMPLE_QUESTION,
    marks: 15,
    topic: "Modern History: Colonial Education Policy",
    paperCode: "Paper II",
    qNum: 1,
    evaluation: SAMPLE_EVALUATION,
  });
  console.log(`   ✔ Cover PDF created: ${path.basename(markedCoverPath)}`);

  // 2. Generate Model Answer PDF (with larger text on QCAB lined pages)
  console.log("\n📄 2/3: Generating Model Answer PDF (larger font on ruled QCAB lines)...");
  const modelAnswerPath = await generateModelAnswerPdf({
    question: SAMPLE_QUESTION,
    marks: 15,
    topic: "Modern History: Colonial Education Policy",
    paperCode: "Paper II",
    qNum: 1,
    modelAnswer: SAMPLE_ANSWER,
  });
  console.log(`   ✔ Model Answer PDF created: ${path.basename(modelAnswerPath)}`);

  // 3. Merge PDFs
  console.log("\n📎 3/3: Merging Cover + Model Answer...");
  const mergedPath = await mergeEvaluationPdfs({
    markedCoverPath,
    modelAnswerPath,
  });
  console.log(`   ✔ Merged Result PDF created: ${mergedPath}`);

  // 4. Save Model Answer + Evaluation into Notion
  console.log("\n📓 Saving Model Answer & Evaluation to Notion...");
  const evalSummary = [
    `Score: ${SAMPLE_EVALUATION.total_marks} / ${SAMPLE_EVALUATION.max_marks} Marks (A - GOOD ✅)`,
    `Introduction: ${SAMPLE_EVALUATION.evaluation.introduction.marks_awarded}/${SAMPLE_EVALUATION.evaluation.introduction.max_marks}`,
    `Main Content: ${SAMPLE_EVALUATION.evaluation.body.marks_awarded}/${SAMPLE_EVALUATION.evaluation.body.max_marks}`,
    `Conclusion: ${SAMPLE_EVALUATION.evaluation.conclusion.marks_awarded}/${SAMPLE_EVALUATION.evaluation.conclusion.max_marks}`,
    `12-Rule Format: ${SAMPLE_EVALUATION.evaluation.format.marks_awarded}/${SAMPLE_EVALUATION.evaluation.format.max_marks}`,
    `Language: ${SAMPLE_EVALUATION.evaluation.language.marks_awarded}/${SAMPLE_EVALUATION.evaluation.language.max_marks}`,
    `Feedback: ${SAMPLE_EVALUATION.overall_feedback}`,
  ].join("\n");

  const notionRes = await saveSession({
    question: SAMPLE_QUESTION,
    marks: 15,
    words: 250,
    modelAnswer: SAMPLE_ANSWER,
    evaluation: evalSummary,
    topic: "Colonial Education Policy",
    unitId: "GS1_U1",
  });

  console.log("\n==================================================================");
  console.log("🎉 ALL TESTS PASSED!");
  console.log("==================================================================");
  console.log(`📁 PDF File: ${mergedPath}`);
  console.log(`🔗 Notion URL: ${notionRes.url}`);
  console.log("==================================================================");

  // Auto-open PDF on screen
  const { exec } = require("child_process");
  exec(`start "" "${mergedPath}"`);
}

runEndToEndTest().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
