require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");
const { MODEL_SYSTEM, EVAL_SYSTEM, QUESTION_SYSTEM, PYQ_SYSTEM } = require("./prompts");

let ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function updateGeminiKey(newKey) {
  process.env.GEMINI_API_KEY = newKey;
  ai = new GoogleGenAI({ apiKey: newKey });
  console.log(`[LLM Engine] Gemini AI Key updated in-memory.`);
}

const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-pro-latest",
].filter(Boolean);

async function ask(system, contents, maxTokens = 8192) {
  let lastErr = null;

  for (const model of CANDIDATE_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents,
          config: { systemInstruction: system, maxOutputTokens: maxTokens },
        });
        const text = (res.text || "").trim();
        if (text) return text;
      } catch (err) {
        lastErr = err;
        const isQuotaOrRate = err.status === 429 || (err.message && err.message.toLowerCase().includes("quota"));
        console.warn(`[Auto-Healer LLM] Model '${model}' attempt ${attempt} failed: ${err.status || err.message?.slice(0, 80)}`);
        if (isQuotaOrRate) {
          // Immediately failover to next model in the pool
          break;
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw lastErr || new Error("All candidate Gemini models failed in Auto-Heal engine");
}

const generateQuestion = (topic, marks) =>
  ask(QUESTION_SYSTEM, `Subject/topic: ${topic}\nMarks: ${marks}\nLanguage: English (Generate strictly in English language only. Do NOT use Tamil.)`);

const generatePYQ = (topic, marks = 15, excludeQuestion = "") => {
  const extra = excludeQuestion
    ? `\nIMPORTANT: Ensure this question is completely distinct and tests a different syllabus dimension/sub-theme from: "${excludeQuestion}". Do NOT duplicate.`
    : "";
  return ask(
    PYQ_SYSTEM,
    `Syllabus Topic: ${topic}\nMarks: ${marks}\nLanguage: English (Generate strictly in English language only. Do NOT use Tamil.)${extra}`
  );
};

const modelAnswer = (question, marks, words) =>
  ask(MODEL_SYSTEM, `Question: ${question}\nMarks: ${marks}\nWord limit: ${words}\nLanguage: English (Write strictly in English language only. Do NOT use Tamil.)`);

// answer = { text } or { imageBase64, mediaType } or { pdfBase64, mediaType }
function evaluate(question, marks, words, answer) {
  const header = `Question: ${question}\nMarks: ${marks}\nWord limit: ${words}\n\nStudent's answer:`;
  let contents;

  if (answer.pdfBase64 || answer.mediaType === "application/pdf") {
    const data = answer.pdfBase64 || answer.data;
    contents = [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "application/pdf", data } },
          {
            text: `${header}\n(Attached is the student's submitted PDF answer script. Examine all pages thoroughly, read the handwritten or typed text, and evaluate according to the TNPSC 12-rule criteria.)`,
          },
        ],
      },
    ];
  } else if (answer.imageBase64) {
    contents = [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: answer.mediaType || "image/jpeg", data: answer.imageBase64 } },
          { text: `${header} (handwritten, see image; read it carefully and evaluate)` },
        ],
      },
    ];
  } else {
    contents = `${header}\n${answer.text}`;
  }

  return ask(EVAL_SYSTEM, contents);
}

module.exports = { generateQuestion, generatePYQ, modelAnswer, evaluate, updateGeminiKey };

if (require.main === module) {
  (async () => {
    console.log(`Testing TNPSC Mains LLM module using ${MODEL}...`);
    try {
      console.log("Generating sample question for 'Indian Polity' (15 marks)...");
      const question = await generateQuestion("Indian Polity", 15);
      console.log("\n--- Generated Question ---");
      console.log(question);
      console.log("\n--------------------------\nLLM test completed successfully!");
    } catch (err) {
      console.error("LLM test error:", err);
    }
  })();
}

