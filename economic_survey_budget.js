/**
 * Tamil Nadu Economic Survey & Budget Stats Injector
 * Authentic data from Tamil Nadu Budget 2024-25 / 2025-26 & State Economic Appraisal.
 */

const BUDGET_MACRO = {
  fiscalYear: "2024-25 (Budget Estimates)",
  gsdp: "₹31.55 Lakh Crore (~$380 Billion)",
  gsdpGrowth: "15.1% (Nominal GSDP Growth Rate)",
  revenueReceipts: "₹2,99,009 Crore",
  sotr: "₹1,95,173 Crore (State's Own Tax Revenue - 65% of total revenue)",
  revenueDeficit: "₹44,907 Crore (1.42% of GSDP)",
  fiscalDeficit: "₹1,08,690 Crore (3.44% of GSDP - within FRBM & 15th FC limits)",
  debtToGsdp: "26.69% (Within prudential fiscal benchmark)",
  capitalOutlay: "₹44,380 Crore (Record public capital expenditure)",
};

const SECTORAL_GSVA = [
  {
    sector: "🌾 Primary Sector (Agriculture, Livestock & Fisheries)",
    share: "11.2% of GSVA",
    highlights: "Separate Agricultural Budget presented annually since 2021; emphasis on traditional millets and organic farming clusters.",
  },
  {
    sector: "🏭 Secondary Sector (Manufacturing, Construction & Utilities)",
    share: "37.4% of GSVA (National average: ~29%)",
    highlights: "Key driver of Tamil Nadu's economy; #1 in female factory employment (42% of India) and #1 in Electronics Exports ($9.5B+).",
  },
  {
    sector: "💻 Tertiary Sector (Services, IT, Banking & Logistics)",
    share: "51.4% of GSVA",
    highlights: "Pioneering SaaS capital of India (Chennai); extensive TIDEL park network expanding into Tier-2/3 cities (Madurai, Tiruchi, Salem).",
  },
];

const DEPARTMENT_ALLOCATIONS = [
  { dept: "School Education", allocation: "₹44,042 Crore", flagship: "CM Breakfast Scheme, Model Schools (Thagaisal Palligal), Smart Classrooms" },
  { dept: "Agriculture & Farmers Welfare", allocation: "₹42,282 Crore", flagship: "Kalaignar All Village Agri Development, Micro-irrigation, Millet Mission" },
  { dept: "Rural Development & Panchayats", allocation: "₹27,922 Crore", flagship: "Kalaignar Kanavu Illam (Rural Housing), Anaithu Grama Anna Marumalarchi" },
  { dept: "Highways & Minor Ports", allocation: "₹20,052 Crore", flagship: "CM Road Development Programme, Thoothukudi Outer Harbour, Port connectivity" },
  { dept: "Health & Family Welfare", allocation: "₹20,198 Crore", flagship: "Makkalai Thedi Maruthuvam, Innuyir Kaappom 48, District Medical Colleges" },
  { dept: "Social Welfare & Women", allocation: "₹7,830 Crore", flagship: "Pudhumai Penn, Moovalur Ramamirtham, Working Women Hostels (Thozhi)" },
  { dept: "Higher Education", allocation: "₹8,212 Crore", flagship: "Naan Mudhalvan, Tamizh Pudhalvan Scheme, Modern Research Labs" },
  { dept: "Special Programme Implementation", allocation: "₹13,720 Crore", flagship: "Kalaignar Magalir Urimai Thogai (₹1,000/month basic income)" },
];

function formatBudgetSummaryCard() {
  const b = BUDGET_MACRO;
  return [
    `🎯 <b>TAMIL NADU BUDGET 2024-25 & STATE FINANCES</b>`,
    `<i>Macro-Economic Fundamentals & Fiscal Prudence</i>`,
    `────────────────────────────────────────`,
    `📊 <b>GSDP (Gross State Domestic Product):</b> <code>${b.gsdp}</code>`,
    `📈 <b>Nominal GSDP Growth Rate:</b> <code>${b.gsdpGrowth}</code>`,
    `💰 <b>State's Own Tax Revenue (SOTR):</b> <code>${b.sotr}</code>`,
    `🏗️ <b>Capital Outlay (Asset Creation):</b> <code>${b.capitalOutlay}</code>`,
    `📉 <b>Fiscal Deficit:</b> <code>${b.fiscalDeficit}</code>`,
    `🛡️ <b>Debt-to-GSDP Ratio:</b> <code>${b.debtToGsdp}</code> (Within FRBM bounds)`,
    `────────────────────────────────────────`,
    `🏛️ <b>GSVA Sectoral Composition:</b>`,
    SECTORAL_GSVA.map((s) => `• <b>${s.sector}:</b> <code>${s.share}</code>`).join("\n"),
    `────────────────────────────────────────`,
    `💡 <i>Quote these exact budget figures under Paper IV (Economy) to demonstrate analytical authority!</i>`,
  ].join("\n");
}

function formatDepartmentAllocationsCard() {
  const lines = [
    `🏛️ <b>KEY DEPARTMENTAL BUDGET ALLOCATIONS (2024-25)</b>`,
    `────────────────────────────────────────`,
  ];

  DEPARTMENT_ALLOCATIONS.forEach((d, i) => {
    lines.push(`<b>${i + 1}. ${d.dept}:</b> <code>${d.allocation}</code>`);
    lines.push(`   📌 <i>Flagship: ${d.flagship}</i>`);
    lines.push("");
  });

  lines.push(`💡 <i>Use in Introduction boxes or Unique Key points for respective governance topics!</i>`);
  return lines.join("\n");
}

module.exports = {
  BUDGET_MACRO,
  SECTORAL_GSVA,
  DEPARTMENT_ALLOCATIONS,
  formatBudgetSummaryCard,
  formatDepartmentAllocationsCard,
};
