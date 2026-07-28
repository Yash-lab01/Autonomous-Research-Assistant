import re
import logging
from pathlib import Path
from typing import List, Tuple
import pdfplumber
import PyPDF2
from app.models.paper import ParagraphChunk

logger = logging.getLogger("ai_research_os.pdf_parser")

# Regex to detect LaTeX math patterns
MATH_PATTERN = re.compile(
    r'(\$[^$]+\$|\\\(.*?\\\)|\\\[.*?\\\]|\\frac|\\sum|\\int|\\alpha|\\beta|\\gamma|'
    r'\\theta|\\lambda|\\mu|\\sigma|\\epsilon|\\nabla|\\partial|\\infty|\\mathbb|'
    r'\\mathbf|\\mathrm|\\text\{|\\begin\{equation|\\begin\{align)',
    re.DOTALL
)

class HybridPDFParser:
    """
    Two-Stage Hybrid PDF Parser:
    - Stage 1 (Fast Path): pdfplumber for rapid text, table & paragraph extraction.
      Tables are converted to Markdown and tagged [TABLE]. Math-heavy paragraphs tagged [MATH].
    - Stage 2 (Docling Fallback): Layout-aware parsing for multi-column / complex PDFs.
    """

    @staticmethod
    def parse_pdf(pdf_path: str, paper_id: str) -> Tuple[List[ParagraphChunk], str]:
        """
        Parses a PDF into paragraph chunks (including tables as markdown and math-tagged text).
        Returns: (List[ParagraphChunk], parser_used_name)
        """
        pdf_file = Path(pdf_path)
        if not pdf_file.exists():
            raise FileNotFoundError(f"PDF file not found at {pdf_path}")

        # Stage 1: Fast Path via pdfplumber
        paragraphs, fast_quality_ok = HybridPDFParser._fast_path_parse(pdf_path, paper_id)

        if fast_quality_ok:
            logger.info(f"Fast path (pdfplumber) succeeded for paper {paper_id} ({len(paragraphs)} chunks).")
            return paragraphs, "pdfplumber"

        logger.warning(f"Quality heuristic check failed for paper {paper_id}. Attempting Docling fallback...")

        # Stage 2: Docling Fallback
        docling_paragraphs = HybridPDFParser._docling_fallback_parse(pdf_path, paper_id)
        if docling_paragraphs:
            logger.info(f"Docling fallback succeeded for paper {paper_id} ({len(docling_paragraphs)} chunks).")
            return docling_paragraphs, "docling"

        logger.warning(f"Docling not available or failed. Using pdfplumber result for {paper_id}.")
        return paragraphs, "pdfplumber (fallback)"

    @staticmethod
    def _is_math_heavy(text: str) -> bool:
        """Returns True if the text contains significant LaTeX or math notation."""
        return bool(MATH_PATTERN.search(text))

    @staticmethod
    def _table_to_markdown(table_data: list) -> str:
        """Convert pdfplumber table (list of rows) to a Markdown table string."""
        if not table_data or not table_data[0]:
            return ""

        # Clean cells — replace None with empty string
        def clean(cell):
            if cell is None:
                return ""
            return str(cell).replace("\n", " ").strip()

        rows = [[clean(cell) for cell in row] for row in table_data if any(cell for cell in row)]
        if not rows:
            return ""

        header = rows[0]
        separator = ["-" * max(len(h), 3) for h in header]
        md_rows = [
            "| " + " | ".join(header) + " |",
            "| " + " | ".join(separator) + " |",
        ]
        for row in rows[1:]:
            # Pad/trim row to match header width
            padded = row[:len(header)] + [""] * max(0, len(header) - len(row))
            md_rows.append("| " + " | ".join(padded) + " |")

        return "\n".join(md_rows)

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

                    # ── 1. Extract Tables ──────────────────────────────────────────
                    tables = page.extract_tables() or []
                    table_bboxes = []
                    for table_data in tables:
                        md = HybridPDFParser._table_to_markdown(table_data)
                        if md and len(md) > 40:
                            # Attempt to find the table's bounding box to exclude from text
                            try:
                                ts = page.find_tables()
                                for t in ts:
                                    table_bboxes.append(t.bbox)
                            except Exception:
                                pass

                            chunk = ParagraphChunk(
                                id=f"{paper_id}_p{page_idx}_tbl{current_paragraph_id}",
                                paper_id=paper_id,
                                page_number=page_idx,
                                paragraph_id=current_paragraph_id,
                                text=f"[TABLE] {md}",
                                section_name="table"
                            )
                            chunks.append(chunk)
                            current_paragraph_id += 1

                    # ── 2. Extract Text (excluding table regions) ───────────────
                    # Crop away table bounding boxes so table text isn't double-counted
                    text_page = page
                    if table_bboxes:
                        try:
                            for bbox in table_bboxes:
                                text_page = text_page.outside_bbox(bbox)
                        except Exception:
                            text_page = page

                    text = text_page.extract_text() or ""
                    total_chars += len(text)

                    raw_paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
                    for p_text in raw_paragraphs:
                        clean_text = " ".join(p_text.split())
                        if len(clean_text) > 30:
                            # Tag math-heavy paragraphs so LLMs & renderer handle them specially
                            prefix = "[MATH] " if HybridPDFParser._is_math_heavy(clean_text) else ""
                            chunk = ParagraphChunk(
                                id=f"{paper_id}_p{page_idx}_g{current_paragraph_id}",
                                paper_id=paper_id,
                                page_number=page_idx,
                                paragraph_id=current_paragraph_id,
                                text=f"{prefix}{clean_text}",
                                section_name="math" if prefix else None
                            )
                            chunks.append(chunk)
                            current_paragraph_id += 1

        except Exception as e:
            logger.error(f"pdfplumber fast path error on {pdf_path}: {e}")

        # Quality Heuristics
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
                    clean_text = " ".join(node.text.split())
                    prefix = "[MATH] " if HybridPDFParser._is_math_heavy(clean_text) else ""
                    chunk = ParagraphChunk(
                        id=f"{paper_id}_p{page_no}_g{paragraph_id}",
                        paper_id=paper_id,
                        page_number=page_no,
                        paragraph_id=paragraph_id,
                        text=f"{prefix}{clean_text}",
                        section_name="math" if prefix else None
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

    @staticmethod
    def extract_figures(pdf_path: str, paper_id: str) -> List[dict]:
        """
        Extracts embedded figures and diagrams from PDF pages.
        Saves images to data/figures/{paper_id}/
        Returns list of figure metadata dictionaries.
        """
        from app.config import settings
        figures: List[dict] = []
        pdf_file = Path(pdf_path)
        if not pdf_file.exists():
            return figures

        output_dir = settings.FIGURES_DIR / paper_id
        output_dir.mkdir(parents=True, exist_ok=True)

        try:
            with pdfplumber.open(pdf_path) as pdf:
                fig_count = 1
                for page_idx, page in enumerate(pdf.pages, start=1):
                    images = getattr(page, "images", [])
                    if images:
                        for img_obj in images[:3]:  # Max 3 per page
                            try:
                                x0, top, x1, bottom = img_obj["x0"], img_obj["top"], img_obj["x1"], img_obj["bottom"]
                                width = x1 - x0
                                height = bottom - top
                                if width > 80 and height > 60 and width < page.width * 0.95 and height < page.height * 0.95:
                                    cropped = page.crop((x0, top, x1, bottom))
                                    fig_filename = f"fig_p{page_idx}_{fig_count}.png"
                                    fig_path = output_dir / fig_filename
                                    pil_img = cropped.to_image(resolution=150).original
                                    pil_img.save(fig_path, format="PNG")
                                    rel_url = f"/figures/{paper_id}/{fig_filename}"
                                    figures.append({
                                        "figure_id": f"{paper_id}_fig{fig_count}",
                                        "paper_id": paper_id,
                                        "page_number": page_idx,
                                        "file_path": str(fig_path),
                                        "url": rel_url,
                                        "width": int(width),
                                        "height": int(height),
                                        "caption": f"Figure on Page {page_idx} ({int(width)}×{int(height)}px)"
                                    })
                                    fig_count += 1
                                    if len(figures) >= 8:
                                        break
                            except Exception as img_err:
                                logger.debug(f"Could not crop image on page {page_idx}: {img_err}")
                    if len(figures) >= 8:
                        break
        except Exception as e:
            logger.error(f"Error extracting figures for paper {paper_id}: {e}")

        return figures
