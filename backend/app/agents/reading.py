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
        except Exception as e:
            logger.error(f"Reading Agent RAG search failed: {e}")
            state.step_logs.append(f"[Reading Agent] Error retrieving chunks: {e}")

        return state
