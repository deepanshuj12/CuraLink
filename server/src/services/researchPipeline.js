const { createResearchQuery, tokenize } = require("./queryService");
const { fetchOpenAlex, fetchPubMed, fetchClinicalTrials } = require("./sourceClients");
const { rerankRecords } = require("./rankingService");
const { generateStructuredAnswer } = require("./llmService");


const cache = new Map();
const CACHE_TTL = 1000 * 60 * 10; // 10 minutes

function setCache(key, value) {
  cache.set(key, {
    data: value,
    expiry: Date.now() + CACHE_TTL
  });
}

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}


function quickFilter(records, query) {
  const tokens = tokenize(query);

  return records.filter(item => {
    const text = `${item.title} ${item.abstract || ""}`.toLowerCase();

    let matches = 0;
    for (const token of tokens) {
      if (token.length > 3 && text.includes(token)) {
        matches++;
      }
    }

    return matches >= 2; // require stronger signal
  }).slice(0, 80);
}


async function safeFetch(fn) {
  try {
    return await fn();
  } catch {
    return [];
  }
}

async function runResearchPipeline(context) {
  const { query: expandedQuery, correctedDisease } = createResearchQuery(context);


  const cacheKey = JSON.stringify({
    q: expandedQuery,
    d: correctedDisease,
    l: context.location,
  });

  const cached = getCache(cacheKey);
  if (cached) return cached;


  const BASE_LIMIT = context.inputStyle === "followup" ? 40 : 80;

  const [openAlexRaw, pubmedRaw, trialsRaw] = await Promise.all([
    safeFetch(() => fetchOpenAlex(expandedQuery, 1, Math.floor(BASE_LIMIT * 0.6))),
    safeFetch(() => fetchPubMed(expandedQuery, Math.floor(BASE_LIMIT * 0.6))),
    safeFetch(() => fetchClinicalTrials(correctedDisease || context.disease, expandedQuery, 40)),
  ]);

  const allPublications = [...openAlexRaw, ...pubmedRaw];


  const filteredPublications = quickFilter(allPublications, expandedQuery);


  const topPublications = rerankRecords(expandedQuery, filteredPublications, 6, context);
  const topTrials = rerankRecords(expandedQuery, trialsRaw, 4, context);

  let finalPublications = topPublications;


  if (topPublications.length < 2) {
    const fallbackPubs = rerankRecords(expandedQuery, allPublications, 4, context);

    if (fallbackPubs.length === 0) {
      return {
        expandedQuery,
        correctedDisease,
        publications: [],
        clinicalTrials: [],
        answer: "Insufficient high-quality research found for this query.",
      };
    }

    finalPublications = fallbackPubs;
  }


  const answer = await generateStructuredAnswer(
    context,
    finalPublications.slice(0, 5),
    topTrials.slice(0, 3)
  );

  const result = {
    expandedQuery,
    correctedDisease,
    retrievalStats: {
      totalCandidates: allPublications.length + trialsRaw.length,
      publicationCandidates: allPublications.length,
      trialCandidates: trialsRaw.length,
    },
    sourceStatus: {
      openAlex: openAlexRaw.length ? "ok" : "empty",
      pubmed: pubmedRaw.length ? "ok" : "empty",
      clinicalTrials: trialsRaw.length ? "ok" : "empty",
    },
    publications: finalPublications,
    clinicalTrials: topTrials,
    answer,
  };


  setCache(cacheKey, result);

  return result;
}

module.exports = { runResearchPipeline };
