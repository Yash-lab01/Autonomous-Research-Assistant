import io
import re
import zipfile
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.services.db import DatabaseService

logger = logging.getLogger("ai_research_os.latex_exporter")

class LaTeXExporter:

    @staticmethod
    def escape_latex(text: str) -> str:
        """Escapes special LaTeX characters in plain text strings."""
        if not text:
            return ""
        # Don't escape if already contains latex commands
        if "\\" in text and any(cmd in text for cmd in ["\\textbf", "\\cite", "\\begin", "\\item"]):
            return text
        
        replacements = [
            ("&", "\\&"),
            ("%", "\\%"),
            ("$", "\\$"),
            ("#", "\\#"),
            ("_", "\\_"),
            ("{", "\\{"),
            ("}", "\\}"),
            ("~", "\\textasciitilde{}"),
            ("^", "\\textasciicircum{}"),
        ]
        res = text
        for orig, rep in replacements:
            res = res.replace(orig, rep)
        return res

    @staticmethod
    def markdown_to_latex_body(md_text: str, bib_keys: Dict[str, str]) -> str:
        """
        Converts Markdown headers, bolding, lists, and citations into clean LaTeX syntax.
        """
        if not md_text:
            return "\\section{Overview}\nNo literature review text provided.\n"

        lines = md_text.split("\n")
        latex_lines = []
        in_list = False

        for line in lines:
            stripped = line.strip()

            # Heading 1 or 2 -> \section
            if stripped.startswith("## "):
                if in_list:
                    latex_lines.append("\\end{itemize}")
                    in_list = False
                sec_title = stripped[3:].strip()
                latex_lines.append(f"\n\\section{{{LaTeXExporter.escape_latex(sec_title)}}}")
                continue

            # Heading 3 -> \subsection
            if stripped.startswith("### "):
                if in_list:
                    latex_lines.append("\\end{itemize}")
                    in_list = False
                subsec_title = stripped[4:].strip()
                latex_lines.append(f"\n\\subsection{{{LaTeXExporter.escape_latex(subsec_title)}}}")
                continue

            # Bullet points
            if stripped.startswith("- ") or stripped.startswith("* "):
                if not in_list:
                    latex_lines.append("\\begin{itemize}")
                    in_list = True
                item_content = stripped[2:].strip()
                # Replace markdown bold
                item_content = re.sub(r'\*\*([^*]+)\*\*', r'\\textbf{\1}', item_content)
                latex_lines.append(f"  \\item {item_content}")
                continue

            # Blank line
            if not stripped:
                if in_list:
                    latex_lines.append("\\end{itemize}")
                    in_list = False
                latex_lines.append("")
                continue

            # Regular paragraph line
            if in_list:
                latex_lines.append("\\end{itemize}")
                in_list = False

            # Convert markdown bold **bold** -> \textbf{bold}
            processed = re.sub(r'\*\*([^*]+)\*\*', r'\\textbf{\1}', line)
            # Convert markdown italics *italic* -> \textit{italic}
            processed = re.sub(r'\*([^*]+)\*', r'\\textit{\1}', processed)

            # Convert bracketed citation tags [1], [2] or (Vaswani et al.)
            # If citations refer to indexed papers, link to bib_keys
            for name, key in bib_keys.items():
                if name.lower() in processed.lower():
                    # Substitute first occurrence with \cite{key}
                    processed = re.sub(re.escape(name), f"{name} \\cite{{{key}}}", processed, count=1, flags=re.IGNORECASE)

            latex_lines.append(processed)

        if in_list:
            latex_lines.append("\\end{itemize}")

        return "\n".join(latex_lines)

    @staticmethod
    def generate_survey_bundle(
        db: Session,
        paper_ids: List[str],
        topic: Optional[str] = None,
        review_text: Optional[str] = None,
        format_style: str = "ieee"
    ) -> Dict[str, Any]:
        """
        Generates standard academic LaTeX document (`main.tex`), `references.bib`,
        and packages them into a compilable ZIP archive.
        """
        all_papers = DatabaseService.list_papers(db)
        selected_papers = [p for p in all_papers if p.id in paper_ids]

        # Generate BibTeX keys and .bib content
        bib_entries = []
        bib_keys: Dict[str, str] = {}

        for idx, p in enumerate(selected_papers, start=1):
            sd = p.structured_data or {}
            lead_author = "author"
            if p.authors and len(p.authors) > 0:
                lead_author = re.sub(r'[^a-zA-Z]', '', p.authors[0].split()[-1].lower())
            
            year = "2026"
            if p.published_date and len(p.published_date) >= 4:
                year = p.published_date[:4]

            key = f"{lead_author}{year}_{idx}"
            bib_keys[p.title[:30]] = key
            if p.arxiv_id:
                bib_keys[p.arxiv_id] = key

            # Check if structured_data has existing bibtex
            raw_bib = sd.get("bibtex", "")
            if raw_bib and raw_bib.strip().startswith("@"):
                # Ensure the key matches our standard citation key
                fixed_bib = re.sub(r'@\w+\{([^,]+),', f'@article{{{key},', raw_bib, count=1)
                bib_entries.append(fixed_bib)
            else:
                authors_str = " and ".join(p.authors) if p.authors else "Unknown Authors"
                entry = f"""@article{{{key},
  author    = {{{authors_str}}},
  title     = {{{p.title}}},
  journal   = {{arXiv preprint arXiv:{p.arxiv_id or 'ext'}}},
  year      = {{{year}}}
}}"""
                bib_entries.append(entry)

        references_bib = "\n\n".join(bib_entries)

        # Build main.tex
        survey_title = topic or "Literature Survey & Systematic Comparative Analysis"
        latex_body = LaTeXExporter.markdown_to_latex_body(review_text or "", bib_keys)

        if format_style == "ieee":
            doc_header = r"""\documentclass[10pt,journal,compsoc]{IEEEtran}
\usepackage{cite}
\usepackage{amsmath,amssymb,amsfonts}
\usepackage{graphicx}
\usepackage{textcomp}
\usepackage{xcolor}
\usepackage{booktabs}
\usepackage{hyperref}

\begin{document}

\title{""" + LaTeXExporter.escape_latex(survey_title) + r"""}

\author{Autonomous Research Agent System\\
\IEEEauthorblockA{Generated from Indexed Academic Literature}
}

\maketitle

\begin{abstract}
This systematic literature review provides a structured synthesis, taxonomy breakdown, and comparative evaluation of recent advancements in """ + LaTeXExporter.escape_latex(survey_title) + r""". Across """ + str(len(selected_papers)) + r""" core foundational studies, we examine primary architectures, empirical benchmark metrics, and open research challenges.
\end{abstract}

\begin{IEEEkeywords}
Artificial Intelligence, Machine Learning, Systematic Survey, Comparative Taxonomy, Benchmark Evaluation.
\end{IEEEkeywords}
"""
            doc_footer = r"""
\bibliographystyle{IEEEtran}
\bibliography{references}

\end{document}
"""
        else:
            doc_header = r"""\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage{amsmath,amssymb}
\usepackage{booktabs}
\usepackage{cite}
\usepackage{graphicx}
\usepackage{hyperref}
\usepackage[margin=1in]{geometry}

\title{\textbf{""" + LaTeXExporter.escape_latex(survey_title) + r"""}}
\author{\textbf{Autonomous AI Research Assistant}}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
This survey paper presents a rigorous synthesis of """ + str(len(selected_papers)) + r""" recent publications on """ + LaTeXExporter.escape_latex(survey_title) + r""".
\end{abstract}
"""
            doc_footer = r"""
\bibliographystyle{plain}
\bibliography{references}

\end{document}
"""

        main_tex = doc_header + "\n" + latex_body + "\n" + doc_footer

        # Create in-memory ZIP bundle
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("main.tex", main_tex)
            zf.writestr("references.bib", references_bib)
            zf.writestr("README.md", f"# {survey_title}\nGenerated by Autonomous AI Research Agent.\nCompile with: `pdflatex main && bibtex main && pdflatex main && pdflatex main`\n")
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.getvalue()

        return {
            "title": survey_title,
            "main_tex": main_tex,
            "references_bib": references_bib,
            "zip_bytes": zip_bytes,
            "paper_count": len(selected_papers),
            "bib_keys": bib_keys
        }
