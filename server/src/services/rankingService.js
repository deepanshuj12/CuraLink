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
      disease * 0.35 +     
      recency * 0.15 +
      credibility * 0.15 +
      citations * 0.05;

    return { ...item, score: Number(score.toFixed(4)) };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

module.exports = { rerankRecords };
