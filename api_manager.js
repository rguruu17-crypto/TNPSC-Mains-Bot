require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");
const { Client } = require("@notionhq/client");

const ENV_PATH = path.join(__dirname, ".env");

/**
 * Safely masks secret keys for presentation in Telegram chats.
 * Example: "secret-token-value-12345" -> "secret...2345"
 */
function maskKey(key, startLen = 6, endLen = 4) {
  if (!key || typeof key !== "string" || key.trim().length === 0) {
    return "(Not Configured)";
  }
  const clean = key.trim();
  if (clean.length <= startLen + endLen) {
    return "••••••••";
  }
  return `${clean.slice(0, startLen)}...${clean.slice(-endLen)}`;
}

/**
 * Safely updates or appends a key-value pair in the backend .env file.
 * Preserves comments, formatting, and other keys.
 */
function updateEnvFile(key, value) {
  let content = "";
  if (fs.existsSync(ENV_PATH)) {
    content = fs.readFileSync(ENV_PATH, "utf8");
  }

  const lines = content.split(/\r?\n/);
  let keyFound = false;
  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}=`)) {
      keyFound = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!keyFound) {
    // If last line is not empty, add a newline
    if (newLines.length > 0 && newLines[newLines.length - 1].trim() !== "") {
      newLines.push("");
    }
    newLines.push(`${key}=${value}`);
  }

  fs.writeFileSync(ENV_PATH, newLines.join("\n"), "utf8");
  process.env[key] = value;

  try {
    if (key === "GEMINI_API_KEY") {
      const { updateGeminiKey } = require("./llm");
      updateGeminiKey(value);
    } else if (key === "NOTION_TOKEN" || key === "NOTION_API_KEY") {
      const { updateNotionConfig } = require("./notion");
      updateNotionConfig({ newToken: value });
    } else if (key === "NOTION_DATABASE_ID") {
      const { updateNotionConfig } = require("./notion");
      updateNotionConfig({ newDatabaseId: value });
    }
  } catch (err) {
    console.warn("Could not propagate key update to module in-memory:", err.message);
  }

  return true;
}

/**
 * Tests the live health and response latency of a Gemini API Key.
 */
async function checkGeminiHealth(customKey = null) {
  const apiKey = (customKey || process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return {
      ok: false,
      latency: null,
      error: "No Gemini API Key configured in backend .env",
      isConfigured: false,
    };
  }

  const startTime = Date.now();
  try {
    const testAi = new GoogleGenAI({ apiKey });
    const modelToTest = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const res = await testAi.models.generateContent({
      model: modelToTest,
      contents: "Ping. Respond strictly with the word: PONG",
      config: { maxOutputTokens: 10 },
    });

    const latency = Date.now() - startTime;
    const text = (res.text || "").trim();

    return {
      ok: true,
      latency,
      model: modelToTest,
      sampleResponse: text,
      isConfigured: true,
      error: null,
    };
  } catch (err) {
    const latency = Date.now() - startTime;
    const msg = err.message || String(err);
    const isQuota = err.status === 429 || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("resource_exhausted");
    const isInvalid = err.status === 400 || err.status === 401 || err.status === 403 || msg.toLowerCase().includes("api_key_invalid") || msg.toLowerCase().includes("invalid api key");

    return {
      ok: false,
      latency,
      isQuota,
      isInvalid,
      isConfigured: true,
      error: isQuota
        ? "Free-tier daily quota exhausted (429). Please update with a fresh API key."
        : isInvalid
        ? "Invalid API Key. Google AI rejected the credential."
        : (msg.slice(0, 120) || "Unknown connection failure"),
    };
  }
}

/**
 * Tests the live health and response latency of Notion Integration.
 */
async function checkNotionHealth(customToken = null, customDbId = null) {
  const token = (customToken || process.env.NOTION_TOKEN || process.env.NOTION_API_KEY || "").trim();
  const dbId = (customDbId || process.env.NOTION_DATABASE_ID || "").trim();

  if (!token) {
    return {
      ok: false,
      latency: null,
      error: "No Notion Token configured in backend .env",
      isConfigured: false,
    };
  }

  const startTime = Date.now();
  try {
    const testNotion = new Client({ auth: token });
    const me = await testNotion.users.me();
    const latency = Date.now() - startTime;

    let dbAccessible = false;
    let rootPageTitle = null;

    if (dbId) {
      try {
        const block = await testNotion.blocks.retrieve({ block_id: dbId });
        dbAccessible = true;
        rootPageTitle = block?.child_page?.title || "Connected Notion Page";
      } catch (e) {
        // Try as page
        try {
          const page = await testNotion.pages.retrieve({ page_id: dbId });
          dbAccessible = true;
          rootPageTitle = "Connected Notion Page";
        } catch (_) {
          dbAccessible = false;
        }
      }
    }

    return {
      ok: true,
      latency,
      botName: me.name || "TNPSC Integration Bot",
      dbAccessible,
      rootPageTitle,
      isConfigured: true,
      error: null,
    };
  } catch (err) {
    const latency = Date.now() - startTime;
    const msg = err.message || String(err);
    const isUnauthorized = err.status === 401 || msg.toLowerCase().includes("unauthorized");

    return {
      ok: false,
      latency,
      isConfigured: true,
      error: isUnauthorized
        ? "Unauthorized: Invalid Notion Internal Integration Token"
        : (msg.slice(0, 120) || "Failed connecting to Notion API"),
    };
  }
}

/**
 * Runs parallel health check across Gemini and Notion.
 */
async function checkAllApiHealth() {
  const [gemini, notion] = await Promise.all([
    checkGeminiHealth(),
    checkNotionHealth(),
  ]);
  return { gemini, notion };
}

/**
 * Formats a modern Telegram card summarizing API credentials & health.
 */
function formatApiSettingsCard(health) {
  const geminiKey = process.env.GEMINI_API_KEY || "";
  const notionToken = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY || "";
  const notionDb = process.env.NOTION_DATABASE_ID || "";

  const gStatus = health.gemini.ok
    ? `🟢 <b>Operational</b> (<code>${health.gemini.latency}ms</code> • ${health.gemini.model})`
    : health.gemini.isQuota
    ? `🟡 <b>Quota Exhausted (429)</b>\n   ⚠️ <i>${health.gemini.error}</i>`
    : `🔴 <b>Error</b>: <i>${health.gemini.error}</i>`;

  const nStatus = health.notion.ok
    ? `🟢 <b>Connected</b> (<code>${health.notion.latency}ms</code> • Bot: <i>${health.notion.botName}</i>)`
    : `🔴 <b>Error</b>: <i>${health.notion.error}</i>`;

  const nRootStatus = health.notion.dbAccessible
    ? `🟢 <b>Accessible</b> (${health.notion.rootPageTitle || "Verified"})`
    : health.notion.ok
    ? `🟡 <b>Not Linked</b> (Page ID not shared with integration)`
    : `⚪ <b>Pending Connection</b>`;

  return [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  ⚙️ <b>API CREDENTIALS & HEALTH METER</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    ``,
    `🧠 <b>Google Gemini AI Engine:</b>`,
    `• <b>Key:</b> <code>${maskKey(geminiKey)}</code>`,
    `• <b>Health:</b> ${gStatus}`,
    ``,
    `📓 <b>Notion Workspace Integration:</b>`,
    `• <b>Token:</b> <code>${maskKey(notionToken)}</code>`,
    `• <b>Health:</b> ${nStatus}`,
    `• <b>Root Page ID:</b> <code>${maskKey(notionDb, 8, 4)}</code>`,
    `• <b>Page Access:</b> ${nRootStatus}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `💾 <b>Backend Storage:</b> <code>.env</code> file in project root`,
    `👉 <i>Tap a button below to update any key or re-test live health:</i>`,
  ].join("\n");
}

module.exports = {
  maskKey,
  updateEnvFile,
  checkGeminiHealth,
  checkNotionHealth,
  checkAllApiHealth,
  formatApiSettingsCard,
};
