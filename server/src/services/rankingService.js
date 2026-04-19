const { tokenize } = require("./queryService");

function scoreTextMatch(queryTokens, text = "") {
  const target = new Set(tokenize(text));
  let overlap = 0;

  for (const token of queryTokens) {
    if (target.has(token)) overlap += 1;
  }

  return overlap / Math.max(queryTokens.length, 1);
}

function diseaseMatchScore(disease, text = "") {
  if (!disease) return 0;

  const lowerText = text.toLowerCase();
  const lowerDisease = disease.toLowerCase();

  if (lowerText.includes(lowerDisease)) return 1;

  const diseaseWords = tokenize(disease);
  const textWords = tokenize(text);

  const common = diseaseWords.filter(w => textWords.includes(w));
  return common.length / Math.max(diseaseWords.length, 1);
}

function yearScore(year) {
  if (!year) return 0.3;
  const age = new Date().getFullYear() - year;
  return Math.max(0.2, 1 - age / 20);
}

function credibilityScore(source) {
  const map = {
    "PubMed": 1,
    "ClinicalTrials.gov": 0.95,
    "OpenAlex": 0.85,
  };
  return map[source] || 0.5;
}

function citationScore(item) {
  return item.citationCount ? Math.min(item.citationCount / 100, 1) : 0.4;
}

function rerankRecords(query, records, limit = 6, context = {}) {
  const queryTokens = tokenize(query);

  const scored = records.map(item => {
    const relevance = scoreTextMatch(queryTokens, `${item.title} ${item.abstract || ""}`);
    const disease = diseaseMatchScore(context.disease, item.title + " " + (item.abstract || ""));
    const recency = yearScore(item.year);
    const credibility = credibilityScore(item.source);
    const citations = citationScore(item);

    const score =
      relevance * 0.30 +
      disease * 0.35 +     // 🔥 boosted
      recency * 0.15 +
      credibility * 0.15 +
      citations * 0.05;

    return { ...item, score: Number(score.toFixed(4)) };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

module.exports = { rerankRecords };


// const { tokenize } = require("./queryService");

// function scoreTextMatch(queryTokens, text = "") {
//   if (!text) return 0;
//   const target = new Set(tokenize(text));
//   let overlap = 0;
//   let exactMatches = 0;
//   for (const token of queryTokens) {
//     if (target.has(token)) {
//       overlap += 1;
//       // Boost exact phrase matches
//       if (text.toLowerCase().includes(token)) exactMatches += 0.5;
//     }
//   }
//   return overlap / Math.max(queryTokens.length, 1) + exactMatches;
// }

// function diseaseMatchScore(disease, text = "") {
//   if (!disease) return 0;
//   const lowerText = text.toLowerCase();
//   const lowerDisease = disease.toLowerCase();
//   if (lowerText.includes(lowerDisease)) return 1;
//   // Check for related terms
//   const diseaseWords = tokenize(disease);
//   const textWords = tokenize(text);
//   const commonWords = diseaseWords.filter(word => textWords.includes(word));
//   return commonWords.length / Math.max(diseaseWords.length, 1) * 0.8;
// }

// function locationMatchScore(location, text = "") {
//   if (!location) return 0;
//   const lowerText = text.toLowerCase();
//   const lowerLocation = location.toLowerCase();
//   if (lowerText.includes(lowerLocation)) return 1;
//   return 0;
// }

// function yearScore(year) {
//   if (!year) return 0.2;
//   const currentYear = new Date().getFullYear();
//   const age = Math.max(currentYear - year, 0);
//   // More recent papers get higher scores, with diminishing returns
//   return Math.max(0.1, 1 - (age / 15)); // 15 years for full decay
// }

// function credibilityScore(source) {
//   const scores = {
//     "PubMed": 1.0,
//     "ClinicalTrials.gov": 0.95,
//     "OpenAlex": 0.85,
//   };
//   return scores[source] || 0.5;
// }

// function citationScore(item) {
//   // If we have citation data, use it
//   if (item.citationCount !== undefined) {
//     return Math.min(item.citationCount / 100, 1); // Cap at 100 citations
//   }
//   return 0.5; // Default
// }

// function rerankRecords(query, records, limit = 8, context = {}) {
//   const queryTokens = tokenize(query);
//   const scored = records.map((item) => {
//     const relevance = scoreTextMatch(queryTokens, `${item.title} ${item.abstract || ""} ${item.snippet || ""}`);
//     const diseaseMatch = diseaseMatchScore(context.disease, `${item.title} ${item.abstract || ""}`);
//     const locationMatch = locationMatchScore(context.location, `${item.title} ${item.abstract || ""}`);
//     const recency = yearScore(item.year);
//     const credibility = credibilityScore(item.source);
//     const citations = citationScore(item);

//     // Weighted scoring: relevance is most important, then recency and credibility
//     const score = relevance * 0.35 + diseaseMatch * 0.20 + locationMatch * 0.10 +
//                   recency * 0.15 + credibility * 0.15 + citations * 0.05;

//     return { ...item, score: Number(score.toFixed(4)) };
//   });
//   scored.sort((a, b) => b.score - a.score);
//   return scored.slice(0, limit);
// }

// module.exports = { rerankRecords };
