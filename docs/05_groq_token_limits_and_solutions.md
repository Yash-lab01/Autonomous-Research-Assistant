# 05. The Groq Token Limit Issue & 4 Strategic Solutions

## ⚠️ The Core Problem: Groq Free-Tier Rate Limits

Groq provides extraordinary inference speeds (300–500 tokens per second), making it the premier cloud inference engine for interactive chat and synthesis. However, its on-demand developer tier enforces strict rate limits:

| Metric | Free Developer Tier Ceiling |
| :--- | :--- |
| **Tokens Per Minute (TPM)** | **8,000 TPM** |
| **Requests Per Minute (RPM)** | **30 RPM** |
| **Tokens Per Day (TPD)** | **14,400 TPD** |

### Why Academic Papers Crash This Ceiling
A single standard academic conference paper is typically 8 to 15 pages:
- Abstract + Intro: ~1,500 words (~2,000 tokens)
- Methodology: ~2,500 words (~3,300 tokens)
- Experiments & Results: ~3,000 words (~4,000 tokens)
- Discussion, Related Work & References: ~3,000 words (~4,000 tokens)
- **Total for 1 paper:** ~13,000+ tokens.

When comparing **3 papers**, the combined text is **35,000–45,000 tokens**. 

In early versions of our synthesis agent, fetching just 10 paragraphs per paper yielded **36,601 characters (~9,000–10,000 tokens)**. When passed to Groq in a single prompt, Groq immediately failed with:
```
413 Request Entity Too Large / 429 Rate limit reached for model qwen/qwen3.8-27b in organization org_xxx on tokens per minute (TPM): Limit 8000, Used 9840, Requested 1200.
```

---

## 🩹 The Short-Term Mitigation (Already Implemented)

To restore immediate functionality, the following safety layers were deployed:

1. **Paragraph Truncation in [`backend/app/agents/writing.py`](file:///backend/app/agents/writing.py):**
   - Individual paragraphs are truncated to **750 characters max**.
   - Maximum retrieved chunks capped at **6 chunks** per paper.
   - Total prompt context payload is constrained to **~5,000 characters (~1,200 tokens)**.
2. **Global Prompt Safeguard in [`backend/app/services/llm_factory.py`](file:///backend/app/services/llm_factory.py):**
   - Hard-truncates any incoming prompt exceeding **12,000 characters (~3,000 tokens)** before sending to Groq.
   - If Groq returns a rate limit (429), automatically attempts secondary models (`openai/gpt-oss-120b`).

**Limitation of this short-term fix:** While this prevents API crashes, aggressively cutting raw text risks omitting nuanced experimental results, hyperparameters, or subtle limitations.

---

## 🚀 The 4 Architectural Solutions (Deep-Dive)

To preserve 100% of academic details without hitting Groq's 8,000 TPM ceiling, we have designed four strategic solutions:

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

---

### 💡 Solution 1: Section-Targeted Semantic RAG
**"Only send the exact paragraphs relevant to the synthesis goal."**

#### How it Works:
Instead of retrieving raw text linearly from the paper:
1. During ingestion, every chunk stored in the **Qdrant Vector Database** is tagged with section metadata (`section_type: "methodology"`, `section_type: "experiments"`, `section_type: "limitations"`).
2. When the user requests a **Comparative Matrix**, the backend queries Qdrant specifically for:
   - Query 1: *"dataset benchmarks accuracy evaluation results"* with filter `section_type: "experiments"`.
   - Query 2: *"model architecture training algorithm design"* with filter `section_type: "methodology"`.
3. Only the top 2 highest-scoring dense chunks (300 tokens each) per paper are included in the prompt.

#### Token Impact:
- 3 papers × 2 targeted chunks × 300 tokens = **~1,800 tokens**.
- Fits comfortably inside Groq's 8,000 TPM limit.

#### Pros & Cons:
- ✅ **Pros:** Zero information loss for the specific topic being analyzed; dynamic and highly relevant.
- ⚠️ **Cons:** Requires clean metadata tagging during the initial PDF parse.

---

### 💡 Solution 2: Hierarchical Ingestion & Database Pre-Summarization (The "Card" Pattern)
**"Pre-digest the paper once at upload time; never re-read the full PDF during synthesis."**

#### How it Works:
When a paper is first uploaded, an offline background ingestion worker processes the document and generates a set of **Structured Research Cards** stored directly in the SQLite `papers` table:

```json
{
  "executive_summary": "Presents Transformer architecture using self-attention...",
  "core_methodology": "Multi-head scaled dot-product attention without recurrence...",
  "key_findings": [
    "BLEU score of 28.4 on WMT 2014 English-to-German",
    "Trained in 3.5 days on 8 P100 GPUs",
    "Eliminates sequential recurrence bottlenecks"
  ],
  "stated_limitations": [
    "Quadratic memory complexity with sequence length",
    "Requires large training data to generalize well"
  ],
  "datasets_used": ["WMT 2014 English-to-German", "WMT 2014 English-to-French"]
}
```

When generating comparative analysis, literature reviews, or research gaps, the backend **does not query the PDF or raw paragraphs**. It retrieves only these pre-computed JSON cards.

#### Token Impact:
- Each card is ~400 tokens.
- 3 papers = **~1,200 tokens**.
- Leaves **6,800 tokens of headroom** for Groq to generate a rich, comprehensive comparative narrative!

#### Pros & Cons:
- ✅ **Pros:** Instantaneous UI responses; 100% immune to Groq rate limits; structured cards can be rendered directly into UI comparison grids.
- ⚠️ **Cons:** Initial upload takes ~10 seconds longer while generating the pre-digested card.

---

### 💡 Solution 3: Tool / Function Calling on Groq
**"Let the model pull specific facts on-demand instead of pushing everything into the prompt."**

#### How it Works:
Active models like `qwen/qwen3.8-27b` support native **OpenAI-compatible tool calling**. Instead of stuffing the prompt with paper data:
1. Provide the LLM with tool definitions:
   - `get_paper_metrics(paper_id, metric_name)`
   - `get_paper_methodology(paper_id)`
   - `search_paper_text(paper_id, search_query)`
2. The initial prompt is tiny: *"Compare the benchmark scores and limitations of Paper A and Paper B."*
3. The LLM issues a tool call: `get_paper_metrics(paper_id="paper_1", metric_name="accuracy")`.
4. The backend executes the Python function, returns only the exact score, and the LLM finishes the synthesis.

#### Token Impact:
- Base prompt is under **400 tokens**.
- Tool results are under **200 tokens**.
- Total consumption per request: **< 1,000 tokens**.

#### Pros & Cons:
- ✅ **Pros:** Highest factual precision; model only reads what it specifically needs.
- ⚠️ **Cons:** Requires multi-turn LLM reasoning loops (takes 2–3 seconds longer).

---

### 💡 Solution 4: Hybrid Local/Cloud Architecture
**"Local Ollama for unbounded bulk ingestion; Groq for ultra-fast user interaction."**

#### How it Works:
A two-tier compute pipeline that uses hardware where it shines best:

```
[ Upload PDF ] ──► [ Local Ollama (Unbounded Context) ] ──► [ SQLite & Qdrant ]
                     - No rate limits                       - Stores dense cards
                     - Reads full 50-page text              - Vector chunks
                     - Extracts figures & tables

[ User Clicks Compare ] ──► [ Groq Cloud API (Fast) ] ◄── [ Fetch SQLite Cards ]
                             - 400 tokens/sec
                             - Perfect rate-limit safety
                             - Real-time continuous streaming
```

1. **Local Tier (Ollama on user's machine):** Runs locally with **zero rate limits**. When a PDF is uploaded, a local model (e.g. `llama3.2` or `mistral` + `qwen2.5-vl` for figures) parses the entire document without worrying about token budgets. It extracts the structured data cards and writes them to SQLite.
2. **Cloud Tier (Groq API):** When the user interacts with the UI (clicks *Compare*, *Draft Review*, or chats), Groq reads the pre-computed SQLite cards and streams the synthesized prose back to the user at 400+ tokens per second.

#### Token Impact:
- Groq sees **zero bulk PDF text**. Groq only handles user queries and pre-digested summaries. Rate limits are never breached.

---

## 📊 Comparison Matrix of Solutions

| Dimension | Sol 1: Semantic RAG | Sol 2: Pre-Summaries (Cards) | Sol 3: Tool Calling | Sol 4: Hybrid Local/Cloud |
| :--- | :--- | :--- | :--- | :--- |
| **Token Savings** | 80% reduction | 90% reduction | 90% reduction | 95% reduction |
| **Information Retention** | Very High | High (structured) | Maximum | Maximum |
| **Implementation Effort** | Low | Low-Medium (Recommended) | Medium | Medium |
| **Response Latency** | Fast (1–2s) | Ultra-Fast (<1s) | Multi-turn (3–4s) | Ultra-Fast (<1s) |
| **Dependencies** | Qdrant | SQLite only | Groq Tools | Local Ollama + Groq |

> **Strategic Recommendation:** Implement **Solution 2 (Pre-Summaries)** as the immediate standard for the Synthesis Studio, supplemented by **Solution 1 (Semantic RAG)** for deep exploratory Chat.
