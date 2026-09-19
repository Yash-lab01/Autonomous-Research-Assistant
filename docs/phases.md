# Execution Phases & Implementation Roadmap

This document transforms the architectural suggestions and backend analysis from [`07_backend_analysis_and_upgrades.md`](file:///docs/07_backend_analysis_and_upgrades.md) and [`05_current_problems_and_solutions.md`](file:///docs/05_current_problems_and_solutions.md) into a structured, step-by-step engineering roadmap. 

Each phase is grouped logically with a clear objective, actionable checklist, technical blueprint, exact files to modify, and verification metrics.

---

## 🗺️ Roadmap At A Glance

```
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Immediate Latency & Rate-Limit Breakthrough                   │
│ • True SSE Streaming on Synthesis  • Persistent Groq HTTP Connection   │
│ • Content-Hash Synthesis Caching    • Database Research Cards (Sol 2)  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Retrieval Precision & Answer Quality Engine                   │
│ • Hybrid Search (Dense + BM25 RRF)  • Cross-Encoder Re-ranking (ONNX)   │
│ • Section-Aware AST Chunking       • Citation Fact-Check Verification  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: High-Throughput Ingestion & Resource Optimization             │
│ • FastEmbed ONNX Engine (No Torch) • Async Parallel Ingestion Pipeline │
│ • Interactive Table DataFrame Parse• Click-to-Ask Multimodal Figures   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: Advanced Research Workflows & Platform Parity                 │
│ • Consensus Meter Polarity Scorer  • Elicit Custom Extraction Columns  │
│ • Interactive Citation Graph Canvas• One-Click LaTeX / Overleaf Export │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Phase 1: Immediate Latency & Rate-Limit Breakthrough

**Goal:** Eliminate the 5-second initial delay on synthesis tools, prevent Groq 413/429 rate-limit crashes, and make answers begin rendering in under 250ms.

### 📋 Phase 1 Checklist (Completed & Verified)
- [x] **1.1 True Server-Sent Events (SSE) Streaming for Synthesis Endpoints**
- [x] **1.2 Persistent HTTP Connection Pooling for Groq Cloud API**
- [x] **1.3 Content-Hash In-Memory & SQLite Synthesis Caching**
- [x] **1.4 Hierarchical Ingestion & Database Research Cards (Solution 2)**


---

### 🛠️ Phase 1 Implementation Details: What & How to Do

#### 1.1 True Server-Sent Events (SSE) Streaming
* **Problem Solved:** Currently, `/api/compare/prose`, `/api/summary/paper`, and `/api/gaps` wait for Groq to finish generating 1,500 words before sending a JSON response. The user stares at a blank screen for 4–7 seconds before the frontend simulates typing.
* **Target Files:**
  - [`backend/app/main.py`](file:///backend/app/main.py)
  - [`backend/app/agents/writing.py`](file:///backend/app/agents/writing.py)
  - [`backend/app/services/llm_factory.py`](file:///backend/app/services/llm_factory.py)
  - [`frontend/src/components/ComparisonTable.tsx`](file:///frontend/src/components/ComparisonTable.tsx)
  - [`frontend/src/components/LiteratureDraft.tsx`](file:///frontend/src/components/LiteratureDraft.tsx)
* **How to Implement:**
  1. In `LLMFactory`, add an async generator `stream_groq(prompt, system_prompt)` that calls Groq with `stream=True` and yields text deltas as raw Server-Sent Events (`data: {"token": "..."}\n\n`).
  2. In `main.py`, convert `@app.post("/api/compare/prose")` and `@app.post("/api/summary/paper")` to return a `StreamingResponse(generator, media_type="text/event-stream")`.
  3. In the Next.js frontend, use `fetch()` with a `ReadableStream` reader (or `EventSource`) to append incoming tokens to state in real time.
* **Performance Target:** Time-To-First-Token (TTFT) drops from **5,000ms to < 250ms**.

#### 1.2 Persistent HTTP Connection Pooling for Groq
* **Problem Solved:** Currently, `llm_factory.py` opens a new `httpx.AsyncClient()` on every call, forcing a new TLS handshake every time.
* **Target File:** [`backend/app/services/llm_factory.py`](file:///backend/app/services/llm_factory.py)
* **How to Implement:**
  1. Define a shared module-level client:
     ```python
     _shared_client = httpx.AsyncClient(
         timeout=httpx.Timeout(60.0, connect=5.0),
         limits=httpx.Limits(max_keepalive_connections=20, max_connections=50)
     )
     ```
  2. Reuse `_shared_client` across all Groq and Ollama requests.
* **Performance Target:** Shaves **100–150ms** of network handshake latency off every prompt.

#### 1.3 Content-Hash Synthesis Caching
* **Problem Solved:** Re-running a comparison or opening a paper summary that was already generated consumes Groq tokens and forces a redundant 5-second wait.
* **Target Files:**
  - [`backend/app/services/db.py`](file:///backend/app/services/db.py)
  - [`backend/app/agents/writing.py`](file:///backend/app/agents/writing.py)
* **How to Implement:**
  1. Add a `CachedSynthesis` model in SQLite with fields: `cache_key` (SHA-256 of `sorted(paper_ids) + prompt_type + model`), `content`, `created_at`.
  2. Before calling Groq, compute `cache_key`. If present in SQLite, return cached text immediately.
* **Performance Target:** Instantaneous response (< 15ms) for repeated queries with zero token usage.

#### 1.4 Hierarchical Ingestion & Database Research Cards
* **Problem Solved:** Avoids sending 30,000+ characters of uncompressed paper text to Groq, which exhausts the 8,000 TPM limit.
* **Target Files:**
  - [`backend/app/models/paper.py`](file:///backend/app/models/paper.py)
  - [`backend/app/services/extractor.py`](file:///backend/app/services/extractor.py)
  - [`backend/app/services/ingestion.py`](file:///backend/app/services/ingestion.py)
* **How to Implement:**
  1. Expand `StructuredPaperExtraction` to store a 150-word `executive_summary`, `core_methodology`, `key_findings` (bullet points), and `stated_limitations`.
  2. Update `WritingAgent` to pull these cards when generating prose comparisons or literature reviews (~400 tokens per paper instead of 10,000 tokens).
* **Performance Target:** Multi-paper comparison prompt drops from **9,000 tokens to ~1,200 tokens**, 100% immune to Groq 429 crashes.

---

## 🎯 Phase 2: Retrieval Precision & Answer Quality Engine

**Goal:** Transform answer quality from generic summaries into rigorous, publication-grade academic analysis with zero hallucinations and exact citation grounding.

### 📋 Phase 2 Checklist (Completed & Verified)
- [x] **2.1 Hybrid Search (Dense Vectors + BM25 Lexical via Reciprocal Rank Fusion)**
- [x] **2.2 Cross-Encoder Re-Ranking (CrossEncoder ms-marco-MiniLM-L-6-v2)**
- [x] **2.3 Section-Aware Hierarchical AST Chunking**
- [x] **2.4 Citation Fact-Check & Metric Verification Loop**

---

### 🛠️ Phase 2 Implementation Details: What & How to Do

#### 2.1 Hybrid Search (Dense Vector + BM25 Lexical via RRF)
* **Problem Solved:** Dense vector embeddings alone miss exact technical acronyms (e.g., *"GSM8K"*, *"MMLU"*, *"LoRA rank 8"*, *"AdamW"*).
* **Target Files:**
  - [`backend/app/services/vector_store.py`](file:///backend/app/services/vector_store.py)
* **How to Implement:**
  1. Configure Qdrant's payload index for full-text search on `text` field:
     ```python
     client.create_payload_index(
         collection_name=settings.QDRANT_COLLECTION,
         field_name="text",
         field_schema=rest_models.TextIndexParams(
             type="text",
             tokenizer=rest_models.TokenizerType.WORD
         )
     )
     ```
  2. For incoming queries, execute both a vector similarity search and a text match query.
  3. Combine ranks using Reciprocal Rank Fusion (RRF):
     $$\text{Score}(d) = \sum_{m \in \{\text{vector}, \text{bm25}\}} \frac{1}{60 + \text{rank}_m(d)}$$
* **Performance Target:** 100% recall on technical acronyms + semantic breadth on conceptual queries.

#### 2.2 Cross-Encoder Re-Ranking
* **Problem Solved:** Bi-encoders (vector cosine similarity) evaluate queries and chunks independently, frequently retrieving superficial text that shares topic keywords but fails to answer the question.
* **Target Files:**
  - [`backend/app/services/vector_store.py`](file:///backend/app/services/vector_store.py)
  - [`backend/app/agents/reading.py`](file:///backend/app/agents/reading.py)
* **How to Implement:**
  1. Add `flashrank` (lightweight ONNX cross-encoder with zero PyTorch dependency, <15MB size):
     ```python
     from flashrank import Ranker, RerankRequest
     ranker = Ranker(model_name="ms-marco-MiniLM-L-12-v2", cache_dir="./models")
     ```
  2. In `ReadingAgent`, retrieve top 15 candidate chunks from vector search.
  3. Re-rank with FlashRank:
     ```python
     rerank_req = RerankRequest(query=query, passages=[{"id": c["chunk_id"], "text": c["text"]} for c in chunks])
     reranked = ranker.rerank(rerank_req)
     ```
  4. Pass only the top-4 highest-scoring chunks to Groq.
* **Performance Target:** Context signal-to-noise ratio jumps by **40%**; LLM hallucinations drop drastically.

#### 2.3 Section-Aware Hierarchical AST Chunking
* **Problem Solved:** Blind paragraph chunking confuses a baseline method described in *Related Work* with the paper's actual new contribution in *Methodology*.
* **Target Files:**
  - [`backend/app/services/pdf_parser.py`](file:///backend/app/services/pdf_parser.py)
  - [`backend/app/models/paper.py`](file:///backend/app/models/paper.py)
* **How to Implement:**
  1. In `pdf_parser.py`, maintain state tracking the current section header (`# Abstract`, `# Introduction`, `# Related Work`, `# Methodology`, `# Experiments`, `# Results`, `# Limitations`).
  2. Tag each `ParagraphChunk` with `section_type: "methodology" | "results" | "limitations" | "general"`.
  3. Store `section_type` in Qdrant payload filters.
  4. When the user asks *"What benchmark scores did this model achieve?"*, filter Qdrant retrieval strictly to `section_type in ["experiments", "results"]`.
* **Performance Target:** Eliminates cross-section topic bleed and misattributed claims.

#### 2.4 Citation Fact-Check & Metric Verification Loop
* **Problem Solved:** The LLM sometimes hallucinates exact percentages or benchmark scores that do not exist on the cited page.
* **Target Files:**
  - [`backend/app/agents/writing.py`](file:///backend/app/agents/writing.py)
* **How to Implement:**
  1. Extract regex numbers/percentages from the LLM's cited sentences.
  2. Check if the cited numbers exist in the source paragraph chunk.
  3. If a number is verified, display a green verified shield `✓ [Verified p.4]`. If unverified, display a subtle warning tag `[p.4 - unverified metric]`.
* **Performance Target:** NotebookLM-grade source citation integrity.

---

## 🚀 Phase 3: High-Throughput Ingestion & Resource Optimization

**Goal:** Accelerate paper uploads by 50%, eliminate heavy PyTorch dependencies, and introduce interactive table/figure understanding.

### 📋 Phase 3 Checklist
- [ ] **3.1 FastEmbed ONNX Engine Migration (Removing Heavy PyTorch)**
- [ ] **3.2 Asynchronous Concurrent Ingestion Pipeline**
- [ ] **3.3 Interactive Table Extraction to DataFrames**
- [ ] **3.4 Click-to-Ask Multimodal Figure & Diagram Inspector**

---

### 🛠️ Phase 3 Implementation Details: What & How to Do

#### 3.1 FastEmbed ONNX Engine Migration
* **Problem Solved:** `from sentence_transformers import SentenceTransformer` imports full PyTorch (~1.2 GB RAM, 3–4 second startup delay).
* **Target Files:**
  - [`backend/app/services/vector_store.py`](file:///backend/app/services/vector_store.py)
  - [`requirements.txt`](file:///requirements.txt)
* **How to Implement:**
  1. Replace `sentence-transformers` with `fastembed`:
     ```python
     from fastembed import TextEmbedding
     self.encoder = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
     ```
  2. `fastembed` uses optimized C++ ONNX runtime; embeddings generate in parallel batches without CUDA/PyTorch overhead.
* **Performance Target:** **4x faster vector generation**, 70% lower RAM footprint, instantaneous cold boot.

#### 3.2 Asynchronous Concurrent Ingestion Pipeline
* **Problem Solved:** Currently, PDF downloading, Docling text parsing, table extraction, Figure OCR, and Qdrant upserts run in a single blocking sequence.
* **Target Files:**
  - [`backend/app/services/ingestion.py`](file:///backend/app/services/ingestion.py)
* **How to Implement:**
  1. Restructure `IngestionPipeline.process_paper_async` using `asyncio.gather()`:
     ```python
     # Run embedding generation and structured JSON extraction in parallel
     await asyncio.gather(
         vector_store.upsert_paragraphs_async(paragraphs),
         PaperExtractor.extract_structured_data(...)
     )
     ```
* **Performance Target:** Paper processing time cut in half (from 18 seconds down to **8–9 seconds**).

#### 3.3 Interactive Table Extraction to DataFrames
* **Problem Solved:** Extracted tables are stored as raw markdown text strings, making it impossible to sort, filter, or compare metrics quantitatively across papers.
* **Target Files:**
  - [`backend/app/services/extractor.py`](file:///backend/app/services/extractor.py)
  - [`frontend/src/components/ComparisonTable.tsx`](file:///frontend/src/components/ComparisonTable.tsx)
* **How to Implement:**
  1. Parse Docling table markdown into structured JSON arrays of row objects:
     `{"model": "GPT-4", "gsm8k": 92.0, "humaneval": 84.1}`.
  2. In the frontend, render tables with sorting, column filtering, and one-click "Download as CSV".
* **Performance Target:** SciSpace / Elicit table parity.

#### 3.4 Click-to-Ask Multimodal Figure & Diagram Inspector
* **Problem Solved:** Figures are currently extracted and captioned by `qwen2.5-vl`, but users cannot click on a diagram to ask specific architectural questions.
* **Target Files:**
  - [`backend/app/services/vision.py`](file:///backend/app/services/vision.py)
  - [`frontend/src/components/PaperSummary.tsx`](file:///frontend/src/components/PaperSummary.tsx)
* **How to Implement:**
  1. Display extracted diagrams in the Paper Summary modal with an "Ask about Figure" button.
  2. Clicking opens a prompt routed to `qwen2.5-vl` (or Groq Vision) with the image and user question.
* **Performance Target:** Enables deep visual reasoning over neural network architectures, ablation charts, and loss curves.

---

## 🏆 Phase 4: Advanced Research Workflows & Platform Parity

**Goal:** Reach full competitive parity with Consensus.app, Elicit.org, and Connected Papers, creating an unmatched autonomous research environment.

### 📋 Phase 4 Checklist
- [ ] **4.1 Consensus Meter & Polarity Scorer (Consensus.app Parity)**
- [ ] **4.2 Dynamic Custom Extraction Columns (Elicit.org Parity)**
- [ ] **4.3 Interactive Citation Lineage & Co-Citation Graph (Connected Papers Parity)**
- [ ] **4.4 One-Click Academic LaTeX / Overleaf Survey Export**

---

### 🛠️ Phase 4 Implementation Details: What & How to Do

#### 4.1 Consensus Meter & Polarity Scorer
* **Feature Description:** For hypothesis queries (e.g. *"Does test-time compute scaling outperform pre-training scaling?"*), scan all library papers and classify each paper's finding into:
  - **Yes / Supports** (Green)
  - **No / Contradicts** (Red)
  - **Nuanced / Context-Dependent** (Amber)
* **How to Implement:**
  1. Create a specialized prompt asking the LLM to classify the answer per paper with confidence score (0.0 to 1.0) and quote the supporting sentence.
  2. Render a visual stacked consensus meter bar in the UI with percentage breakdowns.

#### 4.2 Dynamic Custom Extraction Columns
* **Feature Description:** Allow researchers to add custom questions to the Synthesis Studio comparison table (e.g. *"What learning rate was used?"*, *"What was the training hardware?"*, *"What is the context window size?"*).
* **How to Implement:**
  1. User adds a custom column in the frontend.
  2. Backend runs an asynchronous micro-extraction agent against the relevant paper chunks.
  3. Dynamically populates the cell in the table.

#### 4.3 Interactive Citation Lineage Graph
* **Feature Description:** Replace static chronological timelines with an interactive 2D force-directed citation network.
* **How to Implement:**
  1. Parse references from extracted PDF bibliographies.
  2. Construct an adjacency matrix of cross-citations between papers in the user's library.
  3. Render using React Flow or Vis.js, highlighting landmark foundational papers and methodological clusters.

#### 4.4 One-Click LaTeX / Overleaf Survey Export
* **Feature Description:** Academics write papers in LaTeX. Allow one-click export of literature reviews into a complete, compilable LaTeX `.zip` bundle.
* **How to Implement:**
  1. Generate `survey.tex` formatted with IEEE/ACM survey document classes.
  2. Include `references.bib` with valid BibTeX keys for all cited papers.
  3. Package as a downloadable `.zip` or generate a direct "Open in Overleaf" URL.

---

## 📊 Summary Implementation Matrix

| Phase | Core Objective | Key Deliverables | Expected Latency / Quality Gain |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Speed & Stability** | True SSE streaming, Groq HTTP pool, caching, DB research cards | TTFT drops to <250ms; 0 rate-limit crashes |
| **Phase 2** | **Answer Quality** | Hybrid search (RRF), Cross-Encoder re-ranking, AST chunking, citation verifier | 40% higher precision; 0 hallucinations |
| **Phase 3** | **Ingestion Throughput** | FastEmbed ONNX, async pipeline, interactive tables, figure QA | Ingestion 50% faster; 70% less RAM |
| **Phase 4** | **Platform Parity** | Consensus meter, custom columns, citation graph, LaTeX export | Matches Consensus, Elicit, Connected Papers |
