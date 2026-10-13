const { Client } = require("@notionhq/client");

let token = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
let notion = new Client({ auth: token });
let DATABASE_ID = process.env.NOTION_DATABASE_ID || process.env.NOTION_PAGE_ID;

function updateNotionConfig({ newToken, newDatabaseId } = {}) {
  if (newToken) {
    token = newToken;
    process.env.NOTION_TOKEN = newToken;
    notion = new Client({ auth: newToken });
    console.log(`[Notion Engine] Notion Client updated with new token.`);
  }
  if (newDatabaseId) {
    DATABASE_ID = newDatabaseId;
    process.env.NOTION_DATABASE_ID = newDatabaseId;
    console.log(`[Notion Engine] Notion Root Database/Page ID updated: ${newDatabaseId}`);
  }
}

// Official Unit Page IDs created inside the user's Notion workspace
const UNIT_PAGE_IDS = {
  GS1_U1: "3f6bdc8a-71e0-8156-a444-fb274d576ce6", // Modern History of India & Indian Culture
  GS1_U2: "3f6bdc8a-71e0-81d6-b6cc-cfd92e8ca844", // Social Issues in India and Tamil Nadu
  GS1_U3: "3f6bdc8a-71e0-81ba-a403-d182ac016d4a", // Ethics and Integrity
  GS2_U1: "3f6bdc8a-71e0-8123-97f0-c712c3b0c6be", // Indian Polity & Emerging Trends
  GS2_U2: "3f6bdc8a-71e0-81b0-ac16-febf4644410c", // Science and Technology
  GS2_U3: "3f6bdc8a-71e0-8104-9bba-c3455726e51a", // Tamil Society – Culture & Heritage
  GS3_U1: "3f6bdc8a-71e0-8111-9d65-f1abbc8cff5c", // Geography of India & Tamil Nadu
  GS3_U2: "3f6bdc8a-71e0-8143-bffe-f28054928ff0", // Environment & Disaster Management
  GS3_U3: "3f6bdc8a-71e0-810c-a650-e22b9af595dd", // Indian Economy & Current Trends
};

const UNIT_METADATA = {
  GS1_U1: {
    paper: "📜 General Studies I (Paper II)",
    unit: "🏛️ Unit I: Modern History of India and Indian Culture (100 marks)",
  },
  GS1_U2: {
    paper: "📜 General Studies I (Paper II)",
    unit: "👥 Unit II: Social Issues in India and Tamil Nadu (100 marks)",
  },
  GS1_U3: {
    paper: "📜 General Studies I (Paper II)",
    unit: "⚖️ Unit III: Ethics and Integrity (50 marks)",
  },
  GS2_U1: {
    paper: "⚖️ General Studies II (Paper III)",
    unit: "⚖️ Unit I: Indian Polity and Emerging Political Trends across the World affecting India (100 marks)",
  },
  GS2_U2: {
    paper: "⚖️ General Studies II (Paper III)",
    unit: "🔬 Unit II: Role and Impact of Science and Technology in the Development of India (100 marks)",
  },
  GS2_U3: {
    paper: "⚖️ General Studies II (Paper III)",
    unit: "🏺 Unit III: Tamil Society – Culture and Heritage (50 marks)",
  },
  GS3_U1: {
    paper: "📈 General Studies III (Paper IV)",
    unit: "🗺️ Unit I: General Geography and Geography of India with Special Reference to Tamil Nadu (75 marks)",
  },
  GS3_U2: {
    paper: "📈 General Studies III (Paper IV)",
    unit: "🌿 Unit II: Environment, Biodiversity and Disaster Management (75 marks)",
  },
  GS3_U3: {
    paper: "📈 General Studies III (Paper IV)",
    unit: "📈 Unit III: Indian Economy – Current Economic Trends and Impact of Global Economy on India (100 marks)",
  },
};

const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/**
 * Extracts pure topic name (e.g. "Advent of Europeans", "Colonialism and Imperialism")
 */
function cleanTopicName(topic) {
  if (!topic) return "General Practice";
  let t = topic;
  if (t.includes(":")) {
    const parts = t.split(":");
    t = parts[parts.length - 1];
  }
  return t.replace(/^[-\s–]+/, "").trim();
}

/**
 * Finds an existing topic page under the Unit page in Notion
 */
async function findTopicPage(unitPageId, topicName) {
  if (!unitPageId) return null;
  const normalizedTarget = topicName.toLowerCase().trim();
  let cursor = undefined;

  while (true) {
    const res = await notion.blocks.children.list({
      block_id: unitPageId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const b of res.results) {
      if (b.type === "child_page" && b.child_page?.title) {
        if (b.child_page.title.toLowerCase().trim() === normalizedTarget) {
          const p = await notion.pages.retrieve({ page_id: b.id });
          return { id: p.id, url: p.url, title: b.child_page.title };
        }
      }
    }

    if (!res.has_more) break;
    cursor = res.next_cursor;
  }

  return null;
}

/**
 * Parses HTML text with <b> or <u> tags into Notion rich_text objects.
 * Keywords marked with <b> or <u> (or markdown **...**) are styled with: bold: true, color: "yellow"
 */
function parseRichTextWithYellowKeywords(html) {
  // Normalize markdown bold/italic if any leaked through
  let normalized = html
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/__([^_]+)__/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<i>$1</i>");

  const out = [];
  let isBold = false;
  let isUnderline = false;
  const re = /<(\/?)(b|u|i)>|([^<]+)/g;
  let m;

  while ((m = re.exec(normalized))) {
    if (m[2] === "b") {
      isBold = !m[1];
    } else if (m[2] === "u") {
      isUnderline = !m[1];
    } else if (!m[2]) {
      const text = decode(m[3]);
      const isKeyword = isBold || isUnderline;
      for (let i = 0; i < text.length; i += 1900) {
        out.push({
          type: "text",
          text: { content: text.slice(i, i + 1900) },
          annotations: {
            bold: isKeyword,
            italic: false,
            strikethrough: false,
            underline: false,
            code: false,
            color: isKeyword ? "yellow" : "default",
          },
        });
      }
    }
  }

  return out.length ? out : [{ type: "text", text: { content: " " } }];
}

/**
 * Converts model answer HTML into Notion blocks adhering strictly to:
 * - Introduction: in Bold text
 * - Current Affairs / Core Focus: in Box content (Callout block)
 * - Subheadings: in Bold text
 * - Points inside each subheading: in bullet points with highlighted keywords in bold + yellow color
 * - Unique Keys / Value Addition: in Box content (Callout block)
 * - Conclusion: in Bold text
 */
function htmlToNotionBlocks(html) {
  const blocks = [];
  const lines = html.split("\n").map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleanText = line.replace(/<[^>]+>/g, "").trim();

    // 1. Introduction Header -> in Bold text
    if (/^(\d+\.\s*)?Introduction$/i.test(cleanText)) {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: "Introduction" }, annotations: { bold: true } }],
        },
      });
      continue;
    }

    // 2. Conclusion Header -> in Bold text
    if (/^(\d+\.\s*)?Conclusion(\s*&?\s*Way\s*Forward)?$/i.test(cleanText)) {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: "Conclusion" }, annotations: { bold: true } }],
        },
      });
      continue;
    }

    // 3. Subheading line -> in Bold text
    const isSubheading =
      /^(\d+\.|\bSubheading\s*\d+:?)\s+[A-Za-z]/i.test(cleanText) ||
      /<(b|u)>.*?<(b|u)>\s*\d+\./i.test(line) ||
      /<b>\s*\d+\.\s+[A-Za-z]/i.test(line);

    if (isSubheading && cleanText.length < 120 && !cleanText.endsWith(".")) {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: cleanText }, annotations: { bold: true } }],
        },
      });
      continue;
    }

    // 4. Box Content -> Current Affairs / Core Focus OR Unique Keys / Value Addition
    const isCurrentAffairs =
      /CURRENT\s*AFFAIRS|CORE\s*FOCUS|CONTEMPORARY\s*(CONTEXT|RELEVANCE)|RECENT\s*DEVELOPMENT/i.test(cleanText) ||
      /^(\s*⚡|\s*📰)/.test(cleanText);

    const isUniqueKey =
      /UNIQUE\s*(KEY|HIGHLIGHT|INSIGHT)|VALUE\s*ADDITION|EXAMINER\s*DIFFERENTIATOR|KEY\s*DIFFERENTIATOR/i.test(cleanText) ||
      line.includes("🔴") ||
      /^(\s*💡|\s*⭐)/.test(cleanText);

    const isExplicitBox = line.includes("<blockquote>") || /^>\s*/.test(line);

    if (isCurrentAffairs || isUniqueKey || isExplicitBox) {
      let cleanLine = line
        .replace(/<\/?blockquote>/g, "")
        .replace(/^>\s*/, "")
        .trim();

      let iconEmoji = "💡";
      let boxColor = "purple_background";

      if (isCurrentAffairs) {
        iconEmoji = "⚡";
        boxColor = "orange_background";
      } else if (isUniqueKey) {
        iconEmoji = "💡";
        boxColor = "purple_background";
      } else {
        iconEmoji = "📌";
        boxColor = "gray_background";
      }

      // Strip redundant leading icon and bracketed tags from callout content
      cleanLine = cleanLine
        .replace(/^[\s⚡💡🔴📰⭐📌]+/, "")
        .replace(/^\[?(CURRENT\s*AFFAIRS(\s*BOX)?|VALUE\s*ADDITION)\]?:?\s*/i, "")
        .trim();

      blocks.push({
        object: "block",
        type: "callout",
        callout: {
          icon: { type: "emoji", emoji: iconEmoji },
          color: boxColor,
          rich_text: parseRichTextWithYellowKeywords(cleanLine),
        },
      });
      continue;
    }

    // 5. Point inside each subheading -> bullet points with bold + yellow color for keywords (not in callout box)
    const isPoint = /^\d+\.\s+/.test(cleanText) || /^[•\-\*]\s+/.test(cleanText);

    if (isPoint) {
      const cleanLine = line
        .replace(/^\d+\.\s+/, "")
        .replace(/^[•\-\*]\s+/, "")
        .trim();

      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: parseRichTextWithYellowKeywords(cleanLine),
        },
      });
      continue;
    }

    // 6. Body lines (Introduction or Conclusion explanations)
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: parseRichTextWithYellowKeywords(line),
      },
    });
  }

  return blocks;
}

/**
 * Saves or appends a practice session directly into the Topic page in Notion:
 * - Page Title = Topic Name (e.g. "Advent of Europeans", "Colonialism and Imperialism")
 * - If topic page exists under the Unit: appends the new question & answer to that same page
 * - 📌 Question in Heading-1
 * - Question text in Callout blue color with bold text
 * - Introduction in Bold text
 * - Current Affairs in Box content (Callout block)
 * - Subheading in Bold text
 * - Points inside each subheading in bullet points with highlighted keywords in bold + yellow color (no callout box)
 * - Unique Keys / Value Addition in Box content (Callout block)
 * - Conclusion in Bold text
 */
async function saveSession({ question, marks = 15, answer, evaluation, modelAnswer, topic, unitId, words, questionNumber }) {
  if (!DATABASE_ID) {
    throw new Error("NOTION_DATABASE_ID / NOTION_PAGE_ID is not configured in .env");
  }

  const targetParentId = (unitId && UNIT_PAGE_IDS[unitId]) || DATABASE_ID.replace(/-/g, "");
  const topicName = cleanTopicName(topic);
  const cleanQuestion = question.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

  const unitMeta = (unitId && UNIT_METADATA[unitId]) || {};
  const paperTitle = unitMeta.paper || "TNPSC Mains";
  const unitTitle = unitMeta.unit || topicName;

  // Check if topic page already exists under the target Unit
  const existingTopicPage = await findTopicPage(targetParentId, topicName);

  // Determine sequential question number with continuity (Question - 1, Question - 2, ...)
  let qNum = typeof questionNumber === "number" ? questionNumber : 1;

  if (existingTopicPage) {
    try {
      const existingChildren = await notion.blocks.children.list({
        block_id: existingTopicPage.id,
        page_size: 100,
      });

      let highestFound = 0;
      let firstUnnumberedBlockId = null;

      for (const b of existingChildren.results) {
        if (b.type === "heading_1") {
          const headingText = b.heading_1?.rich_text?.map((t) => t.plain_text).join("") || "";
          const match = headingText.match(/📌\s*Question\s*-\s*(\d+)/i);
          if (match) {
            highestFound = Math.max(highestFound, parseInt(match[1], 10));
          } else if (/📌\s*Question/i.test(headingText)) {
            highestFound = Math.max(highestFound, 1);
            if (!firstUnnumberedBlockId) firstUnnumberedBlockId = b.id;
          }
        }
      }

      // Upgrade earlier unnumbered "📌 Question" to "📌 Question - 1" for consistency
      if (firstUnnumberedBlockId && highestFound === 1) {
        try {
          await notion.blocks.update({
            block_id: firstUnnumberedBlockId,
            heading_1: {
              rich_text: [{ type: "text", text: { content: "📌 Question - 1" } }],
            },
          });
        } catch (_) {}
      }

      if (typeof questionNumber !== "number") {
        qNum = highestFound + 1;
      }
    } catch (err) {
      console.warn("Could not inspect existing blocks for question number:", err.message);
    }
  }

  // Question blocks according to user styling:
  // 1. 📌 Question - N in Heading-1 (Sequential Continuity)
  // 2. Question in Callout blue color with bold text
  const questionBlocks = [
    {
      object: "block",
      type: "heading_1",
      heading_1: {
        rich_text: [{ type: "text", text: { content: `📌 Question - ${qNum}` } }],
      },
    },
    {
      object: "block",
      type: "callout",
      callout: {
        icon: { type: "emoji", emoji: "📌" },
        color: "blue_background",
        rich_text: [
          {
            type: "text",
            text: { content: `${cleanQuestion} (${marks} Marks, ~${words || marks * 20} words)` },
            annotations: { bold: true },
          },
        ],
      },
    },
  ];

  // Model Answer blocks:
  const modelAnswerBlocks = modelAnswer ? htmlToNotionBlocks(modelAnswer) : [];

  // Student answer / Evaluation blocks (if available):
  const studentBlocks = [];
  if (answer) {
    studentBlocks.push(
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: "📝 Student's Submitted Answer" }, annotations: { bold: true } }],
        },
      },
      ...htmlToNotionBlocks(answer)
    );
  }
  if (evaluation) {
    studentBlocks.push(
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: "🔍 AI Examiner Evaluation & Score" }, annotations: { bold: true } }],
        },
      },
      ...htmlToNotionBlocks(evaluation)
    );
  }

  let page;
  if (existingTopicPage) {
    // ── CASE A: TOPIC PAGE ALREADY EXISTS ──
    // Append the new question and answer into that existing page!
    const appendBlocks = [
      { object: "block", type: "divider", divider: {} },
      ...questionBlocks,
      ...modelAnswerBlocks,
      ...studentBlocks,
    ];

    for (let i = 0; i < appendBlocks.length; i += 100) {
      await notion.blocks.children.append({
        block_id: existingTopicPage.id,
        children: appendBlocks.slice(i, i + 100),
      });
    }

    page = existingTopicPage;
  } else {
    // ── CASE B: CREATE NEW TOPIC PAGE ──
    // Page Title is the Topic Name (e.g. "Advent of Europeans")
    const initialBlocks = [
      // Top metadata card
      {
        object: "block",
        type: "callout",
        callout: {
          icon: { type: "emoji", emoji: "🏛️" },
          rich_text: [
            {
              type: "text",
              text: {
                content:
                  `📚 ${paperTitle}\n` +
                  `🎯 ${unitTitle}\n` +
                  `✍️ Syllabus Topic: ${topicName}\n` +
                  `📅 Started: ${new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}`,
              },
            },
          ],
        },
      },
      ...questionBlocks,
      ...modelAnswerBlocks,
      ...studentBlocks,
    ];

    try {
      page = await notion.pages.create({
        parent: { page_id: targetParentId },
        properties: {
          title: [{ type: "text", text: { content: topicName } }],
        },
        children: initialBlocks.slice(0, 100),
      });
    } catch (err) {
      if (err.code === "object_not_found") {
        page = await notion.pages.create({
          parent: { page_id: DATABASE_ID.replace(/-/g, "") },
          properties: {
            title: [{ type: "text", text: { content: topicName } }],
          },
          children: initialBlocks.slice(0, 100),
        });
      } else {
        throw err;
      }
    }

    for (let i = 100; i < initialBlocks.length; i += 100) {
      await notion.blocks.children.append({
        block_id: page.id,
        children: initialBlocks.slice(i, i + 100),
      });
    }
  }

  return {
    url: page.url,
    id: page.id,
    topicName,
    title: topicName,
    toString() {
      return page.url;
    },
  };
}

/**
 * Appends student answer & evaluation to an already created Topic page in Notion
 */
async function appendEvaluationToSession(pageId, { answer, evaluation }) {
  if (!pageId) return;
  const blocks = [];
  if (answer) {
    blocks.push(
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: "📝 Student's Submitted Answer" }, annotations: { bold: true } }],
        },
      },
      ...htmlToNotionBlocks(answer)
    );
  }
  if (evaluation) {
    blocks.push(
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: "🔍 AI Examiner Evaluation & Score" }, annotations: { bold: true } }],
        },
      },
      ...htmlToNotionBlocks(evaluation)
    );
  }
  if (blocks.length > 0) {
    for (let i = 0; i < blocks.length; i += 100) {
      await notion.blocks.children.append({
        block_id: pageId,
        children: blocks.slice(i, i + 100),
      });
    }
  }
}

module.exports = {
  saveSession,
  appendEvaluationToSession,
  findTopicPage,
  cleanTopicName,
  htmlToNotionBlocks,
  parseRichTextWithYellowKeywords,
  UNIT_PAGE_IDS,
  UNIT_METADATA,
  updateNotionConfig,
};
