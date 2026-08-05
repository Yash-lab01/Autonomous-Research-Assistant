import asyncio
import logging
from typing import Callable, Optional
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

    @staticmethod
    async def run_streaming(
        query: str,
        paper_ids: list = None,
        on_step: Optional[Callable[[str], None]] = None
    ) -> ResearchAgentState:
        """
        Same pipeline as run(), but instruments step_logs so each step log
        is passed to on_step() as soon as it is appended.
        Used by the SSE /api/chat/stream endpoint.
        """
        state = ResearchAgentState(user_query=query, paper_ids=paper_ids or [])

        # Wrap step_logs list to call on_step on each append
        _on_step = on_step or (lambda _: None)
        original_append = state.step_logs.append

        def instrumented_append(log: str):
            original_append(log)
            try:
                _on_step(log)
            except Exception:
                pass

        state.step_logs.append = instrumented_append  # type: ignore

        # Run the same pipeline
        state = await PlannerAgent.plan(state)

        if state.intent == "search":
            state = await SearchAgent.execute(state)
        elif state.intent in ["qa", "compare", "review"]:
            state = await ReadingAgent.execute(state)
            state = await WritingAgent.execute(state)
        else:
            state = await ReadingAgent.execute(state)
            state = await WritingAgent.execute(state)

        return state
