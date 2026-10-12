/**
 * Daily Editorial Syllabus Linker for TNPSC Mains
 * Bridges contemporary news issues (The Hindu, Dinamani, PIB, Frontline) with TNPSC Group-1 Mains Syllabus.
 */

const { linkEditorial } = require("./llm");

const CURATED_EDITORIALS = [
  {
    id: "fiscal_federalism",
    title: "Fiscal Federalism, Cess & Surcharge Proliferation and States' Divisible Pool",
    source: "The Hindu / Economic Appraisal",
    theme: "Center-State Financial Relations & 16th Finance Commission Terms of Reference",
    paper: "Paper III (GS 2) Unit I (Indian Polity & Governance) & Paper IV (GS 3) Economy",
    snippet: "Increasing reliance of the Union on cesses and surcharges shrinks the divisible tax pool, constraining states like Tamil Nadu from fiscal capital expenditure.",
  },
  {
    id: "governor_article200",
    title: "Gubernatorial Discretion & Constitutional Assent to State Legislative Bills (Article 200)",
    source: "The Hindu Editorial / Supreme Court Jurisprudence",
    theme: "Cooperative Federalism, Legislative Autonomy, and State-Governor Deadlocks",
    paper: "Paper III (GS 2) Unit I (Indian Polity & Constitutional Dynamics)",
    snippet: "Supreme Court rulings in Punjab & Tamil Nadu reiterating that Governors cannot exercise pocket veto or sit indefinitely on bills passed by state legislatures.",
  },
  {
    id: "trillion_economy_tn",
    title: "Tamil Nadu's $1 Trillion Vision: Port-Led Clusters & Industrial Decentralization",
    source: "Guidance Tamil Nadu / Business Standard",
    theme: "Industrial Corridors, Non-Leather Footwear, and Semiconductor & EV Manufacturing",
    paper: "Paper IV (GS 3) Unit III (Indian Economy & Role of Tamil Nadu)",
    snippet: "Leveraging Thoothukudi Outer Harbour, Hosur EV cluster, and Sriperumbudur electronics hub to drive balanced regional industrialization.",
  },
  {
    id: "chennai_floods_climate",
    title: "Urban Climate Vulnerability: Extreme Rainfall, Wetlands Degradation and Resilient Drainage",
    source: "Frontline / State Climate Mission Report",
    theme: "Disaster Risk Reduction (DRR), Encroachment of Waterbodies, and Sponge Cities Concept",
    paper: "Paper IV (GS 3) Unit I (Geography & Disasters) & Unit II (Environment)",
    snippet: "Integrating stormwater drainage networks, Buckingham canal revival, and Pallikaranai marshland restoration to mitigate cyclone inundation in Chennai.",
  },
  {
    id: "dpdp_ai_governance",
    title: "Digital Personal Data Protection (DPDP) Act, AI Ethics and Digital Governance in India",
    source: "The Indian Express / TNeGA Digital Policy",
    theme: "Right to Privacy (Puttaswamy Judgment), Citizen Data Sovereignty, and AI in Public Services",
    paper: "Paper III (GS 2) Unit II (Science and Technology) & Governance",
    snippet: "Balancing citizen privacy safeguards under DPDP 2023 with the rollout of AI tools across governance, facial recognition, and public biometric authentication.",
  },
];

function getCuratedEditorials() {
  return CURATED_EDITORIALS;
}

function getCuratedEditorialById(id) {
  return CURATED_EDITORIALS.find((e) => e.id === id);
}

function formatEditorialCard(output, queryTitle = null) {
  return [
    `📰 <b>DAILY EDITORIAL SYLLABUS LINKAGE REPORT</b>`,
    `────────────────────────────────────────`,
    queryTitle ? `📌 <b>Analyzed Issue:</b> <i>"${queryTitle}"</i>\n` : ``,
    output,
    ``,
    `────────────────────────────────────────`,
    `💡 <i>Tip: Tap 'Start 12-Min Mock' or 'Printable QCAB PDF' below to write an answer on this editorial question right now!</i>`,
  ].join("\n");
}

module.exports = {
  CURATED_EDITORIALS,
  getCuratedEditorials,
  getCuratedEditorialById,
  formatEditorialCard,
};
