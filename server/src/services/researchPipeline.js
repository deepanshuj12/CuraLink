const { createResearchQuery, tokenize } = require("./queryService");
const { fetchOpenAlex, fetchPubMed, fetchClinicalTrials } = require("./sourceClients");
const { rerankRecords } = require("./rankingService");
const { generateStructuredAnswer } = require("./llmService");

// 🔥 In-memory cache with TTL
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

// 🔥 Improved filtering (removes weak matches)
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

// 🔥 Safe API calls
async function safeFetch(fn) {
  try {
    return await fn();
  } catch {
    return [];
  }
}

async function runResearchPipeline(context) {
  const { query: expandedQuery, correctedDisease } = createResearchQuery(context);

  // 🔥 Better cache key
  const cacheKey = JSON.stringify({
    q: expandedQuery,
    d: correctedDisease,
    l: context.location,
  });

  const cached = getCache(cacheKey);
  if (cached) return cached;

  // 🔥 Balanced retrieval size
  const BASE_LIMIT = context.inputStyle === "followup" ? 40 : 80;

  const [openAlexRaw, pubmedRaw, trialsRaw] = await Promise.all([
    safeFetch(() => fetchOpenAlex(expandedQuery, 1, Math.floor(BASE_LIMIT * 0.6))),
    safeFetch(() => fetchPubMed(expandedQuery, Math.floor(BASE_LIMIT * 0.6))),
    safeFetch(() => fetchClinicalTrials(correctedDisease || context.disease, expandedQuery, 40)),
  ]);

  const allPublications = [...openAlexRaw, ...pubmedRaw];

  // 🔥 Fast filtering
  const filteredPublications = quickFilter(allPublications, expandedQuery);

  // 🔥 Ranking
  const topPublications = rerankRecords(expandedQuery, filteredPublications, 6, context);
  const topTrials = rerankRecords(expandedQuery, trialsRaw, 4, context);

  let finalPublications = topPublications;

  // 🔥 Smart fallback if filtering too strict
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

  // 🔥 Optimized LLM call (reduced tokens)
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

  // 🔥 Cache result
  setCache(cacheKey, result);

  return result;
}

module.exports = { runResearchPipeline };




// const { expandQuery } = require("./queryExpansionService");
// const { fetchOpenAlex, fetchPubMed, fetchClinicalTrials } = require("./sourceClients");
// const { rerankRecords } = require("./rankingService");
// const { generateStructuredAnswer } = require("./llmService.js");

// // fallback (keep your old logic as backup)
// const { createResearchQuery } = require("./queryService");

// async function runResearchPipeline(context) {
//   let expandedQuery;
//   let correctedDisease = null;

//   // ✅ 1. Query Expansion (NEW)
//   try {
//     expandedQuery = await expandQuery(context);
//   } catch (err) {
//     console.warn("LLM expansion failed, using fallback");
//     const fallback = createResearchQuery(context);
//     expandedQuery = fallback.query;
//     correctedDisease = fallback.correctedDisease;
//   }

//   const searchDisease = correctedDisease || context.disease || expandedQuery;

//   // ✅ 2. Retrieval (UNCHANGED)
//   const [openAlexRaw, pubmedRaw, trialsRaw] = await Promise.all([
//     fetchOpenAlex(expandedQuery, 2, 50),
//     fetchPubMed(expandedQuery, 50),
//     fetchClinicalTrials(searchDisease, expandedQuery, 50),
//   ]);

//   const allPublications = [...openAlexRaw, ...pubmedRaw];

//   // ✅ 3. Semantic filtering (NEW)
//   const filteredPublications = await semanticFilter(
//     expandedQuery,
//     allPublications,
//     100
//   );

//   // ✅ 4. Cross-encoder reranking (NEW)
//   const rerankedPublications = await rerank(
//     expandedQuery,
//     filteredPublications,
//     20
//   );

//   // ✅ 5. Final scoring (your existing logic)
//   const topPublications = rerankRecords(
//     expandedQuery,
//     rerankedPublications,
//     6,
//     context
//   );

//   const topTrials = rerankRecords(
//     expandedQuery,
//     trialsRaw,
//     6,
//     context
//   );

//   // ✅ 6. LLM generation (UNCHANGED)
//   const answer = await generateStructuredAnswer(
//     context,
//     topPublications,
//     topTrials
//   );

//   return {
//     expandedQuery,
//     correctedDisease,
//     retrievalStats: {
//       totalCandidates: allPublications.length + trialsRaw.length,
//       publicationCandidates: allPublications.length,
//       trialCandidates: trialsRaw.length,
//     },
//     sourceStatus: {
//       openAlex: openAlexRaw.length > 0 ? "ok" : "empty_or_failed",
//       pubmed: pubmedRaw.length > 0 ? "ok" : "empty_or_failed",
//       clinicalTrials: trialsRaw.length > 0 ? "ok" : "empty_or_failed",
//     },
//     publications: topPublications,
//     clinicalTrials: topTrials,
//     answer,
//   };
// }

// module.exports = { runResearchPipeline };

// // const { createResearchQuery } = require("./queryService");
// // const { fetchOpenAlex, fetchPubMed, fetchClinicalTrials } = require("./sourceClients");
// // const { rerankRecords } = require("./rankingService");
// // const { generateStructuredAnswer } = require("./llmService");

// // async function runResearchPipeline(context) {
// //   const { query: expandedQuery, correctedDisease } = createResearchQuery(context);

// //   const searchDisease = correctedDisease || context.disease || expandedQuery;
// //   const [openAlexRaw, pubmedRaw, trialsRaw] = await Promise.all([
// //     fetchOpenAlex(expandedQuery, 2, 50),
// //     fetchPubMed(expandedQuery, 50),
// //     fetchClinicalTrials(searchDisease, expandedQuery, 50),
// //   ]);

// //   const allPublications = [...openAlexRaw, ...pubmedRaw];
// //   const topPublications = rerankRecords(expandedQuery, allPublications, 6, context);
// //   const topTrials = rerankRecords(expandedQuery, trialsRaw, 6, context);
// //   const answer = await generateStructuredAnswer(context, topPublications, topTrials);

// //   return {
// //     expandedQuery,
// //     correctedDisease,
// //     retrievalStats: {
// //       totalCandidates: allPublications.length + trialsRaw.length,
// //       publicationCandidates: allPublications.length,
// //       trialCandidates: trialsRaw.length,
// //     },
// //     sourceStatus: {
// //       openAlex: openAlexRaw.length > 0 ? "ok" : "empty_or_failed",
// //       pubmed: pubmedRaw.length > 0 ? "ok" : "empty_or_failed",
// //       clinicalTrials: trialsRaw.length > 0 ? "ok" : "empty_or_failed",
// //     },
// //     publications: topPublications,
// //     clinicalTrials: topTrials,
// //     answer,
// //   };
// // }

// // module.exports = { runResearchPipeline };
