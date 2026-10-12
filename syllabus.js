/**
 * TNPSC Group-1 Mains - Full Syllabus Topic List
 * All topics are extracted after '–' from the official syllabus.
 * Used by the daily auto-scheduler for sequential topic rotation.
 *
 * Rotation: Day 1 = index 0, Day 2 = index 1, ...
 * After last topic, wraps back to index 0.
 */

const SYLLABUS_TOPICS = [

    // ─────────────────────────────────────────────────────────────
    // PAPER II – GENERAL STUDIES I
    // ─────────────────────────────────────────────────────────────

    // Unit I: Modern History of India and Indian Culture
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Advent of Europeans" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Colonialism and Imperialism" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Establishment, Expansion and Consolidation of British Rule" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Early Uprising against British Rule" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "South Indian Rebellion 1799–1801 A.D." },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Vellore Rebellion 1806 A.D." },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Sepoy Mutiny of 1857 A.D." },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Indian National Movements" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Moderation, Extremism and Terrorism Movements of Indian Patriotism" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Significant Indian National Leaders – Rabindranath Tagore and Maulana Abulkalam Azad" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Mohandas Karamchand Gandhi – Life and Contributions" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Jawaharlal Nehru – Life and Contributions" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Subhas Chandra Bose – Life and Contributions" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "B.R. Ambedkar and Vallabhai Patel – Contributions" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Constitutional Developments in India from 1773 to 1950" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Second World War and Final Phase of Independence Struggle" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Partition of India" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Role of Tamil Nadu in Freedom Struggle – Subramanya Siva and Subramania Bharathiyar" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "V.O. Chidambaranar and C. Rajagopalachariyar – Contributions" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Thanthai Periyar and Kamarajar – Contributions" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Impact of British Rule on Socio-Economic Affairs" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "National Renaissance Movement" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Socio-Religious Reform Movements" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Social Reform and Educational Reform Acts" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Emergence of Social Justice Ideology in Tamil Nadu" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Origin, Growth, Decay and Achievements of Justice Party" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Socio-Political Movements and Achievements after Justice Party" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "India since Independence" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Salient Features of Indian Culture – Unity in Diversity, Race, Language, Religion" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "India as a Secular State – National Symbols and Cultural Panorama" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Organizations for Fine Arts, Dance, Drama and Music" },
    { paper: "General Studies I", unit: "Modern History of India and Indian Culture", topic: "Latest Historical Research Developments in Tamil Nadu" },

    // Unit II: Social Issues in India and Tamil Nadu
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Population Explosion – Fertility, Mortality and Population Control Programmes" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Migration, Poverty and Illiteracy" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Right to Education – Women Education and Skill-Based Education" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "E-Learning and Digital Education Programmes" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Child Labour and Child Abuse – Causes and Impact" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Child School Dropouts – Laws and Child Protection Schemes" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Rural and Urban Sanitation – Role of Panchayat Raj" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Women Empowerment – Schemes, Programmes and Social Justice" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Domestic Violence, Dowry Menace and Sexual Assault – Laws and Awareness" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Prevention of Violence against Women – Role of Government and NGOs" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Urbanization – Policy, Planning and Programmes in India and Tamil Nadu" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Impact of Violence on Society – Religious Violence, Terrorism and Communal Violence" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Problems of Minorities and Human Rights Issues" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Regional Disparities in India – Causes and Remedies" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Social Development – Approaches, Models, Policies and Programmes" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Community Development Programmes – Self-Employment and Entrepreneurship" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Role of NGOs in Social Development" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Health Care Problems in India – Children, Adolescents, Women and Aged" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Health Policy in India – Schemes and Health Care Programmes" },
    { paper: "General Studies I", unit: "Social Issues in India and Tamil Nadu", topic: "Vulnerable Sections of Population – Problems, Laws, Punishments and Welfare Programmes" },

    // Unit III: Ethics and Integrity
    { paper: "General Studies I", unit: "Ethics and Integrity", topic: "Ethics and Human Interface – Definition and Scope" },
    { paper: "General Studies I", unit: "Ethics and Integrity", topic: "Ethics of Indian Schools of Philosophy" },
    { paper: "General Studies I", unit: "Ethics and Integrity", topic: "Ethics of Thirukkural" },
    { paper: "General Studies I", unit: "Ethics and Integrity", topic: "Intuitionism and Existentialism" },
    { paper: "General Studies I", unit: "Ethics and Integrity", topic: "Duties, Responsibility, Moral Judgements and Moral Absolutism" },
    { paper: "General Studies I", unit: "Ethics and Integrity", topic: "Attitude – Influence and Relation with Thought and Behaviour" },
    { paper: "General Studies I", unit: "Ethics and Integrity", topic: "Moral and Political Attitudes" },
    { paper: "General Studies I", unit: "Ethics and Integrity", topic: "Ethics in Public Administration – Philosophical Basis of Governance and Probity" },
    { paper: "General Studies I", unit: "Ethics and Integrity", topic: "Codes of Ethics and Conduct – Primary Responsibilities of Public Service Professionals" },
    { paper: "General Studies I", unit: "Ethics and Integrity", topic: "Transparency of Information Sharing and Service Delivery" },
    { paper: "General Studies I", unit: "Ethics and Integrity", topic: "Professional and Non-Professional Interaction – Confidentiality and Disclosure" },
    { paper: "General Studies I", unit: "Ethics and Integrity", topic: "Citizen's Charters and Challenges of Corruption" },
    { paper: "General Studies I", unit: "Ethics and Integrity", topic: "Ethics and Non-Discrimination – Ethics of Public Policy Determination" },

    // ─────────────────────────────────────────────────────────────
    // PAPER III – GENERAL STUDIES II
    // ─────────────────────────────────────────────────────────────

    // Unit I: Indian Polity and Emerging Political Trends
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Constitution of India – Historical Background and Making of the Indian Constitution" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Preamble and Salient Features of Indian Constitution" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Parts, Articles, Schedules and Amendments" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Citizenship" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Fundamental Rights and Fundamental Duties" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Directive Principles of State Policy" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Union Government – Legislature: Lok Sabha and Rajya Sabha" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Executive: President, Vice-President, Prime Minister and Council of Ministers" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Judiciary: Supreme Court – Judicial Review and Judicial Activism" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "State Government – Legislature: State Legislative Assembly and Council" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "State Executive: Governor, Chief Minister and Council of Ministers" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "High Court, District Courts, Subordinate Courts and Tribunals" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Local Government – 73rd and 74th Constitutional Amendment Acts" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Union Territories – Evolution and Administration" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Federalism – Indian Federal System and Union-State Relations" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Civil Services in India – Classification, Recruitment and Training" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Political Parties – National and Regional – Pressure Groups and Public Opinion" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Mass Media, Social Media and NGOs" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Anti-Corruption Measures – Lokadalat, Lokayukta, Lokpal and Ombudsman" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "RTI Act, Citizen's Grievances and Administrative Reform Commission" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Profile of Indian States – Demography, e-Governance and Developmental Programmes" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "India's Foreign Policy and Relationship with World Countries" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Defence, National Security, Nuclear Policy and Terrorism" },
    { paper: "General Studies II", unit: "Indian Polity and Emerging Political Trends", topic: "Human Rights, Environmental Issues and International Organisations" },

    // Unit II: Role and Impact of Science and Technology
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Science and Technology – Role, Achievements and Developments" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Acids, Bases, Salts, Oxidation and Reduction" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Carbon, Nitrogen and their Compounds" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Chemistry of Ores and Metals – Fertilizers, Pesticides and Insecticides" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Polymer, Plastics, Corrosion and Chemistry in Everyday Life" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Renewable and Non-Renewable Energy – Oils and Minerals Exploration" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Space Research – ISRO Achievements and Chandrayaan Mission" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Nano Science and Technology – Applications of Nano-Materials" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Artificial Intelligence, Robotics and Automation" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Mobile Communication and Information Technology Advancements" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Computer Networks, Cryptography and Network Security" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Software Engineering, Image Processing and Machine Learning" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Organic Farming, Agriculture Biotechnology and Genetically Modified Crops" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Intellectual Property Rights and Bio Safety" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Floriculture, Olericulture, Pomology and Medicinal Plants" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Hydroponics, Bonsai, Greenhouse Technology and Preservation of Fruits and Vegetables" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Genetic Engineering in Agriculture – Integrated Farming and Vermiculture" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "The Cell – Basic Unit of Life and Classification of Living Organisms" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Nutrition, Dietetics, Respiration and Blood Circulation" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Endocrine System, Excretion and Reproductive System" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Genetics – Science of Heredity and Pheromones" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Human Diseases – Communicable and Non-Communicable – Preventions and Remedies" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Alcoholism and Drug Abuse" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Organ Transplantation and Stem Cell Technology" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Forensic Science and Sewage Treatment" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "DRDO, Ocean Research and Medical Tourism" },
    { paper: "General Studies II", unit: "Role and Impact of Science and Technology", topic: "Achievements of Indians in Science and Technology – Latest Inventions" },

    // Unit III: Tamil Society – Culture and Heritage
    { paper: "General Studies II", unit: "Tamil Society – Culture and Heritage", topic: "Origin and Development of Tamilian – Palmleaf Manuscripts and Documents" },
    { paper: "General Studies II", unit: "Tamil Society – Culture and Heritage", topic: "Archaeological Excavations in Tamil Nadu – Adhichanallur, Keeladi, Arikkamedu" },
    { paper: "General Studies II", unit: "Tamil Society – Culture and Heritage", topic: "Arts, Science and Culture – Literature, Music, Drama and Fine Arts" },
    { paper: "General Studies II", unit: "Tamil Society – Culture and Heritage", topic: "Tamil Society – Sangam Age, Medieval Age and Modern Age" },
    { paper: "General Studies II", unit: "Tamil Society – Culture and Heritage", topic: "Growth of Rationalist and Origin of Dravidian Movements in Tamil Nadu" },
    { paper: "General Studies II", unit: "Tamil Society – Culture and Heritage", topic: "Contribution of Dravidian Movements to Socio-Economic Development" },
    { paper: "General Studies II", unit: "Tamil Society – Culture and Heritage", topic: "Socio-Cultural Life of Modern Tamilian – Caste, Religion, Women, Polity" },
    { paper: "General Studies II", unit: "Tamil Society – Culture and Heritage", topic: "Tamil Diaspora – Commerce and Relationship with Other Countries" },
    { paper: "General Studies II", unit: "Tamil Society – Culture and Heritage", topic: "Development of Modern Tamils – Print, Film Industries, Computer and Media" },

    // ─────────────────────────────────────────────────────────────
    // PAPER IV – GENERAL STUDIES III
    // ─────────────────────────────────────────────────────────────

    // Unit I: General Geography and Geography of India with Special Reference to Tamil Nadu
    { paper: "General Studies III", unit: "General Geography and Geography of India", topic: "Earth and Universe – Solar System" },
    { paper: "General Studies III", unit: "General Geography and Geography of India", topic: "Atmosphere, Lithosphere, Hydrosphere and Biosphere" },
    { paper: "General Studies III", unit: "General Geography and Geography of India", topic: "India and Tamil Nadu – Location and Physical Divisions" },
    { paper: "General Studies III", unit: "General Geography and Geography of India", topic: "Drainage System of India and Tamil Nadu" },
    { paper: "General Studies III", unit: "General Geography and Geography of India", topic: "Weather and Climate – Monsoon and Rainfall Patterns" },
    { paper: "General Studies III", unit: "General Geography and Geography of India", topic: "Natural Resources – Soil, Natural Vegetation and Wildlife" },
    { paper: "General Studies III", unit: "General Geography and Geography of India", topic: "Irrigation and Multipurpose Projects in India and Tamil Nadu" },
    { paper: "General Studies III", unit: "General Geography and Geography of India", topic: "Mineral Resources and Energy Resources" },
    { paper: "General Studies III", unit: "General Geography and Geography of India", topic: "Agriculture – Crops, Livestock, Fisheries and Agricultural Revolutions" },
    { paper: "General Studies III", unit: "General Geography and Geography of India", topic: "Industries in India and Tamil Nadu" },
    { paper: "General Studies III", unit: "General Geography and Geography of India", topic: "Population – Growth, Distribution, Density and Migration" },
    { paper: "General Studies III", unit: "General Geography and Geography of India", topic: "Races, Tribes, Linguistics and Religions" },
    { paper: "General Studies III", unit: "General Geography and Geography of India", topic: "Trade and Geo Politics – Border Disputes" },
    { paper: "General Studies III", unit: "General Geography and Geography of India", topic: "Ocean and Sea – Bottom Relief Features of Indian Ocean, Arabian Sea and Bay of Bengal" },
    { paper: "General Studies III", unit: "General Geography and Geography of India", topic: "Geospatial Technology – Remote Sensing, GIS and GNSS" },

    // Unit II: Environment, Biodiversity and Disaster Management
    { paper: "General Studies III", unit: "Environment, Biodiversity and Disaster Management", topic: "Ecology – Structure and Function of Ecosystem" },
    { paper: "General Studies III", unit: "Environment, Biodiversity and Disaster Management", topic: "Ecological Succession and Ecosystem Services" },
    { paper: "General Studies III", unit: "Environment, Biodiversity and Disaster Management", topic: "Biodiversity Conservation – Types and Hot Spots in India" },
    { paper: "General Studies III", unit: "Environment, Biodiversity and Disaster Management", topic: "In-situ and Ex-situ Conservation Measures – Roles of CITES, IUCN and CBD" },
    { paper: "General Studies III", unit: "Environment, Biodiversity and Disaster Management", topic: "Biodiversity Act – Significance and Threats" },
    { paper: "General Studies III", unit: "Environment, Biodiversity and Disaster Management", topic: "Air, Water, Soil, Thermal and Noise Pollution – Prevention and Control" },
    { paper: "General Studies III", unit: "Environment, Biodiversity and Disaster Management", topic: "Solid and Hazardous Waste Management" },
    { paper: "General Studies III", unit: "Environment, Biodiversity and Disaster Management", topic: "Environmental Impact Assessment (EIA) – Steps, Clearance and Auditing" },
    { paper: "General Studies III", unit: "Environment, Biodiversity and Disaster Management", topic: "Sustainable Development Goals (SDGs) and Targets" },
    { paper: "General Studies III", unit: "Environment, Biodiversity and Disaster Management", topic: "Climate Change – Changes in Monsoon Pattern and Environmental Consequences" },
    { paper: "General Studies III", unit: "Environment, Biodiversity and Disaster Management", topic: "Clean and Green Energy – Paris Agreement and Nationally Determined Contributions (NDCs)" },
    { paper: "General Studies III", unit: "Environment, Biodiversity and Disaster Management", topic: "Environmental Laws, Policies and Treaties in India and Global Scenario" },
    { paper: "General Studies III", unit: "Environment, Biodiversity and Disaster Management", topic: "Natural Calamities and Manmade Disasters – Disaster Management and NDMA" },
    { paper: "General Studies III", unit: "Environment, Biodiversity and Disaster Management", topic: "Sendai Framework for Disaster Risk Reduction – Environmental Health and Sanitation" },

    // Unit III: Indian Economy – Current Economic Trends
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Features of Indian Economy – National Income and Capital Formation" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "New Economic Policy (NEP) and NITI Aayog" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Agriculture – Role, Land Reforms, New Agricultural Strategy and Green Revolution" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Contract Farming, Minimum Support Price and Public Distribution System" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Agricultural Marketing, Crop Insurance, Rural Credit and Indebtedness" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "World Trade Organization and Agriculture" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Industry – Growth, Policy, Public Sector Disinvestment and Privatisation" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Public Private Partnership (PPP), SEZs and MSMEs – Make in India" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Infrastructure in India – Transport, Power, Communication and R&D" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Banking and Finance – Central Bank, Commercial Bank and NBFIs" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Stock Market, Financial Reforms and Monetary Policy – RBI and Autonomy" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Public Finance – Tax Revenue, Goods and Service Tax and Public Expenditure" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Fiscal Policy, Public Debt, Finance Commission and Fiscal Federalism" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Poverty and Inequality – Poverty Alleviation Programmes and MGNREGA" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Unemployment, Gender Inequality and New Welfare Programmes for Rural Poverty" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Inflation, Inflation Targeting, Deflation and Sustainable Economic Growth" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "India's Foreign Trade – Balance of Payment, Export-Import Policy and FDI" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Globalisation and Global Economic Crisis – Impact on Indian Economy" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "International Institutions – IMF, World Bank, BRICS, SAARC and ASEAN" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Tamil Nadu Economy – GSDP and Trends in State's Economic Growth" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Tamil Nadu – Agriculture, Contract Farming and Organic Farming Policy" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Industry and Entrepreneurship Development in Tamil Nadu" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Tamil Nadu Infrastructure – Power, Transportation, Tourism and Eco-Tourism" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Self Help Groups, Rural Women Empowerment and Rural Poverty in Tamil Nadu" },
    { paper: "General Studies III", unit: "Indian Economy and Current Economic Trends", topic: "Regional Economic Disparities, Local Government and Recent Welfare Programmes in Tamil Nadu" },
];

function getRandomTopic(paperFilter = null, unitFilter = null) {
  let list = SYLLABUS_TOPICS;
  if (paperFilter) {
    list = list.filter((t) => t.paper.toLowerCase().includes(paperFilter.toLowerCase()));
  }
  if (unitFilter) {
    list = list.filter((t) => t.unit.toLowerCase().includes(unitFilter.toLowerCase()));
  }
  if (!list.length) list = SYLLABUS_TOPICS;
  return list[Math.floor(Math.random() * list.length)];
}

function getTopicsByPaper(paperName) {
  return SYLLABUS_TOPICS.filter((t) => t.paper.toLowerCase().includes(paperName.toLowerCase()));
}

function getTopicsByUnit(unitName) {
  return SYLLABUS_TOPICS.filter((t) => t.unit.toLowerCase().includes(unitName.toLowerCase()));
}

module.exports = {
  SYLLABUS_TOPICS,
  getRandomTopic,
  getTopicsByPaper,
  getTopicsByUnit,
};
