import logging
import asyncio
from pathlib import Path
from typing import Optional
from sqlalchemy.orm import Session
from app.config import settings
from app.models.paper import PaperStatus, PaperMetadata, StructuredPaperExtraction
from app.services.db import DatabaseService, SessionLocal
from app.services.arxiv_client import ArxivClient
from app.services.pdf_parser import HybridPDFParser
from app.services.extractor import PaperExtractor
from app.services.vector_store import vector_store

logger = logging.getLogger("ai_research_os.ingestion")

class IngestionPipeline:
    """
    Asynchronous Paper Ingestion Pipeline:
    queued -> downloading -> parsing -> extracting -> embedding -> done / failed
    """

    @staticmethod
    async def process_paper_async(paper_id: str, arxiv_id: Optional[str] = None, pdf_url: Optional[str] = None):
        db: Session = SessionLocal()
        try:
            paper = DatabaseService.get_paper_by_id(db, paper_id)
            if not paper:
                logger.error(f"Paper ID {paper_id} not found in database.")
                return

            # Step 1: Downloading
            DatabaseService.update_paper_status(db, paper_id, PaperStatus.DOWNLOADING)
            local_pdf_path = paper.local_pdf_path

            if not local_pdf_path or not Path(local_pdf_path).exists():
                if arxiv_id and pdf_url:
                    downloaded_path = await ArxivClient.download_pdf(pdf_url, arxiv_id)
                    local_pdf_path = str(downloaded_path)
                    paper.local_pdf_path = local_pdf_path
                    db.commit()
                else:
                    raise ValueError("No local PDF path or valid PDF URL provided for download.")

            # Step 2: Parsing (Hybrid pdfplumber + Docling fallback)
            DatabaseService.update_paper_status(db, paper_id, PaperStatus.PARSING)
            paragraphs, parser_used = HybridPDFParser.parse_pdf(local_pdf_path, paper_id)

            if not paragraphs:
                raise ValueError("PDF parsing yielded 0 text paragraphs.")

            DatabaseService.save_paragraphs(db, paragraphs)
            DatabaseService.update_paper_status(
                db,
                paper_id,
                PaperStatus.EXTRACTING,
                extraction_parser=parser_used,
                paragraph_count=len(paragraphs)
            )

            # Step 3: Structured Information Extraction via LLM (Bulk workload -> Ollama)
            extracted_data: StructuredPaperExtraction = await PaperExtractor.extract_structured_data(
                title=paper.title,
                abstract=paper.summary or "",
                paragraphs=paragraphs,
                arxiv_id=arxiv_id
            )

            DatabaseService.update_paper_status(
                db,
                paper_id,
                PaperStatus.EMBEDDING,
                structured_data=extracted_data
            )

            # Step 4: Vector Store Embedding (Qdrant)
            vector_store.upsert_paragraphs(paragraphs)

            # Step 5: Mark Done
            DatabaseService.update_paper_status(db, paper_id, PaperStatus.DONE)
            logger.info(f"Successfully finished ingestion pipeline for paper {paper_id} ({paper.title}).")

        except Exception as e:
            logger.error(f"Ingestion pipeline failed for paper {paper_id}: {e}", exc_info=True)
            DatabaseService.update_paper_status(
                db,
                paper_id,
                PaperStatus.FAILED,
                failure_reason=str(e)
            )
        finally:
            db.close()
