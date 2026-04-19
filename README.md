# Curalink - AI Medical Research Assistant (MERN + Open-Source LLM)

Full-stack prototype that retrieves research from OpenAlex, PubMed, and ClinicalTrials.gov, re-ranks deep candidates, and uses an open-source local LLM (Ollama) for structured evidence-backed answers.

## Architecture

- `client` - React + Vite chat interface with structured medical context input.
- `server` - Express API, retrieval pipeline, ranking layer, and MongoDB conversation memory.
- LLM - Ollama (`llama3.1:8b` by default), no OpenAI/Gemini APIs.

## Features implemented

- Structured + natural query input (`patientName`, `disease`, `location`, `query`)
- Context-aware query expansion (`query + disease + location + inferred intent terms`)
- Deep retrieval:
  - OpenAlex: ~180 candidates (2 pages x 90)
  - PubMed: up to 120 candidates
  - ClinicalTrials.gov: up to 100 trials
- Ranking using weighted relevance + recency + source credibility
- Final top 6-8 style output (configured as top 8)
- Structured LLM response with:
  - Condition Overview
  - Research Insights
  - Clinical Trials
  - Practical Notes
  - Safety Disclaimer
- Multi-turn context via MongoDB conversation persistence

## Run locally

Prerequisites:
- Node.js 18+
- MongoDB running locally
- Ollama installed and running
- Model pulled, e.g. `ollama pull llama3.1:8b`

### 1) Backend

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

### 2) Frontend

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:5000`

## Core API

### Auth

- `POST /api/auth/register` - create account (`name`, `email`, `password`)
- `POST /api/auth/login` - login and receive JWT
- `GET /api/auth/me` - current user from JWT

### `POST /api/research/chat`

Request:

```json
{
  "conversationId": "optional",
  "patientName": "John Smith",
  "disease": "Parkinson's disease",
  "location": "Toronto, Canada",
  "query": "Deep Brain Stimulation"
}
```

Returns expanded query, retrieval stats, top publications, top clinical trials, and LLM answer with source grounding.

Optional: send `Authorization: Bearer <token>` to bind conversations to account.

### `GET /api/research/history`

Requires JWT and returns last 50 user conversations.
