# AI Research OS — Roadmap & Status 🗺️⚡

---

## ✅ Phase 1 — Core Foundation (COMPLETE)

> All foundational systems built and working.

| Feature | File(s) | Notes |
|---------|---------|-------|
| FastAPI backend server | `backend/app/main.py`, `run_backend.py` | Uvicorn with hot-reload, CORS configured |
| SQLite database + ORM | `services/db.py`, `models/db_models.py` | SQLAlchemy, auto-migration for new columns |
| Hybrid PDF Parser | `services/pdf_parser.py` | pdfplumber fast-path → Docling fallback on quality fail |
| Math + Table extraction | `services/pdf_parser.py` | `[MATH]` and `[TABLE]` chunk tagging |
| Async ingestion pipeline | `services/ingestion.py` | `queued → downloading → parsing → extracting → embedding → done/failed` |
| Structured JSON extraction | `services/extractor.py` | Extracts task/backbone/datasets/metrics/limitations/future_work per paper |
| Qdrant vector store + fallback | `services/vector_store.py` | `all-MiniLM-L6-v2` embeddings; in-memory fallback if Qdrant offline |
| Dual LLM router | `services/llm_factory.py` | Groq (`llama-3.3-70b`) for interactive; Ollama (`qwen2.5:7b`) for bulk; 429 auto-failover |
| arXiv search client | `services/arxiv_client.py` | Sync search in thread executor (prevents event loop blocking) |
| LangGraph agent pipeline | `agents/` | Planner → Search / Reading → Writing |
| Planner Agent | `agents/planner.py` | Classifies intent: `qa / compare / review / search` |
| Reading Agent (RAG) | `agents/reading.py` | Qdrant vector retrieval with page context |
| Writing Agent | `agents/writing.py` | QA response, comparison matrix, literature review |
| Search Agent | `agents/search.py` | arXiv discovery + metadata extraction |
| Graph Orchestrator | `agents/graph.py` | `run()` + `run_streaming()` for SSE |
| Next.js frontend | `frontend/src/app/page.tsx` | Full dashboard with all tabs |
| arXiv search UI | `page.tsx` | Sort toggle + result count selector (3/6/10/15) |
| Paper ingestion UI | `page.tsx`, `PaperCard.tsx` | Ingest button, status badges, polling |
| Comparison Matrix tab | `ComparisonMatrix.tsx` | Table view of task/models/datasets/metrics |
| Literature Review tab | `LiteratureDraft.tsx` | Markdown + KaTeX rendered output |
| Research Gap Finder | `ResearchGaps.tsx`, `agents/gap_finder.py` | Cross-paper limitations/future_work synthesis |
| Research Timeline | `ResearchTimeline.tsx` | Chronological field evolution view |
| Markdown + KaTeX renderer | `MarkdownRenderer.tsx` | Math, tables, code blocks |
| Citation export | `main.py` `/api/citations/export` | BibTeX, APA, IEEE, MLA |
| CSV export | `main.py` `/api/papers/export` | Comparison matrix as CSV |

---

## ✅ Phase 2 — Intelligence & QoL (COMPLETE)

| Feature | File(s) | Notes |
|---------|---------|-------|
| AI Figure Captioning (Vision) | `services/vision.py`, `config.py` | `qwen2.5vl:3b` via Ollama; fallback descriptions |
| Figure gallery in PaperCard | `PaperCard.tsx` | Lightbox, AI-captioned badge, page number |
| Batch Ingest All | `main.py`, `page.tsx`, `api.ts` | `POST /api/ingest/batch`; skips duplicates |
| Retry Failed Papers | `main.py`, `page.tsx`, `api.ts` | `POST /api/papers/{id}/retry`; resets to queued |
| Find Similar Papers | `main.py`, `PaperCard.tsx`, `api.ts` | `GET /api/papers/{id}/similar`; Qdrant semantic match |
| "Already in Library" badge | `page.tsx` | Green badge on search result cards |
| Library filter | `page.tsx` | Real-time title filter in library header |
| Notes & Tags editor | `PaperCard.tsx` | Inline textarea + tag chips; `PATCH /api/papers/{id}/notes` |
| Chat SSE Streaming | `main.py`, `ChatInterface.tsx`, `agents/graph.py` | `POST /api/chat/stream`; live step-log ticker |
| Chat history persistence | `ChatInterface.tsx` | localStorage, last 30 messages, Clear button |
| Voice Research Mode | `ChatInterface.tsx` | Browser SpeechRecognition + SpeechSynthesis |
| Chat Ctrl+Enter shortcut | `ChatInterface.tsx` | Submit without clicking button |
| Clear Chat button | `ChatInterface.tsx` | Clears state + localStorage |
| Toast notifications | `page.tsx` | Auto-dismiss 4s; success/error variants |
| Smart polling (perf fix) | `page.tsx` | useRef-based; only polls when papers are processing |
| Startup script | `start.ps1` | Validates .env, checks Ollama/Qdrant, starts both services |

---

## ✅ Phase 3 — Figure-First Intelligence & Richer Outputs (COMPLETE)

| Feature | File(s) | Notes |
|---------|---------|-------|
| P3.4 Figures in Literature Review | `LiteratureDraft.tsx` | Embed supporting figure diagrams + export to Markdown |
| P3.3 Figures + Prose Mode in Compare | `ComparisonTable.tsx`, `writing.py`, `main.py` | `POST /api/compare/prose`; Table vs Prose toggle + figure strip |
| P3.1 Figure-Aware RAG in Chat | `reading.py`, `state.py`, `db.py`, `ChatInterface.tsx` | Page-level figure matching on cited RAG pages + preview modal |
| P3.2 Deep Paper Summary Tab | `PaperSummary.tsx`, `writing.py`, `main.py`, `Navbar.tsx` | Single-paper deep technical breakdown + combined multi-paper summary |

---

## 🔧 Phase 3 — Figure-First Intelligence + Richer Outputs

> **Build order:** P3.4 → P3.3 → P3.1 → P3.2 (lowest → highest effort, each builds on previous)

---

### P3.4 — Figures in Literature Review *(Lowest effort — start here)*

**Goal:** The Literature Review draft currently outputs pure text. After generation, show a figure panel from cited papers as visual supporting evidence. Also allow figures to be embedded into the Markdown export.

**Exact changes needed:**

#### Backend
- No new endpoints needed — `GET /api/papers/{id}/figures` already exists

#### Frontend: `LiteratureDraft.tsx`
- After the literature review text renders, fetch figures for all papers used (`paper_ids` prop)
- Show a collapsible **"Supporting Figures"** panel below the review text
- Each figure: thumbnail (100px) + AI caption + paper title + page number
- Checkbox per figure: "Include in export"
- **Download as Markdown** button: embed selected figures as `![caption](url)` in the `.md` file

#### State additions needed in `LiteratureDraft.tsx`:
```typescript
const [allFigures, setAllFigures] = useState<{ paperId: string; figures: PaperFigure[] }[]>([]);
const [selectedFigureIds, setSelectedFigureIds] = useState<Set<string>>(new Set());
const [loadingFigures, setLoadingFigures] = useState(false);
```

---

### P3.3 — Figures + Prose Mode in Compare Papers *(Medium effort)*

**Goal:** Two changes to the Compare Papers tab:
1. **Table ↔ Prose toggle** — user can switch between the existing table and a new AI-written prose comparison
2. **Figure strip** — for each compared paper, show its most relevant figure (typically the architecture diagram, page 2–5)

**Exact changes needed:**

#### Backend: `main.py`
Add new endpoint:
```python
POST /api/compare/prose
Body: { paper_ids: List[str] }
Returns: { prose: str, figures_per_paper: { paper_id: str, figure_url: str, caption: str }[] }
```

#### Backend: `agents/writing.py`
Add `WritingAgent._generate_prose_comparison(state)`:
- Same data as table comparison but prompt instructs Groq to write **analytical narrative paragraphs** per dimension
- Sections: **Overview**, **Architectural Approaches**, **Training & Datasets**, **Results & Benchmarks**, **Limitations & Gaps**, **Conclusion**
- Each section is a full paragraph, not bullet points
- Cite papers by name inline: *"As demonstrated by Paper X (2024)..."*

System prompt addition:
```
Write a detailed multi-paper comparison as structured academic prose.
For each dimension (Architecture, Datasets, Results, Limitations), write 2-3 analytical paragraphs.
Do NOT use bullet points. Cite papers by title inline.
```

#### Frontend: `ComparisonMatrix.tsx`
- Add `viewMode: "table" | "prose"` state
- Toggle button: `📊 Table | 📝 Prose` in the header
- Prose mode renders: `<MarkdownRenderer content={proseComparison} />` + figure strip
- **Figure strip**: horizontal scroll row, one card per paper — fetch first figure from `/api/papers/{id}/figures?limit=1`
- Figure card: 150×100px image + paper title abbreviation + caption excerpt

---

### P3.1 — Figure-Aware RAG in Chat *(High impact, medium effort)*

**Goal:** When the Chat agent answers a question, it automatically detects which figures from cited papers are relevant and shows them inline in the response — thumbnail + caption, same lightbox as PaperCard.

**How relevance is determined:**
- After Qdrant retrieves paragraphs, check if any retrieved paragraph is on the same page as a known figure
- Figures on cited pages are considered "relevant" — no LLM call needed for relevance detection
- This is purely a page-number join: `retrieved_paragraph.page_number == figure.page_number`

**Key caption rule:** Reuse stored caption if it exists and is non-generic (length > 20 chars AND does not start with "Figure on page"). Otherwise call `qwen2.5vl:3b` to re-analyse.

**Exact changes needed:**

#### Database: `db_models.py`
Add `FigureORM` table (if not already stored):
```python
class FigureORM(Base):
    __tablename__ = "figures"
    id = Column(String, primary_key=True)
    paper_id = Column(String, ForeignKey("papers.id"))
    figure_id = Column(String)         # e.g. "fig_001"
    page_number = Column(Integer)
    url = Column(String)               # relative path: /static/figures/{paper_id}/...
    caption = Column(Text)
    ai_captioned = Column(Boolean, default=False)
```

#### Backend: `services/db.py`
- `DatabaseService.save_figures(db, paper_id, figures: List[dict])` 
- `DatabaseService.get_figures_by_pages(db, paper_id, page_numbers: List[int])` — key lookup for RAG

#### Backend: `services/ingestion.py`
- After vision captioning, save figure records to `FigureORM` via `DatabaseService.save_figures()`

#### Backend: `agents/state.py`
Add to `ResearchAgentState`:
```python
figures_cited: List[Dict[str, Any]] = []
# Each item: { figure_id, paper_id, url, caption, page_number, ai_captioned }
```

#### Backend: `agents/reading.py`
After retrieving paragraphs, add:
```python
# Collect unique (paper_id, page_number) pairs from results
cited_pages = [(r["paper_id"], r["page_number"]) for r in state.retrieved_paragraphs]
# Look up figures on those pages
figures = []
for paper_id, page_num in set(cited_pages):
    figs = DatabaseService.get_figures_by_pages(db, paper_id, [page_num])
    figures.extend(figs)
state.figures_cited = figures[:6]  # cap at 6 figures per response
```

#### Backend: `main.py` — `/api/chat/stream` done event
Add `figures_cited` to the final SSE payload:
```python
"figures_cited": state.figures_cited,
```

#### Frontend: `ChatInterface.tsx`
In the message type, add:
```typescript
figuresCited?: { figure_id: string; paper_id: string; url: string; caption: string; page_number: number }[];
```

After the markdown content of each assistant message, if `figuresCited.length > 0`:
```tsx
<div className="mt-3 flex flex-wrap gap-2">
  {msg.figuresCited.map(fig => (
    <button onClick={() => setActiveLightboxFig(fig)} className="...">
      <img src={`${API_BASE}${fig.url}`} className="w-24 h-16 object-cover rounded" />
      <p className="text-[10px] text-slate-400">{fig.caption.slice(0, 60)}...</p>
    </button>
  ))}
</div>
```
Use same lightbox modal already in `PaperCard.tsx` (extract to a shared `FigureLightbox.tsx` component).

---

### P3.2 — Deep Paper Summary Tab *(Highest effort — do last)*

**Goal:** New "Paper Summary" tab at position 3 in the features section (Literature Review moves to 4). Two generation modes:
1. **Per-paper deep summary** — rich single-paper analysis with figures embedded
2. **Combined summary** — multi-paper synthesis (broader than literature review, less academic-formal)

**Tab position change in `page.tsx`:**
```
Before: [Compare] [Lit Review] [Gaps] [Timeline]
After:  [Compare] [Summary] [Lit Review] [Gaps] [Timeline]
```

**Exact changes needed:**

#### Backend: `main.py`
```python
GET  /api/papers/{paper_id}/summary        # per-paper, streams SSE
POST /api/summary/combined                  # multi-paper, Body: { paper_ids, topic? }
```

Both endpoints use `StreamingResponse` (SSE), same pattern as `/api/chat/stream`.

#### Backend: `agents/writing.py`
**`_generate_paper_summary(state)` prompt structure:**
```
You are a research summarization expert. Write a deep technical summary of this paper.

PAPER DATA:
Title: {title}
Authors: {authors}
Abstract: {summary}
Structured Extraction: {structured_data JSON}
Key Paragraphs: {top 8 paragraphs from Qdrant}
Figures available: {list of figure captions}

OUTPUT FORMAT (use these exact headers):
## {title}
**Authors:** ... | **Published:** ... | **arXiv:** ...

### 🎯 Core Contribution
[2-3 sentences: what problem, what solution, what's novel]

### 🏗️ Methodology
[Technical description of approach, architecture, training procedure]
[Reference figures by caption where relevant: "As shown in [Fig: Architecture Diagram]..."]

### 📊 Results & Benchmarks
[Key numbers, datasets, comparison to baselines]

### ⚠️ Limitations & Future Work
[Honest assessment of what doesn't work or isn't addressed]

### 💡 Key Takeaways for Researchers
[3-5 bullet points: what to remember, what to cite this for]
```

**`_generate_combined_summary(state)` prompt structure:**
```
Write a combined research summary synthesizing {N} papers on: {topic}

## Combined Summary: {topic}

### 🌐 Overview
### 🔬 Approaches Compared  
### 📈 Key Results Across Papers
### 🔗 Relationships & Trends
### ❓ Open Problems
```

#### Frontend: `PaperSummary.tsx` (new component)
- Paper multi-select (same style as chat scope selector)
- Two buttons: "📄 Summarise Selected Paper" (single) / "📋 Generate Combined Summary" (2+ papers)
- SSE stream → live step ticker → renders result in `<MarkdownRenderer />`
- Below the summary text: figure grid from the summarised paper(s), fetched via `/api/papers/{id}/figures`
- "⬇️ Download as Markdown" button (includes figures as image links)

**Caption/vision rule for Summary:**
- Use stored caption if non-generic (>20 chars, not "Figure on page X")
- If missing or generic → call `qwen2.5vl:3b` to re-analyse before including in summary

---

## Phase 4 — Deep Knowledge Layer (Future)

### Neo4j GraphRAG *(High effort)*
- Property graph: `Paper → Author → Concept → Dataset → Method → Citation`
- Multi-hop Cypher queries from Chat: *"Papers using Qwen2.5 AND evaluating on MMLU"*
- Steps: Deploy `neo4j` in docker-compose → `graph_db.py` Cypher builder → `graph_rag.py` agent → surface results alongside Qdrant citations in Chat

### n8n Automated Research Digest *(Medium effort)*
- Daily arXiv monitoring → auto-ingest → email/Notion digest
- Add `n8n` to docker-compose → `POST /api/webhooks/arxiv-digest` → n8n Cron workflow

### Model Fine-Tuning (Unsloth + QLoRA) *(High effort — needs 200+ papers)*
- Fine-tune `Qwen2.5:7b` specifically for structured JSON extraction from scientific PDFs
- Only worth doing with 200+ verified ground-truth extractions as training data

---

## 🔧 Quick Start

```powershell
# Option 1: Single script (recommended)
.\start.ps1

# Option 2: Manual
python run_backend.py         # Terminal 1 — http://localhost:8000
cd frontend && npm run dev    # Terminal 2 — http://localhost:3000
```

```bash
# Pull required Ollama models
ollama pull qwen2.5:7b        # Text extraction + RAG fallback
ollama pull qwen2.5vl:3b      # Figure captioning (vision)
```

```bash
# Optional: persistent Qdrant (prevents embedding loss on restart)
docker run -p 6333:6333 qdrant/qdrant
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| Qdrant UI | http://localhost:6333/dashboard |
