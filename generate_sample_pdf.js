const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const { generateModelAnswerPdf } = require("./qcab_result_pdf");

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

  console.log(`✅ PDF created: ${pdfPath}`);

  // Convert pages to PNG using PyMuPDF
  const artifactDir = "C:\\Users\\GURUPRASATH\\.gemini\\antigravity-ide\\brain\\68cdeffa-357c-4297-b104-38cddf5628d9";
  const pyScript = `
import fitz
doc = fitz.open(r"${pdfPath}")
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=150)
    out_name = f"${artifactDir.replace(/\\/g, '/')}/sample_model_answer_p{i+1}.png"
    pix.save(out_name)
    print(f"Saved: {out_name}")
`;

  fs.writeFileSync("render_pages.py", pyScript);
  execSync("python render_pages.py", { stdio: "inherit" });
  if (fs.existsSync("render_pages.py")) fs.unlinkSync("render_pages.py");

  console.log("🎉 Sample conversion complete!");
}

main().catch(console.error);
