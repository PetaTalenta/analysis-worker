/**
 * Persona Profile Schema - Updated with Full Spec
 */

const Joi = require('joi');

/**
 * Schema for persona profile validation
 */
const personaProfileSchema = Joi.object({
  archetype: Joi.string().required()
    .description('Nama archetype yang paling sesuai dengan persona'),

  coreMotivators: Joi.array().items(Joi.string()).min(2).max(4).required()
    .description('Fundamental drivers atau motivasi inti dari persona'),

  learningStyle: Joi.string().required()
    .description('Gaya belajar yang paling efektif untuk persona'),

  shortSummary: Joi.string().required()
    .description('Ringkasan singkat tentang persona (1-2 paragraf)'),

  strengthSummary: Joi.string().required()
    .description('Ringkasan kekuatan utama persona (1 paragraf)'),

  strengths: Joi.array().items(Joi.string()).min(3).max(6).required()
    .description('Daftar kekuatan/strength dari persona'),

  weaknessSummary: Joi.string().required()
    .description('Ringkasan kelemahan utama persona (1 paragraf)'),

  weaknesses: Joi.array().items(Joi.string()).min(3).max(6).required()
    .description('Daftar kelemahan/weakness dari persona'),

  careerRecommendation: Joi.array().items(
    Joi.object({
      careerName: Joi.string().required()
        .description('Nama karir atau profesi yang direkomendasikan'),
      justification: Joi.string().required()
        .description('Penjelasan mengapa karir ini cocok berdasarkan data psikometrik'),
      relatedMajors: Joi.array().items(Joi.string()).min(2).max(5).required()
        .description('Jurusan kuliah yang relevan dengan karir ini'),
      careerProspect: Joi.object({
        jobAvailability: Joi.string().valid('super high', 'high', 'moderate', 'low', 'super low').required()
          .description('Sejauh mana lapangan pekerjaan tersedia di bidang tersebut'),
        salaryPotential: Joi.string().valid('super high', 'high', 'moderate', 'low', 'super low').required()
          .description('Potensi pendapatan dari profesi tersebut'),
        careerProgression: Joi.string().valid('super high', 'high', 'moderate', 'low', 'super low').required()
          .description('Peluang naik jabatan atau spesialisasi di bidang tersebut'),
        industryGrowth: Joi.string().valid('super high', 'high', 'moderate', 'low', 'super low').required()
          .description('Pertumbuhan industri terkait profesi ini di masa depan'),
        skillDevelopment: Joi.string().valid('super high', 'high', 'moderate', 'low', 'super low').required()
          .description('Peluang mengembangkan keahlian di profesi ini'),
        aiOvertake: Joi.string().valid('super high', 'high', 'moderate', 'low', 'super low').required()
          .description('Seberapa besar kemungkinan profesi ini akan digantikan oleh AI di masa depan')
      }).required()
    })
  ).min(3).max(5).required()
    .description('Daftar rekomendasi karir yang sesuai dengan persona'),

  insights: Joi.array().items(Joi.string()).min(3).max(5).required()
    .description('Daftar insight atau saran pengembangan diri'),

  skillSuggestion: Joi.array().items(Joi.string()).min(3).max(6).required()
    .description('Rekomendasi pengembangan skill jangka pendek dan menengah'),

  possiblePitfalls: Joi.array().items(Joi.string()).min(2).max(5).required()
    .description('Kesalahan atau jebakan karir yang perlu diwaspadai'),

  riskTolerance: Joi.string().valid('very high', 'high', 'moderate', 'low', 'very low').required()
    .description('Seberapa tinggi toleransi risiko persona dalam karir dan pekerjaan'),

  workEnvironment: Joi.string().required()
    .description('Deskripsi lingkungan kerja yang ideal untuk persona'),

  roleModel: Joi.array().items(
    Joi.object({
      name: Joi.string().required().description('Nama role model'),
      title: Joi.string().required().description('Title atau jabatan utama role model')
    })
  ).min(2).max(3).required()
    .description('Daftar role model yang relevan dan inspiratif, sebagai objek {name, title}'),

  developmentActivities: Joi.object({
    extracurricular: Joi.array().items(Joi.string()).min(2).max(4).required()
      .description('Kegiatan ekstrakurikuler yang disarankan'),
    bookRecommendations: Joi.array().items(
      Joi.object({
        title: Joi.string().required()
          .description('Judul buku'),
        author: Joi.string().required()
          .description('Nama penulis'),
        reason: Joi.string().required()
          .description('Alasan mengapa buku ini cocok untuk persona')
      })
    ).min(2).max(6).required()
      .description('Rekomendasi buku dengan alasan spesifik')
  }).required()
    .description('Aktivitas pengembangan yang disesuaikan dengan konteks siswa SMA')

}).required();

/**
 * Example persona profile
 */
const personaProfileExample = {
  archetype: "The Analytical Innovator",
  coreMotivators: ["Problem-Solving", "Learning & Mastery", "Creative Expression"],
  learningStyle: "Visual & Kinesthetic",
  shortSummary: "Anda adalah seorang pemikir analitis dengan kecenderungan investigatif yang kuat dan kreativitas tinggi. Kombinasi antara kecerdasan logis-matematis dan keterbukaan terhadap pengalaman baru membuat Anda unggul dalam memecahkan masalah kompleks dengan pendekatan inovatif.",
  strengthSummary: "Kekuatan utama Anda terletak pada analisis mendalam, kreativitas, dan dorongan kuat untuk belajar hal baru. Ini membuat Anda mampu menghasilkan solusi unik di berbagai situasi kompleks.",
  strengths: [
    "Kemampuan analisis yang tajam",
    "Kreativitas dan inovasi",
    "Keingintahuan intelektual yang tinggi",
    "Kemampuan belajar mandiri yang kuat",
    "Pemikiran sistematis dan terstruktur"
  ],
  weaknessSummary: "Anda cenderung overthinking, perfeksionis, dan kadang kurang sabar menghadapi proses lambat atau bekerja sama dengan orang lain.",
  weaknesses: [
    "Terkadang terlalu perfeksionis",
    "Dapat terjebak dalam overthinking",
    "Kurang sabar dengan proses yang lambat",
    "Kemampuan sosial yang perlu dikembangkan",
    "Kesulitan mendelegasikan tugas"
  ],
  careerRecommendation: [
    {
      careerName: "Data Scientist",
      justification: "Sangat cocok karena menggabungkan kekuatan analitis (OCEAN: Conscientiousness) dan minat investigatif (RIASEC: Investigative) Anda. Peran ini memungkinkan Anda memecahkan masalah kompleks menggunakan data, yang sejalan dengan arketipe 'Analytical Innovator'.",
      relatedMajors: ["Statistika", "Ilmu Komputer", "Matematika", "Sistem Informasi"],
      careerProspect: {
        jobAvailability: "high",
        salaryPotential: "high",
        careerProgression: "high",
        industryGrowth: "super high",
        skillDevelopment: "super high",
        aiOvertake: "low"
      }
    },
    {
      careerName: "Peneliti",
      justification: "Minat investigatif yang tinggi dan keterbukaan terhadap pengalaman baru membuat Anda cocok untuk dunia penelitian. Kemampuan analitis mendalam mendukung proses riset yang sistematis.",
      relatedMajors: ["Psikologi", "Biologi", "Fisika", "Kimia", "Sosiologi"],
      careerProspect: {
        jobAvailability: "moderate",
        salaryPotential: "moderate",
        careerProgression: "moderate",
        industryGrowth: "moderate",
        skillDevelopment: "high",
        aiOvertake: "moderate"
      }
    },
    {
      careerName: "Pengembang Software",
      justification: "Kombinasi kreativitas dan kemampuan analitis yang kuat sangat sesuai untuk pengembangan software. Keterbukaan terhadap teknologi baru mendukung adaptasi di industri yang dinamis.",
      relatedMajors: ["Teknik Informatika", "Ilmu Komputer", "Sistem Informasi", "Teknik Komputer"],
      careerProspect: {
        jobAvailability: "super high",
        salaryPotential: "high",
        careerProgression: "high",
        industryGrowth: "super high",
        skillDevelopment: "super high",
        aiOvertake: "moderate"
      }
    }
  ],
  insights: [
    "Kembangkan keterampilan komunikasi untuk menyampaikan ide kompleks dengan lebih efektif",
    "Latih kemampuan bekerja dalam tim untuk mengimbangi kecenderungan bekerja sendiri",
    "Manfaatkan kekuatan analitis untuk memecahkan masalah sosial",
    "Cari mentor yang dapat membantu mengembangkan keterampilan kepemimpinan",
    "Tetapkan batas waktu untuk menghindari analisis berlebihan"
  ],
  skillSuggestion: [
    "Public Speaking",
    "Leadership",
    "Teamwork",
    "Time Management",
    "Delegation"
  ],
  possiblePitfalls: [
    "Mengisolasi diri dari tim karena terlalu fokus pada analisis individu",
    "Menunda keputusan karena perfeksionisme berlebihan",
    "Kurang membangun jaringan karena terlalu fokus pada teknis"
  ],
  riskTolerance: "moderate",
  workEnvironment: "Lingkungan kerja yang memberikan otonomi intelektual, menghargai inovasi, dan menyediakan tantangan kognitif yang berkelanjutan. Anda berkembang di tempat yang terstruktur namun fleksibel.",
  roleModel: [
    { name: "Marie Curie", title: "Physicist/Chemist, Nobel Laureate" },
    { name: "Albert Einstein", title: "Theoretical Physicist" },
    { name: "B.J. Habibie", title: "Former President of Indonesia, Engineer" }
  ],
  developmentActivities: {
    extracurricular: ["Klub Robotik", "Olimpiade Sains Nasional (OSN)", "Klub Debat Bahasa Inggris"],
    bookRecommendations: [
      {
        title: "Sapiens: A Brief History of Humankind",
        author: "Yuval Noah Harari",
        reason: "Untuk memuaskan rasa ingin tahu intelektualmu yang tinggi."
      },
      {
        title: "Thinking, Fast and Slow",
        author: "Daniel Kahneman",
        reason: "Untuk memahami bias kognitif dan mempertajam analisismu."
      }
    ]
  }
};

module.exports = {
  personaProfileSchema,
  personaProfileExample
};
