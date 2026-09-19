# 03. Features & Current Status

## 🚀 Current Implementation Status

As of the latest release, AI Research OS is fully operational and structured around **3 Unified Pillars** with **continuous token streaming** across all synthesis and conversational touchpoints.

---

## 🏛️ The 3 Unified Pillars

### 1. Pillar 1: Paper Hub (`#papers`)
The foundation of the research workspace. Manages paper ingestion, parsing, and exploration.

- **PDF Drag-and-Drop Ingestion:** Direct file upload accepting single or multi-page academic PDFs. Automatically invokes Docling/pdfplumber, extracts metadata (title, authors, year, abstract), chunks text into vector embeddings, and stores entries in SQLite.
- **ArXiv Direct Query & Ingestion:** Built-in ArXiv client allows querying preprints by keywords, author, or paper ID, previewing abstracts, and importing them into the library with a single click.
- **Paper Library Grid:** High-density paper cards displaying titles, publication venues, years, primary methodologies, and quick-action toolbars.
- **Deep Paper Summary Modal:** Opens an in-depth inspection view presenting:
  - Quick summary & key contributions.
  - Detailed methodology breakdown.
  - Experimental findings & performance benchmarks.
  - Limitations and self-reported caveats.
  - Rendered with progressive token-by-token streaming.

---

### 2. Pillar 2: Synthesis Studio (`#studio`)
The core intellectual workspace. Replaces disconnected tabs with a unified multi-tool studio.

#### A. Multi-Paper Comparative Matrix
Enables side-by-side analysis across 2 to 5 selected papers.
- **Prose Mode:** Generates a cohesive comparative synthesis narrative highlighting architectural differences, computational trade-offs, and empirical findings. Rendered via continuous streaming markdown.
- **Table Mode:** Builds a structured comparative matrix comparing papers across Dimensions (Problem Statement, Novelty, Methodology, Benchmarks/Datasets, Baseline Comparisons, Stated Limitations).
- **Export Capabilities:** Supports exporting synthesis drafts directly to Markdown and CSV.

#### B. Literature Review Generator
Automates the drafting of comprehensive literature reviews:
- Groups selected papers into thematic sub-clusters.
- Generates structured academic sections: *Introduction*, *Thematic Analysis*, *Methodological Contrasts*, *Critical Evaluation*, and *Synthesized Conclusion*.
- Cites papers with clickable inline cross-references.
- Progressively streams output to prevent UI freeze.

#### C. Research Gap Finder
Scans selected papers to uncover high-impact future research opportunities:
- **Contradiction Detection:** Flags where two papers report conflicting experimental findings or opposing conclusions.
- **Unresolved Limitations:** Aggregates self-reported limitations and unaddressed edge cases.
- **Cross-Domain Opportunities:** Proposes novel combinations of techniques from different papers that have not yet been evaluated together.

#### D. Research Timeline & Evolution Graph
- Interactive chronological visualization tracking the historical evolution of techniques across the uploaded paper collection.
- Highlights citation dependencies and seminal breakthrough papers.

---

### 3. Pillar 3: Agent Copilot (`#copilot`)
A conversational research companion designed specifically for academic inquiry.

- **Multi-Paper Context Awareness:** Understands all papers currently selected or in the library.
- **Source Grounding:** Every claim is backed by citations referencing specific sections or papers in the library.
- **Continuous Generation:** Chat responses stream progressively with a subtle blinking cursor, giving real-time feedback as the model reasons.

---

## 🌊 Progressive Continuous Streaming Engine

In previous versions, LLM outputs would freeze the interface for 10–15 seconds and then dump hundreds of words in a single instant. 

This was completely redesigned using [`StreamedMarkdown.tsx`](file:///frontend/src/components/StreamedMarkdown.tsx):
- **Smooth Progressive Cadence:** Tokens are rendered as they arrive, maintaining a natural reading pace.
- **Visual Typing Indicator:** Displays an active pulsating cursor (`animate-pulse`) while generation is in progress.
- **Rich Formatting Preservation:** Handles Markdown headings, bold text, bullet lists, code blocks, and academic tables without breaking mid-stream.
- **Zero UI Freezing:** Built on non-blocking asynchronous state updates.

---

## ⚡ Windows Automation System

To eliminate manual terminal setup, the workspace provides three robust batch files:

| Script | Function |
| :--- | :--- |
| [`start_all.bat`](file:///start_all.bat) | Master launcher. Opens two independent command prompt windows running backend and frontend simultaneously. |
| [`start_backend.bat`](file:///start_backend.bat) | Validates Python installation, checks virtual environment (`.\venv`), activates it cleanly, verifies dependencies without reinstalling, and starts FastAPI on port 8000. |
| [`start_frontend.bat`](file:///start_frontend.bat) | Validates Node.js, ensures `node_modules` is present without reinstalling, and boots Next.js dev server on port 3000. |
