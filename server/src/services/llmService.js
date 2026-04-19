const { Groq } = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

function makeCompactSource(source) {
  return `Title: ${source.title}
Source: ${source.source}
Year: ${source.year || "N/A"}
URL: ${source.url || "N/A"}
Authors: ${(source.authors || []).slice(0, 2).join(", ") || "N/A"}
Snippet: ${(source.snippet || source.abstract || "").slice(0, 120)}`;
}

function buildConversationContext(history = []) {
  if (!history.length) return "";

  const trimmed = history.slice(-2);

  return `Previous conversation:\n${trimmed
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")}\n\n`;
}

function sanitizeStructuredAnswer(answer, allowedUrls = []) {
  if (!answer || typeof answer !== "string") return answer;

  const allowedSet = new Set(allowedUrls.filter(Boolean).map(url => url.trim()));
  const allowedDomains = ["pubmed.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov", "openalex.org", "clinicaltrials.gov"];
  
  let result = answer;
  
  function isAllowedUrl(url) {
    // Check exact match in allowed set
    if (allowedSet.has(url)) return true;
    
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      // Check if hostname matches any allowed domain exactly or as subdomain
      return allowedDomains.some(domain => 
        hostname === domain || hostname.endsWith("." + domain)
      );
    } catch (e) {
      return false;
    }
  }

  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    const trimmedUrl = url.trim();
    if (isAllowedUrl(trimmedUrl)) {
      return match; 
    }
    return text; 
  });

  result = result.replace(/(https?:\/\/[^\s\)\]\}]+)/g, (match) => {
    let normalized = match.replace(/[\)\.\],;:!?\}]+$/, "").trim();
    if (isAllowedUrl(normalized)) {
      return match; // Keep allowed URLs
    }
    return ""; 
  });

  return result;
}
// function sanitizeStructuredAnswer(answer, allowedUrls = []) {
//   if (!answer || typeof answer !== "string") return answer;

//   const allowedSet = new Set(allowedUrls.filter(Boolean));
//   const urlRegex = /(https?:\/\/[^\s)]+)/g;

//   return answer.replace(urlRegex, (match) => {
//     const normalized = match.replace(/[\)\.\],;:!?]+$/, "");
//     if (allowedSet.has(normalized)) return match;
//     if (normalized.includes("pubmed.ncbi.nlm.nih.gov") || normalized.includes("ncbi.nlm.nih.gov") || normalized.includes("openalex.org") || normalized.includes("clinicaltrials.gov")) {
//       return match;
//     }
//     return "";
//   });
// }

async function generateStructuredAnswer(context, publications, trials) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY missing");
  }

  const systemPrompt = `
You are a medical research assistant.
 CRITICAL - MUST FOLLOW:
- ONLY use URLs from the provided sources list below
- If you generate ANY URL not in provided sources, it will be removed
- Do NOT generate, guess, or hallucinate URLs
- Do NOT mention Wikipedia, WebMD, Mayo Clinic, Google, or any general websites
- Do NOT generate URLs for journals you don't have in the provided sources

STRICT RULES:
- Do NOT use the patient's name or location as a generic example.
- Use ONLY provided sources: OpenAlex, PubMed, and ClinicalTrials.gov.
- Do NOT hallucinate.
- If evidence is weak → explicitly say so.
- Use neutral phrasing such as "people with diabetes" or "patients with lung cancer" when describing the condition.
- Use simple plain text section headings like "Condition Overview:" and "Research Insights:".
- Write full sentences and do not cut off content mid-sentence or mid-reference.
- ALWAYS include only the actual URLs from the provided sources.
- Do not invent journal names, sites, or citations.
- Do not include any links or sources from outside the provided citations.
- Only include URLs in Clinical Trials and Ranked Important Links section and nowhere else.
- If you cannot back a sentence with a provided source, omit it.
- Use up to 6 citations total.
- If clinical trials are available, include trial links in addition to the 6-link cap.
- Don't ask the user to look for clinical trials themselves; if none are found, say so.
Output EXACTLY:

1. Condition Overview
2. Research Insights
3. Clinical Trials (source URLs)
4. Practical Notes
5. Safety Disclaimer
`;

  const conversationContext = buildConversationContext(context.conversationHistory);

  const topPublications = publications.slice(0, 4);
  const topTrials = trials.slice(0, 2);

  let userPrompt;

  if (context.inputStyle === "followup") {
    userPrompt = `${conversationContext}
User follow-up query: ${context.query}

Top publications:
${topPublications.map(makeCompactSource).join("\n")}

Top trials:
${topTrials.map(makeCompactSource).join("\n")}

Instructions:
- Use prior conversation context, but do not restate the full original input.
- Use ONLY provided sources: OpenAlex, PubMed, and ClinicalTrials.gov.
- Make Condition Overview the main response section for this follow-up.
- Other headings may be brief or omitted if they do not add value.
- Choose only the best 3 links for the answer.
- Don't ask user to look for clinical trials themselves, if found nothing say so.
- Ground every claim in sources.
- Mention 3 key findings.
- Include trial status if relevant.
`;
  } else {
    userPrompt = `${conversationContext}
Patient: ${context.patientName || "Unknown"}
Disease: ${context.disease || "Not specified"}
Location: ${context.location || "Not specified"}

User query: ${context.query}

Top publications:
${topPublications.map(makeCompactSource).join("\n")}

Top trials:
${topTrials.map(makeCompactSource).join("\n")}

Instructions:
- Personalize using disease context.
- Do not use the patient name as a generic example.
- Use ONLY provided sources: OpenAlex, PubMed, and ClinicalTrials.gov.
- Ground every claim in sources.
- Mention 3 key findings.
- Include clinical trial URLs if relevant.
- Don't ask user to look for clinical trials themselves, if found nothing say so.
`;
  }

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.6,
      top_p: 0.9,
      max_tokens: 600,
    });

    const rawAnswer = completion.choices[0].message.content;
    const allowedUrls = [...publications, ...trials].map((source) => source.url).filter(Boolean);
    return sanitizeStructuredAnswer(rawAnswer, allowedUrls);
  } catch (error) {
    console.error("Groq error:", error.message);
    throw new Error("LLM generation failed");
  }
}

module.exports = { generateStructuredAnswer };
