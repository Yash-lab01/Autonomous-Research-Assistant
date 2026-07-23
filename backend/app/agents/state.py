from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class ResearchAgentState(BaseModel):
    user_query: str
    intent: str = "qa" # "search" | "qa" | "compare" | "review"
    paper_ids: List[str] = Field(default_factory=list)
    search_results: List[Dict[str, Any]] = Field(default_factory=list)
    retrieved_paragraphs: List[Dict[str, Any]] = Field(default_factory=list)
    comparison_data: Optional[Dict[str, Any]] = None
    literature_review: Optional[Dict[str, Any]] = None
    final_response: str = ""
    citations: List[Dict[str, Any]] = Field(default_factory=list)
    step_logs: List[str] = Field(default_factory=list)
