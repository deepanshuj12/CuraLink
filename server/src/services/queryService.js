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
    "clinical study" 
  ].join(" ");

  return {
    query: expandedQuery.trim(),
    correctedDisease,
  };
}

module.exports = { tokenize, createResearchQuery };
