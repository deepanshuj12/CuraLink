function tokenize(text = "") {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

function normalizeText(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 🔥 lightweight fuzzy matching (kept)
function levenshteinDistance(a = "", b = "") {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

function similarityScore(a = "", b = "") {
  const normA = normalizeText(a);
  const normB = normalizeText(b);

  const distance = levenshteinDistance(normA, normB);
  const length = Math.max(normA.length, normB.length, 1);

  return 1 - distance / length;
}

// 🔥 keep this (VERY important)
const KNOWN_MEDICAL_TERMS = [
  "diabetes","hypertension","asthma","cancer","arthritis",
  "depression","anxiety","alzheimer","parkinson","obesity",
  "migraine","pneumonia","stroke","insomnia","epilepsy",
  "anemia","covid-19","chronic kidney disease","heart failure",
  "copd","dermatitis","psoriasis","lupus","multiple sclerosis",
  "ulcerative colitis","crohn's disease","hepatitis","tuberculosis"
];

function findClosestMedicalTerm(input = "") {
  if (!input) return null;

  let best = null;
  let bestScore = 0;

  for (const term of KNOWN_MEDICAL_TERMS) {
    const score = similarityScore(input, term);
    if (score > bestScore) {
      bestScore = score;
      best = term;
    }
  }

  return bestScore >= 0.75 ? best : null;
}

// 🔥 keep rich intent expansion
function buildIntentTerms(input = "") {
  const map = {
    treatment: ["therapy", "management", "drug", "surgery", "clinical trial"],
    prevention: ["risk reduction", "lifestyle", "screening"],
    diagnosis: ["diagnostic", "biomarker", "test", "imaging"],
    symptom: ["signs", "manifestation"],
    prognosis: ["survival", "outcome"],
    research: ["study", "trial", "evidence"],
  };

  const lower = input.toLowerCase();
  let out = [];

  for (const key in map) {
    if (lower.includes(key)) out.push(...map[key]);
  }

  return out;
}

// ✅ FINAL QUERY BUILDER
function createResearchQuery(context) {
  const correctedDisease = findClosestMedicalTerm(context.disease);
  const disease = correctedDisease || context.disease || "";

  const base = [
    context.query,
    disease,
    context.location
  ].filter(Boolean).join(" ");

  const intentTerms = buildIntentTerms(
    `${context.query} ${disease} ${context.patientName || ""}`
  );

  const expandedQuery = [
    base,
    ...intentTerms,
    "clinical study" // 🔥 consistent anchor
  ].join(" ");

  return {
    query: expandedQuery.trim(),
    correctedDisease,
  };
}

module.exports = { tokenize, createResearchQuery };



// function tokenize(text = "") {
//   return String(text)
//     .toLowerCase()
//     .split(/[^a-z0-9]+/g)
//     .filter(Boolean);
// }

// function normalizeText(text = "") {
//   return String(text).trim().toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
// }

// function levenshteinDistance(a = "", b = "") {
//   const source = normalizeText(a);
//   const target = normalizeText(b);
//   const m = source.length;
//   const n = target.length;
//   if (!m) return n;
//   if (!n) return m;
//   const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
//   for (let i = 0; i <= m; i += 1) dp[i][0] = i;
//   for (let j = 0; j <= n; j += 1) dp[0][j] = j;
//   for (let i = 1; i <= m; i += 1) {
//     for (let j = 1; j <= n; j += 1) {
//       const cost = source[i - 1] === target[j - 1] ? 0 : 1;
//       dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
//     }
//   }
//   return dp[m][n];
// }

// function similarityScore(a = "", b = "") {
//   const distance = levenshteinDistance(a, b);
//   const length = Math.max(normalizeText(a).length, normalizeText(b).length, 1);
//   return 1 - distance / length;
// }

// const KNOWN_MEDICAL_TERMS = [
//   "diabetes",
//   "hypertension",
//   "asthma",
//   "cancer",
//   "arthritis",
//   "depression",
//   "anxiety",
//   "cognitive impairment",
//   "alzheimer",
//   "parkinson",
//   "obesity",
//   "migraine",
//   "pneumonia",
//   "stroke",
//   "insomnia",
//   "epilepsy",
//   "anemia",
//   "covid-19",
//   "chronic kidney disease",
//   "heart failure",
//   "copd",
//   "dermatitis",
//   "psoriasis",
//   "lupus",
//   "multiple sclerosis",
//   "ulcerative colitis",
//   "crohn's disease",
//   "hepatitis",
//   "tuberculosis",
//   "hearing loss",
// ];

// function findClosestMedicalTerm(input = "") {
//   const normalized = normalizeText(input);
//   if (!normalized) return null;
//   let bestMatch = null;
//   let bestScore = 0;
//   for (const term of KNOWN_MEDICAL_TERMS) {
//     const score = similarityScore(normalized, term);
//     if (score > bestScore) {
//       bestScore = score;
//       bestMatch = term;
//     }
//   }
//   return bestScore >= 0.75 ? bestMatch : null;
// }

// function buildExpandedQuery({ disease, query, location }) {
//   const parts = [query, disease, location].filter(Boolean);
//   return parts.join(" ").replace(/\s+/g, " ").trim();
// }

// function buildIntentTerms(input = "") {
//   const termMap = {
//     treatment: ["therapy", "management", "intervention", "clinical trial", "drug", "surgery"],
//     prevention: ["risk reduction", "lifestyle", "screening", "vaccine", "prophylaxis"],
//     diagnosis: ["diagnostic", "biomarker", "imaging", "symptoms", "test"],
//     vitamin: ["supplementation", "deficiency", "adverse effects", "nutrient"],
//     symptom: ["signs", "manifestation", "presentation"],
//     prognosis: ["outcome", "survival", "progression", "mortality"],
//     research: ["study", "trial", "evidence", "meta-analysis"],
//   };
//   const lower = input.toLowerCase();
//   const additions = [];
//   for (const [key, list] of Object.entries(termMap)) {
//     if (lower.includes(key)) additions.push(...list);
//   }
//   return additions;
// }

// function createResearchQuery(context) {
//   const correctedDisease = findClosestMedicalTerm(context.disease) || null;
//   const disease = correctedDisease || context.disease || "";
//   const baseParts = [context.query, disease, context.location].filter(Boolean);
//   const base = baseParts.join(" ").replace(/\s+/g, " ").trim();
//   const intentTerms = buildIntentTerms(`${context.query || ""} ${disease} ${context.patientName || ""}`);
//   const expandedQuery = [base, ...intentTerms].filter(Boolean).join(" ");
//   return {
//     query: expandedQuery,
//     correctedDisease,
//   };
// }

// module.exports = { tokenize, createResearchQuery };
