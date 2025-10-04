1. At the Root Level (Top-level insights):
These provide a quick, high-level summary of the student's core drivers.
  "coreMotivators": ["Problem-Solving", "Learning & Mastery", "Creative Expression"],
  "learningStyle": "Visual & Kinesthetic (Belajar paling baik dengan melihat contoh dan langsung mencoba)"
coreMotivators: An array of strings identifying the fundamental drivers behind the student's actions. This goes beyond skills and into their "why."
learningStyle: A string that describes the most effective way for the student to absorb new information, making skill development suggestions more practical.

2. Inside each careerRecommendation object:
This is the most critical addition. It directly addresses your request for justification and makes the recommendations far more compelling.
  "careerRecommendation": [
    {
      "careerName": "Data Scientist",
      "justification": "Sangat cocok karena menggabungkan kekuatan analitis (OCEAN: Conscientiousness) dan minat investigatif (RIASEC: Investigative) Anda. Peran ini memungkinkan Anda memecahkan masalah kompleks menggunakan data, yang sejalan dengan arketipe 'Analytical Innovator'.",
      "firstSteps": [
        "Ikuti kursus online 'Intro to Python for Data Science'",
        "Coba analisis dataset sederhana dari Kaggle.com",
        "Tonton video 'Day in the Life of a Data Scientist' di YouTube"
      ],
      "relatedMajors": ["Statistika", "Ilmu Komputer", "Matematika", "Sistem Informasi"],
      "careerProspect": { ... }
    },
    ...
  ]
justification: A string that explicitly connects the career suggestion back to the student's psychometric data (OCEAN, RIASEC, VIA-IS) and their archetype. This answers the "Why this career for me?" question.
firstSteps: An array of strings providing concrete, immediate, and low-barrier actions a high school student can take to explore this career path.
relatedMajors: An array of strings listing relevant university majors, creating a direct bridge from high school to higher education planning.

3. As a New Top-Level Key (Expanding on development):
This section translates abstract suggestions into tangible activities.
  "developmentActivities": {
    "extracurricular": ["Klub Robotik", "Olimpiade Sains Nasional (OSN)", "Klub Debat Bahasa Inggris"],
    "projectIdeas": [
      "Membuat visualisasi data dari topik yang disukai (misal: statistik tim sepak bola favorit)",
      "Mendesain aplikasi sederhana untuk memecahkan masalah di sekolah",
      "Menulis blog yang menjelaskan konsep sains yang rumit dengan cara sederhana"
    ],
    "bookRecommendations": [
      {"title": "Sapiens: A Brief History of Humankind", "author": "Yuval Noah Harari", "reason": "Untuk memuaskan rasa ingin tahu intelektualmu yang tinggi."},
      {"title": "Thinking, Fast and Slow", "author": "Daniel Kahneman", "reason": "Untuk memahami bias kognitif dan mempertajam analisismu."}
    ]
  
developmentActivities: An object containing arrays of highly specific, actionable suggestions tailored to a high schooler's context.
extracurricular: Suggests school clubs or activities.
projectIdeas: Gives concrete project examples to build a portfolio and skills.
bookRecommendations: Suggests specific books with a brief reason why it's a good fit for their profile.