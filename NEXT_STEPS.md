# AI Research OS — Roadmap & Status 🗺️⚡

**Phase 1 (Core Autonomous Research Assistant)** ✅ — dual LLM routing (Groq + Ollama), hybrid PDF parsing (pdfplumber + Docling fallback), async ingestion pipeline, Qdrant vector RAG (in-memory fallback), SQLite metadata store, Next.js dashboard.

**Phase 2 (Intelligence & Automation Layer)** ✅ — All items below have been implemented.

> **Note:** Redis is scaffolded in `docker-compose.yml` but has no concrete use case yet — remove if unused, or implement Redis-backed task queue to replace `BackgroundTasks`.

---

## ✅ Implemented (Phase 1 → 2)

| Feature | Status | Notes |
|---------|--------|-------|
| Research Gap Finder Agent | ✅ Done | `/api/gaps` endpoint + ResearchGaps component |
| Export Features (CSV + BibTeX/APA/IEEE/MLA) | ✅ Done | `/api/papers/export`, `/api/citations/export` |
| Paper Annotations & Tags | ✅ Done | Notes + tags inline editor in PaperCard |
| Research Timeline Visualization | ✅ Done | `/api/timeline` + ResearchTimeline component |
| Figure & Architecture Diagram Understanding | ✅ Done | `qwen2.5vl:3b` via Ollama, `/api/papers/{id}/figures` |
| Voice Research Mode | ✅ Done | Browser SpeechRecognition + SpeechSynthesis |
| Sort arXiv Results | ✅ Done | Relevance / Latest / Updated toggle |
| Table & Math extraction | ✅ Done | `[TABLE]` and `[MATH]` chunks in pdf_parser |
| Markdown + KaTeX rendering | ✅ Done | MarkdownRenderer component |
| **Batch Ingest All** | ✅ Done | `/api/ingest/batch` + "Ingest All N New" button |
| **Result Count Selector** | ✅ Done | 3 / 6 / 10 / 15 results selector |
| **Already in Library badge** | ✅ Done | Green "✓ In Library" badge on search results |
| **Library Filter** | ✅ Done | Filter-by-title input in library header |
| **Retry Failed Papers** | ✅ Done | `/api/papers/{id}/retry` + Retry button on cards |
| **Toast Notifications** | ✅ Done | Auto-dismiss 4s toast for ingest/retry actions |
| **Chat SSE Streaming** | ✅ Done | `/api/chat/stream` SSE + live step-log ticker |
| **Chat History Persistence** | ✅ Done | localStorage, last 30 messages, Clear button |
| **Chat Ctrl+Enter shortcut** | ✅ Done | Submit chat without clicking button |
| **Find Similar Papers** | ✅ Done | `/api/papers/{id}/similar` Qdrant-based discovery |
| **Startup Script** | ✅ Done | `start.ps1` — validates env, checks Ollama/Qdrant, starts both services |

---

## 🔮 Phase 3 — Deep Knowledge Layer (High Effort, Do Later)

### 1. Neo4j Knowledge Graph / GraphRAG *(High effort)*

- **Goal**: Upgrade from flat vector similarity to a property graph, enabling multi-hop relational queries.
- **Target Queries**:
  - *"Which papers use Qwen2.5 as backbone AND evaluate on MMLU?"*
  - *"Find all papers citing GraphRAG that use LoRA fine-tuning."*
- **Action Plan**:
  - Deploy `neo4j` in `docker-compose.yml` (`bolt://localhost:7687`)
  - Create `backend/app/services/graph_db.py` — Cypher query builder
  - On `status=done`: map `structured_data` into `Paper → Author → Concept → Dataset → Method` Cypher nodes
  - Add `graph_rag.py` agent routing complex queries to Neo4j instead of Qdrant
  - Surface graph query results alongside vector RAG citations in Chat UI

### 2. n8n Automated Research Digest *(Medium effort)*

- **Goal**: Daily arXiv monitoring → auto-ingest → email/Notion digest of new papers + research gaps.
- **Action Plan**:
  - Add `n8n` to `docker-compose.yml`
  - Expose `POST /api/webhooks/arxiv-digest` and `GET /api/digest/summary`
  - Build n8n: **Cron → HTTP → FastAPI → Gmail/Notion node**

### 3. Model Fine-Tuning (Unsloth + QLoRA) *(High effort — needs 200+ papers)*

- **Goal**: Fine-tune `Qwen2.5:7b` for structured JSON extraction, targeting >98% schema accuracy.
- **When**: Only once you have 200+ verified ground-truth extractions.
- **Action Plan**:
  - Curate 50–100 paper evaluation set with verified `structured_data`
  - Fine-tune via [Unsloth](https://github.com/unslothai/unsloth) PEFT QLoRA
  - Register fine-tuned model in `llm_factory.py` as default `bulk` model

---

## 🔧 Quick Start

```powershell
# Option 1: Single script (recommended)
.\start.ps1

# Option 2: Manual
python run_backend.py         # Terminal 1
cd frontend && npm run dev    # Terminal 2
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| Qdrant UI | http://localhost:6333/dashboard |
