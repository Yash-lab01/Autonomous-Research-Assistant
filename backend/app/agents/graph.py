import logging
from app.agents.state import ResearchAgentState
from app.agents.planner import PlannerAgent
from app.agents.search import SearchAgent
from app.agents.reading import ReadingAgent
from app.agents.writing import WritingAgent

logger = logging.getLogger("ai_research_os.graph")

class ResearchOrchestrator:
    """
    LangGraph Workflow Orchestrator for AI Research OS.
    Executes Planner -> (Search | Reading) -> Writing pipeline.
    """

    @staticmethod
    async def run(query: str, paper_ids: list = None) -> ResearchAgentState:
        state = ResearchAgentState(user_query=query, paper_ids=paper_ids or [])

        # 1. Planner Stage
        state = await PlannerAgent.plan(state)

        # 2. Execution Stage based on Intent
        if state.intent == "search":
            state = await SearchAgent.execute(state)
        elif state.intent in ["qa", "compare", "review"]:
            state = await ReadingAgent.execute(state)
            state = await WritingAgent.execute(state)
        else:
            state = await ReadingAgent.execute(state)
            state = await WritingAgent.execute(state)

        return state
