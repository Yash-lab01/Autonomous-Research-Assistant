import logging
from app.agents.state import ResearchAgentState
from app.services.vector_store import vector_store

logger = logging.getLogger("ai_research_os.reading_agent")

class ReadingAgent:

    @staticmethod
    async def execute(state: ResearchAgentState) -> ResearchAgentState:
        query = state.user_query
        paper_ids = state.paper_ids
        state.step_logs.append(f"[Reading Agent] Searching vector store RAG for query: '{query}'")

        try:
            chunks = vector_store.search_paragraphs(
                query=query,
                paper_ids=paper_ids if paper_ids else None,
                top_k=6
            )
            state.retrieved_paragraphs = chunks
            state.step_logs.append(f"[Reading Agent] Retrieved {len(chunks)} paragraph chunks with citation anchors.")

            # Figure-aware RAG: collect unique (paper_id, page_number) pairs from retrieved chunks
            paper_pages_map = {}
            for c in chunks:
                pid = c.get("paper_id")
                page = c.get("page_number")
                if pid and page:
                    paper_pages_map.setdefault(pid, set()).add(page)

            from app.services.db import DatabaseService, SessionLocal
            db = SessionLocal()
            figures_found = []
            seen_fig_ids = set()

            try:
                for pid, pages in paper_pages_map.items():
                    figs = DatabaseService.get_figures_by_pages(db, pid, list(pages))
                    for f in figs:
                        if f.id not in seen_fig_ids:
                            seen_fig_ids.add(f.id)
                            figures_found.append({
                                "figure_id": f.figure_id,
                                "paper_id": f.paper_id,
                                "url": f.url,
                                "caption": f.caption or f"Diagram on page {f.page_number}",
                                "page_number": f.page_number,
                                "ai_captioned": bool(f.ai_captioned)
                            })
            finally:
                db.close()

            state.figures_cited = figures_found[:4] # Cap at top 4 most relevant figures
            if figures_found:
                state.step_logs.append(f"[Reading Agent] Matched {len(state.figures_cited)} relevant figures from cited pages.")

        except Exception as e:
            logger.error(f"Reading Agent RAG search failed: {e}")
            state.step_logs.append(f"[Reading Agent] Error retrieving chunks: {e}")

        return state
