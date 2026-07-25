import uuid
import logging
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, BackgroundTasks, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.services.db import init_db, get_db, DatabaseService
from app.models.paper import (
    PaperMetadata, PaperStatus, PaperSearchQuery, PaperSearchResult,
    StructuredPaperExtraction, ComparisonMatrix, LiteratureReviewDraft
)
from app.services.arxiv_client import ArxivClient, ArxivRateLimitError
from app.services.ingestion import IngestionPipeline
from app.agents.graph import ResearchOrchestrator

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
    Search arXiv for research papers with rate-limiting & etiquette.
    """
    try:
        results = await ArxivClient.search(query=req.query, max_results=req.max_results)
        
        # Mark already_ingested flags
        for r in results:
            existing = DatabaseService.get_paper_by_arxiv_id(db, r.arxiv_id)
            if existing and existing.status == PaperStatus.DONE:
                r.already_ingested = True
        return results
    except ArxivRateLimitError as e:
        logger.warning(f"arXiv rate limit hit for query '{req.query}': {e}")
        raise HTTPException(
            status_code=429,
            detail=str(e)
        )
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
            "status": p.status,
            "failure_reason": p.failure_reason,
            "extraction_parser": p.extraction_parser,
            "paragraph_count": p.paragraph_count,
            "structured_data": p.structured_data,
            "created_at": p.created_at
        }
        for p in papers
    ]

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
            "structured_data": paper.structured_data
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
