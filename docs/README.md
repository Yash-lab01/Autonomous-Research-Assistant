# AI Research OS — Project Documentation & Context Dossier

Welcome to the **AI Research OS** (Scholar Copilot) context dossier. This directory contains complete architectural, technical, operational, and historical context for both human developers and autonomous AI coding agents working on this codebase.

---

## 🧭 Document Directory & Reading Order

For any AI model or developer new to this repository, read the files in the following order:

| Document | Title | Purpose & Summary |
| :--- | :--- | :--- |
| **[01_project_overview.md](file:///docs/01_project_overview.md)** | **Project Overview & Philosophy** | Core mission, target audience, problem space, and the academic design philosophy (strict anti-SaaS rules from `guide.txt`). |
| **[02_architecture_and_tech_stack.md](file:///docs/02_architecture_and_tech_stack.md)** | **Architecture & Tech Stack** | Complete system diagrams, Next.js 15 frontend, FastAPI backend, LangGraph agents, Qdrant vector DB, SQLite models, and LLM providers. |
| **[03_features_and_current_status.md](file:///docs/03_features_and_current_status.md)** | **Features & Current Status** | What works right now: the 3 Unified Pillars, continuous token streaming (`StreamedMarkdown`), multi-paper synthesis, and Windows launcher scripts. |
| **[04_what_failed_and_anti_patterns.md](file:///docs/04_what_failed_and_anti_patterns.md)** | **Post-Mortems & What NOT To Do** | Detailed breakdown of past failures (Groq deprecations, 413/429 token crashes, offline Ollama crashes, batch reinstall loops, 8-tab clutter) and strict anti-patterns. |
| **[05_current_problems_and_solutions.md](file:///docs/05_current_problems_and_solutions.md)** | **Current Problems & Solutions (Issue Registry)** | Living registry of all active/historical issues: Groq 8k TPM limit & 4 strategic architectures, offline Ollama protocol error, simulated vs real SSE streaming, and technical acronym retrieval. |
| **[06_past_present_future.md](file:///docs/06_past_present_future.md)** | **Timeline & Project Roadmap** | Chronological record of Past (v1 prototype), Present (v2 unified 3 pillars), and Future (v3 planned features, Zotero sync, autonomous literature search). |
| **[07_backend_analysis_and_upgrades.md](file:///docs/07_backend_analysis_and_upgrades.md)** | **Backend Analysis, Upgrades & Benchmarks** | Deep audit comparing backend against Consensus, Elicit, SciSpace, and NotebookLM; technical upgrades to maximize answer quality, boost inference speed (TTFT), and add research superpowers. |
| **[phases.md](file:///docs/phases.md)** | **Execution Phases & Roadmap** | Actionable engineering checklists and technical implementation blueprints grouped into 4 distinct phases (Speed, Answer Quality, Ingestion Throughput, Platform Parity). |

---

## ⚡ Quick Start: Running the Project

The workspace includes standalone Windows automation scripts in the project root:

```powershell
# 1. Start both Backend (port 8000) and Frontend (port 3000) simultaneously in separate terminals:
.\start_all.bat

# Or run them individually:
.\start_backend.bat   # Activates .\venv, starts uvicorn on http://127.0.0.1:8000
.\start_frontend.bat  # Starts Next.js on http://localhost:3000
```

- **Backend API:** `http://localhost:8000` (FastAPI Swagger Docs: `http://localhost:8000/docs`)
- **Frontend App:** `http://localhost:3000` (Next.js 15 App Router)
- **Database:** `ai_research_os.db` (SQLite relational DB in root)
- **Vector DB:** Qdrant instance or embedded local storage (`backend/app/services/vector_store.py`)

---

## 🧠 Core System Invariants (Agent Primer)

When prompting, generating code, or planning features for this repository, keep these non-negotiable rules in mind:

1. **No SaaS Tropes:** No purple glowing gradient blobs, generic marketing buzzwords ("revolutionize your workflow"), or 8 disjointed tabs. Adhere to `guide.txt` — dense, high-contrast, clean academic ergonomics.
2. **Groq Rate-Limit Discipline:** Free-tier Groq enforces **8,000 Tokens Per Minute (TPM)**. Never blindly dump uncompressed 30,000-character paper paragraphs into prompts. Always truncate, compact, or summarize.
3. **Continuous Streaming:** Never flash large blocks of text at once. All LLM synthesis, reviews, and gap analysis must stream tokens progressively using [`StreamedMarkdown.tsx`](file:///frontend/src/components/StreamedMarkdown.tsx).
4. **Active Groq Models:** Use `qwen/qwen3.8-27b` (primary) and `openai/gpt-oss-120b` / `openai/gpt-oss-20b` (failover). `llama-3.3-70b-versatile` is **deprecated and must not be used**.
5. **No Reinstall Loops:** Startup scripts must never run `pip install` or `npm install` unconditionally on every start. They check if `venv` and `node_modules` exist first.
