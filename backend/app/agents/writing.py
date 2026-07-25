import json
import logging
from typing import List, Dict, Any
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
            # Fallback if no specific papers indexed yet
            prompt = f"User Question: {query}\n\nAnswer concisely based on general AI/ML knowledge, noting that no papers are currently loaded in the active collection."
            response = await LLMFactory.invoke_llm(prompt=prompt, workload_type="interactive")
            state.final_response = response
            return state

        context_blocks = []
        citations_list = []

        for idx, c in enumerate(chunks, start=1):
            tag = f"[Citation {idx}: Paper {c['paper_id']}, p.{c['page_number']}]"
            context_blocks.append(f"{tag}\n\"{c['text']}\"")
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

    @staticmethod
    async def _generate_literature_review(state: ResearchAgentState) -> ResearchAgentState:
        state.step_logs.append("[Writing Agent] Synthesizing literature review draft...")
        db: Session = SessionLocal()
        all_papers = DatabaseService.list_papers(db)
        db.close()

        # Filter to only selected papers if paper_ids were provided
        if state.paper_ids:
            papers = [p for p in all_papers if p.id in state.paper_ids]
        else:
            papers = all_papers[:8]

        paper_entries = []
        for p in papers:
            sd = p.structured_data or {}
            entry = f"Title: {p.title}\nSummary: {p.summary or 'N/A'}"
            if sd.get("primary_task"):
                entry += f"\nPrimary Task: {sd['primary_task']}"
            if sd.get("methodology_summary"):
                entry += f"\nMethodology: {sd['methodology_summary']}"
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
