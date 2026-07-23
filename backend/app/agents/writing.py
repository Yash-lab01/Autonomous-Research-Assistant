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
        papers = DatabaseService.list_papers(db)
        db.close()

        paper_summaries = [f"- **{p.title}**: {p.summary}" for p in papers[:5]]
        combined_summaries = "\n".join(paper_summaries)

        prompt = f"""Topic: {state.user_query}
Ingested Papers Summary:
{combined_summaries}

Generate a structured Literature Review draft with sections:
1. Introduction
2. Background
3. Existing Methods
4. Limitations and Research Gaps
5. Future Directions
"""

        review_text = await LLMFactory.invoke_llm(
            prompt=prompt,
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
