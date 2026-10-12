/**
 * Tamil Nadu High-Yield Stats & Scheme Injector for TNPSC Mains
 * Curated authentic official data points from:
 * - Tamil Nadu Budget 2024-25 / 2025-26
 * - NITI Aayog SDG India Index 2023-24
 * - NFHS-5 (National Family Health Survey)
 * - Socio-Economic Survey of Tamil Nadu & RBI State Finances
 */

const TN_STATS_DATA = {
  economy: {
    category: "📈 Economy, Industries & Infrastructure",
    shortCode: "economy",
    headline: "Tamil Nadu: 2nd Largest State Economy in India & Industrial Powerhouse",
    points: [
      {
        metric: "GSDP & Target",
        stat: "GSDP: ₹31.55 Lakh Crore (~$380 Billion) | Vision: $1 Trillion Economy by 2030",
        source: "TN Budget 2024-25",
        useIn: "Economic growth, industrial policy, state finances",
      },
      {
        metric: "National Contribution",
        stat: "Contributes ~8.8% to India's National GDP; 2nd largest state economy in India",
        source: "RBI State Finances Report",
        useIn: "Federal economy, manufacturing sector",
      },
      {
        metric: "Women Factory Workforce",
        stat: "Employs ~42% of India's total female factory workforce (Over 4x the next state)",
        source: "Annual Survey of Industries (ASI)",
        useIn: "Women empowerment, inclusive industrialization, labour reforms",
      },
      {
        metric: "EV & Electronics Capital",
        stat: "Produces 70% of India's 2-wheeler EVs (Hosur/Chennai); #1 in Electronics Exports ($9.5B+ in FY24)",
        source: "Ministry of Commerce / Guidance TN",
        useIn: "Green mobility, export dynamism, Make in India",
      },
      {
        metric: "Urbanization Rate",
        stat: "48.4% Urbanized (Census 2011), projected >53% in 2024; most urbanized large state",
        source: "TN Urban Development Policy",
        useIn: "Urban planning, smart cities, municipal governance",
      },
    ],
  },
  health: {
    category: "🏥 Health & Human Development",
    shortCode: "health",
    headline: "Tamil Nadu Model: Robust Public Healthcare & Low Mortality",
    points: [
      {
        metric: "Infant Mortality Rate (IMR)",
        stat: "13 per 1,000 live births (National Average: 28)",
        source: "SRS Bulletin / NFHS-5",
        useIn: "Child health, maternal care, public health infrastructure",
      },
      {
        metric: "Maternal Mortality Ratio (MMR)",
        stat: "54 per 1,00,000 live births (National Average: 97; SDG target 70 already surpassed)",
        source: "SRS Special Bulletin",
        useIn: "Institutional deliveries, maternal nutrition",
      },
      {
        metric: "Institutional Deliveries",
        stat: "99.8% Institutional Deliveries across the state (99.9% in urban, 99.7% in rural)",
        source: "NFHS-5",
        useIn: "Primary health centres, public hospital access",
      },
      {
        metric: "Makkalai Thedi Maruthuvam",
        stat: "Doorstep screening & NCD drug delivery: Covered 1.05+ Crore beneficiaries statewide",
        source: "TN Health Dept Portal",
        useIn: "Non-communicable diseases, preventive healthcare, grassroots delivery",
      },
      {
        metric: "Innuyir Kaappom - Nammai Kakkum 48",
        stat: "Free emergency trauma care up to ₹1 Lakh within first 48 hours; 2.2+ Lakh lives saved",
        source: "TN Health Policy Note 2024",
        useIn: "Road safety, emergency medical services, golden hour intervention",
      },
    ],
  },
  education: {
    category: "🎓 Education, Literacy & Youth Upskilling",
    shortCode: "education",
    headline: "Highest Higher Education Enrolment & Flagship Youth Missions",
    points: [
      {
        metric: "Gross Enrolment Ratio (GER)",
        stat: "Higher Education GER: 47.0% (National Average: 28.4%) | Female GER: 48.3%",
        source: "AISHE (All India Survey on Higher Education)",
        useIn: "Higher education expansion, gender parity, demographic dividend",
      },
      {
        metric: "Pudhumai Penn Scheme",
        stat: "₹1,000/month stipend for girls from government schools pursuing higher education; boosted girl enrolment by ~34%",
        source: "TN Social Welfare Dept",
        useIn: "Girl child education, drop-out reduction, social mobility",
      },
      {
        metric: "Tamizh Pudhalvan Scheme",
        stat: "₹1,000/month financial aid for boys from govt schools joining college; budget ₹360 Cr",
        source: "TN Budget 2024-25",
        useIn: "Equitable youth support, college retention",
      },
      {
        metric: "Naan Mudhalvan Scheme",
        stat: "Flagship skill enhancement platform: Upskilled 28+ Lakh students across engineering, arts & polytechnics",
        source: "Tamil Nadu Skill Development Corp (TNSDC)",
        useIn: "Industry-readiness, technical skilling, employability",
      },
      {
        metric: "Chief Minister's Breakfast Scheme",
        stat: "Hot breakfast provided to 17+ Lakh primary school children (Classes 1-5); increased attendance by 20%",
        source: "Evaluation by State Planning Commission",
        useIn: "Child nutrition, cognitive development, public schooling strength",
      },
    ],
  },
  welfare: {
    category: "🛡️ Social Justice, Welfare & Gender Parity",
    shortCode: "welfare",
    headline: "Pioneering Social Welfare & Dravidian Social Justice Model",
    points: [
      {
        metric: "Kalaignar Magalir Urimai Thogai",
        stat: "Universal basic income of ₹1,000/month transferred directly to 1.15 Crore women heads of family",
        source: "TN Finance Dept (₹13,720 Cr budget)",
        useIn: "Unpaid care work recognition, economic empowerment, poverty alleviation",
      },
      {
        metric: "Vidiyal Payanam (Free Bus Travel)",
        stat: "Zero-fare bus travel for women: Over 500 Crore trips completed; saves ~₹800-₹1,200/month per woman",
        source: "TN Transport Dept Study",
        useIn: "Labour mobility, female workforce participation, urban transport equity",
      },
      {
        metric: "69% Reservation Policy",
        stat: "Tamil Nadu pioneered 69% reservation (BC, MBC, SC, ST) protected under 9th Schedule (76th Amendment Act, 1994)",
        source: "TN Backward Classes Dept / Constitution",
        useIn: "Affirmative action, social justice, constitutional safeguards",
      },
      {
        metric: "NITI Aayog SDG Index Rank",
        stat: "Ranked #3 in India on overall Sustainable Development Goals (Score: 78/100)",
        source: "NITI Aayog SDG India Index 2023-24",
        useIn: "Good governance, poverty eradication, sustainable growth",
      },
      {
        metric: "Self-Help Groups (TNSRLM)",
        stat: "4.5+ Lakh SHGs with 50+ Lakh women members; credit linkage exceeding ₹30,000 Crore annually",
        source: "Tamil Nadu Rural Transformation Project (TNRTP)",
        useIn: "Microfinance, rural entrepreneurship, self-reliance",
      },
    ],
  },
  environment: {
    category: "🌿 Environment, Climate Change & Water Resources",
    shortCode: "environment",
    headline: "First State in India with a Dedicated Climate Change Mission",
    points: [
      {
        metric: "TN Climate Change Mission",
        stat: "First Indian State to launch a dedicated State Climate Change Mission & Climate Governing Council",
        source: "TN Environment & Forest Dept",
        useIn: "Climate adaptation, carbon neutrality, renewable energy transition",
      },
      {
        metric: "Tamil Nadu Green Mission",
        stat: "Target to increase tree and forest cover from 23.7% to 33% by 2032 through mass afforestation",
        source: "Green TN Mission Policy Note",
        useIn: "Ecology preservation, urban forestry, biodiversity",
      },
      {
        metric: "Ramsar Wetland Sites",
        stat: "16 Ramsar Wetland Sites (Highest in India); including Point Calimere, Pallikaranai, Pichavaram",
        source: "Ministry of Environment, Forest & Climate Change (MoEFCC)",
        useIn: "Ecosystem restoration, wetland preservation, migratory birds",
      },
      {
        metric: "Dugong Conservation Reserve",
        stat: "India's first Dugong Conservation Reserve established in Palk Bay (448 sq. km)",
        source: "TN Wildlife Wing",
        useIn: "Marine conservation, endangered species protection",
      },
      {
        metric: "Meendum Manjappai Campaign",
        stat: "Revival of traditional cloth bags to eliminate single-use plastics across 38 districts",
        source: "TN Pollution Control Board (TNPCB)",
        useIn: "Solid waste management, circular economy, behavioural change",
      },
    ],
  },
  governance: {
    category: "🏛️ Governance, Technology & Public Administration",
    shortCode: "governance",
    headline: "Digital Governance, Service Delivery & Citizen Centricity",
    points: [
      {
        metric: "CM Dashboard 360",
        stat: "Real-time automated KPI tracking of 60+ departments, key dams, hospital beds, and crime indices",
        source: "TN e-Governance Agency (TNeGA)",
        useIn: "Data-driven administration, bureaucratic accountability, transparency",
      },
      {
        metric: "Ungal Thogudhiyil Muthalvar",
        stat: "Grievance redressal mission solving citizen petitions in 100 days; resolution rate >85%",
        source: "Special Programme Implementation Dept",
        useIn: "Citizen charter, public grievance redressal, responsive bureaucracy",
      },
      {
        metric: "e-Sevai Centres & TN e-District",
        stat: "Over 12,000 e-Sevai centres delivering 300+ public certificates and welfare schemes digitally",
        source: "TNeGA Annual Report",
        useIn: "Last-mile service delivery, reduction of corruption, digital empowerment",
      },
      {
        metric: "Panchayati Raj Leadership",
        stat: "50% reservation for women in local bodies (Gram Panchayats, Municipalities, Corporations)",
        source: "TN Panchayats Act Amendments",
        useIn: "Grassroots democracy, female political representation, decentralization",
      },
    ],
  },
};

/**
 * Get all categories formatted for inline buttons
 */
function getStatCategories() {
  return Object.keys(TN_STATS_DATA).map((key) => ({
    key,
    name: TN_STATS_DATA[key].category,
    shortCode: TN_STATS_DATA[key].shortCode,
  }));
}

/**
 * Format a single category into a modern Telegram HTML Card
 */
function formatCategoryCard(catKey) {
  const cat = TN_STATS_DATA[catKey];
  if (!cat) return null;

  const lines = [
    `🏛️ <b>TAMIL NADU OFFICIAL POLICY & STATS BANK</b>`,
    `<b>Category:</b> <code>${cat.category}</code>`,
    `<i>${cat.headline}</i>`,
    `────────────────────────────────────`,
  ];

  cat.points.forEach((p, idx) => {
    lines.push(`<b>${idx + 1}. ${p.metric}:</b>`);
    lines.push(`<blockquote>📊 <b>Stat:</b> ${p.stat}\n📚 <b>Source:</b> <i>${p.source}</i>\n🎯 <b>Use in:</b> <code>${p.useIn}</code></blockquote>`);
    lines.push("");
  });

  lines.push(`💡 <i>Tip: Quote these exact numbers & sources in your Introduction, Unique Key Box, or Body points to secure top marks!</i>`);
  return lines.join("\n");
}

/**
 * Search stats by keyword across all categories
 */
function searchStats(keyword) {
  if (!keyword || !keyword.trim()) return [];
  const q = keyword.toLowerCase().trim();
  const results = [];

  for (const [catKey, cat] of Object.entries(TN_STATS_DATA)) {
    for (const p of cat.points) {
      if (
        p.metric.toLowerCase().includes(q) ||
        p.stat.toLowerCase().includes(q) ||
        p.useIn.toLowerCase().includes(q) ||
        cat.category.toLowerCase().includes(q)
      ) {
        results.push({ ...p, category: cat.category, catKey });
      }
    }
  }

  return results;
}

/**
 * Format search results into a clean card
 */
function formatSearchResultsCard(keyword, results) {
  if (!results.length) {
    return [
      `🔍 <b>TN Stats Search:</b> "<code>${keyword}</code>"`,
      `────────────────────────────────────`,
      `<i>No exact match found in the high-yield database.</i>`,
      ``,
      `💡 Try searching: <code>economy</code>, <code>health</code>, <code>ger</code>, <code>women</code>, <code>climate</code>, <code>ger</code>, <code>schemes</code>`,
    ].join("\n");
  }

  const lines = [
    `🔍 <b>TN STATS SEARCH RESULTS:</b> "<code>${keyword}</code>"`,
    `<i>Found ${results.length} high-yield statistical citation(s):</i>`,
    `────────────────────────────────────`,
  ];

  results.slice(0, 5).forEach((r, idx) => {
    lines.push(`<b>${idx + 1}. [${r.category.split(" ")[1] || "TN"}] ${r.metric}:</b>`);
    lines.push(`<blockquote>📊 <b>${r.stat}</b>\n📚 <i>Source: ${r.source}</i>\n🎯 <i>Use in: ${r.useIn}</i></blockquote>`);
    lines.push("");
  });

  lines.push(`📌 <i>Copy and paste directly into your 12-rule Mains answer!</i>`);
  return lines.join("\n");
}

module.exports = {
  TN_STATS_DATA,
  getStatCategories,
  formatCategoryCard,
  searchStats,
  formatSearchResultsCard,
};
