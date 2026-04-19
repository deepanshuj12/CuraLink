const { Groq } = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// 🔥 Trim but keep important info
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

  // 🔥 Only last 2 messages (huge token saving)
  const trimmed = history.slice(-2);

  return `Previous conversation:\n${trimmed
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")}\n\n`;
}

function sanitizeStructuredAnswer(answer, allowedUrls = []) {
  if (!answer || typeof answer !== "string") return answer;

  const allowedSet = new Set(allowedUrls.filter(Boolean));
  const urlRegex = /(https?:\/\/[^\s)]+)/g;

  return answer.replace(urlRegex, (match) => {
    const normalized = match.replace(/[\)\.\],;:!?]+$/, "");
    if (allowedSet.has(normalized)) return match;
    if (normalized.includes("pubmed.ncbi.nlm.nih.gov") || normalized.includes("ncbi.nlm.nih.gov") || normalized.includes("openalex.org") || normalized.includes("clinicaltrials.gov")) {
      return match;
    }
    return "";
  });
}

async function generateStructuredAnswer(context, publications, trials) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY missing");
  }

  const systemPrompt = `
You are a medical research assistant.

STRICT RULES:
- Do NOT use the patient's name or location as a generic example.
- Use ONLY provided sources: OpenAlex, PubMed, and ClinicalTrials.gov.
- Do NOT hallucinate.
- If evidence is weak → explicitly say so.
- Use neutral phrasing such as "people with diabetes" or "patients with lung cancer" when describing the condition.
- Use simple plain text section headings like "Condition Overview:" and "Research Insights:".
- Write full sentences and do not cut off content mid-sentence or mid-reference.
- ALWAYS include only the actual URLs from the provided sources in the relevant section.
- Do not invent journal names, sites, or citations.
- Do not include any links or sources from outside the provided citations.
- Allowed domains: openalex.org, pubmed.ncbi.nlm.nih.gov, ncbi.nlm.nih.gov, clinicaltrials.gov.
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





// const { Groq } = require('groq-sdk');

// const groq = new Groq({
//   apiKey: process.env.GROQ_API_KEY,
// });

// function makeSourceLine(source) {
//   return `- ${source.title} | ${source.authors?.join(", ") || "N/A"} | ${source.year || "N/A"} | ${source.source} | ${source.url}\n  Snippet: ${source.snippet || source.abstract?.slice(0, 240) || "N/A"}`;
// }

// async function generateStructuredAnswer(context, publications, trials) {
//   const groqApiKey = process.env.GROQ_API_KEY;
//   if (!groqApiKey) {
//     throw new Error("GROQ_API_KEY environment variable is required");
//   }
// const systemPrompt = `
// You are a medical research assistant.

// Rules:
// - Use ONLY the provided sources
// - Do NOT hallucinate
// - Follow the exact output structure

// Output format (STRICT):

// 1. Condition Overview
// (2–3 sentences)

// 2. Research Insights
// (2–3 sentences + findings from sources)

// 3. Clinical Trials
// (2–3 sentences + trial insights)

// 4. Practical Notes
// (2–3 sentences)

// 5. Safety Disclaimer
// (2–3 sentences)

// - Always ground statements in evidence
// - If evidence is weak, say so
// - Use conversation context if provided
// `;
//   // const systemPrompt = [
//   //   "You are a medical research assistant.",
//   //   "Use only provided sources and avoid hallucination.",
//   //   "ALWAYS output in markdown with EXACTLY these sections:",
//   //   "1. Condition Overview",
//   //   "2. Research Insights",
//   //   "3. Clinical Trials",
//   //   "4. Practical Notes",
//   //   "5. Safety Disclaimer",
//   //   "For each section:",
//   //   "- Provide 2-3 sentences explaining the query context and findings.",
//   //   "- Under Research Insights, include relevant publication links.",
//   //   "- Under Clinical Trials, include relevant clinical trial links.",
//   //   "- Under other sections, include any additional relevant links if applicable.",
//   //   "Support multi-turn conversations by using previous context when relevant.",
//   //   "### Expected Behavior",
//   //   "The system should **automatically expand the query intelligently**.",
//   //   "👉 Example:",
//   //   "Instead of searching:",
//   //   "\"deep brain stimulation\"",
//   //   "It should search:",
//   //   "> **\"deep brain stimulation + Parkinson's disease\"**",
//   //   "---",
//   //   "### Output Should Combine",
//   //   "- Relevant **publications**",
//   //   "- Relevant **clinical trials**",
//   //   "👉 All results must be **context-aware and merged intelligently**",
//   //   "## 2️⃣ Research Data Retrieval (Mandatory Sources)",
//   //   "Your system must use:",
//   //   "- **OpenAlex API** → research publications",
//   //   "- **PubMed API** → research publications",
//   //   "- **ClinicalTrials.gov API** → clinical trials",
//   //   "---",
//   //   "### Publications (OpenAlex + PubMed)",
//   //   "The system should:",
//   //   "- Fetch **relevant publications based on query + disease context**",
//   //   "- Ensure **depth in retrieval before filtering**",
//   //   "---",
//   //   "### Publications Must Include:",
//   //   "- Title",
//   //   "- Abstract / Summary",
//   //   "- Authors",
//   //   "- Publication Year",
//   //   "- Source (PubMed / OpenAlex)",
//   //   "- URL",
//   //   "---",
//   //   "### Retrieval Expectation (Important)",
//   //   "❌ Avoid:",
//   //   "- Fetching only top 1–2 results based on user query",
//   //   "✅ Expected:",
//   //   "- Retrieve a **broad candidate pool (50–300 results)**",
//   //   "- Then:",
//   //   "  - Filter",
//   //   "  - Rank",
//   //   "  - Refine",
//   //   "- Ultimately in final response show only top 6-8 publications or clinical trials",
//   //   "👉 The system must demonstrate **depth first, then precision**",
//   //   "## 4️⃣ Intelligent Retrieval + Re-Ranking",
//   //   "Your system must:",
//   //   "- Retrieve **large sets**",
//   //   "- Apply **strong filtering and ranking**",
//   //   "Ranking factors should include:",
//   //   "- Relevance to query",
//   //   "- Recency",
//   //   "- Source credibility",
//   //   "---",
//   //   "You are free to decide:",
//   //   "- Embeddings vs keyword vs hybrid search",
//   //   "- Vector DB vs direct API processing",
//   //   "- Real-time vs stored data",
//   //   "---",
//   //   "👉 But retrieval must be **deep, accurate, and intentional**",
//   //   "## 6️⃣ Context Awareness & Follow-Up Intelligence",
//   //   "The system must support **multi-turn conversations**.",
//   //   "---",
//   //   "### Example",
//   //   "User:",
//   //   "\"Latest treatment for lung cancer\"",
//   //   "Follow-up:",
//   //   "\"Can I take Vitamin D?\"",
//   //   "---",
//   //   "### Expected Behavior",
//   //   "- Use previous context (lung cancer)",
//   //   "- Re-run retrieval if needed",
//   //   "- Generate a **personalized, research-backed response**",
//   //   "👉 No generic answers",
//   //   "👉 No stale reuse",
//   //   "## 7️⃣ Personalization (Health Companion Behavior)",
//   //   "The system should act like a **user-aware assistant**:",
//   //   "- Understand user condition",
//   //   "- Adapt answers accordingly",
//   //   "- Improve relevance over time",
//   //   "---",
//   //   "### Example",
//   //   "Instead of:",
//   //   "\"Vitamin D is good\"",
//   //   "It should say:",
//   //   "\"Based on studies in lung cancer patients…\"",
//   //   "---",
//   //   "## 8️⃣ Structured Output",
//   //   "Each response should include:",
//   //   "- Condition Overview",
//   //   "- Research Insights (from publications)",
//   //   "- Clinical Trials (if applicable)",
//   //   "- Source Attribution",
//   //   "---",
//   //   "### Source Attribution Must Include:",
//   //   "- Title",
//   //   "- Authors",
//   //   "- Year",
//   //   "- Platform",
//   //   "- URL",
//   //   "- Supporting snippet",
//   // ].join(" ");

//   const conversationContext = context.conversationHistory ?
//     `Previous conversation:\n${context.conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}\n\n` : '';

//   let userPrompt;
//   if (context.inputStyle === 'followup') {
//     userPrompt = `${conversationContext}
// User query: ${context.query}

// Top publications:
// ${publications.slice(0, 8).map(makeSourceLine).join("\n")}

// Top trials:
// ${trials.slice(0, 8).map(makeSourceLine).join("\n")}

// Instructions:
// - Keep statements grounded in evidence above.
// - If evidence is weak, say so explicitly.
// - Mention 4-8 key findings.
// - Mention trial status and eligibility caveats where relevant.
// - Use conversation context when answering follow-up questions.
// `;
//   } else {
//     userPrompt = `${conversationContext}
// Patient: ${context.patientName || "Unknown"}
// Disease: ${context.disease || "Not specified"}
// Location: ${context.location || "Not specified"}
// User query: ${context.query}

// Top publications:
// ${publications.slice(0, 8).map(makeSourceLine).join("\n")}

// Top trials:
// ${trials.slice(0, 8).map(makeSourceLine).join("\n")}

// Instructions:
// - Keep statements grounded in evidence above.
// - If evidence is weak, say so explicitly.
// - Mention 4-8 key findings.
// - Mention trial status and eligibility caveats where relevant.
// - Use conversation context when answering follow-up questions.
// `;
//   }

//   const messages = [
//     { role: "system", content: systemPrompt },
//     { role: "user", content: userPrompt },
//   ];

//   console.log(`Generating answer for query: ${context.query} using Groq (llama-3.3-70b-versatile)`);

//   try {
//     const completion = await groq.chat.completions.create({
//       model: "llama-3.3-70b-versatile",
//       messages: messages,
//       temperature: 0.7,
//       top_p: 0.9,
//       max_tokens: 512,
//     });

//     console.log(`Answer generated successfully for query: ${context.query}`);
//     return completion.choices[0].message.content;
//   } catch (error) {
//     const message = `Groq API call failed for query: ${context.query}, error: ${error.message}`;
//     console.error(message);
//     throw new Error(message);
//   }
// }

// module.exports = { generateStructuredAnswer };
