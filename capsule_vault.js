/**
 * Tamil Nadu Scheme & Policy Capsule Vault for TNPSC Mains
 * High-yield flagship capsules with specific 12-rule Mains answer integration guidance.
 */

const SCHEME_CAPSULES = [
  {
    id: "magalir_urimai",
    title: "Kalaignar Magalir Urimai Thogai Thittam",
    tagline: "India's Largest Direct Basic Income for Women Heads of Households",
    nodal: "Special Programme Implementation & Revenue Department",
    outlay: "₹13,720 Crore (Annual Budget Outlay)",
    target: "1.15 Crore Women Heads of Families (Transferred on 15th of every month)",
    keyFeatures: [
      "Provides ₹1,000/month unconditional direct cash transfer via Aadhaar DBT.",
      "Recognizes unpaid domestic labour and caregiving work of women as economic contribution.",
      "Strict inclusion criteria ensuring financial autonomy for low-income and vulnerable women.",
    ],
    mainsPlacement: {
      paper: "Paper II (GS 1) Unit II (Social Issues) & Paper IV (GS 3) Economy",
      introHook: "Tamil Nadu's Kalaignar Magalir Urimai Thogai establishes the nation's largest rights-based basic income, transferring ₹1,000/month directly to 1.15 Crore women.",
      uniqueKey: "Recognizes the constitutional dignity of women's unpaid household labour, injecting ₹13,720 Crore directly into rural/urban grassroots consumption.",
      wayForward: "Scale the basic income model towards social security convergence, linking beneficiaries with institutional micro-credit and entrepreneurial collectives.",
    },
  },
  {
    id: "pudhumai_penn",
    title: "Pudhumai Penn Scheme (Higher Education Assurance)",
    tagline: "Moovalur Ramamirtham Ammaiyar Higher Education Assurance Scheme",
    nodal: "Social Welfare and Women Empowerment Department",
    outlay: "₹370 Crore annually",
    target: "Girls who studied in Government Schools (Classes 6-12) pursuing undergraduate degrees/diplomas",
    keyFeatures: [
      "Monthly financial incentive of ₹1,000 directly credited until degree completion.",
      "Replaced the traditional marriage assistance scheme to incentivize tertiary education over early marriage.",
      "Resulted in an unprecedented 34% jump in female college enrolment from government schools.",
    ],
    mainsPlacement: {
      paper: "Paper II (GS 1) Unit II (Women & Child Welfare) & Education",
      introHook: "Restructuring marriage aid into educational incentive, the Pudhumai Penn scheme grants ₹1,000/month to ensure higher education retention among marginalized girls.",
      uniqueKey: "Boosted female tertiary enrolment by 34% within two academic cycles, directly accelerating Tamil Nadu's Gross Enrolment Ratio (GER) to 47%.",
      wayForward: "Integrate Pudhumai Penn with STEM and technical mentoring to bridge the gap between degree attainment and formal industry recruitment.",
    },
  },
  {
    id: "breakfast_scheme",
    title: "Chief Minister's Breakfast Scheme (CMBS)",
    tagline: "Pioneering School Nutrition Scheme across Government Primary Schools",
    nodal: "Social Welfare and Nutritious Meal Programme Department",
    outlay: "₹404 Crore annually",
    target: "17 Lakh primary school children (Classes 1 to 5) across 31,008 government schools",
    keyFeatures: [
      "Provides freshly cooked nutritious hot breakfast (millets, pongal, kichadi) before school assembly.",
      "State Planning Commission audit revealed student attendance jumped by 20%–40% in targeted rural blocks.",
      "Alleviates morning malnutrition and enhances classroom cognitive attention and retention.",
    ],
    mainsPlacement: {
      paper: "Paper II (GS 1) Unit II (Social Issues - Nutrition) & Public Administration",
      introHook: "Carrying forward the historic legacy of the Mid-Day Meal, Tamil Nadu became the first Indian state to guarantee universal morning breakfast in government primary schools.",
      uniqueKey: "Demonstrated a 20%+ surge in primary school attendance alongside documented reductions in child micronutrient deficiency.",
      wayForward: "Institutionalize decentralized food quality audits via School Management Committees and expand coverage to upper primary standards.",
    },
  },
  {
    id: "naan_mudhalvan",
    title: "Naan Mudhalvan Scheme (Youth Skill Empowerment)",
    tagline: "Mass-Scale Technical Skilling and Employability Mission",
    nodal: "Tamil Nadu Skill Development Corporation (TNSDC)",
    outlay: "₹150+ Crore annually",
    target: "Over 28 Lakh college students across engineering, arts, science, and polytechnic colleges",
    keyFeatures: [
      "Mandatory curriculum-embedded training in AI/ML, Blockchain, Data Analytics, Semiconductor Design, and Green Energy.",
      "Partnership with 80+ global tech giants (Microsoft, AWS, Google, IBM) and leading MNCs.",
      "Dedicated portals for competitive exam coaching (Naan Mudhalvan All India Civil Services stipend of ₹7,500/month).",
    ],
    mainsPlacement: {
      paper: "Paper III (GS 2) Unit II (Science & Tech) & Paper IV (GS 3) Industrial Economy",
      introHook: "Naan Mudhalvan bridges the university-industry skill divide by imparting frontier tech competencies to over 28 Lakh students across 1,000+ colleges.",
      uniqueKey: "Direct corporate syllabus integration with mandatory credits, transforming Tamil Nadu from an IT services hub into a high-tech engineering talent powerhouse.",
      wayForward: "Expand Tier-2/3 district innovation labs and link skilled graduates with global semiconductor and EV design clusters in Tamil Nadu.",
    },
  },
  {
    id: "makkalai_maruthuvam",
    title: "Makkalai Thedi Maruthuvam (Healthcare at Doorstep)",
    tagline: "Community Non-Communicable Disease (NCD) Management at the Citizen's Doorstep",
    nodal: "Health and Family Welfare Department",
    outlay: "₹250+ Crore annually",
    target: "Over 1.05 Crore beneficiaries screened and provided medicines at home",
    keyFeatures: [
      "Women health volunteers (WHVs) screen hypertension, diabetes, and kidney ailments at doorstep.",
      "Direct home delivery of essential NCD drug kits and palliative home-care physiotherapy.",
      "Drastically reduces out-of-pocket health expenditure for rural senior citizens.",
    ],
    mainsPlacement: {
      paper: "Paper II (GS 1) Unit II (Social Issues - Health) & Paper III (GS 2) Unit II (S&T)",
      introHook: "Makkalai Thedi Maruthuvam pioneers decentralized preventative healthcare by delivering chronic disease diagnostics and therapeutics directly to 1+ Crore doorsteps.",
      uniqueKey: "Cuts out-of-pocket health expenditure while mitigating premature cardiovascular mortality through early asymptomatic screening.",
      wayForward: "Leverage TNeGA digital health records to create unified predictive epidemiological surveillance across all 38 districts.",
    },
  },
  {
    id: "innuyir_kaappom",
    title: "Innuyir Kaappom - Nammai Kakkum 48",
    tagline: "Free Emergency Trauma & Golden Hour Intervention Scheme",
    nodal: "Health and Family Welfare Department",
    outlay: "Universal cashless trauma care up to ₹1,00,000 per victim",
    target: "Any road accident victim inside Tamil Nadu (irrespective of state/nationality)",
    keyFeatures: [
      "Covers 81 critical trauma procedures within the golden first 48 hours in 680+ empaneled hospitals.",
      "Emergency treatment is 100% cashless, eliminating delays caused by admission formalities.",
      "Has saved over 2.2 Lakh accident victims with state reimbursement exceeding ₹180 Crore.",
    ],
    mainsPlacement: {
      paper: "Paper II (GS 1) Public Health & Paper III (GS 2) Governance",
      introHook: "Innuyir Kaappom enshrines the fundamental Right to Life (Article 21) by guaranteeing cashless emergency trauma treatment up to ₹1 Lakh within the critical golden hour.",
      uniqueKey: "Saved over 2.2 Lakh road crash victims with zero out-of-pocket payment across 680+ public and private network hospitals.",
      wayForward: "Integrate emergency GIS blackspot ambulance routing with automated trauma triage dispatch systems.",
    },
  },
  {
    id: "tn_climate",
    title: "Tamil Nadu Climate Change Mission & Green Mission",
    tagline: "Pioneering Sub-National Climate Governance and Wetland Conservation",
    nodal: "Environment, Climate Change and Forests Department",
    outlay: "Dedicated Climate Governing Council headed by the Chief Minister",
    target: "All 38 districts, 16 Ramsar Wetland Sites, and 1,076 km coastline",
    keyFeatures: [
      "First state in India to establish a dedicated Climate Change Mission and Climate Governing Council.",
      "Green Tamil Nadu Mission: Targets increasing tree/forest cover from 23.7% to 33% by 2032.",
      "Tamil Nadu Wetlands Mission: Successfully designated 16 Ramsar Sites (Highest in India).",
    ],
    mainsPlacement: {
      paper: "Paper IV (GS 3) Unit II (Environment, Biodiversity and Climate Change)",
      introHook: "Tamil Nadu established India's first sub-national Climate Change Mission to steer carbon-neutral transition, coastal resilience, and ecosystem conservation.",
      uniqueKey: "Holds the national record with 16 Ramsar Wetland Sites and established India's first Dugong Conservation Reserve in Palk Bay (448 sq. km).",
      wayForward: "Mobilize blue carbon financing mechanisms and institutionalize district-level climate adaptation blueprints across vulnerable coastal belts.",
    },
  },
  {
    id: "vidiyal_payanam",
    title: "Vidiyal Payanam (Zero-Fare Bus Travel for Women)",
    tagline: "Urban & Rural Mobility Equity and Women Workforce Inclusion",
    nodal: "Transport Department",
    outlay: "₹3,000+ Crore annual government subsidy to State Transport Undertakings (STUs)",
    target: "Women, trans-women, and differently-abled individuals across ordinary town buses",
    keyFeatures: [
      "100% fare-free travel on government town/city buses statewide.",
      "Over 500 Crore zero-fare trips completed since inception.",
      "State Planning Commission study: Saves each beneficiary ₹800–₹1,200 monthly in transit costs.",
    ],
    mainsPlacement: {
      paper: "Paper II (GS 1) Social Issues & Paper IV (GS 3) Infrastructure",
      introHook: "Vidiyal Payanam operationalizes public transit as an instrument of social justice, enabling over 500 Crore fare-free trips for women commuters.",
      uniqueKey: "Saves ₹800-₹1,200 monthly per woman, directly driving Tamil Nadu's nation-leading 42% female industrial workforce participation.",
      wayForward: "Augment electric bus fleet transition in Tier-2/3 towns to synchronize female transit access with zero-emission urban transport.",
    },
  },
];

function getAllCapsules() {
  return SCHEME_CAPSULES;
}

function getCapsuleById(id) {
  return SCHEME_CAPSULES.find((c) => c.id === id);
}

function searchCapsules(query) {
  if (!query || !query.trim()) return SCHEME_CAPSULES;
  const q = query.toLowerCase().trim();
  return SCHEME_CAPSULES.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.tagline.toLowerCase().includes(q) ||
      c.target.toLowerCase().includes(q) ||
      c.mainsPlacement.paper.toLowerCase().includes(q)
  );
}

function formatCapsuleCard(c) {
  const lines = [
    `🌟 <b>TAMIL NADU POLICY & SCHEME CAPSULE</b>`,
    `────────────────────────────────────────`,
    `🏛️ <b>Scheme:</b> <b>${c.title}</b>`,
    `📌 <i>"${c.tagline}"</i>`,
    ``,
    `🏢 <b>Nodal Department:</b> <code>${c.nodal}</code>`,
    `💰 <b>Outlay & Allocation:</b> <code>${c.outlay}</code>`,
    `👥 <b>Target Beneficiaries:</b> ${c.target}`,
    `────────────────────────────────────────`,
    `📋 <b>Core Highlights:</b>`,
  ];

  c.keyFeatures.forEach((f, i) => lines.push(`• <b>${i + 1}.</b> ${f}`));

  lines.push(``);
  lines.push(`🎯 <b>HOW TO INJECT IN 12-RULE MAINS ANSWER:</b>`);
  lines.push(`📚 <b>Syllabus Link:</b> <i>${c.mainsPlacement.paper}</i>`);
  lines.push(`⚡ <b>Intro Current Affairs Box:</b>`);
  lines.push(`<blockquote>⚡ <b>[CURRENT AFFAIRS / CORE FOCUS]:</b> ${c.mainsPlacement.introHook}</blockquote>`);
  lines.push(`💡 <b>Standout Unique Key Box:</b>`);
  lines.push(`<blockquote>💡 <b>[UNIQUE KEY / VALUE ADDITION]:</b> ${c.mainsPlacement.uniqueKey}</blockquote>`);
  lines.push(`🌱 <b>Way Forward / Conclusion:</b>`);
  lines.push(`<i>"${c.mainsPlacement.wayForward}"</i>`);
  lines.push(`────────────────────────────────────────`);
  lines.push(`📌 <i>Use /qcab to generate a printable practice booklet for this scheme!</i>`);

  return lines.join("\n");
}

module.exports = {
  SCHEME_CAPSULES,
  getAllCapsules,
  getCapsuleById,
  searchCapsules,
  formatCapsuleCard,
};
