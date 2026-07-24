# AI Research OS — Phase 2 Roadmap & Next Steps 🗺️⚡

**Phase 1 (Core Autonomous Research Assistant)** is operational with dual LLM routing (Groq + Ollama), hybrid PDF parsing (pdfplumber + Docling fallback), async ingestion pipeline, Qdrant vector RAG (in-memory fallback), SQLite metadata store, and the Next.js dashboard (Paper Discovery, Chat & RAG, Multi-Paper Matrix, Literature Review).

> **Note:** Redis is scaffolded in `docker-compose.yml` but has no concrete Phase 1 use case yet — see Phase 2 item #0 for resolution.

This document covers **Phase 2 (Intelligence & Automation Layer)**, ordered from lowest to highest implementation effort.

---

## 🚀 Immediate Next Tasks (Do These First)

Before starting any Phase 2 feature, complete these foundation steps:

1. **Start Docker Infrastructure**
   ```bash
   docker-compose up -d
   ```
   Launches local **Qdrant** (`:6333`) for real vector storage. Without this, the system falls back to in-memory Qdrant which resets on every restart — meaning your indexed papers lose their embeddings.

2. **Test Full Paper Ingestion End-to-End**
   - Start backend: `python run_backend.py`
   - Start frontend: `cd frontend && npm run dev`
   - Search arXiv for 3–5 papers on a topic (e.g. *"GraphRAG"* or *"Agentic RAG"*).
   - Confirm each paper progresses through: `queued → downloading → parsing → extracting → embedding → done`.
   - Ask a question in the Chat tab and verify citations appear with source paragraphs.

3. **Decide Redis Fate**
   - If you want persistent ingestion queuing across restarts: implement Redis-backed task queue (replace `BackgroundTasks`).
   - If not needed yet: **remove Redis from `docker-compose.yml`** to avoid a running container with no purpose.

---

## 🎯 Phase 2 Milestone Objectives

Items are ordered by implementation effort: **easy → hard**.

---

### 1. Research Gap Finder Agent *(Low effort — data already exists)*

- **Goal**: Automatically surface open research problems and novel thesis/project ideas by cross-referencing `limitations` and `future_work` fields already extracted from every ingested paper.
- **Why now**: The structured extraction schema already captures `limitations` and `future_work` per paper. This feature is purely a new agent + prompt — no new data pipeline needed.
- **Target output**:
  - *"3 papers cite 'scalability under large graph structures' as a limitation — no paper addresses this yet."*
  - *"Novel idea: combine LoRA fine-tuning with GraphRAG indexing for domain-specific retrieval."*
- **Action Plan**:
  - Create `backend/app/agents/gap_finder.py` — queries `DatabaseService` for all `structured_data`, groups `limitations` by semantic similarity, synthesizes gaps using Groq 70B.
  - Add a `GET /api/gaps` endpoint in `main.py`.
  - Add a **"Research Gaps & Novel Ideas"** tab in the Next.js frontend.

---

### 2. Export Features *(Low effort — extends existing endpoints)*

- **Goal**: Let users export their work in shareable formats — comparison matrices as CSV/Markdown tables, literature review drafts as `.md` or `.pdf`, and full citation lists.
- **Action Plan**:
  - Add `GET /api/papers/export?format=csv` endpoint — serializes `structured_data` fields across all papers into a downloadable comparison table.
  - Add a **"Download as Markdown"** button in `LiteratureDraft.tsx` that saves the current review draft to a `.md` file.
  - Add **"Export as PDF"** using a lightweight client-side library like `jsPDF` or `react-pdf`.

---

### 3. Paper Annotations & Personal Notes *(Low effort — extends existing DB schema)*

- **Goal**: Let researchers attach personal notes, highlights, and tags to individual papers in their library — turning the OS into a genuine research notebook.
- **Action Plan**:
  - Add a `notes` text column and `tags` JSON array to `PaperORM` in `db_models.py`.
  - Add `PATCH /api/papers/{paper_id}/notes` endpoint.
  - Add an inline notes editor card in `PaperCard.tsx` (expandable panel with a text area and tag chips).

---

### 4. Interactive Research Timeline Visualization *(Medium effort)*

- **Goal**: Visual timeline showing the historical evolution of a research field based on publication dates and citation relationships extracted from ingested papers.
  - Example: `Dense Retrieval (2022) → Hybrid RAG (2023) → GraphRAG (2024) → Agentic RAG (2025) → Memory RAG (2026)`
- **Action Plan**:
  - Ensure `published_date` is stored cleanly during ingestion (already in `PaperORM`).
  - Parse citation dependency trees from the `references` section of ingested PDFs (add to `pdf_parser.py`).
  - Build a **Timeline** frontend component using **React Flow** or **D3.js** — nodes are papers, edges are citation links, x-axis is time.
  - Add as a new tab: **"Field Evolution"** in the Navbar.

---

### 5. Figure & Architecture Diagram Understanding *(Medium effort)*

- **Goal**: Use a local vision model to extract, display, and explain architecture diagrams, benchmark plots, and tables directly from paper PDFs.
- **Action Plan**:
  - In `pdf_parser.py`, add an image extraction step using `pdfplumber`'s image bounding-box API — save figure images to `data/figures/{paper_id}/`.
  - Route extracted figures to a vision model via Ollama:
    - **Recommended**: `llava:13b` or `moondream` (widely available in Ollama)
    - **Fallback**: `minicpm-v` (smaller, faster)
    - *(Note: `Qwen2.5-VL` is the highest quality option if your GPU supports it)*
  - Add figure thumbnail cards with AI-generated captions inside the Chat RAG UI and Paper detail view.

---

### 6. Voice Research Mode *(Medium effort)*

- **Goal**: Natural voice conversation with the research agent — speak a question, hear a spoken answer.
  - *"Explain this paper like I'm a beginner"* → synthesized voice output.
- **Action Plan**:
  - **Speech-to-Text**: Use [`faster-whisper`](https://github.com/SYSTRAN/faster-whisper) (pip-installable, runs locally, much faster than `whisper.cpp` for Python integration). Add a `POST /api/transcribe` endpoint.
  - **Text-to-Speech**: Integrate [`Kokoro`](https://github.com/hexgrad/kokoro) or `Piper` TTS engine for local voice synthesis. Add a `POST /api/speak` endpoint.
  - **Frontend**: Add a push-to-talk 🎤 microphone button in `ChatInterface.tsx` — records audio, sends to `/api/transcribe`, autofills the query input, and plays back the agent's response via `/api/speak`.

---

### 7. n8n Automated Research Digest *(Medium effort)*

- **Goal**: A fully automated background workflow that monitors selected arXiv topics daily, auto-ingests new papers, and sends a digest (email or Notion) summarizing new findings and research gaps.
- **Cadence**: Daily monitoring; weekly digest — configurable via n8n workflow.
- **Action Plan**:
  - Add `n8n` service container to `docker-compose.yml` (official n8n Docker image).
  - Expose webhook endpoints in FastAPI:
    - `POST /api/webhooks/arxiv-digest` — triggers topic scan + ingestion.
    - `GET /api/digest/summary` — returns a pre-formatted digest payload.
  - Build n8n workflow: **Cron trigger → HTTP request to FastAPI → format digest → send via Gmail/Notion node**.

---

### 8. Neo4j Knowledge Graph Integration / GraphRAG *(High effort — do last)*

- **Goal**: Upgrade from flat vector similarity search to a true property graph model, enabling multi-hop relational queries that Qdrant cannot answer.
- **Target Queries**:
  - *"Which papers use Qwen2.5 as a backbone and evaluate on MMLU?"*
  - *"Find all papers that build upon GraphRAG and use LoRA for fine-tuning."*
  - *"Which datasets are used by more than 3 papers in my library?"*
- **Data Source**: The existing `structured_data` JSON (already extracted per paper) provides the graph nodes — `Paper → Author → Concept → Dataset → Method → Citation` — no new extraction pipeline needed, just graph ingestion.
- **Action Plan**:
  - Deploy `neo4j` container in `docker-compose.yml` (`bolt://localhost:7687`, Browser: `:7474`).
  - Create `backend/app/services/graph_db.py` — Cypher query builder + Neo4j Python driver wrapper.
  - On paper ingestion completion (`status = done`), map `structured_data` nodes into Cypher `CREATE` / `MERGE` statements.
  - Add a `graph_rag.py` agent that routes complex multi-hop queries to Neo4j Cypher instead of Qdrant vector search.
  - Expose graph query results in the Chat UI alongside vector RAG citations.

---

### 9. Model Fine-Tuning for Extraction (Unsloth + QLoRA) *(High effort — optional)*

- **Goal**: Fine-tune a 7B/8B local model specifically for structured JSON extraction from multi-column scientific PDFs, targeting >98% schema accuracy (vs. the base model's ~75–85%).
- **When to do this**: Only worthwhile once you have 200+ ingested papers with verified ground-truth extractions to train on.
- **Action Plan**:
  - Curate an evaluation dataset: sample 50–100 papers from your library, manually verify their `structured_data` JSON extractions as ground truth.
  - Fine-tune using [`Unsloth`](https://github.com/unslothai/unsloth) PEFT QLoRA on `Qwen2.5:7b` or `Llama-3.1:8b`.
  - Register the fine-tuned model in `llm_factory.py` as the default `bulk` extraction model.
  - Run a benchmark: before vs. after accuracy on the held-out evaluation set.

---

## 📊 Phase 2 Feature Summary

| # | Feature | Effort | Dependency |
|---|---------|--------|------------|
| 1 | Research Gap Finder | 🟢 Low | Phase 1 structured_data |
| 2 | Export Features | 🟢 Low | Phase 1 endpoints |
| 3 | Paper Annotations | 🟢 Low | Phase 1 DB schema |
| 4 | Research Timeline | 🟡 Medium | published_date + React Flow |
| 5 | Figure Understanding | 🟡 Medium | Ollama vision model |
| 6 | Voice Research Mode | 🟡 Medium | faster-whisper + TTS |
| 7 | n8n Digest | 🟡 Medium | Docker + n8n |
| 8 | Neo4j GraphRAG | 🔴 High | structured_data + Neo4j |
| 9 | Model Fine-Tuning | 🔴 High | 200+ verified papers |
