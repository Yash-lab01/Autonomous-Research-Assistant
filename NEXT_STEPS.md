# AI Research OS — Phase 2 Roadmap & Next Steps 🗺️⚡

Now that **Phase 1 (Core Autonomous Research Assistant)** is fully operational with dual LLM routing, hybrid PDF parsing, Qdrant vector RAG, and the Next.js dashboard, here is the detailed implementation roadmap for **Phase 2 (Intelligence & Automation Layer)**.

---

## 🎯 Phase 2 Milestone Objectives

### 1. Neo4j Knowledge Graph Integration (GraphRAG)
- **Goal**: Transition from flat vector similarity search to a true property graph model linking `Paper → Author → Concept → Dataset → Method → Citation`.
- **Target Queries**:
  - *"Which papers use Qwen2.5 as a backbone and evaluate on MMLU?"*
  - *"Find all papers that build upon GraphRAG and use LoRA for fine-tuning."*
- **Action Plan**:
  - Deploy Neo4j container in `docker-compose.yml` (`bolt://localhost:7687`).
  - Add Cypher query builder service (`backend/app/services/graph_db.py`).
  - Map extracted JSON nodes into Cypher graph relationships upon ingestion.

---

### 2. Research Gap Finder Agent
- **Goal**: Automatically scan extracted `limitations` and `future_work` fields across all ingested papers in your library to surface open research problems and potential thesis/project ideas.
- **Action Plan**:
  - Create `backend/app/agents/gap_finder.py`.
  - Build prompt templates that cross-reference limitations across competing methods.
  - Surface an interactive **"Research Gaps & Novel Ideas"** tab in the Next.js frontend.

---

### 3. Interactive Research Timeline Visualization
- **Goal**: Visual timeline showing the historical evolution of a research field (e.g., `Dense Retrieval (2022) → Hybrid RAG (2023) → GraphRAG (2024) → Agentic RAG (2025) → Memory RAG (2026)`).
- **Action Plan**:
  - Parse publication dates and citation dependency trees.
  - Integrate a timeline component using D3.js or React Flow on the frontend.

---

### 4. Figure & Architecture Diagram Understanding (Qwen2.5-VL)
- **Goal**: Use vision models to extract and explain architecture diagrams, flowcharts, tables, and benchmark plots directly from research paper PDFs.
- **Action Plan**:
  - Add image extraction step in `pdf_parser.py` using `pdfplumber` image bounds.
  - Route extracted figure images to `Qwen2.5-VL` or `Gemma-Vision` via Ollama/API.
  - Render figure thumbnails and explanations inside the Chat RAG UI.

---

### 5. Voice Research Mode
- **Goal**: Natural voice conversation with the agent (*"Explain this paper like I'm a beginner"* → Voice output).
- **Action Plan**:
  - Speech-to-Text: Integrate `Whisper.cpp` for local speech transcription.
  - Text-to-Speech: Integrate `Piper` or `Kokoro` TTS engine.
  - Add push-to-talk microphone button in Next.js `ChatInterface.tsx`.

---

### 6. n8n Weekly Automated Digest
- **Goal**: Background automation workflow running daily arXiv monitoring for selected topics → auto-download → extract → embed → send email/Notion digest.
- **Action Plan**:
  - Setup n8n workflow container in `docker-compose.yml`.
  - Expose webhook trigger endpoints in FastAPI (`/api/webhooks/arxiv-digest`).

---

### 7. Model Fine-Tuning (Unsloth + QLoRA)
- **Goal**: Fine-tune a 7B/8B local model specifically for structured information extraction from multi-column scientific PDFs to increase JSON extraction accuracy to >98%.
- **Action Plan**:
  - Build evaluation dataset from arXiv papers with verified ground-truth JSON extractions.
  - Train using `Unsloth` PEFT QLoRA script.
  - Compare before/after extraction benchmark accuracy.

---

## 📋 Recommended Immediate Next Tasks

1. **Test Initial Paper Ingestion**:
   - Start the FastAPI backend (`python run_backend.py`) and Next.js frontend (`cd frontend && npm run dev`).
   - Ingest 3-5 arXiv papers on a chosen subject (e.g., *"GraphRAG"* or *"Agentic AI"*).
2. **Review Graphify Analysis**:
   - Open `graphify-out/graph.html` in your browser to inspect the codebase structure.
3. **Deploy Docker Containers**:
   - Run `docker-compose up -d` to launch local Qdrant & Redis services.
