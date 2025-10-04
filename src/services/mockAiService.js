

const logger = require('../utils/logger');

/**
 * Generate mock persona profile based on assessment data
 * @param {Object} assessmentData - Assessment data
 * @param {String} jobId - Job ID for logging
 * @returns {Promise<Object>} - Mock persona profile
 */
const generateMockPersonaProfile = async (assessmentData, jobId) => {
  try {
    logger.info('Generating mock persona profile', { jobId });

    // Simulate AI processing delay - 20 seconds for faster testing
    await new Promise(resolve => setTimeout(resolve, 20000));

    // Extract assessment data for dynamic mock generation
    const { riasec, ocean, viaIs } = assessmentData;

    // Determine archetype based on highest RIASEC scores
    const riasecEntries = Object.entries(riasec);
    const topRiasec = riasecEntries.reduce((a, b) => riasec[a[0]] > riasec[b[0]] ? a : b);
    const secondRiasec = riasecEntries.filter(entry => entry[0] !== topRiasec[0])
      .reduce((a, b) => riasec[a[0]] > riasec[b[0]] ? a : b);

    // Generate archetype based on top RIASEC combinations
    const archetypeMap = {
      'realistic-investigative': 'The Practical Analyst',
      'realistic-conventional': 'The Systematic Builder',
      'investigative-artistic': 'The Creative Researcher',
      'investigative-realistic': 'The Technical Problem Solver',
      'artistic-social': 'The Creative Communicator',
      'artistic-investigative': 'The Innovative Thinker',
      'social-enterprising': 'The People Leader',
      'social-artistic': 'The Empathetic Creator',
      'enterprising-social': 'The Charismatic Leader',
      'enterprising-conventional': 'The Strategic Organizer',
      'conventional-realistic': 'The Detail-Oriented Implementer',
      'conventional-investigative': 'The Methodical Analyst'
    };

    const archetypeKey = `${topRiasec[0]}-${secondRiasec[0]}`;
    const archetype = archetypeMap[archetypeKey] || 'The Balanced Professional';

    // Generate strengths based on top scores
    const strengths = generateStrengths(riasec, ocean, viaIs);
    
    // Generate weaknesses based on low scores
    const weaknesses = generateWeaknesses(riasec, ocean, viaIs);

    // Generate career recommendations based on RIASEC profile
    const careerRecommendation = generateCareerRecommendations(riasec, ocean);

    // Generate insights based on personality profile
    const insights = generateInsights(riasec, ocean, viaIs);

    // Generate work environment based on personality
    const workEnvironment = generateWorkEnvironment(riasec, ocean);

    // Generate role models based on archetype and interests
    const roleModel = generateRoleModels(topRiasec[0], secondRiasec[0]);

    // Generate short summary
    const shortSummary = generateShortSummary(archetype, topRiasec, ocean);

    // Generate additional required fields
    const coreMotivators = generateCoreMotivators(riasec, ocean);
    const learningStyle = generateLearningStyle(ocean);
    const strengthSummary = generateStrengthSummary(strengths);
    const weaknessSummary = generateWeaknessSummary(weaknesses);
    const skillSuggestion = generateSkillSuggestions(riasec, ocean);
    const possiblePitfalls = generatePossiblePitfalls(riasec, ocean);
    const riskTolerance = generateRiskTolerance(ocean);
    const developmentActivities = generateDevelopmentActivities(riasec, ocean);

    const mockProfile = {
      archetype,
      coreMotivators,
      learningStyle,
      shortSummary,
      strengthSummary,
      strengths,
      weaknessSummary,
      weaknesses,
      careerRecommendation,
      insights,
      skillSuggestion,
      possiblePitfalls,
      riskTolerance,
      workEnvironment,
      roleModel,
      developmentActivities
    };

    logger.info('Mock persona profile generated successfully', {
      jobId,
      archetype,
      strengthsCount: strengths.length,
      weaknessesCount: weaknesses.length,
      careerCount: careerRecommendation.length
    });

    return mockProfile;

  } catch (error) {
    logger.error('Failed to generate mock persona profile', {
      jobId,
      error: error.message
    });
    throw error;
  }
};

/**
 * Generate strengths based on assessment scores
 */
const generateStrengths = (riasec, ocean, viaIs) => {
  const strengths = [];

  // RIASEC-based strengths
  if (riasec.realistic > 70) strengths.push('Kemampuan praktis dan hands-on yang kuat');
  if (riasec.investigative > 70) strengths.push('Kemampuan analitis dan problem-solving yang excellent');
  if (riasec.artistic > 70) strengths.push('Kreativitas dan kemampuan berpikir out-of-the-box');
  if (riasec.social > 70) strengths.push('Kemampuan interpersonal dan empati yang tinggi');
  if (riasec.enterprising > 70) strengths.push('Leadership dan kemampuan persuasi yang natural');
  if (riasec.conventional > 70) strengths.push('Organisasi dan attention to detail yang sangat baik');

  // OCEAN-based strengths
  if (ocean.openness > 70) strengths.push('Keterbukaan terhadap ide baru dan pengalaman');
  if (ocean.conscientiousness > 70) strengths.push('Disiplin dan reliability yang tinggi');
  if (ocean.extraversion > 70) strengths.push('Energi sosial dan kemampuan networking yang kuat');
  if (ocean.agreeableness > 70) strengths.push('Kemampuan kerjasama dan diplomasi');

  // VIA-IS based strengths (top 3)
  const viaEntries = Object.entries(viaIs).sort((a, b) => b[1] - a[1]).slice(0, 3);
  viaEntries.forEach(([strength, score]) => {
    if (score > 75) {
      const strengthMap = {
        creativity: 'Kreativitas dan inovasi yang luar biasa',
        curiosity: 'Rasa ingin tahu dan semangat belajar yang tinggi',
        judgment: 'Critical thinking dan kemampuan evaluasi yang tajam',
        loveOfLearning: 'Passion untuk pembelajaran berkelanjutan',
        perseverance: 'Ketekunan dan daya tahan yang kuat',
        leadership: 'Kemampuan memimpin dan menginspirasi orang lain'
      };
      if (strengthMap[strength]) {
        strengths.push(strengthMap[strength]);
      }
    }
  });

  // Ensure minimum 4 strengths by adding generic ones if needed (model expects 4-6)
  const genericStrengths = [
    'Kemampuan adaptasi yang baik dalam berbagai situasi',
    'Dedikasi dan komitmen terhadap pekerjaan',
    'Kemampuan belajar dan berkembang secara berkelanjutan',
    'Integritas dan etika kerja yang kuat',
    'Kemampuan komunikasi yang efektif',
    'Pemikiran sistematis dan terstruktur'
  ];
  for (let i = 0; i < genericStrengths.length && strengths.length < 4; i++) {
    if (!strengths.includes(genericStrengths[i])) strengths.push(genericStrengths[i]);
  }

  return strengths.slice(0, 6); // Limit to 6 strengths
};

/**
 * Generate weaknesses based on low assessment scores
 */
const generateWeaknesses = (riasec, ocean, viaIs) => {
  const weaknesses = [];

  // OCEAN-based weaknesses
  if (ocean.neuroticism > 60) weaknesses.push('Kecenderungan stress dan anxiety dalam situasi pressure');
  if (ocean.conscientiousness < 40) weaknesses.push('Kesulitan dalam manajemen waktu dan organisasi');
  if (ocean.extraversion < 40) weaknesses.push('Kurang nyaman dalam situasi sosial yang intens');
  if (ocean.agreeableness < 40) weaknesses.push('Kesulitan dalam kompromi dan diplomasi');
  if (ocean.openness < 40) weaknesses.push('Resistensi terhadap perubahan dan ide-ide baru');

  // RIASEC-based weaknesses
  if (riasec.social < 40) weaknesses.push('Kurang optimal dalam peran yang membutuhkan interaksi sosial intensif');
  if (riasec.conventional < 40) weaknesses.push('Kesulitan mengikuti prosedur dan sistem yang rigid');
  if (riasec.enterprising < 40) weaknesses.push('Kurang nyaman dalam peran leadership dan sales');

  // VIA-IS based weaknesses (bottom 3)
  const viaEntries = Object.entries(viaIs).sort((a, b) => a[1] - b[1]).slice(0, 3);
  viaEntries.forEach(([weakness, score]) => {
    if (score < 40) {
      const weaknessMap = {
        selfRegulation: 'Kesulitan dalam self-control dan manajemen emosi',
        prudence: 'Kecenderungan impulsif dalam pengambilan keputusan',
        humility: 'Kesulitan menerima feedback dan mengakui keterbatasan',
        forgiveness: 'Kesulitan move on dari konflik atau kekecewaan'
      };
      if (weaknessMap[weakness]) {
        weaknesses.push(weaknessMap[weakness]);
      }
    }
  });

  // Ensure minimum 4 weaknesses (model expects 4-5)
  const genericWeaknesses = [
    'Perlu pengembangan dalam area komunikasi interpersonal',
    'Dapat meningkatkan fleksibilitas dalam menghadapi perubahan',
    'Membutuhkan pengembangan dalam manajemen waktu yang lebih efektif',
    'Perlu peningkatan dalam kemampuan delegasi dan teamwork',
    'Dapat mengembangkan patience dalam menghadapi proses yang lambat'
  ];
  for (let i = 0; i < genericWeaknesses.length && weaknesses.length < 4; i++) {
    if (!weaknesses.includes(genericWeaknesses[i])) weaknesses.push(genericWeaknesses[i]);
  }

  return weaknesses.slice(0, 5); // Limit to 5 weaknesses
};

/**
 * Generate career recommendations based on RIASEC and OCEAN
 * Must match original model format: exactly 4 items, each with
 * { careerName, justification, firstSteps[3], relatedMajors[4-5], careerProspect{...} }
 */
const generateCareerRecommendations = (riasec, ocean) => {
  const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // Determine top 2 RIASEC interests
  const sortedRiasec = Object.entries(riasec).sort((a, b) => b[1] - a[1]);
  const topInterests = sortedRiasec.slice(0, 2).map(([k]) => k);

  // Maps
  const careerMap = {
    realistic: ['Software Engineer', 'Mechanical Engineer', 'Architect', 'Quality Assurance'],
    investigative: ['Data Scientist', 'Research Scientist', 'Data Analyst', 'Psychologist'],
    artistic: ['UX/UI Designer', 'Product Designer', 'Content Creator', 'Marketing Creative'],
    social: ['Teacher', 'Counselor', 'Human Resources Manager', 'Social Worker'],
    enterprising: ['Business Development Manager', 'Project Manager', 'Entrepreneur', 'Sales Director'],
    conventional: ['Financial Analyst', 'Operations Manager', 'Administrative Manager', 'Accountant']
  };

  const majorsMap = {
    realistic: ['Teknik Informatika', 'Teknik Mesin', 'Teknik Industri', 'Arsitektur', 'Sistem Informasi'],
    investigative: ['Ilmu Komputer', 'Statistika', 'Matematika', 'Fisika', 'Biologi'],
    artistic: ['Desain Komunikasi Visual', 'Desain Produk', 'Seni Rupa', 'Arsitektur Interior', 'Ilmu Komunikasi'],
    social: ['Psikologi', 'Pendidikan', 'Kesejahteraan Sosial', 'Bimbingan Konseling', 'Ilmu Komunikasi'],
    enterprising: ['Manajemen', 'Bisnis', 'Pemasaran', 'Kewirausahaan', 'Hubungan Internasional'],
    conventional: ['Akuntansi', 'Sistem Informasi', 'Administrasi Bisnis', 'Keuangan', 'Perpajakan']
  };

  // Deprecated: firstSteps removed from schema
  const stepMap = {
    realistic: [
      'Ikuti kursus dasar pemrograman (Python/JavaScript)',
      'Bangun proyek sederhana dan unggah ke GitHub',
      'Ikut komunitas atau kompetisi teknis lokal'
    ],
    investigative: [
      'Ambil kursus analisis data atau metodologi riset',
      'Kerjakan mini riset/analisis dataset dari Kaggle',
      'Baca paper populer dan tulis ringkasannya'
    ],
    artistic: [
      'Bangun portofolio visual di Behance/Dribbble',
      'Pelajari prinsip desain dan prototyping (Figma)',
      'Ikut challenge desain mingguan'
    ],
    social: [
      'Aktif di kegiatan volunteer/organisasi sosial',
      'Latih komunikasi publik dan empati terstruktur',
      'Cari mentor di bidang pelayanan/pendidikan'
    ],
    enterprising: [
      'Ikut kompetisi business plan atau wirausaha',
      'Pelajari dasar-dasar sales dan negosiasi',
      'Bangun proyek mini (jualan kecil/organisasi event)'
    ],
    conventional: [
      'Pelajari Excel/Spreadsheet lanjutan',
      'Ikuti kursus akuntansi/operasional dasar',
      'Buat proyek perbaikan proses sederhana'
    ]
  };

  const oceanStrengths = [];
  if (ocean.openness >= 60) oceanStrengths.push('Openness tinggi');
  if (ocean.conscientiousness >= 60) oceanStrengths.push('Conscientiousness tinggi');
  if (ocean.extraversion >= 60) oceanStrengths.push('Extraversion tinggi');
  if (ocean.agreeableness >= 60) oceanStrengths.push('Agreeableness tinggi');

  const buildJustification = (interest, name) => {
    const oceanText = oceanStrengths.length ? ` dan kekuatan OCEAN (${oceanStrengths.join(', ')})` : '';
    const interestText = title(interest);
    const focusMap = {
      realistic: 'pendekatan praktis dan problem-solving teknis',
      investigative: 'analisis mendalam dan riset berbasis data',
      artistic: 'kreativitas dan eksplorasi ide',
      social: 'interaksi manusia dan dampak sosial',
      enterprising: 'inisiatif, kepemimpinan, dan orientasi hasil',
      conventional: 'ketelitian proses dan efisiensi sistem'
    };
    return `Cocok dengan minat ${interestText}${oceanText}. Peran "${name}" memanfaatkan ${focusMap[interest]}.`;
  };

  const pickMajors = (interest) => majorsMap[interest]?.slice(0, 4) || ['Manajemen', 'Ilmu Komputer', 'Statistika', 'Psikologi'];

  const addCareer = (list, name, interest) => {
    list.push({
      careerName: name,
      justification: buildJustification(interest, name),
      relatedMajors: pickMajors(interest),
      careerProspect: generateCareerProspect(name, riasec, ocean)
    });
  };

  const selected = [];
  const seen = new Set();

  // Prefer careers from top 2 interests
  for (const interest of topInterests) {
    const options = careerMap[interest] || [];
    for (const name of options) {
      if (selected.length >= 4) break;
      if (seen.has(name)) continue;
      seen.add(name);
      addCareer(selected, name, interest);
      if (selected.length >= 4) break;
    }
    if (selected.length >= 4) break;
  }

  // Fallback pool across all interests if not enough
  if (selected.length < 4) {
    const all = Object.entries(careerMap);
    for (const [interest, names] of all) {
      for (const name of names) {
        if (selected.length >= 4) break;
        if (seen.has(name)) continue;
        seen.add(name);
        addCareer(selected, name, interest);
      }
      if (selected.length >= 4) break;
    }
  }

  // Ensure exactly 4 items
  return selected.slice(0, 4);
};

/**
 * Generate career prospect for a specific career
 */
const generateCareerProspect = (career) => {
  // Base prospects for different career types
  const techCareers = ['Software Engineer', 'Data Scientist', 'Data Analyst', 'UX/UI Designer'];
  const businessCareers = ['Business Development Manager', 'Sales Director', 'Project Manager'];
  const creativeCareers = ['Content Creator', 'Marketing Creative', 'Product Designer', 'UX/UI Designer'];
  const serviceCareers = ['Teacher', 'Counselor', 'Human Resources Manager', 'Social Worker'];

  let baseProspect = {
    jobAvailability: 'moderate',
    salaryPotential: 'moderate',
    careerProgression: 'moderate',
    industryGrowth: 'moderate',
    skillDevelopment: 'moderate',
    aiOvertake: 'moderate'
  };

  if (techCareers.includes(career)) {
    baseProspect = {
      jobAvailability: 'high',
      salaryPotential: 'high',
      careerProgression: 'high',
      industryGrowth: 'super high',
      skillDevelopment: 'super high',
      aiOvertake: 'moderate'
    };
  } else if (businessCareers.includes(career)) {
    baseProspect = {
      jobAvailability: 'high',
      salaryPotential: 'high',
      careerProgression: 'super high',
      industryGrowth: 'high',
      skillDevelopment: 'high',
      aiOvertake: 'moderate'
    };
  } else if (creativeCareers.includes(career)) {
    baseProspect = {
      jobAvailability: 'moderate',
      salaryPotential: 'moderate',
      careerProgression: 'moderate',
      industryGrowth: 'high',
      skillDevelopment: 'high',
      aiOvertake: 'low'
    };
  } else if (serviceCareers.includes(career)) {
    baseProspect = {
      jobAvailability: 'moderate',
      salaryPotential: 'moderate',
      careerProgression: 'moderate',
      industryGrowth: 'moderate',
      skillDevelopment: 'moderate',
      aiOvertake: 'low'
    };
  }

  return baseProspect;
};

/**
 * Generate insights based on personality profile
 */
const generateInsights = (riasec, ocean, viaIs) => {
  const insights = [];

  // Conscientiousness insights
  if (ocean.conscientiousness > 70) {
    insights.push('Manfaatkan kekuatan organisasi Anda dengan mengambil peran yang membutuhkan planning dan execution yang detail');
  } else if (ocean.conscientiousness < 40) {
    insights.push('Fokus pada pengembangan time management dan organizational skills untuk meningkatkan produktivitas');
  } else {
    insights.push('Kembangkan keseimbangan antara struktur dan fleksibilitas dalam pendekatan kerja Anda');
  }

  // Openness insights
  if (ocean.openness > 70) {
    insights.push('Cari lingkungan kerja yang memberikan variasi dan tantangan baru secara konsisten');
  } else if (ocean.openness < 40) {
    insights.push('Fokus pada penguasaan mendalam di bidang keahlian yang sudah familiar');
  } else {
    insights.push('Seimbangkan eksplorasi hal baru dengan pendalaman expertise yang sudah ada');
  }

  // Extraversion insights
  if (ocean.extraversion > 70) {
    insights.push('Manfaatkan energy sosial Anda dalam peran yang melibatkan networking dan team collaboration');
  } else if (ocean.extraversion < 40) {
    insights.push('Pilih peran yang memungkinkan deep work dan interaksi sosial yang terbatas namun meaningful');
  } else {
    insights.push('Cari keseimbangan antara kolaborasi tim dan waktu untuk refleksi individual');
  }

  // RIASEC insights
  const topRiasec = Object.entries(riasec).reduce((a, b) => riasec[a[0]] > riasec[b[0]] ? a : b);
  if (topRiasec[0] === 'investigative') {
    insights.push('Kembangkan kemampuan research dan analytical thinking melalui proyek-proyek yang challenging');
  } else if (topRiasec[0] === 'artistic') {
    insights.push('Alokasikan waktu untuk eksplorasi kreatif dan pengembangan ide-ide inovatif');
  } else if (topRiasec[0] === 'social') {
    insights.push('Fokus pada pengembangan kemampuan interpersonal dan leadership skills');
  } else {
    insights.push('Identifikasi dan kembangkan kekuatan unik Anda sesuai dengan minat dominan');
  }

  // VIA-IS insights
  const topVia = Object.entries(viaIs).reduce((a, b) => viaIs[a[0]] > viaIs[b[0]] ? a : b);
  if (topVia[0] === 'creativity') {
    insights.push('Alokasikan waktu regular untuk creative exploration dan brainstorming sessions');
  } else if (topVia[0] === 'perseverance') {
    insights.push('Manfaatkan ketekunan Anda untuk menyelesaikan proyek-proyek jangka panjang yang kompleks');
  } else {
    insights.push('Kembangkan kekuatan karakter dominan Anda melalui praktik dan aplikasi yang konsisten');
  }

  // Ensure at least 4 items (model expects 4-5)
  const fallback = [
    'Tetapkan batasan waktu untuk menghindari overthinking',
    'Bangun rutinitas refleksi mingguan untuk evaluasi kemajuan',
    'Cari mentor yang dapat memberikan umpan balik jujur'
  ];
  for (let i = 0; i < fallback.length && insights.length < 4; i++) {
    if (!insights.includes(fallback[i])) insights.push(fallback[i]);
  }

  return insights.slice(0, 5);
};

/**
 * Generate work environment description
 */
const generateWorkEnvironment = (riasec, ocean) => {
  let environment = 'Lingkungan kerja ideal Anda adalah ';

  if (ocean.extraversion > 60) {
    environment += 'yang collaborative dan dynamic, dengan banyak interaksi tim dan networking opportunities. ';
  } else {
    environment += 'yang memungkinkan fokus mendalam dengan minimal distraction, namun tetap supportive. ';
  }

  if (riasec.investigative > 60) {
    environment += 'Anda akan thriving di tempat yang menghargai analytical thinking dan problem-solving, ';
  }

  if (riasec.artistic > 60) {
    environment += 'dengan kebebasan untuk eksplorasi kreatif dan inovasi. ';
  }

  if (ocean.conscientiousness > 60) {
    environment += 'Struktur yang jelas dan goal-oriented akan membantu Anda perform optimal, ';
  }

  environment += 'dengan leadership yang memberikan autonomy namun tetap available untuk guidance ketika dibutuhkan.';

  return environment;
};

/**
 * Generate role models based on interests
 */
const generateRoleModels = (topInterest, secondInterest) => {
  const roleModelMap = {
    'realistic': [
      { name: 'Elon Musk', title: 'CEO Tesla/SpaceX' },
      { name: 'Steve Wozniak', title: 'Co-founder Apple' },
      { name: 'James Dyson', title: 'Founder Dyson' }
    ],
    'investigative': [
      { name: 'Marie Curie', title: 'Physicist/Chemist, Nobel Laureate' },
      { name: 'Stephen Hawking', title: 'Theoretical Physicist' },
      { name: 'Jane Goodall', title: 'Primatologist' }
    ],
    'artistic': [
      { name: 'Steve Jobs', title: 'Co-founder Apple' },
      { name: 'Jony Ive', title: 'Former Chief Design Officer, Apple' },
      { name: 'David Kelley', title: 'Founder IDEO' }
    ],
    'social': [
      { name: 'Oprah Winfrey', title: 'Media Executive/Philanthropist' },
      { name: 'Nelson Mandela', title: 'Former President of South Africa' },
      { name: 'Mother Teresa', title: 'Humanitarian' }
    ],
    'enterprising': [
      { name: 'Richard Branson', title: 'Founder Virgin Group' },
      { name: 'Jack Ma', title: 'Founder Alibaba' },
      { name: 'Sara Blakely', title: 'Founder Spanx' }
    ],
    'conventional': [
      { name: 'Warren Buffett', title: 'CEO Berkshire Hathaway' },
      { name: 'Tim Cook', title: 'CEO Apple' },
      { name: 'Sheryl Sandberg', title: 'Former COO Meta' }
    ]
  };

  const roleModels = [];

  if (roleModelMap[topInterest]) {
    roleModels.push(...roleModelMap[topInterest]);
  }

  if (roleModelMap[secondInterest] && secondInterest !== topInterest) {
    roleModels.push(...roleModelMap[secondInterest].slice(0, 2));
  }

  // Add some universal role models with titles
  const universalModels = [
    { name: 'Bill Gates', title: 'Co-founder Microsoft' },
    { name: 'Michelle Obama', title: 'Former First Lady, Lawyer' },
    { name: 'B.J. Habibie', title: 'Former President of Indonesia, Engineer' },
    { name: 'Susi Pudjiastuti', title: 'Former Minister of Marine Affairs and Fisheries' },
    { name: 'Nadiem Makarim', title: 'Minister of Education, Founder Gojek' }
  ];
  roleModels.push(...universalModels);

  // Remove duplicates by name+title
  const uniqueRoleModels = [];
  const seen = new Set();
  for (const rm of roleModels) {
    const key = `${rm.name}|${rm.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRoleModels.push(rm);
    }
  }

  // Ensure minimum 2 role models (matching schema)
  if (uniqueRoleModels.length < 2) {
    const additionalModels = [
      { name: 'Albert Einstein', title: 'Theoretical Physicist' },
      { name: 'Oprah Winfrey', title: 'Media Executive/Philanthropist' },
      { name: 'Steve Jobs', title: 'Co-founder Apple' },
      { name: 'Marie Curie', title: 'Physicist/Chemist, Nobel Laureate' }
    ];
    for (let i = 0; i < additionalModels.length && uniqueRoleModels.length < 2; i++) {
      const key = `${additionalModels[i].name}|${additionalModels[i].title}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRoleModels.push(additionalModels[i]);
      }
    }
  }

  return uniqueRoleModels.slice(0, 3); // Limit to 3 (matching schema max)
};

/**
 * Generate short summary
 */
const generateShortSummary = (archetype, topRiasec, ocean) => {
  let summary = `Anda adalah seorang ${archetype} dengan kekuatan utama di bidang ${topRiasec[0]}. `;
  
  if (ocean.conscientiousness > 60) {
    summary += 'Kepribadian yang terorganisir dan goal-oriented membuat Anda reliable dalam execution. ';
  }
  
  if (ocean.openness > 60) {
    summary += 'Keterbukaan terhadap pengalaman baru memungkinkan Anda untuk terus berkembang dan beradaptasi. ';
  }
  
  summary += 'Kombinasi unik dari analytical thinking dan practical approach membuat Anda valuable dalam berbagai konteks profesional.';
  
  return summary;
};

/**
 * Generate core motivators (exactly 4 items as per original model schema)
 */
const generateCoreMotivators = (riasec, ocean) => {
  const motivators = [];

  // Based on top RIASEC scores
  const sortedRiasec = Object.entries(riasec).sort((a, b) => b[1] - a[1]);
  const topInterest = sortedRiasec[0][0];

  const motivatorMap = {
    realistic: ['Problem-Solving', 'Hands-on Work', 'Technical Mastery'],
    investigative: ['Learning & Discovery', 'Research & Analysis', 'Knowledge Building'],
    artistic: ['Creative Expression', 'Innovation', 'Aesthetic Achievement'],
    social: ['Helping Others', 'Community Impact', 'Relationship Building'],
    enterprising: ['Leadership', 'Achievement', 'Influence & Persuasion'],
    conventional: ['Organization', 'Efficiency', 'Structure & Order']
  };

  if (motivatorMap[topInterest]) {
    motivators.push(...motivatorMap[topInterest].slice(0, 2));
  }

  // Add based on personality
  if (ocean.openness > 60) {
    motivators.push('Continuous Learning');
  }
  if (ocean.conscientiousness > 60) {
    motivators.push('Excellence & Quality');
  }

  // Ensure exactly 4 items by filling from a fallback pool
  const fallback = ['Growth & Mastery', 'Impact', 'Autonomy', 'Innovation'];
  for (let i = 0; i < fallback.length && motivators.length < 4; i++) {
    if (!motivators.includes(fallback[i])) motivators.push(fallback[i]);
  }

  return motivators.slice(0, 4);
};

/**
 * Generate learning style
 */
const generateLearningStyle = (ocean) => {
  if (ocean.openness > 70) {
    return 'Experiential & Exploratory';
  } else if (ocean.conscientiousness > 70) {
    return 'Structured & Systematic';
  } else if (ocean.extraversion > 60) {
    return 'Collaborative & Interactive';
  } else {
    return 'Visual & Kinesthetic';
  }
};

/**
 * Generate strength summary
 */
const generateStrengthSummary = (strengths) => {
  return `Kekuatan utama Anda terletak pada ${strengths.slice(0, 3).join(', ').toLowerCase()}. Kombinasi unik dari kemampuan ini membuat Anda mampu memberikan kontribusi yang valuable dalam berbagai situasi dan tantangan.`;
};

/**
 * Generate weakness summary
 */
const generateWeaknessSummary = (weaknesses) => {
  return `Area yang perlu dikembangkan meliputi ${weaknesses.slice(0, 2).join(' dan ').toLowerCase()}. Dengan awareness dan usaha yang konsisten, area-area ini dapat menjadi kekuatan di masa depan.`;
};

/**
 * Generate skill suggestions
 */
const generateSkillSuggestions = (riasec) => {
  const suggestions = [];

  const sortedRiasec = Object.entries(riasec).sort((a, b) => b[1] - a[1]);
  const topInterest = sortedRiasec[0][0];

  const skillMap = {
    realistic: ['Technical problem-solving', 'Project management', 'Quality control'],
    investigative: ['Data analysis', 'Research methodology', 'Critical thinking'],
    artistic: ['Creative thinking', 'Design principles', 'Innovation techniques'],
    social: ['Communication skills', 'Emotional intelligence', 'Team collaboration'],
    enterprising: ['Leadership skills', 'Strategic planning', 'Negotiation'],
    conventional: ['Process optimization', 'Data management', 'Attention to detail']
  };

  if (skillMap[topInterest]) {
    suggestions.push(...skillMap[topInterest]);
  }

  // Add digital literacy
  suggestions.push('Digital literacy', 'Adaptability');

  // Ensure at least 4 items (model expects 4-6)
  const fallback = ['Public Speaking', 'Time Management', 'Problem Solving'];
  for (let i = 0; i < fallback.length && suggestions.length < 4; i++) {
    if (!suggestions.includes(fallback[i])) suggestions.push(fallback[i]);
  }

  return suggestions.slice(0, 6);
};

/**
 * Generate possible pitfalls
 */
const generatePossiblePitfalls = (riasec, ocean) => {
  const pitfalls = [];

  const sortedRiasec = Object.entries(riasec).sort((a, b) => b[1] - a[1]);
  const topInterest = sortedRiasec[0][0];

  const pitfallMap = {
    realistic: ['Mengabaikan aspek interpersonal', 'Terlalu fokus pada detail teknis'],
    investigative: ['Analysis paralysis', 'Kurang action-oriented'],
    artistic: ['Perfectionism yang berlebihan', 'Kesulitan dengan struktur'],
    social: ['Burnout karena terlalu fokus pada orang lain', 'Kesulitan membuat keputusan sulit'],
    enterprising: ['Overconfidence', 'Mengabaikan detail penting'],
    conventional: ['Resistance to change', 'Terlalu rigid dalam pendekatan']
  };

  if (pitfallMap[topInterest]) {
    pitfalls.push(...pitfallMap[topInterest]);
  }

  // Add based on personality
  if (ocean.neuroticism > 60) {
    pitfalls.push('Overthinking dan anxiety');
  }

  // Ensure at least 4 items (model expects 4-5)
  const fallback = ['Kurang konsisten eksekusi', 'Menghindari feedback sulit', 'Menunda keputusan penting'];
  for (let i = 0; i < fallback.length && pitfalls.length < 4; i++) {
    if (!pitfalls.includes(fallback[i])) pitfalls.push(fallback[i]);
  }

  return pitfalls.slice(0, 5);
};

/**
 * Generate risk tolerance
 */
const generateRiskTolerance = (ocean) => {
  const riskScore = (ocean.openness + ocean.extraversion - ocean.neuroticism) / 3;

  if (riskScore > 70) return 'high';
  if (riskScore > 50) return 'moderate';
  if (riskScore > 30) return 'low';
  return 'very low';
};

/**
 * Generate development activities
 */
const generateDevelopmentActivities = (riasec) => {
  const sortedRiasec = Object.entries(riasec).sort((a, b) => b[1] - a[1]);
  const topInterest = sortedRiasec[0][0];

  const extracurricularMap = {
    realistic: ['Klub Robotik', 'Olimpiade Sains', 'Maker Space'],
    investigative: ['Klub Penelitian', 'Science Fair', 'Debat Ilmiah'],
    artistic: ['Klub Seni', 'Creative Writing', 'Design Competition'],
    social: ['Volunteer Work', 'Student Council', 'Peer Mentoring'],
    enterprising: ['Business Club', 'Entrepreneurship Competition', 'Leadership Training'],
    conventional: ['Student Government', 'Academic Committee', 'Event Organization']
  };

  // Ensure array lengths match model schema: extracurricular 2-3, bookRecommendations 2-6
  const extracurricular = (extracurricularMap[topInterest] || ['Academic Club', 'Volunteer Work']).slice(0, 3);

  const books = [
    { title: 'Mindset: The New Psychology of Success', author: 'Carol Dweck', reason: 'Mengembangkan growth mindset yang esensial untuk kesuksesan' },
    { title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', reason: 'Memahami bias kognitif dan pengambilan keputusan' },
    { title: 'Atomic Habits', author: 'James Clear', reason: 'Membangun kebiasaan efektif untuk pengembangan diri' },
    { title: 'Deep Work', author: 'Cal Newport', reason: 'Maksimalkan fokus untuk hasil belajar yang mendalam' },
    { title: 'Range', author: 'David Epstein', reason: 'Menghargai eksplorasi luas sebelum spesialisasi' },
    { title: 'Grit', author: 'Angela Duckworth', reason: 'Menguatkan ketekunan dalam mencapai tujuan jangka panjang' }
  ];

  return {
    extracurricular,
    bookRecommendations: books
  };
};

module.exports = {
  generateMockPersonaProfile
};
