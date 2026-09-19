import json
import logging
from typing import List, Dict, Any, Optional, AsyncGenerator
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.services.db import DatabaseService
from app.services.vector_store import vector_store
from app.services.llm_factory import LLMFactory

logger = logging.getLogger("ai_research_os.consensus")

class PaperStance(BaseModel):
    paper_id: str
    paper_title: str
    arxiv_id: Optional[str] = None
    stance: str # "supports" | "contradicts" | "nuanced" | "neutral"
    confidence: float # 0.0 to 1.0
    takeaway: str
    supporting_quote: str
    page_number: Optional[int] = None
    relevance_score: float = 0.0

class ConsensusResult(BaseModel):
    query: str
    total_papers: int
    analyzed_papers: int
    supports_count: int
    contradicts_count: int
    nuanced_count: int
    neutral_count: int
    supports_pct: float
    contradicts_pct: float
    nuanced_pct: float
    consensus_verdict: str
    paper_stances: List[PaperStance]

class ConsensusService:

    CLASSIFICATION_PROMPT = """You are an objective scientific meta-reviewer analyzing research literature consensus.
Given a hypothesis query and text excerpts from an academic paper, determine the paper's stance on the hypothesis.

Classify into exactly ONE of:
- "supports": The empirical findings or theories clearly favor or validate the hypothesis.
- "contradicts": The findings disprove, fail to validate, or show negative results regarding the hypothesis.
- "nuanced": The result is context-dependent, mixed, conditional on specific hyperparameters/architectures, or shows trade-offs.
- "neutral": The paper mentions related topics but does not provide direct evidence to confirm or deny the hypothesis.

Return ONLY a valid JSON object matching this schema:
{
  "stance": "supports" | "contradicts" | "nuanced" | "neutral",
  "confidence": 0.85,
  "takeaway": "One clear sentence summarizing the paper's specific finding regarding the question.",
  "supporting_quote": "A direct, verbatim sentence or phrase from the provided text excerpt that justifies this stance.",
  "page_number": 4
}
Do NOT include markdown formatting or explanations outside the JSON object.
"""

    @staticmethod
    async def classify_single_paper(paper, query: str) -> PaperStance:
        """Analyzes a single paper's stance on a given research question."""
        title = paper.title or "Untitled Paper"
        sd = paper.structured_data or {}
        
        # Retrieve top relevant paragraphs for this paper using hybrid vector search
        relevant_chunks = []
        try:
            raw_chunks = vector_store.search_paragraphs(
                query=query,
                top_k=4,
                paper_ids=[paper.id]
            )
            relevant_chunks = raw_chunks
        except Exception as e:
            logger.warning(f"Vector search for paper {paper.id} in consensus failed: {e}")

        # Assemble evidence context
        context_parts = []
        if sd.get("executive_summary"):
            context_parts.append(f"EXECUTIVE SUMMARY:\n{sd['executive_summary']}")
        elif paper.summary:
            context_parts.append(f"ABSTRACT / SUMMARY:\n{paper.summary}")

        if sd.get("key_findings"):
            findings_str = "\n".join(f"- {f}" for f in sd["key_findings"])
            context_parts.append(f"KEY FINDINGS:\n{findings_str}")

        if relevant_chunks:
            chunks_text = "\n\n".join(
                f"[Page {c.get('page_number', '?')}]: {c.get('text', '')}"
                for c in relevant_chunks
            )
            context_parts.append(f"RELEVANT TEXT PASSAGES:\n{chunks_text}")

        evidence_text = "\n\n".join(context_parts)[:4000]

        prompt = f"""HYPOTHESIS / QUESTION: {query}
PAPER TITLE: {title}

EVIDENCE FROM PAPER:
{evidence_text}

Classify this paper's stance strictly following the JSON format."""

        try:
            raw = await LLMFactory.invoke_llm(
                prompt=prompt,
                system_prompt=ConsensusService.CLASSIFICATION_PROMPT,
                workload_type="interactive",
                response_format="json_object",
                temperature=0.1
            )
            cleaned = raw.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            parsed = json.loads(cleaned.strip())

            stance = parsed.get("stance", "nuanced").lower()
            if stance not in ["supports", "contradicts", "nuanced", "neutral"]:
                stance = "nuanced"

            conf = float(parsed.get("confidence", 0.75))
            conf = max(0.0, min(1.0, conf))

            page = parsed.get("page_number")
            if not page and relevant_chunks:
                page = relevant_chunks[0].get("page_number")

            return PaperStance(
                paper_id=paper.id,
                paper_title=title,
                arxiv_id=paper.arxiv_id,
                stance=stance,
                confidence=round(conf, 2),
                takeaway=parsed.get("takeaway", "No specific takeaway extracted."),
                supporting_quote=parsed.get("supporting_quote", ""),
                page_number=page,
                relevance_score=float(relevant_chunks[0].get("score", 0.8)) if relevant_chunks else 0.5
            )

        except Exception as e:
            logger.error(f"Failed to classify consensus stance for {paper.id}: {e}")
            return PaperStance(
                paper_id=paper.id,
                paper_title=title,
                arxiv_id=paper.arxiv_id,
                stance="nuanced",
                confidence=0.5,
                takeaway="Context-dependent analysis based on available paper metadata.",
                supporting_quote=paper.summary[:200] if paper.summary else "",
                page_number=1,
                relevance_score=0.5
            )

    @staticmethod
    async def analyze_consensus(
        db: Session,
        query: str,
        paper_ids: Optional[List[str]] = None
    ) -> ConsensusResult:
        """
        Runs comprehensive consensus analysis across target or all completed papers in library.
        """
        all_papers = DatabaseService.list_papers(db)
        candidates = [p for p in all_papers if (p.status.value == "done" if hasattr(p.status, "value") else p.status == "done")]
        if paper_ids:
            candidates = [p for p in candidates if p.id in paper_ids]

        if not candidates:
            return ConsensusResult(
                query=query,
                total_papers=0,
                analyzed_papers=0,
                supports_count=0,
                contradicts_count=0,
                nuanced_count=0,
                neutral_count=0,
                supports_pct=0.0,
                contradicts_pct=0.0,
                nuanced_pct=0.0,
                consensus_verdict="No completed papers available to evaluate consensus.",
                paper_stances=[]
            )

        stances: List[PaperStance] = []
        for paper in candidates:
            stance = await ConsensusService.classify_single_paper(paper, query)
            stances.append(stance)

        # Calculate summary statistics
        total = len(stances)
        supports = sum(1 for s in stances if s.stance == "supports")
        contradicts = sum(1 for s in stances if s.stance == "contradicts")
        nuanced = sum(1 for s in stances if s.stance == "nuanced")
        neutral = sum(1 for s in stances if s.stance == "neutral")

        informative_total = max(1, supports + contradicts + nuanced)
        s_pct = round((supports / informative_total) * 100, 1)
        c_pct = round((contradicts / informative_total) * 100, 1)
        n_pct = round((nuanced / informative_total) * 100, 1)

        # Generate synthesized verdict
        if s_pct >= 65.0:
            verdict = f"Strong Scientific Consensus: {s_pct}% of analyzed literature supports the hypothesis."
        elif c_pct >= 65.0:
            verdict = f"Strong Scientific Disagreement: {c_pct}% of analyzed literature contradicts the hypothesis."
        elif s_pct > c_pct and s_pct > n_pct:
            verdict = f"Moderate Support ({s_pct}%), but with notable contextual nuances or caveats across architectures."
        elif c_pct > s_pct and c_pct > n_pct:
            verdict = f"Leaning Skeptical ({c_pct}% contradicts), with significant constraints identified."
        else:
            verdict = f"Active Scientific Debate: Findings are heavily context-dependent ({n_pct}% nuanced) across differing benchmarks and compute regimes."

        return ConsensusResult(
            query=query,
            total_papers=len(candidates),
            analyzed_papers=total,
            supports_count=supports,
            contradicts_count=contradicts,
            nuanced_count=nuanced,
            neutral_count=neutral,
            supports_pct=s_pct,
            contradicts_pct=c_pct,
            nuanced_pct=n_pct,
            consensus_verdict=verdict,
            paper_stances=stances
        )

    @staticmethod
    async def stream_consensus(
        db: Session,
        query: str,
        paper_ids: Optional[List[str]] = None
    ) -> AsyncGenerator[str, None]:
        """
        Yields real-time Server-Sent Events as each paper is classified.
        """
        all_papers = DatabaseService.list_papers(db)
        candidates = [p for p in all_papers if (p.status.value == "done" if hasattr(p.status, "value") else p.status == "done")]
        if paper_ids:
            candidates = [p for p in candidates if p.id in paper_ids]

        total = len(candidates)
        yield f"data: {json.dumps({'type': 'init', 'total': total, 'query': query})}\n\n"

        stances: List[PaperStance] = []
        for idx, paper in enumerate(candidates, start=1):
            stance = await ConsensusService.classify_single_paper(paper, query)
            stances.append(stance)
            payload = {
                "type": "paper_result",
                "index": idx,
                "total": total,
                "stance": stance.model_dump()
            }
            yield f"data: {json.dumps(payload)}\n\n"

        # Final summary
        supports = sum(1 for s in stances if s.stance == "supports")
        contradicts = sum(1 for s in stances if s.stance == "contradicts")
        nuanced = sum(1 for s in stances if s.stance == "nuanced")
        neutral = sum(1 for s in stances if s.stance == "neutral")
        informative_total = max(1, supports + contradicts + nuanced)

        s_pct = round((supports / informative_total) * 100, 1)
        c_pct = round((contradicts / informative_total) * 100, 1)
        n_pct = round((nuanced / informative_total) * 100, 1)

        if s_pct >= 65.0:
            verdict = f"Strong Scientific Consensus: {s_pct}% of analyzed literature supports the hypothesis."
        elif c_pct >= 65.0:
            verdict = f"Strong Scientific Disagreement: {c_pct}% of analyzed literature contradicts the hypothesis."
        elif s_pct > c_pct and s_pct > n_pct:
            verdict = f"Moderate Support ({s_pct}%), but with notable contextual nuances or caveats."
        elif c_pct > s_pct and c_pct > n_pct:
            verdict = f"Leaning Skeptical ({c_pct}% contradicts), with significant constraints identified."
        else:
            verdict = f"Active Scientific Debate: Findings are heavily context-dependent ({n_pct}% nuanced) across differing benchmarks."

        summary_payload = {
            "type": "done",
            "query": query,
            "total_papers": total,
            "analyzed_papers": len(stances),
            "supports_count": supports,
            "contradicts_count": contradicts,
            "nuanced_count": nuanced,
            "neutral_count": neutral,
            "supports_pct": s_pct,
            "contradicts_pct": c_pct,
            "nuanced_pct": n_pct,
            "consensus_verdict": verdict,
            "paper_stances": [s.model_dump() for s in stances]
        }
        yield f"data: {json.dumps(summary_payload)}\n\n"
