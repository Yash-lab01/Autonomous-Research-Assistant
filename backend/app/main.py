import uuid
import logging
import csv
import io
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.config import settings
from app.services.db import init_db, get_db, DatabaseService
from app.models.paper import (
    PaperMetadata, PaperStatus, PaperSearchQuery, PaperSearchResult,
    StructuredPaperExtraction, ComparisonMatrix, LiteratureReviewDraft
)
from app.services.arxiv_client import ArxivClient, ArxivRateLimitError
from app.services.ingestion import IngestionPipeline
from app.services.pdf_parser import HybridPDFParser
from app.services.timeline import TimelineService
from app.agents.graph import ResearchOrchestrator
from app.agents.gap_finder import GapFinderAgent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai_research_os.main")

app = FastAPI(
    title=settings.APP_NAME,
    description="Autonomous Local-First & Cloud-Boosted AI Research Assistant",
    version="1.0.0"
)

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure static figures directory exists
figures_dir = settings.FIGURES_DIR
figures_dir.mkdir(parents=True, exist_ok=True)
app.mount("/figures", StaticFiles(directory=str(figures_dir)), name="figures")

@app.on_event("startup")
def startup_event():
    init_db()
    logger.info("Database initialized successfully.")

@app.get("/")
def read_root():
    return {
        "status": "online",
        "app": settings.APP_NAME,
        "groq_model": settings.GROQ_PRIMARY_MODEL,
        "ollama_model": settings.OLLAMA_FALLBACK_MODEL
    }

@app.post("/api/search", response_model=List[PaperSearchResult])
async def search_arxiv_papers(req: PaperSearchQuery, db: Session = Depends(get_db)):
    """
    Search arXiv for research papers.
    sort_by: "relevance" | "date" | "updated"
    """
    try:
        results = await ArxivClient.search(
            query=req.query,
            max_results=req.max_results,
            sort_by=req.sort_by
        )
        # Mark already_ingested flags
        for r in results:
            existing = DatabaseService.get_paper_by_arxiv_id(db, r.arxiv_id)
            if existing and existing.status == PaperStatus.DONE:
                r.already_ingested = True
        return results
    except ArxivRateLimitError as e:
        logger.warning(f"arXiv rate limit hit for query '{req.query}': {e}")
        raise HTTPException(status_code=429, detail=str(e))
    except Exception as e:
        logger.error(f"Search API error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ingest")
async def ingest_paper(
    background_tasks: BackgroundTasks,
    arxiv_id: Optional[str] = None,
    title: Optional[str] = None,
    authors: Optional[List[str]] = None,
    pdf_url: Optional[str] = None,
    summary: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Triggers non-blocking async paper ingestion pipeline:
    queued -> downloading -> parsing -> extracting -> embedding -> done/failed
    """
    if arxiv_id:
        existing = DatabaseService.get_paper_by_arxiv_id(db, arxiv_id)
        if existing:
            return {
                "message": "Paper already registered.",
                "paper_id": existing.id,
                "status": existing.status
            }

    paper_id = f"paper_{uuid.uuid4().hex[:8]}"
    paper_metadata = PaperMetadata(
        id=paper_id,
        arxiv_id=arxiv_id,
        title=title or f"arXiv Paper {arxiv_id}",
        authors=authors or [],
        pdf_url=pdf_url,
        summary=summary,
        status=PaperStatus.QUEUED
    )

    db_paper = DatabaseService.create_paper(db, paper_metadata)

    # Trigger background non-blocking execution
    background_tasks.add_task(
        IngestionPipeline.process_paper_async,
        paper_id=paper_id,
        arxiv_id=arxiv_id,
        pdf_url=pdf_url
    )

    return {
        "message": "Paper ingestion queued successfully.",
        "paper_id": paper_id,
        "status": PaperStatus.QUEUED
    }

@app.get("/api/papers")
def list_papers(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    List all papers with live status & failure reasons.
    """
    papers = DatabaseService.list_papers(db, skip=skip, limit=limit)
    return [
        {
            "id": p.id,
            "arxiv_id": p.arxiv_id,
            "title": p.title,
            "authors": p.authors,
            "published_date": p.published_date,
            "pdf_url": p.pdf_url,
            "summary": p.summary,
            "status": p.status,
            "failure_reason": p.failure_reason,
            "extraction_parser": p.extraction_parser,
            "paragraph_count": p.paragraph_count,
            "structured_data": p.structured_data,
            "notes": p.notes,
            "tags": p.tags,
            "created_at": p.created_at
        }
        for p in papers
    ]

# NOTE: /api/papers/export MUST be declared BEFORE /api/papers/{paper_id}
# FastAPI matches routes in order — if {paper_id} comes first, 'export' gets swallowed as a paper_id.
@app.get("/api/papers/export")
def export_comparison_matrix(
    paper_ids: Optional[List[str]] = Query(None),
    format_type: str = Query("csv"),
    db: Session = Depends(get_db)
):
    """
    Exports paper metadata & structured comparison data as downloadable CSV.
    """
    all_papers = DatabaseService.list_papers(db)
    if paper_ids:
        papers = [p for p in all_papers if p.id in paper_ids and (p.status.value == "done" or p.status == "done")]
    else:
        papers = [p for p in all_papers if (p.status.value == "done" or p.status == "done")]

    if format_type.lower() == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "arXiv ID", "Title", "Primary Task", "Backbone Models", 
            "Datasets Used", "Benchmark Metrics", "Limitations", "Future Work", "Notes", "Tags"
        ])
        for p in papers:
            sd = p.structured_data or {}
            metrics = sd.get("benchmark_metrics", {})
            metrics_str = "; ".join([f"{k}: {v}" for k, v in metrics.items()]) if isinstance(metrics, dict) else str(metrics)
            writer.writerow([
                p.arxiv_id or p.id,
                p.title,
                sd.get("primary_task", ""),
                ", ".join(sd.get("backbone_models", [])),
                ", ".join(sd.get("datasets_used", [])),
                metrics_str,
                "; ".join(sd.get("limitations", [])),
                "; ".join(sd.get("future_work", [])),
                p.notes or "",
                ", ".join(p.tags or [])
            ])
        csv_content = output.getvalue()
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=research_comparison_matrix.csv"}
        )
    
    return {"papers": [p.structured_data for p in papers]}

@app.get("/api/papers/{paper_id}")
def get_paper_details(paper_id: str, db: Session = Depends(get_db)):
    paper = DatabaseService.get_paper_by_id(db, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    
    paragraphs = DatabaseService.get_paragraphs_by_paper(db, paper_id)
    return {
        "paper": {
            "id": paper.id,
            "arxiv_id": paper.arxiv_id,
            "title": paper.title,
            "authors": paper.authors,
            "pdf_url": paper.pdf_url,
            "summary": paper.summary,
            "status": paper.status,
            "failure_reason": paper.failure_reason,
            "extraction_parser": paper.extraction_parser,
            "structured_data": paper.structured_data,
            "notes": paper.notes,
            "tags": paper.tags
        },
        "paragraphs": [
            {
                "id": p.id,
                "page_number": p.page_number,
                "paragraph_id": p.paragraph_id,
                "text": p.text
            }
            for p in paragraphs
        ]
    }

@app.delete("/api/papers/{paper_id}")
def delete_paper(paper_id: str, db: Session = Depends(get_db)):
    """
    Remove a paper and all its indexed paragraphs from the knowledge base.
    """
    success = DatabaseService.delete_paper(db, paper_id)
    if not success:
        raise HTTPException(status_code=404, detail="Paper not found")
    return {"message": "Paper deleted successfully.", "paper_id": paper_id}

@app.post("/api/chat")
async def chat_with_agent(
    query: str,
    paper_ids: Optional[List[str]] = Query(None)
):
    """
    Interactive Chat Q&A with LangGraph agent orchestrator & citation anchors.
    """
    state = await ResearchOrchestrator.run(query=query, paper_ids=paper_ids)
    return {
        "intent": state.intent,
        "response": state.final_response,
        "citations": state.citations,
        "step_logs": state.step_logs,
        "comparison_data": state.comparison_data,
        "literature_review": state.literature_review
    }

@app.get("/api/citations/export")
def export_citations(
    paper_ids: List[str] = Query(...),
    format_type: str = Query("bibtex"), # "bibtex" | "apa" | "ieee" | "mla"
    db: Session = Depends(get_db)
):
    """
    Exports citations in BibTeX, APA, IEEE, or MLA formats.
    """
    result = []
    for pid in paper_ids:
        paper = DatabaseService.get_paper_by_id(db, pid)
        if not paper:
            continue
        
        authors_str = ", ".join(paper.authors) if paper.authors else "Unknown Authors"
        year = paper.published_date.split("-")[0] if paper.published_date else "2026"
        
        if format_type == "bibtex":
            if paper.structured_data and paper.structured_data.get("bibtex"):
                result.append(paper.structured_data["bibtex"])
            else:
                key = paper.arxiv_id or paper.id
                result.append(f"@article{{{key},\n  author={{{authors_str}}},\n  title={{{paper.title}}},\n  journal={{arXiv preprint}},\n  year={{{year}}}\n}}")
        elif format_type == "apa":
            result.append(f"{authors_str} ({year}). {paper.title}. arXiv preprint arXiv:{paper.arxiv_id or ''}.")
        elif format_type == "ieee":
            result.append(f"{authors_str}, \"{paper.title},\" arXiv preprint arXiv:{paper.arxiv_id or ''}, {year}.")
        elif format_type == "mla":
            result.append(f"{authors_str}. \"{paper.title}.\" arXiv preprint ({year}).")

    return {
        "format": format_type,
        "content": "\n\n".join(result)
    }

class NotesUpdate(BaseModel):
    notes: Optional[str] = None
    tags: Optional[List[str]] = None

@app.patch("/api/papers/{paper_id}/notes")
def update_paper_notes(paper_id: str, body: NotesUpdate, db: Session = Depends(get_db)):
    """
    Update personal researcher notes and tags for a paper.
    """
    paper = DatabaseService.update_paper_notes(db, paper_id, notes=body.notes, tags=body.tags)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    return {"message": "Paper notes updated", "paper_id": paper_id, "notes": paper.notes, "tags": paper.tags}

@app.get("/api/gaps")
async def analyze_research_gaps(paper_ids: Optional[List[str]] = Query(None)):
    """
    Analyze open research gaps, common limitations, and novel project ideas across ingested papers.
    """
    result = await GapFinderAgent.analyze_gaps(paper_ids=paper_ids)
    return result

@app.get("/api/timeline")
def get_research_timeline(
    paper_ids: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Returns chronological paper evolution milestones, taxonomy progression, and citation links.
    """
    return TimelineService.build_timeline(db, paper_ids=paper_ids)

@app.get("/api/papers/{paper_id}/figures")
def get_paper_figures(paper_id: str, db: Session = Depends(get_db)):
    """
    Extracts & returns figure diagram image URLs and captions for a paper.
    """
    paper = DatabaseService.get_paper_by_id(db, paper_id)
    if not paper or not paper.local_pdf_path:
        raise HTTPException(status_code=404, detail="Paper PDF not found")
    
    figures = HybridPDFParser.extract_figures(paper.local_pdf_path, paper_id)
    return {"paper_id": paper_id, "figure_count": len(figures), "figures": figures}

class DigestWebhookRequest(BaseModel):
    topic: str
    max_results: int = 5

@app.post("/api/webhooks/arxiv-digest")
async def trigger_arxiv_digest_webhook(
    req: DigestWebhookRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    n8n Webhook Endpoint: Discovers & auto-ingests top research papers for a topic.
    """
    try:
        results = await ArxivClient.search(query=req.topic, max_results=req.max_results)
        ingested = []
        for r in results:
            existing = DatabaseService.get_paper_by_arxiv_id(db, r.arxiv_id)
            if not existing:
                paper_data = PaperMetadata(
                    id=f"paper_{uuid.uuid4().hex[:8]}",
                    arxiv_id=r.arxiv_id,
                    title=r.title,
                    authors=r.authors,
                    published_date=r.published_date,
                    pdf_url=r.pdf_url,
                    summary=r.summary,
                    status=PaperStatus.QUEUED
                )
                DatabaseService.create_paper(db, paper_data)
                background_tasks.add_task(IngestionPipeline.run_pipeline, paper_data.id)
                ingested.append(r.title)
        
        return {
            "status": "success",
            "topic": req.topic,
            "discovered_count": len(results),
            "ingested_titles": ingested
        }
    except Exception as e:
        logger.error(f"Digest webhook error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/digest/summary")
async def get_digest_summary(db: Session = Depends(get_db)):
    """
    n8n Summary Digest Endpoint: Returns formatted recent paper summaries & gap analysis payload.
    """
    papers = DatabaseService.list_papers(db, limit=10)
    gaps = await GapFinderAgent.analyze_gaps()
    return {
        "digest_title": "AI Research OS — Weekly Intelligence Digest",
        "timestamp": uuid.uuid4().hex[:8],
        "total_library_papers": len(papers),
        "recent_papers": [
            {
                "title": p.title,
                "arxiv_id": p.arxiv_id,
                "task": (p.structured_data or {}).get("primary_task", "N/A"),
                "summary": p.summary
            }
            for p in papers[:5]
        ],
        "research_gaps_report": gaps.get("gaps_markdown", "")
    }
