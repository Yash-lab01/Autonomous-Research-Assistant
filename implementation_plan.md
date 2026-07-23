# AI Research OS — Implementation Plan (Phase 1: Core Autonomous Research Assistant)

Implementation plan for constructing **AI Research OS**, an autonomous local-first & cloud-boosted AI system that continuously discovers, ingests, analyzes, compares, and synthesizes research papers across subjects with full citation traceability.

This plan focuses on **Phase 1 (Core Research Assistant)** as specified in `AI_Research_OS_Project_Overview_and_Roadmap.pdf`.

---

## User Design Decisions & Architecture Updates

> [!TIP]
> **1. Dual LLM Engine Strategy (Workload-Based Routing, Not Simple Primary/Fallback)**:
> - **Bulk/background workloads** (structured JSON extraction during ingestion, run across potentially hundreds of papers): default to **local Ollama** (`qwen2.5:7b` / `llama3.2`). This is not latency-sensitive and keeps the system honest to its local-first design — it also avoids burning through Groq's free-tier rate limits during bulk ingestion runs.
> - **Interactive workloads** (chat Q&A, live multi-paper comparison, literature review generation where the user is waiting): use **Groq API** (`llama-3.3-70b-versatile` / `qwen-2.5-32b`) for its speed, with automatic fallback to local Ollama.
> - **Fallback trigger**: `llm_factory.py` must catch rate-limit (429) and timeout errors specifically — not just "offline mode" — and fall back to Ollama with a request queue/backoff so a bulk ingestion run degrades gracefully instead of failing loudly mid-batch.

> [!TIP]
> **2. Two-Stage Hybrid PDF Parser Pipeline**:
> - **Stage 1 (Fast Path)**: `pdfplumber` / `PyPDF2` for rapid text, abstract, and reference parsing (<1 second per paper).
> - **Stage 2 (Smart Fallback)**: Automatic quality check (heuristics: multi-column detection, garbled/short text, table presence). Routes to **Docling** for layout-aware table extraction and structured section parsing.

> [!TIP]
> **3. Async Ingestion Pipeline (Background Processing)**:
> - PDF download → parse → extract → embed is a multi-second-to-minute pipeline per paper, especially when the Docling fallback triggers. This must not block the API or freeze the chat UI.
> - Run ingestion via FastAPI `BackgroundTasks` at minimum (queue-based processing if Redis is retained — see decision 5 below).
> - Each paper gets a visible status (`queued` → `downloading` → `parsing` → `extracting` → `embedding` → `done` / `failed`) surfaced to the frontend so the UI never appears to hang.

> [!TIP]
> **4. arXiv API Etiquette & Deduplication**:
> - `arxiv_client.py` must add a delay between requests (~3 seconds, per arXiv's guidance) and a descriptive user-agent string, to avoid throttling during bulk discovery searches.
> - Before downloading, check for an existing arXiv ID/DOI in `db.py` to avoid re-ingesting duplicate papers across overlapping searches (e.g. searching "GraphRAG" today and "GraphRAG survey" next week).

> [!TIP]
> **5. Redis — Justified Use or Cut from Phase 1**:
> - Redis appears in `docker-compose.yml` but must have a concrete job to justify inclusion. Use it for either: (a) caching arXiv API responses to avoid redundant repeat searches, or (b) as the backing queue for async ingestion (decision 3 above).
> - If neither is implemented in Phase 1, cut Redis from the compose file entirely and reintroduce it only when a concrete use case exists.

---

## Proposed System Architecture & Directory Layout

```
AI-Research-OS/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI entry point & API endpoints
│   │   ├── config.py                # Groq API key, Ollama URL, & model settings
│   │   ├── agents/                  # LangGraph Agent orchestrations
│   │   │   ├── state.py             # Agent state definitions & schema
│   │   │   ├── graph.py             # LangGraph workflow graph definition
│   │   │   ├── planner.py           # Research Planner Agent
│   │   │   ├── search.py            # arXiv Search & Ingestion Agent
│   │   │   ├── reading.py           # PDF Extraction & Paragraph Indexer Agent
│   │   │   └── writing.py           # Synthesis, Comparison & Citation Agent
│   │   ├── services/
│   │   │   ├── llm_factory.py       # Workload-based LLM router (bulk → Ollama, interactive → Groq 70B, with rate-limit-aware fallback)
│   │   │   ├── arxiv_client.py      # arXiv API & PDF Downloader
│   │   │   ├── pdf_parser.py        # Hybrid parser (pdfplumber fast-path + Docling fallback)
│   │   │   ├── extractor.py         # Structured JSON Extractor (Abstract, Methods, Metrics, etc.)
│   │   │   ├── vector_store.py      # Qdrant client wrapper
│   │   │   └── db.py                # SQLite metadata & citation database
│   │   └── models/
│   │       ├── paper.py             # Pydantic schemas for paper, extraction, citation — includes an explicit status field (queued/downloading/parsing/extracting/embedding/done/failed) and a failure_reason field so partial/failed extractions are visible rather than silently omitted
│   │       └── db_models.py         # ORM models (SQLAlchemy / SQLModel)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx             # Main Dashboard & Research Hub
│   │   │   ├── papers/page.tsx      # Paper Library & Discovery
│   │   │   ├── compare/page.tsx      # Side-by-side Multi-Paper Comparison
│   │   │   └── review/page.tsx      # Structured Literature Review Generator
│   │   ├── components/
│   │   │   ├── ChatInterface.tsx    # Interactive Agent Chat with citation tooltips
│   │   │   ├── PaperCard.tsx        # Paper metadata & quick preview card
│   │   │   ├── ComparisonTable.tsx  # Dynamic metric/dataset comparison matrix
│   │   │   ├── LiteratureDraft.tsx  # Formatted survey paper draft output
│   │   │   └── CitationModal.tsx    # BibTeX / APA / IEEE / MLA Exporter
│   │   └── lib/
│   │       └── api.ts               # FastAPI client connection helpers
│   ├── package.json
│   └── tailwind.config.ts
├── docker-compose.yml               # Local infrastructure (Qdrant, Redis, Ollama, Backend)
├── .env.example                      # Template for GROQ_API_KEY and other secrets (never commit .env)
└── README.md
```

---

## Detailed Step-by-Step Implementation Breakdown

### Phase 1.1: Backend Core, LLM Router & Infrastructure
- [NEW] [docker-compose.yml](file:///c:/Users/yashp/Desktop/New%20folder/docker-compose.yml): Setup Qdrant vector database (`:6333`) and Redis cache/queue (`:6379`). Redis must back a concrete Phase 1 use (arXiv response caching and/or the async ingestion queue) — cut it from the compose file if neither is implemented.
- [NEW] [backend/app/config.py](file:///c:/Users/yashp/Desktop/New%20folder/backend/app/config.py): Configuration settings supporting `GROQ_API_KEY`, default model (`llama-3.3-70b-versatile`), and local Ollama endpoint (`http://localhost:11434`).
- [NEW] [.env.example](file:///c:/Users/yashp/Desktop/New%20folder/.env.example): Template listing `GROQ_API_KEY` and other secrets so real keys are never committed.
- [NEW] [backend/app/services/llm_factory.py](file:///c:/Users/yashp/Desktop/New%20folder/backend/app/services/llm_factory.py): Workload-based router — bulk/background extraction defaults to local Ollama (`qwen2.5:7b`); interactive chat/comparison/review calls default to Groq 70B. Catches 429 rate-limit and timeout errors specifically and falls back to Ollama with request queue/backoff, so a bulk ingestion run degrades gracefully instead of failing mid-batch.

### Phase 1.2: Hybrid PDF Parsing Engine
- [NEW] [backend/app/services/pdf_parser.py](file:///c:/Users/yashp/Desktop/New%20folder/backend/app/services/pdf_parser.py):
  1. Fast Path: Parses using `pdfplumber` for instant paragraph extraction.
  2. Quality Heuristic Inspector: Checks for low character-per-page count, garbled flow, or complex multi-column structures.
  3. Docling Fallback: Auto-triggers `docling` layout & table model when quality thresholds are not met.

### Phase 1.3: arXiv Discovery, Ingestion & Qdrant RAG
- [NEW] [backend/app/services/arxiv_client.py](file:///c:/Users/yashp/Desktop/New%20folder/backend/app/services/arxiv_client.py): Async arXiv API wrapper for searching, fetching metadata, and downloading PDFs. Includes a ~3-second delay between requests and a descriptive user-agent string per arXiv's API etiquette guidance, to avoid throttling during bulk discovery searches.
- [NEW] [backend/app/services/db.py](file:///c:/Users/yashp/Desktop/New%20folder/backend/app/services/db.py): Before downloading a paper, check for an existing arXiv ID/DOI to prevent duplicate ingestion across overlapping searches (e.g. "GraphRAG" today, "GraphRAG survey" next week).
- [NEW] [backend/app/services/extractor.py](file:///c:/Users/yashp/Desktop/New%20folder/backend/app/services/extractor.py): Extracts structured JSON schema (title, task, dataset, model, metrics, limitations, future work). Extraction failures (corrupted PDF, unsupported language, garbled parse) set an explicit `failed` status with a `failure_reason` rather than being silently dropped.
- [NEW] [backend/app/services/vector_store.py](file:///c:/Users/yashp/Desktop/New%20folder/backend/app/services/vector_store.py): Indexes paragraph chunks with page numbers and paragraph IDs into Qdrant for exact citation RAG.

### Phase 1.3b: Async Ingestion Pipeline
- [NEW] Ingestion (download → parse → extract → embed) runs via FastAPI `BackgroundTasks` (or a Redis-backed queue if that use case is adopted), so the API and chat UI never block on a slow paper.
- [NEW] Each paper's status (`queued` / `downloading` / `parsing` / `extracting` / `embedding` / `done` / `failed`) is exposed via an endpoint and polled or streamed to the frontend so in-progress papers are visibly distinguishable from completed ones.

### Phase 1.4: LangGraph Agent Workflows
- [NEW] [backend/app/agents/graph.py](file:///c:/Users/yashp/Desktop/New%20folder/backend/app/agents/graph.py):
  - **Planner Agent**: Route intent (Search vs. Read vs. Compare vs. Review vs. Q&A).
  - **Search Agent**: Runs paper acquisition pipeline.
  - **Reading Agent**: Extracts RAG context with paragraph anchors.
  - **Writing Agent**: Generates side-by-side matrices, literature review drafts, and citation tooltips.

### Phase 1.5: Modern Next.js Frontend Dashboard
- [NEW] [frontend/src/app/page.tsx](file:///c:/Users/yashp/Desktop/New%20folder/frontend/src/app/page.tsx): Main unified dashboard with Discovery, Multi-Paper Comparison, Literature Generator, and RAG Chat.
- [NEW] [frontend/src/components/ChatInterface.tsx](file:///c:/Users/yashp/Desktop/New%20folder/frontend/src/components/ChatInterface.tsx): RAG Chat UI with real-time agent status streaming and clickable citation badges showing exact source paragraphs.
- [NEW] [frontend/src/components/ComparisonTable.tsx](file:///c:/Users/yashp/Desktop/New%20folder/frontend/src/components/ComparisonTable.tsx): Dynamic paper comparison matrix (Datasets, Models, Accuracy, Speed, Limitations).

---

## Verification Plan

### Automated Tests
1. **Parser Benchmark Test**: Run `pdf_parser.py` on single-column vs multi-column test papers to verify fast-path execution and automatic Docling fallback trigger.
2. **LLM Factory Failover**: Test Groq API execution and automatic failover to local Ollama when offline, API key is absent, or a simulated 429 rate-limit response is returned. Verify bulk extraction calls route to Ollama by default and interactive chat calls route to Groq by default.
3. **Structured Extraction Validation**: Test Pydantic JSON schema extraction accuracy on sample arXiv PDFs, including at least one corrupted/malformed PDF to confirm it produces a `failed` status with a populated `failure_reason` rather than crashing or silently dropping the paper.
4. **Deduplication Test**: Ingest the same arXiv ID via two different search queries and verify only one record is created in `db.py`.
5. **arXiv Rate-Limit Compliance**: Verify `arxiv_client.py` enforces the inter-request delay and sends a descriptive user-agent during a bulk search/download run.

### Manual Verification
1. **Paper Discovery & Ingestion**: Search arXiv for `"GraphRAG"` or `"Agentic RAG"` in the UI, verify PDF download, hybrid parsing, and vector indexing.
2. **Citation Traceability**: Ask "Which models perform best on HotpotQA?" and verify that every citation tag `[1]` links to the exact source paragraph snippet.
3. **Multi-Paper Comparison**: Select 3 research papers and verify that the comparison table renders structured dataset, model, and accuracy fields cleanly.
4. **Async Ingestion Visibility**: Trigger ingestion of a paper that requires the Docling fallback (slow path) and confirm the frontend shows live status progression (e.g. `parsing` → `extracting` → `done`) instead of appearing to hang, and that the chat UI remains responsive during ingestion.
5. **Failed Extraction Visibility**: Attempt to ingest a corrupted or non-English PDF and verify it appears in the paper library with a visible `failed` status and reason, rather than being silently omitted from search/comparison results.
