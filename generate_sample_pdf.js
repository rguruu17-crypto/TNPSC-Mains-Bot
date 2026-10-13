const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const { generateModelAnswerPdf, generateMarkedCoverPdf } = require("./qcab_result_pdf");

const SAMPLE_ANSWER = `INTRODUCTION
Subramanya Bharathiyar and Subramanya Siva were seminal figures in Tamil Nadu's freedom struggle whose complementary talents—Bharathiyar through literary awakening and Siva through oratorical mass mobilization—transformed the anti-colonial resistance into a genuine mass movement.

[CURRENT AFFAIRS BOX]: The Tamil Nadu government recently instituted the Mahakavi Bharathiyar Memorial Day and renovated Subramanya Siva's memorial in Papparapatti, reaffirming their enduring relevance to modern patriotic civic education.

1. BHARATHIYAR'S UNIQUE METHODS & MASS MOBILIZATION
  • Bharathiyar used simple, yet powerful Tamil, making nationalist ideas comprehensible and relatable to the common people.
  • His songs were memorized and sung widely, fostering a collective sense of patriotism and resistance.
  • He skillfully blended traditional Tamil literary forms with modern political commentary, making his message resonate deeply.
  • Through his journalism (India, Vijaya), he critiqued colonial policies and educated the public on self-rule and human rights.
  [VALUE ADDITION]: Bharathiyar's revolutionary idea of a 'Federal India' with linguistic states, articulated decades before independence, highlighted his foresight in nation-building beyond mere political freedom.

2. SIVA'S DISTINCTIVE STRATEGIES & PUBLIC ENGAGEMENT
  • Siva's primary method was direct public engagement through powerful speeches and street-corner meetings, connecting with ordinary citizens.
  • He advocated for the boycott of foreign goods and the promotion of indigenous industries, embodying the Swadeshi spirit at the grassroots.
  • He organized patriotic processions ('Desa Bhakta Jatha') and rallies, using visual and auditory spectacles to inspire the masses.
  • Siva travelled extensively, spreading the message of national independence and encouraging self-help among villagers.
  [VALUE ADDITION]: Subramanya Siva was the first political prisoner in the Madras Presidency to be charged with sedition, enduring immense hardships in prison, which led him to advocate for significant prison reforms.

3. SACRIFICES AND PIONEERING JOURNALISM
  • Siva published the journal 'Gnana Bhanu' to disseminate radical philosophical and political nationalism across Tamil Nadu.
  • Bharathiyar operated fearlessly from French Pondicherry under severe surveillance to evade British arrest warrants.
  • Both endured extreme poverty, ostracisation, and debilitating imprisonment without compromising patriotic integrity.
  [VALUE ADDITION]: Siva envisioned and worked towards establishing a 'Bharatha Samaj' — a cohesive Indian society free from caste and religious divisions, emphasizing social unity as a prerequisite for national liberation.

CONCLUSION
The synthesis of Bharathiyar's poetic fire and Siva's grassroots agitation catalyzed the Swadeshi movement in Southern India. Their inclusive vision of freedom united political self-rule with social equality, providing an enduring ethical template for the national movement.

Word count: ~255 words`;

async function main() {
  console.log("📄 Generating sample model answer PDF...");
  const pdfPath = await generateModelAnswerPdf({
    question: "Highlight the distinctive roles of Subramanya Bharathi and Subramanya Siva in igniting national consciousness in Tamil Nadu during the Freedom Struggle.",
    marks: 15,
    topic: "Role of Tamil Nadu in Indian National Movement",
    paperCode: "Paper II",
    qNum: 1,
    modelAnswer: SAMPLE_ANSWER,
  });

  console.log(`✅ Model Answer PDF created: ${pdfPath}`);

  console.log("📄 Generating sample evaluated cover PDF...");
  const coverPdfPath = await generateMarkedCoverPdf({
    question: "Examine the role of the Justice Party in laying the foundation of social justice and affirmative action in Tamil Nadu.",
    marks: 15,
    topic: "Examine the role of the Justice...",
    paperCode: "Paper II",
    qNum: 1,
    evaluation: {
      total_marks: 8,
      max_marks: 15,
      word_count_estimate: 210,
      overall_feedback: "Well-structured answer with good points on Communal G.O. (1921 & 1922) and provincial education acts. Could incorporate more administrative details.",
      evaluation: {
        introduction: { marks_awarded: 2, max_marks: 3, comment: "Clear background of the Justice Party" },
        body: { marks_awarded: 3.5, max_marks: 7, comment: "Detailed affirmative policies" },
        conclusion: { marks_awarded: 1, max_marks: 2, comment: "Good link to modern TN reservation policy" },
        format: { marks_awarded: 1, max_marks: 1.5, comment: "Followed 12 rules" },
        language: { marks_awarded: 0.5, max_marks: 1.5, comment: "Clear and standard English" }
      }
    }
  });
  console.log(`✅ Evaluated Cover PDF created: ${coverPdfPath}`);

  // Convert pages to PNG using PyMuPDF
  const artifactDir = "C:/Users/GURUPRASATH/.gemini/antigravity-ide/brain/473ba8b2-9c0a-43d1-bad1-a8c7b316d708";
  const pyScript = `
import pymupdf

# Render Model Answer pages
doc = pymupdf.open(r"${pdfPath}")
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=150)
    out_name = f"${artifactDir}/sample_model_answer_p{i+1}.png"
    pix.save(out_name)
    print(f"Saved: {out_name}")

# Render Cover page
doc_cover = pymupdf.open(r"${coverPdfPath}")
pix_cover = doc_cover[0].get_pixmap(dpi=150)
cover_out_name = f"${artifactDir}/sample_cover_page.png"
pix_cover.save(cover_out_name)
print(f"Saved: {cover_out_name}")
`;

  fs.writeFileSync("render_pages.py", pyScript);
  execSync("python render_pages.py", { stdio: "inherit" });
  if (fs.existsSync("render_pages.py")) fs.unlinkSync("render_pages.py");

  console.log("🎉 Sample conversion complete!");
}

main().catch(console.error);
