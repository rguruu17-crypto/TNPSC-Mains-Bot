require("dotenv").config();
const llm = require("./llm");
const { saveSession, UNIT_METADATA } = require("./notion");
const { ALL_UNITS } = require("./auto_generate");
const { SYLLABUS_TOPICS } = require("./syllabus");

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Fetches and cleans text content from any website or IAS coaching editorial URL.
 */
async function fetchUrlText(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status} (${res.statusText})`);
    }

    const html = await res.text();
    return extractCleanArticle(html, url);
  } catch (err) {
    throw new Error(`Failed to fetch URL (${url}): ${err.message}`);
  }
}

/**
 * Strips script tags, styles, navbars, and boilerplate HTML to isolate the core article text.
 * Specially optimized for IAS coaching websites: Drishti IAS, Vajiram and Ravi, Vision IAS, etc.
 */
function extractCleanArticle(html, fallbackUrl = "") {
  // 1. Extract Page Title (prefer h1 if clean, else <title>)
  let title = "";
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const rawH1 = h1Match[1].replace(/<[^>]+>/g, "").trim();
    if (rawH1.length > 5 && rawH1.length < 200) {
      title = rawH1;
    }
  }

  if (!title) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    title = titleMatch ? titleMatch[1].trim() : "IAS Study Resource";
    title = title.replace(/\s*[-–|].*$/, "").trim(); // Remove site suffix
  }

  // 2. Remove scripts, styles, navigations, footers, and tracking tags
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // 3. Convert block elements to clean line breaks
  let text = cleaned
    .replace(/<(?:h[1-6]|p|div|li|tr|br|section)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();

  // If text is too long, limit to first 12,000 characters for LLM processing
  if (text.length > 12000) {
    text = text.slice(0, 12000) + "\n\n... [Content Truncated for Analysis]";
  }

  if (text.length < 80) {
    throw new Error("Unable to extract readable article text from the webpage (anti-scraping or empty body).");
  }

  return { title, text };
}

const IAS_ANALYZER_SYSTEM = `You are an elite TNPSC Group-1 Mains Syllabus Director.
Your task is to analyze content or editorials from an IAS coaching website (such as Vision IAS, InsightsIAS, Drishti IAS, The Hindu, Shankar IAS, etc.) and map it accurately into the official TNPSC Group-1 Mains Syllabus.

THE 9 OFFICIAL TNPSC MAINS UNITS ARE:
- GS1_U1: Modern History of India and Indian Culture (Paper II - GS 1)
- GS1_U2: Social Issues in India and Tamil Nadu (Paper II - GS 1)
- GS1_U3: Ethics and Integrity (Paper II - GS 1)
- GS2_U1: Indian Polity and Emerging Political Trends (Paper III - GS 2)
- GS2_U2: Role and Impact of Science and Technology in the Development of India (Paper III - GS 2)
- GS2_U3: Tamil Society – Culture and Heritage (Paper III - GS 2)
- GS3_U1: General Geography of India with Special Reference to Tamil Nadu (Paper IV - GS 3)
- GS3_U2: Environment, Biodiversity and Disaster Management (Paper IV - GS 3)
- GS3_U3: Indian Economy – Current Economic Trends and Impact of Global Economy on India (Paper IV - GS 3)

CRITICAL INSTRUCTIONS:
1. Identify the exact matching unitId from the 9 units above.
2. Select or formulate the concise, authoritative TNPSC Syllabus Topic name (e.g. "Fiscal Federalism & State Autonomy", "Urban Floods and Climate Resilience", "Artificial Intelligence in Public Administration").
3. Formulate an authentic, high-standard 15-Mark TNPSC Mains Question based on the article's core themes with appropriate directive (Examine, Critically Evaluate, Discuss, Analyze).
4. Extract 3 to 4 key analytical value additions (acts, committees, landmark judgments, or Tamil Nadu initiatives).
5. Output MUST be strictly valid JSON without markdown wrapping or backticks.

OUTPUT FORMAT (RAW JSON ONLY):
{
  "unitId": "GS2_U1",
  "paper": "General Studies II (Paper III)",
  "unit": "Unit I: Indian Polity and Emerging Political Trends",
  "topic": "Concise Topic Name",
  "question": "The 15-mark TNPSC Mains Question...",
  "summary": "2-3 sentence overview of why this issue is high-yield for TNPSC Mains",
  "valueAdditions": [
    "Constitutional / Statutory Article or Act citation",
    "Landmark Supreme Court Judgment or Commission Recommendation",
    "Tamil Nadu specific policy, scheme, or pioneer initiative"
  ]
}`;

/**
 * Maps IAS article text to TNPSC Mains syllabus, formulates 15M question,
 * generates 12-rule model answer, and pushes directly to Notion.
 */
async function ingestArticleContent({ title, text, sourceUrl = null, onProgress = null }) {
  if (onProgress) onProgress({ step: 1, text: `Analyzing content & mapping to TNPSC Mains Syllabus...` });

  const prompt = `ARTICLE TITLE: ${title}\nSOURCE URL: ${sourceUrl || "N/A"}\n\nARTICLE BODY CONTENT:\n${text}`;
  
  // 1. Analyze and map syllabus
  const rawAnalysis = await llm.linkEditorial ? await llm.linkEditorial(prompt) : null;
  
  // Use Gemini to produce the strict JSON mapping
  const jsonResponseText = await llm.modelAnswer(
    `Analyze this IAS article and output strictly raw JSON matching the required schema:\n${prompt}`,
    15,
    250
  ).catch(async () => {
    return null;
  });

  // Call ask helper directly with IAS_ANALYZER_SYSTEM
  let mapping = null;
  try {
    const rawJson = await llm.generateQuestion(
      `${IAS_ANALYZER_SYSTEM}\n\nCONTENT TO ANALYZE:\n${prompt}`,
      15
    );
    const cleanJson = rawJson.replace(/```json/gi, "").replace(/```/g, "").trim();
    mapping = JSON.parse(cleanJson);
  } catch (err) {
    // Robust fallback: infer from text keywords
    const lower = text.toLowerCase();
    let fallbackUnitId = "GS2_U1";
    if (lower.includes("economy") || lower.includes("gdp") || lower.includes("inflation") || lower.includes("fiscal")) fallbackUnitId = "GS3_U3";
    else if (lower.includes("climate") || lower.includes("environment") || lower.includes("pollution") || lower.includes("disaster")) fallbackUnitId = "GS3_U2";
    else if (lower.includes("technology") || lower.includes("ai") || lower.includes("space") || lower.includes("science")) fallbackUnitId = "GS2_U2";
    else if (lower.includes("women") || lower.includes("child") || lower.includes("health") || lower.includes("poverty")) fallbackUnitId = "GS1_U2";
    else if (lower.includes("history") || lower.includes("freedom") || lower.includes("colonial")) fallbackUnitId = "GS1_U1";

    mapping = {
      unitId: fallbackUnitId,
      paper: UNIT_METADATA[fallbackUnitId]?.paper || "General Studies II (Paper III)",
      unit: UNIT_METADATA[fallbackUnitId]?.unit || "Unit I: Indian Polity",
      topic: title.slice(0, 60),
      question: `Critically examine the contemporary dimensions of "${title.slice(0, 70)}" in the context of governance and socio-economic development in India and Tamil Nadu.`,
      summary: `High-yield contemporary issue extracted from ${sourceUrl || title}.`,
      valueAdditions: ["Key policy directives and Tamil Nadu institutional initiatives"],
    };
  }

  const unitMeta = UNIT_METADATA[mapping.unitId] || { paper: mapping.paper, unit: mapping.unit };
  const topicName = mapping.topic || title.slice(0, 60);
  const question = mapping.question;

  if (onProgress) onProgress({ step: 2, text: `Generating 12-rule Model Answer for: "${topicName}"...` });
  const modelAnswer = await llm.modelAnswer(question, 15, 250);

  if (onProgress) onProgress({ step: 3, text: `Pushing directly to Notion under ${unitMeta.unit}...` });
  const notionRes = await saveSession({
    question,
    marks: 15,
    words: 250,
    modelAnswer,
    topic: topicName,
    unitId: mapping.unitId,
    isPYQ: false,
  });

  return {
    success: true,
    sourceUrl,
    title,
    topic: topicName,
    unitId: mapping.unitId,
    paper: unitMeta.paper,
    unit: unitMeta.unit,
    question,
    modelAnswer,
    notionUrl: notionRes.url || notionRes.toString(),
    notionPageId: notionRes.id,
    questionNumber: notionRes.questionNumber,
    valueAdditions: mapping.valueAdditions || [],
    summary: mapping.summary || "",
  };
}

/**
 * Ingests a single URL: fetches, maps to syllabus, generates 12-rule answer, and pushes to Notion.
 */
async function ingestUrlToNotion(url, { onProgress = null } = {}) {
  if (onProgress) onProgress({ step: 0, text: `Fetching webpage content from ${url}...` });
  const { title, text } = await fetchUrlText(url);
  return await ingestArticleContent({ title, text, sourceUrl: url, onProgress });
}

/**
 * Ingests multiple URLs sequentially and pushes each to Notion.
 */
async function ingestMultipleUrls(urls, { onProgress = null } = {}) {
  const results = [];
  const errors = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i].trim();
    if (!url) continue;

    if (onProgress) {
      onProgress({
        index: i + 1,
        total: urls.length,
        url,
        text: `Processing [${i + 1}/${urls.length}]: ${url}`,
      });
    }

    try {
      const res = await ingestUrlToNotion(url, {
        onProgress: (p) => {
          if (onProgress) onProgress({ ...p, index: i + 1, total: urls.length, url });
        },
      });
      results.push(res);
    } catch (err) {
      console.error(`Failed to ingest URL: ${url}`, err.message);
      errors.push({ url, error: err.message });
    }
  }

  return { results, errors, total: urls.length, successCount: results.length, failCount: errors.length };
}

module.exports = {
  fetchUrlText,
  extractCleanArticle,
  ingestArticleContent,
  ingestUrlToNotion,
  ingestMultipleUrls,
};

// Standalone CLI runner
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const urls = args.filter((a) => a.startsWith("http://") || a.startsWith("https://"));

    if (urls.length === 0) {
      console.log("Usage: node url_content_ingester.js <url1> [url2] [url3]...");
      console.log("Example:");
      console.log("  node url_content_ingester.js https://www.thehindu.com/opinion/editorial/...");
      process.exit(1);
    }

    console.log("==================================================================");
    console.log(`🌐 IAS WEBSITE CONTENT INGESTER ➔ NOTION`);
    console.log(`Ingesting ${urls.length} URL(s)...`);
    console.log("==================================================================");

    const batch = await ingestMultipleUrls(urls, {
      onProgress: (p) => {
        if (p.text) console.log(`[PROGRESS] ${p.text}`);
      },
    });

    console.log("\n==================================================================");
    console.log(`🎉 BATCH INGESTION COMPLETE: ${batch.successCount} succeeded, ${batch.failCount} failed.`);
    console.log("==================================================================");

    for (const r of batch.results) {
      console.log(`\n📌 Topic: ${r.topic}`);
      console.log(`📚 Paper: ${r.paper} | 🏛️ Unit: ${r.unit}`);
      console.log(`❓ Question: ${r.question}`);
      console.log(`🔗 Notion Link: ${r.notionUrl}`);
    }

    if (batch.errors.length > 0) {
      console.log("\n⚠️ Failed URLs:");
      for (const e of batch.errors) {
        console.log(`- ${e.url}: ${e.error}`);
      }
    }
  })();
}
