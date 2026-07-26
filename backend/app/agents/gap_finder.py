import logging
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from app.services.db import DatabaseService, SessionLocal
from app.services.llm_factory import LLMFactory

logger = logging.getLogger("ai_research_os.gap_finder")

GAP_SYSTEM_PROMPT = """You are the Lead Research Gap & Innovation Discovery Agent for AI Research OS.
Your goal is to cross-examine technical limitations, dataset constraints, and future work across multiple scientific papers to discover unaddressed research gaps and propose high-impact novel project/thesis ideas.

STRICT FORMATTING RULES:
- Use markdown section headers:
  ## 1. Key Limitations & Cross-Paper Bottlenecks
  ## 2. Unaddressed Research Gaps
  ## 3. Proposed Novel Project & Thesis Ideas
  ## 4. Suggested Evaluation Benchmarks
- Each section must contain thorough, insightful academic analysis with clear, bulleted or numbered breakdowns.
- Explicitly cite papers by title when referencing their specific limitations or future work.
- Propose creative, actionable, and concrete novel methodologies combining techniques or overcoming observed limitations.
"""

class GapFinderAgent:

    @staticmethod
    async def analyze_gaps(paper_ids: List[str] = None) -> Dict[str, Any]:
        """
        Scans limitations and future_work across papers to discover open research gaps.
        """
        logger.info("Running Research Gap Finder Agent...")
        db: Session = SessionLocal()
        all_papers = DatabaseService.list_papers(db)
        db.close()

        # Filter done papers
        completed_papers = [p for p in all_papers if p.status.value == "done" or p.status == "done"]
        if paper_ids:
            completed_papers = [p for p in completed_papers if p.id in paper_ids]

        if not completed_papers:
            return {
                "paper_count": 0,
                "gaps_markdown": "No completed papers found in your library. Add and ingest papers first to generate research gap insights.",
                "insights": []
            }

        # Build cross-paper synthesis context
        paper_blocks = []
        for p in completed_papers:
            sd = p.structured_data or {}
            title = p.title
            task = sd.get("primary_task", "General AI/ML")
            method = sd.get("methodology_summary", p.summary or "N/A")
            limitations = sd.get("limitations", [])
            future_work = sd.get("future_work", [])
            metrics = sd.get("benchmark_metrics", {})
            datasets = sd.get("datasets_used", [])

            block = f"### Paper: {title}\n"
            block += f"- **Primary Task**: {task}\n"
            block += f"- **Methodology**: {method}\n"
            if datasets:
                block += f"- **Datasets**: {', '.join(datasets)}\n"
            if metrics:
                block += f"- **Key Metrics**: {metrics}\n"
            if limitations:
                block += f"- **Stated Limitations**: {'; '.join(limitations)}\n"
            else:
                block += "- **Stated Limitations**: None explicitly stated\n"
            if future_work:
                block += f"- **Proposed Future Work**: {'; '.join(future_work)}\n"

            paper_blocks.append(block)

        formatted_papers = "\n\n".join(paper_blocks)

        prompt = f"""Synthesize open research gaps and novel project ideas across the following {len(completed_papers)} research papers in your knowledge base:

{formatted_papers}

Analyze these papers deeply and write a comprehensive Research Gap & Novel Innovation Report following all system prompt instructions strictly."""

        analysis_text = await LLMFactory.invoke_llm(
            prompt=prompt,
            system_prompt=GAP_SYSTEM_PROMPT,
            workload_type="interactive",
            temperature=0.4
        )

        return {
            "paper_count": len(completed_papers),
            "gaps_markdown": analysis_text,
            "paper_titles": [p.title for p in completed_papers]
        }
