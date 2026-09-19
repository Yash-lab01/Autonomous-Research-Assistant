# 05. Current Problems, Root Causes & Strategic Solutions

This document serves as the **Living Issue Registry** for AI Research OS. Any architectural, infrastructure, or algorithmic problem encountered during development or production is logged here with its symptoms, root cause, short-term mitigations, and strategic long-term solutions.

---

## 📋 Problem Registry Index

| ID | Issue Title | Severity | Status | Primary Impact |
| :--- | :--- | :--- | :--- | :--- |
| **PROB-01** | **Groq Cloud Token Rate Limit (8k TPM Overflow)** | 🔴 Critical | 🟡 Mitigated (Long-term in progress) | Synthesis & Compare crashes with 413/429 |
| **PROB-02** | **Offline Local Ollama Protocol Error Cascade** | 🟠 High | 🟢 Resolved | Backend 500 error when local Ollama is offline |
| **PROB-03** | **Simulated vs Real SSE Streaming on Synthesis Endpoints** | 🟡 Medium | 🟡 In Progress | Initial TTFT latency on large literature reviews |
| **PROB-04** | **Pure Vector Keyword Blindness on Technical Acronyms** | 🟡 Medium | ⚪ Planned | Retrieval miss on exact dataset names & benchmarks |

---

## 🔴 PROB-01: Groq Cloud Token Rate Limits & Context Overflows

### 1. Problem Description & Symptoms
When generating comparative analyses, multi-paper summaries, or literature reviews across 3+ academic papers, the application crashed with one of the following HTTP errors from Groq:
```
413 Request Entity Too Large
429 Rate limit reached for model qwen/qwen3.8-27b on tokens per minute (TPM): Limit 8000, Used 9840, Requested 1200.
```

### 2. Root Cause Analysis
- **Groq Free Developer Tier Constraints:**
  - **8,000 Tokens Per Minute (TPM)**
  - **30 Requests Per Minute (RPM)**
  - **14,400 Tokens Per Day (TPD)**
- **Academic Paper Reality:**
  - 1 standard academic paper = 8,000 to 15,000 tokens.
  - Comparing 3 papers = 30,000 to 45,000 tokens.
  - In earlier versions of `writing.py`, fetching 10 uncompressed paragraphs per paper sent **36,601 characters (~9,000–10,000 tokens)** into a single prompt. This single request exceeded the entire minute's quota, triggering immediate rate-limit rejections.

### 3. Immediate Mitigations (Applied in Codebase)
1. **Paragraph Truncation in [`backend/app/agents/writing.py`](file:///backend/app/agents/writing.py):**
   - Individual paragraphs are truncated to **750 characters max**.
   - Maximum retrieved chunks capped at **6 chunks** per paper.
   - Total prompt context payload constrained to **~5,000 characters (~1,200 tokens)**.
2. **Global Prompt Safeguard in [`backend/app/services/llm_factory.py`](file:///backend/app/services/llm_factory.py):**
   - Truncates incoming prompts exceeding **12,000 characters (~3,000 tokens)** before dispatch.
   - Auto-fails over to secondary models (`openai/gpt-oss-120b`).

### 4. The 4 Strategic Long-Term Solutions (Deep-Dive)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       THE 4 STRATEGIC ARCHITECTURES                     │
├──────────────────────────┬──────────────────────────────────────────────┤
│ Solution 1: Semantic RAG │ Query Qdrant for targeted section chunks     │
├──────────────────────────┼──────────────────────────────────────────────┤
│ Solution 2: DB Cards     │ Pre-summarize structured cards in SQLite     │
├──────────────────────────┼──────────────────────────────────────────────┤
│ Solution 3: Tool Calling │ Let Groq pull snippets on-demand via tools   │
├──────────────────────────┼──────────────────────────────────────────────┤
│ Solution 4: Local/Cloud  │ Local Ollama ingests; Groq synthesizes       │
└──────────────────────────┴──────────────────────────────────────────────┘
```

#### 💡 Solution 1: Section-Targeted Semantic RAG
- **Concept:** Never dump full papers. Tag each chunk in Qdrant with section taxonomy (`section: "methodology"`, `section: "results"`, `section: "limitations"`).
- **Execution:** When comparing papers on benchmarks, query Qdrant specifically with filter `section: "results"`.
- **Token Impact:** Drops prompt from 30,000+ to **~1,800 tokens**. Zero rate-limit breaches.

#### 💡 Solution 2: Hierarchical Ingestion & Database Pre-Summarization (The "Card" Pattern)
- **Concept:** Pre-digest each paper into a structured JSON card stored in SQLite upon upload:
  - `executive_summary` (~150 words)
  - `core_methodology` (~200 words)
  - `benchmark_metrics` (key-value dictionary)
  - `limitations` (3-4 bullet points)
- **Execution:** Synthesis Studio reads only these pre-digested cards (~400 tokens per paper).
- **Token Impact:** 3 papers = **~1,200 tokens**. Leaves **6,800 tokens of headroom** for rich generation.

#### 💡 Solution 3: Tool / Function Calling on Groq
- **Concept:** Equip `qwen/qwen3.8-27b` with native Python tool calling (`get_paper_metrics`, `search_paper_text`).
- **Execution:** The prompt is minimal. The model queries specific numbers or parameters on demand.
- **Token Impact:** Base prompt is under **400 tokens**. Highest factual precision.

#### 💡 Solution 4: Hybrid Local/Cloud Architecture
- **Concept:** Local Ollama (running locally with zero rate limits) parses complete 50-page PDFs, extracts tables, and creates database cards.
- **Execution:** Groq Cloud API (400 tokens/sec) only handles interactive user queries and synthesis over pre-digested cards.
- **Token Impact:** Groq sees zero bulk PDF text; rate limits are never breached.

---

## 🟠 PROB-02: Offline Local Ollama Protocol Error Cascade

### 1. Problem Description & Symptoms
When Groq hit a 429 rate limit, `llm_factory.py` automatically attempted fallback to local Ollama (`http://localhost:11434`). When Ollama was offline, the request crashed with:
```
httpx.RemoteProtocolError: Server disconnected without sending a response.
HTTP 500 Internal Server Error
```

### 2. Root Cause
`LLMFactory.invoke_llm` assumed Ollama was always listening on localhost and lacked connection timeouts or a pre-flight reachability guard.

### 3. Resolution Applied
- Implemented multi-tier fallback: Try primary Groq model (`qwen/qwen3.8-27b`) -> Try secondary Groq model (`openai/gpt-oss-120b`) -> Check Ollama with strict 3-second timeout -> Return clear user-actionable error message if both are unavailable.

---

## 🟡 PROB-03: Simulated vs Real SSE Streaming on Synthesis Endpoints

### 1. Problem Description & Symptoms
While [`/api/chat/stream`](file:///backend/app/main.py#L448) uses true Server-Sent Events (SSE), the synthesis endpoints ([`/api/compare/prose`](file:///backend/app/main.py#L298), [`/api/summary/paper`](file:///backend/app/main.py#L314), and [`/api/gaps`](file:///backend/app/main.py#L25)) await the entire LLM response on the backend before returning JSON. The frontend then uses [`StreamedMarkdown.tsx`](file:///frontend/src/components/StreamedMarkdown.tsx) to simulate streaming.

### 2. Impact
For long literature reviews (1,500 words), the user experiences a 4–7 second initial delay before text starts appearing, even though Groq could stream tokens within 250 milliseconds.

### 3. Solution (Planned in Next Sprint)
Migrate `/api/compare/prose`, `/api/summary/paper`, and `/api/gaps` to FastAPI `StreamingResponse` using SSE (`text/event-stream`), piping Groq's raw token chunks directly to the frontend.

---

## 🟡 PROB-04: Pure Vector Keyword Blindness on Technical Acronyms

### 1. Problem Description & Symptoms
Dense vector embeddings (`all-MiniLM-L6-v2`) capture general semantic meaning well, but can miss exact matches on specialized scientific acronyms (e.g. "MMLU", "GSM8K", "LoRA-FA", "Direct Preference Optimization / DPO") when searching paragraphs.

### 2. Root Cause
Dense vector search projects tokens into continuous semantic space where exact alphanumeric acronyms can have lower cosine similarity than broad descriptive text.

### 3. Solution (Planned in Next Sprint)
Implement **Hybrid Search (Dense Cosine Vectors + BM25 Lexical Keyword Search)** using Qdrant's native payload text index or Reciprocal Rank Fusion (RRF).
