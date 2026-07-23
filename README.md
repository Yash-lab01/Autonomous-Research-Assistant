# AI Research OS 🧠🚀

**AI Research OS** is an autonomous local-first & cloud-boosted AI research assistant system that continuously discovers, ingests, understands, compares, and synthesizes research papers across subjects with full paragraph-level citation traceability.

---

## 🌟 Key Features (Phase 1)

- **🔍 arXiv Automatic Discovery**: Search arXiv by keyword or topic with automatic rate-limit etiquette and duplicate checking.
- **📄 Two-Stage Hybrid PDF Parser**: Fast-path text parsing (<1s) using `pdfplumber` with automated quality heuristic checks routing to `Docling` for layout-aware table extraction.
- **⚡ Dual LLM Workload Router (`llm_factory.py`)**:
  - **Bulk Background Extraction**: Uses local **Ollama** (`qwen2.5:7b`) to save cloud API limits during bulk paper processing.
  - **Interactive RAG & Review**: Uses **Groq API** (`llama-3.3-70b-versatile`) for ultra-fast response times.
  - **429 Failover**: Catches API rate limits or network timeouts and gracefully fails over to local Ollama.
- **⚡ Non-Blocking Async Ingestion**: Real-time paper ingestion status (`queued` → `downloading` → `parsing` → `extracting` → `embedding` → `done` / `failed`).
- **📌 Verified Citation RAG**: Search and chat across indexed papers with clickable inline citation badges `[1]` that pop up the exact source paragraph snippet.
- **📊 Multi-Paper Comparison Matrix**: Side-by-side taxonomy of tasks, backbone models, datasets, accuracy metrics, and limitations.
- **📝 Literature Review Survey Generator**: Synthesizes Introduction, Background, Existing Methods, Gaps, and Future Directions with BibTeX reference exports.

---

## 🏗️ Tech Stack

- **Frontend**: Next.js 16 (App Router, React 19, TypeScript, Tailwind CSS, Glassmorphic Dark Theme)
- **Backend API**: FastAPI (Python 3.11+)
- **Agent Orchestrator**: LangGraph (Planner, Search, Reading, and Writing Agents)
- **Vector Database**: Qdrant (with in-memory vector fallback)
- **Database & Cache**: SQLite (SQLAlchemy / SQLModel) + Redis
- **LLM Models**: Groq (`llama-3.3-70b-versatile`) + Local Ollama (`qwen2.5:7b`)

---

## 🚀 Quick Start Guide

### Prerequisites
- Python 3.10+
- Node.js 18+ & npm
- (Optional) [Ollama](https://ollama.com/) running `qwen2.5:7b` locally
- (Optional) [Groq API Key](https://console.groq.com/) set in `.env`

### 1. Environment Setup
Clone or navigate to the repository folder:
```powershell
cd "AI- Research Agent"
```

Copy `.env.example` to `.env`:
```powershell
cp .env.example .env
```
*(Optionally add your `GROQ_API_KEY` in `.env`)*

### 2. Backend Setup
Create and activate Python virtual environment:
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Run the backend FastAPI server:
```powershell
python run_backend.py
```
*FastAPI documentation will be available at [http://localhost:8000/docs](http://localhost:8000/docs).*

### 3. Frontend Setup
In a new terminal window:
```powershell
cd frontend
npm install
npm run dev
```
*Open [http://localhost:3000](http://localhost:3000) in your browser.*

---

## 📁 Repository Directory Structure

```
AI-Research-Agent/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI entry point & API endpoints
│   │   ├── config.py                # App & model configurations
│   │   ├── agents/                  # LangGraph Agent orchestrations
│   │   │   ├── planner.py           # Intent Classification Agent
│   │   │   ├── search.py            # arXiv Discovery Agent
│   │   │   ├── reading.py           # Paragraph Vector RAG Agent
│   │   │   ├── writing.py           # Synthesis, Comparison & Citation Agent
│   │   │   └── graph.py             # Workflow graph orchestrator
│   │   ├── services/
│   │   │   ├── llm_factory.py       # Dual LLM router (Ollama + Groq 70B failover)
│   │   │   ├── arxiv_client.py      # arXiv API downloader & rate limiter
│   │   │   ├── pdf_parser.py        # Hybrid parser (pdfplumber + Docling)
│   │   │   ├── extractor.py         # Structured JSON extractor
│   │   │   ├── vector_store.py      # Qdrant RAG client wrapper
│   │   │   ├── ingestion.py        # Non-blocking async ingestion pipeline
│   │   │   └── db.py                # SQLite ORM & persistence layer
│   │   └── models/
│   │       ├── paper.py             # Pydantic schemas
│   │       └── db_models.py         # SQLAlchemy ORM models
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/                     # Next.js App Router pages
│   │   ├── components/              # UI Components (ChatInterface, ComparisonTable, etc.)
│   │   └── lib/                     # API client
├── docker-compose.yml               # Qdrant & Redis containers
├── run_backend.py                   # Backend starter script
├── NEXT_STEPS.md                    # Roadmap & future implementation plan
├── README.md                        # Project documentation
└── .gitignore
```

---

## 🛡️ License

MIT License. Designed and built as an autonomous AI research system.
