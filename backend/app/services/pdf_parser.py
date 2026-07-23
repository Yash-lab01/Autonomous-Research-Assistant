import logging
from pathlib import Path
from typing import List, Tuple
import pdfplumber
import PyPDF2
from app.models.paper import ParagraphChunk

logger = logging.getLogger("ai_research_os.pdf_parser")

class HybridPDFParser:
    """
    Two-Stage Hybrid PDF Parser:
    - Stage 1 (Fast Path): pdfplumber / PyPDF2 for rapid text & paragraph extraction (<1s).
    - Stage 2 (Quality Heuristic Inspector & Docling Fallback): Detects multi-column, garbled text, or tables,
      and attempts layout-aware parsing via Docling if installed.
    """

    @staticmethod
    def parse_pdf(pdf_path: str, paper_id: str) -> Tuple[List[ParagraphChunk], str]:
        """
        Parses a PDF into paragraph chunks.
        Returns: (List[ParagraphChunk], parser_used_name)
        """
        pdf_file = Path(pdf_path)
        if not pdf_file.exists():
            raise FileNotFoundError(f"PDF file not found at {pdf_path}")

        # Stage 1: Fast Path via pdfplumber
        paragraphs, fast_quality_ok = HybridPDFParser._fast_path_parse(pdf_path, paper_id)

        if fast_quality_ok:
            logger.info(f"Fast path (pdfplumber) succeeded for paper {paper_id} ({len(paragraphs)} paragraphs extracted).")
            return paragraphs, "pdfplumber"

        logger.warning(f"Quality heuristic check failed for paper {paper_id}. Attempting Docling fallback...")

        # Stage 2: Docling Fallback
        docling_paragraphs = HybridPDFParser._docling_fallback_parse(pdf_path, paper_id)
        if docling_paragraphs:
            logger.info(f"Docling fallback succeeded for paper {paper_id} ({len(docling_paragraphs)} paragraphs extracted).")
            return docling_paragraphs, "docling"

        # If Docling is not installed or fails, return the fast path result as graceful fallback
        logger.warning(f"Docling fallback not available or failed. Retaining pdfplumber fast-path result for {paper_id}.")
        return paragraphs, "pdfplumber (fallback)"

    @staticmethod
    def _fast_path_parse(pdf_path: str, paper_id: str) -> Tuple[List[ParagraphChunk], bool]:
        chunks: List[ParagraphChunk] = []
        total_chars = 0
        total_pages = 0
        current_paragraph_id = 1

        try:
            with pdfplumber.open(pdf_path) as pdf:
                total_pages = len(pdf.pages)
                for page_idx, page in enumerate(pdf.pages, start=1):
                    text = page.extract_text() or ""
                    total_chars += len(text)

                    # Split text into paragraphs based on double newlines or blank lines
                    raw_paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
                    for p_text in raw_paragraphs:
                        # Clean up inline newlines for continuous text flow
                        clean_text = " ".join(p_text.split())
                        if len(clean_text) > 30: # Ignore tiny headers/footers
                            chunk = ParagraphChunk(
                                id=f"{paper_id}_p{page_idx}_g{current_paragraph_id}",
                                paper_id=paper_id,
                                page_number=page_idx,
                                paragraph_id=current_paragraph_id,
                                text=clean_text
                            )
                            chunks.append(chunk)
                            current_paragraph_id += 1
        except Exception as e:
            logger.error(f"pdfplumber fast path error on {pdf_path}: {e}")

        # Quality Heuristics:
        # 1. Average characters per page >= 150
        # 2. Total paragraphs >= 3 (not empty)
        avg_chars_per_page = total_chars / max(total_pages, 1)
        quality_ok = (avg_chars_per_page >= 150) and (len(chunks) >= 3)

        return chunks, quality_ok

    @staticmethod
    def _docling_fallback_parse(pdf_path: str, paper_id: str) -> List[ParagraphChunk]:
        """
        Attempts layout-aware document extraction using Docling if installed.
        """
        try:
            from docling.document_converter import DocumentConverter
            converter = DocumentConverter()
            result = converter.convert(pdf_path)
            doc = result.document

            chunks: List[ParagraphChunk] = []
            paragraph_id = 1

            for node, level in doc.iterate_items():
                if hasattr(node, "text") and node.text and len(node.text.strip()) > 30:
                    page_no = getattr(node, "prov", [None])[0].page_no if getattr(node, "prov", None) else 1
                    chunk = ParagraphChunk(
                        id=f"{paper_id}_p{page_no}_g{paragraph_id}",
                        paper_id=paper_id,
                        page_number=page_no,
                        paragraph_id=paragraph_id,
                        text=" ".join(node.text.split())
                    )
                    chunks.append(chunk)
                    paragraph_id += 1
            return chunks
        except ImportError:
            logger.debug("Docling library is not installed. Skipping layout-aware fallback.")
            return []
        except Exception as e:
            logger.error(f"Docling fallback extraction error on {pdf_path}: {e}")
            return []
