const express = require("express");
const Conversation = require("../models/Conversation");
const { runResearchPipeline } = require("../services/researchPipeline");
const { authOptional, authRequired } = require("../middleware/auth");
const { createResearchQuery } = require("../services/queryService");
const { fetchOpenAlex, fetchPubMed, fetchClinicalTrials } = require("../services/sourceClients");
const { rerankRecords } = require("../services/rankingService");
const { generateStructuredAnswer } = require("../services/llmService");

const router = express.Router();

function formatQuoteItems(publications = []) {
  return publications.map((item) => ({
    quote: item.snippet || item.abstract || "No summary snippet available.",
    title: item.title,
    url: item.url,
    source: item.source,
    rank: item.score || 0,
  }));
}

function formatRankedLinks(publications = [], clinicalTrials = []) {
  const links = [
    ...publications.map((item) => ({
      label: `${item.title} • ${item.source}`,
      url: item.url,
      rank: item.score || 0,
      type: "publication",
      snippet: item.snippet || item.abstract?.slice(0, 120) || "",
    })),
    ...clinicalTrials.map((item) => ({
      label: `${item.title} • ${item.source} • ${item.recruitingStatus || "UNKNOWN"}`,
      url: item.url,
      rank: item.score || 0,
      type: "trial",
      snippet: item.snippet || item.eligibilityCriteria?.slice(0, 120) || "",
    })),
  ]
    .filter((item) => Boolean(item.url))
    .sort((a, b) => b.rank - a.rank);

  return links.slice(0, 3);
}

router.post("/chat", authOptional, async (req, res, next) => {
  try {
    const { conversationId, patientName, disease, location, query, inputStyle } = req.body;
    if (!query || !String(query).trim()) {
      return res.status(400).json({ error: "query is required" });
    }

    let conversation = null;
    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
      if (conversation?.userId && (!req.user || String(conversation.userId) !== String(req.user.id))) {
        return res.status(403).json({ error: "Conversation belongs to another account" });
      }
    }
    if (!conversation) {
      conversation = await Conversation.create({
        userId: req.user?.id || null,
        patientName: patientName || "",
        disease: disease || "",
        location: location || "",
        messages: [],
      });
    }

    if (patientName) conversation.patientName = patientName;
    if (disease) conversation.disease = disease;
    if (location) conversation.location = location;

    const effectiveContext = {
      patientName: conversation.patientName,
      disease: disease || conversation.disease,
      location: location || conversation.location,
      query,
      inputStyle: inputStyle || 'full',
      conversationHistory: conversation.messages.slice(-6), // Last 6 messages for context
    };

    conversation.messages.push({ role: "user", content: query, meta: { effectiveContext } });
    const pipelineResult = await runResearchPipeline(effectiveContext);
    const topPublicationQuotes = formatQuoteItems(pipelineResult.publications);
    const rankedLinks = formatRankedLinks(pipelineResult.publications, pipelineResult.clinicalTrials);

    conversation.messages.push({
      role: "assistant",
      content: pipelineResult.answer,
      meta: {
        expandedQuery: pipelineResult.expandedQuery,
        correctedDisease: pipelineResult.correctedDisease,
        retrievalStats: pipelineResult.retrievalStats,
        sourceStatus: pipelineResult.sourceStatus,
        topPublicationQuotes,
        rankedLinks,
      },
    });

    await conversation.save();

    return res.json({
      conversationId: conversation._id,
      context: {
        patientName: conversation.patientName,
        disease: conversation.disease,
        location: conversation.location,
      },
      correctedDisease: pipelineResult.correctedDisease,
      topPublicationQuotes,
      rankedLinks,
      ...pipelineResult,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/conversation/:id", authOptional, async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.id).lean();
    if (!conversation) return res.status(404).json({ error: "conversation not found" });
    if (conversation.userId && (!req.user || String(conversation.userId) !== String(req.user.id))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.json(conversation);
  } catch (error) {
    return next(error);
  }
});

router.get("/history", authRequired, async (req, res, next) => {
  try {
    const rows = await Conversation.find({ userId: req.user.id })
      .sort({ updatedAt: -1 })
      .limit(50)
      .select("_id patientName disease location updatedAt messages")
      .lean();
    const history = rows.map((item) => {
      const userPreview = [...item.messages].reverse().find((m) => m.role === "user")?.content || "";
      return {
        id: item._id,
        patientName: item.patientName,
        disease: item.disease,
        location: item.location,
        updatedAt: item.updatedAt,
        messageCount: item.messages?.length || 0,
        lastMessage: item.messages?.[item.messages.length - 1]?.content || "",
        preview: userPreview,
      };
    });
    return res.json({ history });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
