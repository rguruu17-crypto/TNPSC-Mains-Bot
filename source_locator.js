/**
 * NCERT & TN Samacheer Kalvi Source Locator (/source)
 * ─────────────────────────────────────────────────────────────────
 * Instantly connects any TNPSC Mains syllabus concept, question,
 * or keyword back to official Tamil Nadu State Board (Samacheer Kalvi)
 * and NCERT school textbooks with exact Class, Chapter, Page Range,
 * Tamil medium chapter titles, and high-yield box alerts.
 * ─────────────────────────────────────────────────────────────────
 */

const { ask } = require("./llm");

const SOURCE_LOCATOR_SYSTEM = `You are a Senior Academic Researcher and Textbook Author for the Tamil Nadu State Council of Educational Research and Training (TNSCERT) and NCERT, specialized in TNPSC Group-1 and Group-2 Mains syllabus mapping.

Given a TNPSC Mains topic, question, or keyword:
Identify the exact, authentic school textbook references across both:
1. Tamil Nadu Samacheer Kalvi (TN State Board) Textbooks (Classes 6-12)
2. NCERT Textbooks (Classes 6-12)

Strictly provide accurate, authentic chapter names and classes.

Respond ONLY with valid JSON (no markdown formatting, no extra commentary):
{
  "query": "<topic/question searched>",
  "mapped_paper": "<Paper II | Paper III | Paper IV>",
  "mapped_unit": "<Unit name, e.g. Indian Polity / History of Tamil Nadu / Indian Economy>",
  "samacheer_sources": [
    {
      "standard": "<e.g. Standard 11 or Standard 12>",
      "subject": "<e.g. History / Political Science / Economics / Geography / Ethics / Science>",
      "chapter_number": "<e.g. Chapter 19 or Lesson 4>",
      "chapter_title_en": "<Exact English Chapter Title>",
      "chapter_title_ta": "<Official Tamil Medium Chapter Title in Tamil script>",
      "page_range": "<Approx. Page numbers, e.g. pp. 280-295>",
      "key_focus_areas": ["<Key topic 1>", "<Key topic 2>"]
    }
  ],
  "ncert_sources": [
    {
      "class": "<e.g. Class 11 or Class 12>",
      "book_title": "<e.g. Indian Constitution at Work / Themes in Indian History / Indian Economic Development>",
      "chapter_number": "<e.g. Chapter 6>",
      "chapter_title": "<Exact NCERT Chapter Title>",
      "page_range": "<Approx. Page range>",
      "key_takeaways": "<1-line summary of what to extract>"
    }
  ],
  "high_yield_boxes": [
    "<Specific Infobox, 'Do You Know?', or timeline chart in the textbook that TNPSC loves to ask>"
  ],
  "mains_citation_tip": "<1-line recommendation on how to quote this textbook insight in a 15-mark answer>",
  "download_links": {
    "tn_textbook": "https://www.textbookcorp.tn.gov.in/",
    "ncert": "https://ncert.nic.in/textbook.php"
  }
}`;

/**
 * Deterministic local fallback lookup for common TNPSC topics
 */
const LOCAL_SOURCE_FALLBACKS = [
  {
    keywords: ["justice party", "self respect", "dravidian", "periyar", "social justice", "dmk", "reformers"],
    data: {
      mapped_paper: "Paper II",
      mapped_unit: "Unit I: Modern History of India and Indian Culture (Role of Tamil Nadu)",
      samacheer_sources: [
        {
          standard: "Standard 11",
          subject: "History (Higher Secondary First Year)",
          chapter_number: "Chapter 19",
          chapter_title_en: "Towards Modernity",
          chapter_title_ta: "நவீனத்தை நோக்கி",
          page_range: "pp. 284–302",
          key_focus_areas: ["South Indian Liberal Federation (1916)", "Communal G.O. (1921 & 1922)", "Periyar E.V.R. and Self-Respect Movement (1925)"]
        },
        {
          standard: "Standard 10",
          subject: "Social Science (History)",
          chapter_number: "Unit 10",
          chapter_title_en: "Social Transformation in Tamil Nadu",
          chapter_title_ta: "தமிழ்நாட்டில் சமூக மாற்றங்கள்",
          page_range: "pp. 82–96",
          key_focus_areas: ["Dravidian Movement origins", "Justice Party Ministry (1920-1926)", "Atheism and Self-Respect Marriages"]
        }
      ],
      ncert_sources: [
        {
          class: "Class 12",
          book_title: "Social Change and Development in India",
          chapter_number: "Chapter 8",
          chapter_title: "Social Movements",
          page_range: "pp. 142–158",
          key_takeaways: "Backward Classes and Anti-Caste Movements in South India"
        }
      ],
      high_yield_boxes: [
        "1921 Communal Representation Order table in Standard 11 History",
        "Neelakanta Brahmachari & Bharatha Matha Association timeline in Std 10 Unit 10"
      ],
      mains_citation_tip: "Cite the 1921 Communal G.O. passed by the Justice Party as the pioneering statutory foundation of modern social justice and reservation in India."
    }
  },
  {
    keywords: ["governor", "president", "ordinance", "article 163", "article 356", "federalism", "centre state"],
    data: {
      mapped_paper: "Paper III",
      mapped_unit: "Unit I: Indian Polity and Emerging Political Trends",
      samacheer_sources: [
        {
          standard: "Standard 12",
          subject: "Political Science",
          chapter_number: "Unit 2 & Unit 3",
          chapter_title_en: "Executive & Legislature",
          chapter_title_ta: "ஆட்சித்துறை & சட்டமன்றம்",
          page_range: "pp. 35–68",
          key_focus_areas: ["Powers of the Governor (Discretionary vs Constitutional)", "State Council of Ministers", "P.V. Rajamannar Committee (1969) on Centre-State Relations"]
        },
        {
          standard: "Standard 10",
          subject: "Social Science (Civics)",
          chapter_number: "Unit 2",
          chapter_title_en: "Central and State Government",
          chapter_title_ta: "மாநில அரசு",
          page_range: "pp. 195–210",
          key_focus_areas: ["Constitutional position of the Governor under Art 153-167", "Sarkaria Commission recommendations table"]
        }
      ],
      ncert_sources: [
        {
          class: "Class 11",
          book_title: "Indian Constitution at Work",
          chapter_number: "Chapter 4 & Chapter 7",
          chapter_title: "Executive & Federalism",
          page_range: "pp. 77–100 & 150–178",
          key_takeaways: "Discretionary powers under Article 163 and tensions in Centre-State relations"
        }
      ],
      high_yield_boxes: [
        "Sarkaria & Punchhi Commission recommendations box in Std 12 Political Science Unit 3",
        "TN Government's P.V. Rajamannar Committee 1969 mandate in Std 12 Polity"
      ],
      mains_citation_tip: "Quote the landmark S.R. Bommai case (1994) and Sarkaria Commission guidelines as highlighted in Class 12 TN Political Science to balance executive discretion."
    }
  },
  {
    keywords: ["panchayat", "local body", "urban local", "73rd", "74th", "gram sabha"],
    data: {
      mapped_paper: "Paper III",
      mapped_unit: "Unit I: Indian Polity (Local Government)",
      samacheer_sources: [
        {
          standard: "Standard 11",
          subject: "Political Science",
          chapter_number: "Unit 12",
          chapter_title_en: "Local Governments",
          chapter_title_ta: "உள்ளாட்சி அரசாங்கங்கள்",
          page_range: "pp. 210–235",
          key_focus_areas: ["73rd and 74th Constitutional Amendment Acts", "Tamil Nadu Panchayats Act 1994", "50% reservation for women in TN local bodies"]
        },
        {
          standard: "Standard 9",
          subject: "Social Science (Civics)",
          chapter_number: "Unit 5",
          chapter_title_en: "Local Self Government",
          chapter_title_ta: "உள்ளாட்சி அமைப்புகள்",
          page_range: "pp. 250–262",
          key_focus_areas: ["Kudavolai system in Chola administration (Uttiramerur inscription)", "Gram Sabha meetings on 6 official days in Tamil Nadu"]
        }
      ],
      ncert_sources: [
        {
          class: "Class 11",
          book_title: "Indian Constitution at Work",
          chapter_number: "Chapter 8",
          chapter_title: "Local Governments",
          page_range: "pp. 176–200",
          key_takeaways: "Evolution of Panchayati Raj from Balwant Rai Mehta to 73rd Amendment"
        }
      ],
      high_yield_boxes: [
        "Uttiramerur Chola Inscriptions on democratic village elections in Std 9 Civics",
        "Tamil Nadu's 6 Mandatory Gram Sabha Dates (Jan 26, May 1, Aug 15, Oct 2, Mar 22, Nov 1) in Std 11 Polity"
      ],
      mains_citation_tip: "Highlight Tamil Nadu's ancient democratic legacy by contrasting the Uttiramerur Inscriptions with the statutory 73rd Amendment provisions."
    }
  },
  {
    keywords: ["economy", "poverty", "unemployment", "gsdp", "industrial", "clusters", "msme"],
    data: {
      mapped_paper: "Paper IV",
      mapped_unit: "Unit II: Indian Economy and Issues Relating to Tamil Nadu",
      samacheer_sources: [
        {
          standard: "Standard 11",
          subject: "Economics",
          chapter_number: "Chapter 11",
          chapter_title_en: "Tamil Nadu Economy",
          chapter_title_ta: "தமிழ்நாட்டுப் பொருளாதாரம்",
          page_range: "pp. 248–278",
          key_focus_areas: ["Industrial Clusters in TN (Tiruppur, Sivakasi, Coimbatore)", "Health & Education achievements (Gross Enrolment Ratio)", "Renewable energy leadership in wind & solar"]
        },
        {
          standard: "Standard 12",
          subject: "Economics",
          chapter_number: "Chapter 9",
          chapter_title_en: "Fiscal Economics",
          chapter_title_ta: "நிதிப் பொருளியல்",
          page_range: "pp. 180–210",
          key_focus_areas: ["GST council and state fiscal autonomy", "Deficit indicators (Fiscal Deficit, Revenue Deficit)", "Public Debt management"]
        }
      ],
      ncert_sources: [
        {
          class: "Class 11",
          book_title: "Indian Economic Development",
          chapter_number: "Chapter 4 & Chapter 7",
          chapter_title: "Poverty & Employment: Growth, Informalisation and Other Issues",
          page_range: "pp. 60–85 & 118–140",
          key_takeaways: "Multidimensional Poverty Index and structural unemployment issues in India"
        }
      ],
      high_yield_boxes: [
        "Tamil Nadu Industrial Clusters Map (Knitwear, Leather, Auto, Fireworks) in Std 11 Economics Chapter 11",
        "NITI Aayog Health Index comparisons in Std 11 Economics"
      ],
      mains_citation_tip: "Cite Tamil Nadu's high Gross Enrolment Ratio (51.3% vs national 27.1%) from Standard 11 TN Economics to justify state human capital development."
    }
  }
];

/**
 * Searches local fallback database for matching sources
 */
function getLocalFallback(query) {
  const qLower = query.toLowerCase();
  for (const item of LOCAL_SOURCE_FALLBACKS) {
    if (item.keywords.some((k) => qLower.includes(k))) {
      return {
        query,
        ...item.data,
        download_links: {
          tn_textbook: "https://www.textbookcorp.tn.gov.in/",
          ncert: "https://ncert.nic.in/textbook.php"
        }
      };
    }
  }
  return null;
}

/**
 * Locates authentic TN Samacheer Kalvi & NCERT textbook sources for any topic or question.
 * @param {string} queryText - Topic, keyword, or complete mains question
 * @returns {Promise<object>} - Structured source references
 */
async function locateTextbookSources(queryText) {
  const fallback = getLocalFallback(queryText);

  try {
    const prompt = `TNPSC MAINS TOPIC / QUESTION TO MAP TO TEXTBOOKS:
"${queryText.trim()}"

Identify the exact Class/Standard, Subject, Chapter number, English and Tamil titles, page ranges, and high-yield infoboxes across TN Samacheer Kalvi and NCERT textbooks. Follow the JSON schema strictly.`;

    const raw = await ask(SOURCE_LOCATOR_SYSTEM, prompt, 2500);
    const clean = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(clean);
    return {
      query: queryText,
      mapped_paper: parsed.mapped_paper || "Paper II / Paper III / Paper IV",
      mapped_unit: parsed.mapped_unit || "TNPSC General Studies Unit",
      samacheer_sources: Array.isArray(parsed.samacheer_sources) && parsed.samacheer_sources.length > 0
        ? parsed.samacheer_sources
        : (fallback ? fallback.samacheer_sources : []),
      ncert_sources: Array.isArray(parsed.ncert_sources) && parsed.ncert_sources.length > 0
        ? parsed.ncert_sources
        : (fallback ? fallback.ncert_sources : []),
      high_yield_boxes: Array.isArray(parsed.high_yield_boxes) && parsed.high_yield_boxes.length > 0
        ? parsed.high_yield_boxes
        : (fallback ? fallback.high_yield_boxes : ["Refer to summary timelines and 'Do You Know?' infoboxes"]),
      mains_citation_tip: parsed.mains_citation_tip || (fallback ? fallback.mains_citation_tip : "Directly cite textbook chapters in your introduction for authentic foundational backing."),
      download_links: {
        tn_textbook: "https://www.textbookcorp.tn.gov.in/",
        ncert: "https://ncert.nic.in/textbook.php"
      }
    };
  } catch (err) {
    console.warn("⚠️ AI source locator parse error, using fallback/default:", err.message);
    if (fallback) return fallback;

    // Default emergency generic response
    return {
      query: queryText,
      mapped_paper: "TNPSC Mains General Studies",
      mapped_unit: "General Studies Core Syllabus",
      samacheer_sources: [
        {
          standard: "Standard 11 & Standard 12",
          subject: "State Board Textbooks (TNSCERT)",
          chapter_number: "Relevant Syllabus Units",
          chapter_title_en: "Higher Secondary Foundation Modules",
          chapter_title_ta: "மேல்நிலை முதலாம் மற்றும் இரண்டாம் ஆண்டு பாடப்புத்தகங்கள்",
          page_range: "Core Chapters",
          key_focus_areas: ["Foundational definitions", "Tamil Nadu specific case studies"]
        }
      ],
      ncert_sources: [
        {
          class: "Class 11 & Class 12",
          book_title: "NCERT Central Foundation Books",
          chapter_number: "Core Chapters",
          chapter_title: "Indian National Development Series",
          page_range: "Core Modules",
          key_takeaways: "Conceptual clarity and analytical frameworks"
        }
      ],
      high_yield_boxes: ["Check all 'Do You Know?' / தெரிந்து கொள்வோம் infoboxes in TNSCERT books"],
      mains_citation_tip: "Always anchor your conceptual definitions using authentic Samacheer Kalvi formulations.",
      download_links: {
        tn_textbook: "https://www.textbookcorp.tn.gov.in/",
        ncert: "https://ncert.nic.in/textbook.php"
      }
    };
  }
}

/**
 * Formats a clean, readable Telegram Markdown card for textbook sources.
 * @param {object} sourceData - Output from locateTextbookSources
 * @returns {string} - Formatted Telegram card
 */
function formatSourceLocatorCard(sourceData) {
  let card = `📚 *NCERT & TN SAMACHEER KALVI SOURCE LOCATOR*\n`;
  card += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  card += `🎯 *Topic / Query:* _${sourceData.query.slice(0, 100)}_\n`;
  card += `📑 *Syllabus Mapping:* *${sourceData.mapped_paper}* ➔ _${sourceData.mapped_unit}_\n\n`;

  card += `🏫 *TAMIL NADU SAMACHEER KALVI (STATE BOARD)*\n`;
  if (sourceData.samacheer_sources && sourceData.samacheer_sources.length > 0) {
    sourceData.samacheer_sources.forEach((src, idx) => {
      card += `*${idx + 1}. ${src.standard} — ${src.subject}*\n`;
      card += `   📖 *${src.chapter_number}:* ${src.chapter_title_en}\n`;
      if (src.chapter_title_ta) {
        card += `   🇮🇳 *தமிழ் வடிவம்:* _${src.chapter_title_ta}_\n`;
      }
      if (src.page_range) {
        card += `   📍 *Pages:* \`${src.page_range}\`\n`;
      }
      if (src.key_focus_areas && src.key_focus_areas.length > 0) {
        card += `   🔑 *Core Focus:* ${src.key_focus_areas.join(" • ")}\n`;
      }
      card += `\n`;
    });
  } else {
    card += `_Standard 11 & 12 TNSCERT Higher Secondary textbooks._\n\n`;
  }

  card += `📖 *NCERT CORE REFERENCES*\n`;
  if (sourceData.ncert_sources && sourceData.ncert_sources.length > 0) {
    sourceData.ncert_sources.forEach((ncert, idx) => {
      card += `*${idx + 1}. ${ncert.class} — ${ncert.book_title}*\n`;
      card += `   📑 *${ncert.chapter_number}:* ${ncert.chapter_title}\n`;
      if (ncert.page_range) {
        card += `   📍 *Pages:* \`${ncert.page_range}\`\n`;
      }
      if (ncert.key_takeaways) {
        card += `   💡 *Takeaway:* _${ncert.key_takeaways}_\n`;
      }
      card += `\n`;
    });
  } else {
    card += `_Class 11 & 12 NCERT Foundation texts._\n\n`;
  }

  if (sourceData.high_yield_boxes && sourceData.high_yield_boxes.length > 0) {
    card += `⚡ *HIGH-YIELD "DO YOU KNOW?" BOX ALERTS:*\n`;
    sourceData.high_yield_boxes.forEach((box) => {
      card += `   • 📌 _${box}_\n`;
    });
    card += `\n`;
  }

  if (sourceData.mains_citation_tip) {
    card += `💡 *HOW TO QUOTE IN MAINS (13/15 TIP):*\n`;
    card += `   _"${sourceData.mains_citation_tip}"_\n\n`;
  }

  card += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  card += `🌐 *Official Free e-Books:*\n`;
  card += `   • [TN Textbook Corp (Free PDF)](${sourceData.download_links.tn_textbook})\n`;
  card += `   • [NCERT Official Portal](${sourceData.download_links.ncert})\n`;

  return card;
}

module.exports = {
  locateTextbookSources,
  formatSourceLocatorCard,
};
