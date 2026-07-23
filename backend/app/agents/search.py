import logging
from typing import List
from sqlalchemy.orm import Session
from app.agents.state import ResearchAgentState
from app.services.arxiv_client import ArxivClient
from app.services.db import DatabaseService, SessionLocal
from app.models.paper import PaperMetadata, PaperStatus

logger = logging.getLogger("ai_research_os.search_agent")

class SearchAgent:

    @staticmethod
    async def execute(state: ResearchAgentState) -> ResearchAgentState:
        query = state.user_query
        state.step_logs.append(f"[Search Agent] Querying arXiv API for '{query}'...")

        try:
            results = await ArxivClient.search(query=query, max_results=5)
            db: Session = SessionLocal()

            processed_results = []
            for r in results:
                existing = DatabaseService.get_paper_by_arxiv_id(db, r.arxiv_id)
                already_ingested = existing is not None and existing.status == PaperStatus.DONE

                processed_results.append({
                    "arxiv_id": r.arxiv_id,
                    "title": r.title,
                    "authors": r.authors,
                    "published_date": r.published_date,
                    "pdf_url": r.pdf_url,
                    "summary": r.summary,
                    "already_ingested": already_ingested
                })

            db.close()
            state.search_results = processed_results
            state.step_logs.append(f"[Search Agent] Found {len(results)} research papers on arXiv.")
            state.final_response = f"I found {len(results)} relevant papers on arXiv for '{query}'. You can select any paper to download, extract, and index into your knowledge base."

        except Exception as e:
            logger.error(f"Search agent failed: {e}")
            state.step_logs.append(f"[Search Agent] Error searching arXiv: {e}")
            state.final_response = f"Failed to search arXiv: {e}"

        return state
