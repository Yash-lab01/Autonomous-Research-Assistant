import re
import logging
from pathlib import Path
from typing import List, Tuple, Optional
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

# Academic Section Heading Patterns (Arabic or Roman numerals, or plain words)
SECTION_PATTERNS = [
    (re.compile(r'^(?:abstract)\b', re.IGNORECASE), "abstract"),
    (re.compile(r'^(?:[0-9IVXLCDM]+\.?\s*)?(?:introduction|overview|background\s+and\s+overview)\b', re.IGNORECASE), "introduction"),
    (re.compile(r'^(?:[0-9IVXLCDM]+\.?\s*)?(?:related\s+work|background|literature\s+review|prior\s+work)\b', re.IGNORECASE), "related_work"),
    (re.compile(r'^(?:[0-9IVXLCDM]+\.?\s*)?(?:(?:proposed|our|the)\s+)?(?:methodology|methods|method|approach|architecture|framework|model|system|pipeline)\b', re.IGNORECASE), "methodology"),
    (re.compile(r'^(?:[0-9IVXLCDM]+\.?\s*)?(?:experiments|experimental\s+setup|evaluation|results|findings|empirical\s+analysis|benchmarks)\b', re.IGNORECASE), "results"),
    (re.compile(r'^(?:[0-9IVXLCDM]+\.?\s*)?(?:discussion|ablation|ablations|analysis|case\s+study)\b', re.IGNORECASE), "discussion"),
    (re.compile(r'^(?:[0-9IVXLCDM]+\.?\s*)?(?:limitations|broader\s+impacts?|ethical\s+considerations?)\b', re.IGNORECASE), "limitations"),
    (re.compile(r'^(?:[0-9IVXLCDM]+\.?\s*)?(?:conclusions?|concluding\s+remarks|summary)\b', re.IGNORECASE), "conclusion"),
    (re.compile(r'^(?:[0-9IVXLCDM]+\.?\s*)?(?:references|bibliography)\b', re.IGNORECASE), "references"),
    (re.compile(r'^(?:(?:[0-9a-zIVXLCDM]+\.?\s*)?(?:appendix|supplementary(?:\s+material)?)|appendix\s+[a-z0-9]+)\b', re.IGNORECASE), "appendix"),
]

class HybridPDFParser:
    """
    Two-Stage Hybrid PDF Parser:
    - Stage 1 (Fast Path): pdfplumber for rapid text, table & paragraph extraction.
      Tables are converted to Markdown and tagged [TABLE]. Math-heavy paragraphs tagged [MATH].
    - Stage 2 (Docling Fallback): Layout-aware parsing for multi-column / complex PDFs.
    """

    @staticmethod
    def detect_section_header(line: str) -> Optional[str]:
        """Identifies if a text line corresponds to a standard academic paper section header."""
        clean = line.strip().strip('#*').strip()
        if not clean or len(clean) > 80:
            return None
        for pattern, section_name in SECTION_PATTERNS:
            if pattern.search(clean):
                return section_name
        return None

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
        active_section = "general"

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
                        lines = [line.strip() for line in p_text.split("\n") if line.strip()]
                        if lines:
                            detected = HybridPDFParser.detect_section_header(lines[0])
                            if detected:
                                active_section = detected
                                if len(lines) == 1:
                                    # Header on its own line: section state updated, skip empty paragraph
                                    continue
                                p_body = " ".join(lines[1:])
                            else:
                                p_body = " ".join(lines)
                        else:
                            p_body = p_text

                        clean_text = " ".join(p_body.split())
                        if len(clean_text) > 30:
                            # Tag math-heavy paragraphs so LLMs & renderer handle them specially
                            prefix = "[MATH] " if HybridPDFParser._is_math_heavy(clean_text) else ""
                            chunk = ParagraphChunk(
                                id=f"{paper_id}_p{page_idx}_g{current_paragraph_id}",
                                paper_id=paper_id,
                                page_number=page_idx,
                                paragraph_id=current_paragraph_id,
                                text=f"{prefix}{clean_text}",
                                section_name=active_section
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
            active_section = "general"

            for node, level in doc.iterate_items():
                if hasattr(node, "text") and node.text:
                    raw = node.text.strip()
                    detected = HybridPDFParser.detect_section_header(raw)
                    if detected:
                        active_section = detected
                        if len(raw) < 40:
                            continue

                    if len(raw) > 30:
                        page_no = getattr(node, "prov", [None])[0].page_no if getattr(node, "prov", None) else 1
                        clean_text = " ".join(raw.split())
                        prefix = "[MATH] " if HybridPDFParser._is_math_heavy(clean_text) else ""
                        chunk = ParagraphChunk(
                            id=f"{paper_id}_p{page_no}_g{paragraph_id}",
                            paper_id=paper_id,
                            page_number=page_no,
                            paragraph_id=paragraph_id,
                            text=f"{prefix}{clean_text}",
                            section_name=active_section
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

    @staticmethod
    def extract_tables_structured(pdf_path: str, paper_id: str) -> List[dict]:
        """
        Extracts structured tables with headers and row arrays from a PDF.
        Returns a list of table dictionaries ready for DataFrame inspection & CSV export.
        """
        tables_res: List[dict] = []
        pdf_file = Path(pdf_path)
        if not pdf_file.exists():
            return tables_res

        try:
            with pdfplumber.open(pdf_path) as pdf:
                tbl_idx = 1
                for page_idx, page in enumerate(pdf.pages, start=1):
                    raw_tables = page.extract_tables() or []
                    for t_data in raw_tables:
                        if not t_data or len(t_data) < 2:
                            continue

                        def clean_cell(c):
                            return str(c).replace("\n", " ").strip() if c is not None else ""

                        clean_rows = [[clean_cell(c) for c in row] for row in t_data if any(row)]
                        if not clean_rows or len(clean_rows) < 2:
                            continue

                        headers = clean_rows[0]
                        rows = clean_rows[1:]
                        md = HybridPDFParser._table_to_markdown(clean_rows)

                        # Exclude degenerate tables (must have at least 2 columns and 1 row)
                        if len(headers) >= 2 and len(rows) >= 1:
                            tables_res.append({
                                "table_id": f"{paper_id}_tbl_p{page_idx}_{tbl_idx}",
                                "paper_id": paper_id,
                                "page_number": page_idx,
                                "headers": headers,
                                "rows": rows,
                                "markdown": md,
                                "caption": f"Table on Page {page_idx} ({len(headers)} cols × {len(rows)} rows)"
                            })
                            tbl_idx += 1
                            if len(tables_res) >= 15:
                                break
                    if len(tables_res) >= 15:
                        break
        except Exception as e:
            logger.error(f"Error extracting structured tables from {pdf_path}: {e}")

        return tables_res

