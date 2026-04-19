const axios = require("axios");
const xml2js = require("xml2js");

const http = axios.create({ timeout: 30000 });

function decodeOpenAlexAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== "object") return "";
  const pairs = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions || []) pairs.push([pos, word]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  return pairs.map((entry) => entry[1]).join(" ");
}

async function fetchOpenAlex(query, pages = 2, perPage = 100) {
  try {
    const tasks = [];
    for (let page = 1; page <= pages; page += 1) {
      tasks.push(
        http.get("https://api.openalex.org/works", {
          params: {
            search: query,
            "per-page": perPage,
            page,
            sort: "relevance_score:desc",
          },
        })
      );
    }
    const responses = await Promise.all(tasks);
    return responses.flatMap((r) =>
      (r.data?.results || []).map((work) => {
        const abstract = decodeOpenAlexAbstract(work.abstract_inverted_index);
        return {
          id: work.id,
          title: work.title || "Untitled",
          abstract,
          authors: (work.authorships || [])
            .map((a) => a.author?.display_name)
            .filter(Boolean),
          year: work.publication_year || null,
          source: "OpenAlex",
          // url: work.primary_location?.landing_page_url || work.id,
          url: work.id,
          snippet: abstract.slice(0, 260) || work.title || "",
        };
      })
    );
  } catch (error) {
    console.error("OpenAlex fetch failed:", error.message);
    return [];
  }
}

async function fetchPubMed(query, retmax = 120) {
  try {
    const search = await http.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi", {
      params: {
        db: "pubmed",
        term: query,
        retmax,
        sort: "pub+date",
        retmode: "json",
      },
    });
    const ids = search.data?.esearchresult?.idlist || [];
    if (!ids.length) return [];

    const details = await http.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi", {
      params: {
        db: "pubmed",
        id: ids.join(","),
        retmode: "xml",
      },
    });

    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    const parsed = await parser.parseStringPromise(details.data);
    const articles = parsed?.PubmedArticleSet?.PubmedArticle || [];
    const list = Array.isArray(articles) ? articles : [articles];

    return list.filter(Boolean).map((article) => {
      const citation = article?.MedlineCitation || {};
      const articleInfo = citation?.Article || {};
      const authorList = articleInfo?.AuthorList?.Author || [];
      const authors = (Array.isArray(authorList) ? authorList : [authorList])
        .map((a) => [a?.ForeName, a?.LastName].filter(Boolean).join(" "))
        .filter(Boolean);
      const abstractText = articleInfo?.Abstract?.AbstractText;
      const abstract = Array.isArray(abstractText)
        ? abstractText.map((item) => (typeof item === "string" ? item : item?._ || "")).join(" ")
        : typeof abstractText === "string"
          ? abstractText
          : abstractText?._ || "";
      const pmid = citation?.PMID?._ || citation?.PMID || "";
      const year = articleInfo?.Journal?.JournalIssue?.PubDate?.Year || null;
      const title = articleInfo?.ArticleTitle?._ || articleInfo?.ArticleTitle || "Untitled";
      return {
        id: `pubmed:${pmid || title}`,
        title,
        abstract,
        authors,
        year: year ? Number(year) : null,
        source: "PubMed",
        url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "",
        snippet: abstract?.slice(0, 260) || title,
      };
    });
  } catch (error) {
    console.error("PubMed fetch failed:", error.message);
    return [];
  }
}

// async function fetchClinicalTrials(condition, query, pageSize = 100) {
//   try {
//     const response = await http.get("https://clinicaltrials.gov/api/v2/studies", {
//       params: {
//         "query.cond": condition,
//         "query.term": query,
//         "filter.overallStatus": "RECRUITING",
//         pageSize,
//         format: "json",
//       },
//     });
//     const studies = response.data?.studies || [];
//     return studies.map((study) => {
//       const proto = study.protocolSection || {};
//       const ident = proto.identificationModule || {};
//       const status = proto.statusModule || {};
//       const contacts = proto.contactsLocationsModule || {};
//       const eligibility = proto.eligibilityModule || {};
//       const firstLocation = contacts?.locations?.[0];
//       const centralContact = contacts?.centralContacts?.[0];
//       return {
//         id: ident.nctId || ident.orgStudyId || ident.briefTitle,
//         title: ident.briefTitle || "Untitled Trial",
//         recruitingStatus: status.overallStatus || "UNKNOWN",
//         eligibilityCriteria: eligibility.eligibilityCriteria || "Not listed",
//         location: firstLocation
//           ? [firstLocation.city, firstLocation.state, firstLocation.country].filter(Boolean).join(", ")
//           : "Not listed",
//         contact: centralContact
//           ? [centralContact.name, centralContact.phone, centralContact.email].filter(Boolean).join(" | ")
//           : "Not listed",
//         source: "ClinicalTrials.gov",
//         url: ident.nctId ? `https://clinicaltrials.gov/study/${ident.nctId}` : "",
//         snippet: eligibility.eligibilityCriteria?.slice(0, 260) || ident.briefTitle || "",
//       };
//     });
//   } catch (error) {
//     console.error("ClinicalTrials fetch failed:", error.message);
//     return [];
//   }
// }
async function fetchClinicalTrials(condition, query, pageSize = 100) {
  try {
    const response = await http.get("https://clinicaltrials.gov/api/v2/studies", {
      params: {
        "query.cond": condition,
        "query.term": query,
        "filter.overallStatus": "RECRUITING",
        pageSize,
        format: "json",
      },
    });

    const studies = response.data?.studies || [];

    return studies.map((study) => {
      const proto = study.protocolSection || {};
      const ident = proto.identificationModule || {};
      const status = proto.statusModule || {};
      const contacts = proto.contactsLocationsModule || {};
      const eligibility = proto.eligibilityModule || {};
      const description = proto.descriptionModule || {};

      const firstLocation = contacts?.locations?.[0];
      const centralContact = contacts?.centralContacts?.[0];

      const nctId = ident.nctId;

      return {
        id: nctId || ident.orgStudyId || ident.briefTitle,

        title: ident.briefTitle || "Untitled Trial",

        // ✅ ADD ABSTRACT (important for ranking + LLM reasoning)
        abstract: description.briefSummary || "",

        snippet:
          description.briefSummary?.slice(0, 240) ||
          eligibility.eligibilityCriteria?.slice(0, 240) ||
          ident.briefTitle ||
          "",

        // ✅ ADD AUTHORS (LLM expects this format)
        authors: ["ClinicalTrials.gov"],

        // ✅ ADD YEAR (helps rankingService)
        year: status.startDateStruct?.year || null,

        recruitingStatus: status.overallStatus || "UNKNOWN",

        eligibilityCriteria:
          eligibility.eligibilityCriteria || "Not listed",

        location: firstLocation
          ? [firstLocation.city, firstLocation.state, firstLocation.country]
              .filter(Boolean)
              .join(", ")
          : "Not listed",

        contact: centralContact
          ? [centralContact.name, centralContact.phone, centralContact.email]
              .filter(Boolean)
              .join(" | ")
          : "Not listed",

        source: "ClinicalTrials.gov",

        // ✅ CRITICAL FIX (you already had this, just make it safer)
        url: nctId ? `https://clinicaltrials.gov/study/${nctId}` : null,
      };
    });
  } catch (error) {
    console.error("ClinicalTrials fetch failed:", error.message);
    return [];
  }
}

module.exports = { fetchOpenAlex, fetchPubMed, fetchClinicalTrials };
