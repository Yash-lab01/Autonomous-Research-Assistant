import json
import logging
from app.agents.state import ResearchAgentState
from app.services.llm_factory import LLMFactory

logger = logging.getLogger("ai_research_os.planner")

PLANNER_SYSTEM_PROMPT = """You are the Lead Research Planner Agent for AI Research OS.
Analyze the user's input and classify their intent into one of four categories:
1. "search": User wants to search arXiv for new papers, find recent publications, or download papers.
2. "compare": User wants to compare multiple papers, algorithms, or benchmarks side-by-side.
3. "review": User wants to generate a comprehensive literature review or survey paper draft.
4. "qa": User is asking a specific technical question about research papers or concepts.

Return ONLY a JSON object with:
{
  "intent": "search" | "compare" | "review" | "qa",
  "reasoning": "Brief explanation of choice"
}
"""

class PlannerAgent:

    @staticmethod
    async def plan(state: ResearchAgentState) -> ResearchAgentState:
        query = state.user_query
        state.step_logs.append(f"[Planner] Analyzing query intent for: '{query}'")

        try:
            raw_res = await LLMFactory.invoke_llm(
                prompt=f"User Query: {query}",
                system_prompt=PLANNER_SYSTEM_PROMPT,
                workload_type="interactive", # Route to Groq 70B
                response_format="json_object",
                temperature=0.1
            )
            data = json.loads(raw_res.strip())
            intent = data.get("intent", "qa")
            state.intent = intent
            state.step_logs.append(f"[Planner] Classified intent as '{intent}'. Reasoning: {data.get('reasoning', '')}")
        except Exception as e:
            logger.warning(f"Planner intent classification failed ({e}). Defaulting to 'qa'.")
            state.intent = "qa"
            state.step_logs.append("[Planner] Defaulted intent to 'qa'")

        return state
