import json
import logging
from typing import List, Dict, Any, Optional, AsyncGenerator
from sqlalchemy.orm import Session
from app.agents.state import ResearchAgentState
from app.services.llm_factory import LLMFactory
from app.services.db import DatabaseService, SessionLocal

logger = logging.getLogger("ai_research_os.writing_agent")

WRITING_SYSTEM_PROMPT = """You are the Lead Scientific Writing & Citation Agent for AI Research OS.
Your goal is to answer the user's research question accurately based on the provided paragraph chunks.

CRITICAL REQUIREMENT - CITATION TRACEABILITY:
Every claim, metric, or technical statement MUST be explicitly cited using inline citations formatted as:
`[Paper Title, p. PAGE_NUMBER]` or `[Citation 1]`.

At the end of your response, include a "References & Verified Source Paragraphs" section listing each citation with its exact paragraph text snippet.
"""

PROSE_COMPARE_SYSTEM_PROMPT = """You are a senior AI research scientist writing a structured comparative analysis.

Your task is to compare multiple research papers using a POINT-BASED format. Every section must use bullet points — NO paragraphs.

STRICT FORMATTING RULES:
- Use these exact section headers:
  ## 1. Comparative Overview
  ## 2. Architectural Approaches & Backbones
  ## 3. Training Datasets & Evaluation Benchmarks
  ## 4. Empirical Performance & Trade-offs
  ## 5. Limitations & Open Research Gaps
  ## 6. Synthesis & Conclusions

- Under each section, for EVERY paper, write a bold sub-header with the short paper title followed by 3–5 bullet points.
  Format: **[Short Paper Title]**
  - bullet point 1
  - bullet point 2

- After all per-paper bullets in each section, add a **Key Contrast:** sub-section with 2–3 bullets directly comparing the papers.

- Use ✅ and ❌ in Section 4 (Empirical Performance) to mark strengths and weaknesses.

- In Section 5 (Limitations), end with a **Shared Gaps:** bullet list for gaps common to all papers.

- In Section 6 (Synthesis), end with **Takeaways:** bullet list.

- DO NOT write any paragraph prose. Every piece of text must be a bullet point or a bold header.
- Keep each bullet point concise (one idea per bullet, max 20 words).
- Cite papers by their short title in bold, not as inline prose references.
"""

REVIEW_SYSTEM_PROMPT = """You are an expert academic researcher and scientific writer.
Your task is to write a thorough, well-structured literature review draft in proper academic prose.

STRICT FORMATTING RULES:
- Use markdown section headers: ## 1. Introduction, ## 2. Background, ## 3. Existing Methods & Key Contributions, ## 4. Limitations & Research Gaps, ## 5. Future Directions, ## References
- Each section must contain at least 3–4 full paragraphs of dense, informative prose.
- Do NOT use bullet points or asterisk (*) lists anywhere in the main sections. Write in complete sentences and paragraphs only.
- Cite specific papers by name inline (e.g., "As demonstrated by GraphRAG under Fire,...").
- The total output should be comprehensive and resemble a real academic survey paper section.
- Under ## References, list each paper on its own line in this format: [1] Authors. "Title." arXiv preprint, Year.
- Use neutral, precise academic language. Avoid vague filler phrases.
"""


class WritingAgent:

    @staticmethod
    async def execute(state: ResearchAgentState) -> ResearchAgentState:
        intent = state.intent

        if intent == "compare":
            return await WritingAgent._generate_comparison(state)
        elif intent == "review":
            return await WritingAgent._generate_literature_review(state)
        else:
            return await WritingAgent._generate_qa_response(state)

    @staticmethod
    async def _generate_qa_response(state: ResearchAgentState) -> ResearchAgentState:
        query = state.user_query
        chunks = state.retrieved_paragraphs

        if not chunks:
            prompt = f"User Question: {query}\n\nAnswer concisely based on general AI/ML knowledge, noting that no papers are currently loaded in the active collection."
            response = await LLMFactory.invoke_llm(prompt=prompt, workload_type="interactive")
            state.final_response = response
            return state

        context_blocks = []
        citations_list = []

        for idx, c in enumerate(chunks, start=1):
            tag = f"[Citation {idx}: Paper {c['paper_id']}, p.{c['page_number']}]"
            snippet = (c.get('text') or "")[:750].strip()
            context_blocks.append(f"{tag}\n\"{snippet}\"")
            citations_list.append({
                "citation_id": idx,
                "paper_id": c["paper_id"],
                "page_number": c["page_number"],
                "paragraph_id": c["paragraph_id"],
                "text": c["text"]
            })

        formatted_context = "\n\n".join(context_blocks)
        prompt = f"User Question: {query}\n\nRELEVANT SOURCE PARAGRAPHS:\n{formatted_context}\n\nAnswer the question thoroughly with inline citations:"

        response = await LLMFactory.invoke_llm(
            prompt=prompt,
            system_prompt=WRITING_SYSTEM_PROMPT,
            workload_type="interactive",
            temperature=0.2
        )

        state.final_response = response
        state.citations = citations_list
        state.step_logs.append(f"[Writing Agent] Synthesized response with {len(citations_list)} inline citations.")
        return state

    @staticmethod
    async def _generate_comparison(state: ResearchAgentState) -> ResearchAgentState:
        state.step_logs.append("[Writing Agent] Generating multi-paper comparison matrix...")
        db: Session = SessionLocal()
        papers = DatabaseService.list_papers(db)

        items = []
        for p in papers[:5]:
            if p.structured_data:
                sd = p.structured_data
                items.append({
                    "paper_id": p.id,
                    "title": p.title,
                    "primary_task": sd.get("primary_task", "General"),
                    "backbone_model": ", ".join(sd.get("backbone_models", [])) or "N/A",
                    "datasets": sd.get("datasets_used", []),
                    "key_metrics": sd.get("benchmark_metrics", {}),
                    "limitations": sd.get("limitations", [])
                })

        db.close()
        state.comparison_data = {
            "topic": state.user_query,
            "papers": items,
            "synthesis_summary": f"Comparison matrix compiled across {len(items)} ingested papers."
        }
        state.final_response = f"I have compiled a multi-paper comparison table across {len(items)} papers."
        return state

    # -------------------------------------------------------------
    # PROSE COMPARISON (STREAMING & BATCH WITH RESEARCH CARDS)
    # -------------------------------------------------------------

    @staticmethod
    def _build_prose_compare_prompt(papers: list) -> str:
        paper_entries = []
        for p in papers:
            sd = p.structured_data or {}
            exec_summary = sd.get("executive_summary") or p.summary or "N/A"
            findings = sd.get("key_findings") or []
            entry = (
                f"Title: {p.title}\n"
                f"Primary Task: {sd.get('primary_task', 'N/A')}\n"
                f"Executive Summary: {exec_summary[:300]}\n"
                f"Backbone Models: {', '.join(sd.get('backbone_models', []))}\n"
                f"Datasets Used: {', '.join(sd.get('datasets_used', []))}\n"
                f"Benchmark Metrics: {sd.get('benchmark_metrics', {})}\n"
                f"Key Findings: {'; '.join(findings[:3])}\n"
                f"Limitations: {'; '.join(sd.get('limitations', []))}"
            )
            paper_entries.append(entry)

        combined = "\n\n---\n\n".join(paper_entries)
        return f"""Write a structured, point-based comparative analysis of the following {len(papers)} research papers.

{combined}

Follow all formatting rules strictly. Use ONLY bullet points — no paragraph text anywhere."""

    @staticmethod
    async def generate_prose_comparison(paper_ids: List[str] = None) -> str:
        """
        Generates structured academic prose comparison across specified papers with caching.
        """
        db: Session = SessionLocal()
        cache_key = DatabaseService.compute_synthesis_cache_key("prose_compare", paper_ids or [])
        cached = DatabaseService.get_cached_synthesis(db, cache_key)
        if cached:
            db.close()
            return cached

        all_papers = DatabaseService.list_papers(db)
        db.close()

        if paper_ids:
            papers = [p for p in all_papers if p.id in paper_ids and p.structured_data]
        else:
            papers = [p for p in all_papers if p.structured_data][:6]

        if not papers:
            return "No structured paper data available for prose comparison. Please ensure selected papers have completed processing."

        prompt = WritingAgent._build_prose_compare_prompt(papers)

        response = await LLMFactory.invoke_llm(
            prompt=prompt,
            system_prompt=PROSE_COMPARE_SYSTEM_PROMPT,
            workload_type="interactive",
            temperature=0.2
        )

        db = SessionLocal()
        DatabaseService.save_cached_synthesis(db, cache_key, "prose_compare", response)
        db.close()

        return response

    @staticmethod
    async def generate_prose_comparison_stream(paper_ids: List[str] = None) -> AsyncGenerator[str, None]:
        """
        Streams structured academic prose comparison token by token with caching.
        """
        db: Session = SessionLocal()
        cache_key = DatabaseService.compute_synthesis_cache_key("prose_compare", paper_ids or [])
        cached = DatabaseService.get_cached_synthesis(db, cache_key)
        if cached:
            db.close()
            logger.info("Streaming cached prose comparison.")
            yield cached
            return

        all_papers = DatabaseService.list_papers(db)
        db.close()

        if paper_ids:
            papers = [p for p in all_papers if p.id in paper_ids and p.structured_data]
        else:
            papers = [p for p in all_papers if p.structured_data][:6]

        if not papers:
            yield "No structured paper data available for prose comparison. Please ensure selected papers have completed processing."
            return

        prompt = WritingAgent._build_prose_compare_prompt(papers)

        accumulated = []
        async for token in LLMFactory.stream_llm(
            prompt=prompt,
            system_prompt=PROSE_COMPARE_SYSTEM_PROMPT,
            temperature=0.2
        ):
            accumulated.append(token)
            yield token

        full_content = "".join(accumulated)
        if full_content.strip():
            db = SessionLocal()
            DatabaseService.save_cached_synthesis(db, cache_key, "prose_compare", full_content)
            db.close()

    # -------------------------------------------------------------
    # PAPER SUMMARY (STREAMING & BATCH WITH RESEARCH CARDS)
    # -------------------------------------------------------------

    @staticmethod
    def _build_paper_summary_prompt(paper, paragraphs, figures) -> str:
        sd = paper.structured_data or {}
        compact_paras = []
        for p in paragraphs[:5]:
            t = (p.text or "").strip()
            if t:
                compact_paras.append(f"[p. {p.page_number}] {t[:600]}")
        top_paragraphs = "\n\n".join(compact_paras) or "No detailed paragraphs available."
        fig_captions = "\n".join([f"- [Fig p.{f.page_number}] {f.caption}" for f in figures[:5]]) or "No figures extracted."

        exec_summary = sd.get("executive_summary") or paper.summary or "N/A"
        findings = sd.get("key_findings") or []

        return f"""You are a senior AI research scientist. Write a deep, highly technical per-paper summary for the following research paper.

PAPER METADATA:
Title: {paper.title}
Authors: {", ".join(paper.authors or [])}
arXiv ID: {paper.arxiv_id or paper.id}
Executive Card: {exec_summary[:400]}

EXTRACTED STRUCTURED DATA:
Primary Task: {sd.get('primary_task', 'N/A')}
Core Methodology: {sd.get('methodology_summary', 'N/A')[:400]}
Backbone Models: {', '.join(sd.get('backbone_models', []))}
Datasets: {', '.join(sd.get('datasets_used', []))}
Benchmark Metrics: {sd.get('benchmark_metrics', {})}
Key Findings: {'; '.join(findings[:3])}
Limitations: {'; '.join(sd.get('limitations', []))}

AVAILABLE FIGURES/DIAGRAMS:
{fig_captions}

KEY PARAGRAPHS:
{top_paragraphs}

STRICT OUTPUT FORMAT:
## {paper.title}
**Authors:** {", ".join(paper.authors or [])} | **arXiv:** {paper.arxiv_id or paper.id}

### 🎯 Core Innovation & Contribution
Write 2-3 technical paragraphs highlighting the core problem, proposed novel solution, and key contributions.

### 🏗️ Technical Architecture & Methodology
Write 2-3 dense paragraphs detailing the system pipeline, loss functions, algorithms, and models used. Reference figures where relevant (e.g. "As shown in [Fig p.X]...").

### 📊 Empirical Results & Benchmarks
Write 1-2 paragraphs analyzing performance metrics, baseline comparisons, and evaluation datasets.

### ⚠️ Limitations & Failure Modes
Write 1-2 paragraphs detailing practical constraints, scalability limits, or edge-case failures.

### 💡 Takeaways for Researchers
Write 3-5 concise bullet points summarizing why this paper matters and when to cite it.
"""

    @staticmethod
    async def generate_paper_summary(paper_id: str) -> str:
        """
        Generates a deep technical per-paper summary with caching.
        """
        db: Session = SessionLocal()
        cache_key = DatabaseService.compute_synthesis_cache_key("paper_summary", [paper_id])
        cached = DatabaseService.get_cached_synthesis(db, cache_key)
        if cached:
            db.close()
            return cached

        paper = DatabaseService.get_paper_by_id(db, paper_id)
        paragraphs = DatabaseService.get_paragraphs_by_paper(db, paper_id)
        figures = DatabaseService.get_figures_by_pages(db, paper_id, list(range(1, 30)))
        db.close()

        if not paper:
            return "Paper not found."

        prompt = WritingAgent._build_paper_summary_prompt(paper, paragraphs, figures)

        response = await LLMFactory.invoke_llm(
            prompt=prompt,
            system_prompt="You are an expert AI research scientist producing dense, rigorous per-paper technical summaries.",
            workload_type="interactive",
            temperature=0.2
        )

        db = SessionLocal()
        DatabaseService.save_cached_synthesis(db, cache_key, "paper_summary", response)
        db.close()

        return response

    @staticmethod
    async def generate_paper_summary_stream(paper_id: str) -> AsyncGenerator[str, None]:
        """
        Streams deep technical per-paper summary token by token with caching.
        """
        db: Session = SessionLocal()
        cache_key = DatabaseService.compute_synthesis_cache_key("paper_summary", [paper_id])
        cached = DatabaseService.get_cached_synthesis(db, cache_key)
        if cached:
            db.close()
            logger.info("Streaming cached paper summary.")
            yield cached
            return

        paper = DatabaseService.get_paper_by_id(db, paper_id)
        paragraphs = DatabaseService.get_paragraphs_by_paper(db, paper_id)
        figures = DatabaseService.get_figures_by_pages(db, paper_id, list(range(1, 30)))
        db.close()

        if not paper:
            yield "Paper not found."
            return

        prompt = WritingAgent._build_paper_summary_prompt(paper, paragraphs, figures)

        accumulated = []
        async for token in LLMFactory.stream_llm(
            prompt=prompt,
            system_prompt="You are an expert AI research scientist producing dense, rigorous per-paper technical summaries.",
            temperature=0.2
        ):
            accumulated.append(token)
            yield token

        full_content = "".join(accumulated)
        if full_content.strip():
            db = SessionLocal()
            DatabaseService.save_cached_synthesis(db, cache_key, "paper_summary", full_content)
            db.close()

    # -------------------------------------------------------------
    # COMBINED SUMMARY (STREAMING & BATCH WITH RESEARCH CARDS)
    # -------------------------------------------------------------

    @staticmethod
    def _build_combined_summary_prompt(papers: list, topic_str: str) -> str:
        paper_blocks = []
        for p in papers:
            sd = p.structured_data or {}
            abstract = (sd.get("executive_summary") or p.summary or "N/A")[:350].strip()
            method = (sd.get('methodology_summary') or abstract)[:300].strip()
            findings = sd.get("key_findings") or []
            paper_blocks.append(
                f"Title: {p.title}\n"
                f"Abstract: {abstract}\n"
                f"Task: {sd.get('primary_task', 'N/A')}\n"
                f"Methodology: {method}\n"
                f"Key Findings: {'; '.join(findings[:2])}\n"
                f"Datasets: {', '.join(sd.get('datasets_used', [])[:4])}\n"
                f"Limitations: {'; '.join(sd.get('limitations', [])[:2])}"
            )

        combined_input = "\n\n---\n\n".join(paper_blocks)
        return f"""Write a multi-paper synthesis summary covering the following {len(papers)} research papers on topic: '{topic_str}'.

PAPER SOURCES:
{combined_input}

STRICT OUTPUT FORMAT:
## Combined Research Summary: {topic_str}

### 🌐 High-Level Technical Landscape
Write 2-3 paragraphs synthesizing the current state of research across these papers.

### 🔬 Methodological Approaches Compared
Write 2-3 paragraphs comparing models, architectures, and algorithms across the papers.

### 📈 Empirical Results & Benchmark Highlights
Write 2 paragraphs highlighting key performance metrics and evaluation outcomes.

### 🔗 Synergies & Unresolved Research Gaps
Write 2 paragraphs identifying shared limitations and opportunities for combined research.
"""

    @staticmethod
    async def generate_combined_summary(paper_ids: List[str], topic: Optional[str] = None) -> str:
        """
        Generates a multi-paper synthesis summary with caching.
        """
        db: Session = SessionLocal()
        topic_str = topic or "Multi-Paper Research Focus"
        cache_key = DatabaseService.compute_synthesis_cache_key("combined_summary", paper_ids or [], topic_str)
        cached = DatabaseService.get_cached_synthesis(db, cache_key)
        if cached:
            db.close()
            return cached

        all_papers = DatabaseService.list_papers(db)
        db.close()

        papers = [p for p in all_papers if p.id in paper_ids] if paper_ids else all_papers[:6]
        if not papers:
            return "No papers selected for combined summary."

        prompt = WritingAgent._build_combined_summary_prompt(papers, topic_str)

        response = await LLMFactory.invoke_llm(
            prompt=prompt,
            system_prompt="You are an expert AI research scientist synthesizing multi-paper technical summaries.",
            workload_type="interactive",
            temperature=0.25
        )

        db = SessionLocal()
        DatabaseService.save_cached_synthesis(db, cache_key, "combined_summary", response)
        db.close()

        return response

    @staticmethod
    async def generate_combined_summary_stream(paper_ids: List[str], topic: Optional[str] = None) -> AsyncGenerator[str, None]:
        """
        Streams multi-paper synthesis summary token by token with caching.
        """
        topic_str = topic or "Multi-Paper Research Focus"
        db: Session = SessionLocal()
        cache_key = DatabaseService.compute_synthesis_cache_key("combined_summary", paper_ids or [], topic_str)
        cached = DatabaseService.get_cached_synthesis(db, cache_key)
        if cached:
            db.close()
            logger.info("Streaming cached combined summary.")
            yield cached
            return

        all_papers = DatabaseService.list_papers(db)
        db.close()

        papers = [p for p in all_papers if p.id in paper_ids] if paper_ids else all_papers[:6]
        if not papers:
            yield "No papers selected for combined summary."
            return

        prompt = WritingAgent._build_combined_summary_prompt(papers, topic_str)

        accumulated = []
        async for token in LLMFactory.stream_llm(
            prompt=prompt,
            system_prompt="You are an expert AI research scientist synthesizing multi-paper technical summaries.",
            temperature=0.25
        ):
            accumulated.append(token)
            yield token

        full_content = "".join(accumulated)
        if full_content.strip():
            db = SessionLocal()
            DatabaseService.save_cached_synthesis(db, cache_key, "combined_summary", full_content)
            db.close()

    @staticmethod
    async def _generate_literature_review(state: ResearchAgentState) -> ResearchAgentState:
        state.step_logs.append("[Writing Agent] Synthesizing literature review draft...")
        db: Session = SessionLocal()
        all_papers = DatabaseService.list_papers(db)
        db.close()

        if state.paper_ids:
            papers = [p for p in all_papers if p.id in state.paper_ids]
        else:
            papers = all_papers[:8]

        paper_entries = []
        for p in papers:
            sd = p.structured_data or {}
            exec_summary = sd.get("executive_summary") or p.summary or "N/A"
            entry = f"Title: {p.title}\nSummary: {exec_summary[:350]}"
            if sd.get("primary_task"):
                entry += f"\nPrimary Task: {sd['primary_task']}"
            if sd.get("methodology_summary"):
                entry += f"\nMethodology: {sd['methodology_summary'][:300]}"
            if sd.get("datasets_used"):
                entry += f"\nDatasets: {', '.join(sd['datasets_used'])}"
            if sd.get("benchmark_metrics"):
                metrics = sd["benchmark_metrics"]
                if isinstance(metrics, dict):
                    entry += f"\nKey Metrics: {', '.join(f'{k}: {v}' for k, v in list(metrics.items())[:4])}"
            if sd.get("limitations"):
                entry += f"\nLimitations: {'; '.join(sd['limitations'][:3])}"
            if sd.get("future_work"):
                entry += f"\nFuture Work: {'; '.join(sd['future_work'][:2])}"
            paper_entries.append(entry)

        combined_papers = "\n\n---\n\n".join(paper_entries)

        prompt = f"""Write a comprehensive structured literature review on the following research topic.

TOPIC: {state.user_query}

AVAILABLE PAPERS ({len(paper_entries)} total):
{combined_papers}

Write the full literature review draft now, following all formatting rules strictly. Be thorough — each section should deeply analyze the state of the field, not just summarize individual papers."""

        review_text = await LLMFactory.invoke_llm(
            prompt=prompt,
            system_prompt=REVIEW_SYSTEM_PROMPT,
            workload_type="interactive",
            temperature=0.3
        )

        state.literature_review = {
            "topic": state.user_query,
            "title": f"Literature Review: {state.user_query}",
            "content": review_text
        }
        state.final_response = review_text
        return state
