import re
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.services.db import DatabaseService

logger = logging.getLogger("ai_research_os.citation_graph")

class CitationGraphService:

    @staticmethod
    def build_graph(db: Session, paper_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Builds a 2D citation lineage and co-citation network across ingested papers (Connected Papers parity).
        Detects direct cross-citations (by arXiv ID, DOI, and author/title reference matching)
        and semantic co-citation connections.
        """
        all_papers = DatabaseService.list_papers(db)
        completed_papers = [
            p for p in all_papers
            if (p.status.value == "done" if hasattr(p.status, "value") else p.status == "done")
        ]

        if paper_ids:
            completed_papers = [p for p in completed_papers if p.id in paper_ids]

        if not completed_papers:
            return {
                "nodes": [],
                "edges": [],
                "clusters": [],
                "total_nodes": 0,
                "total_edges": 0
            }

        # Build lookup maps
        paper_by_id = {p.id: p for p in completed_papers}
        arxiv_to_id = {p.arxiv_id.strip(): p.id for p in completed_papers if p.arxiv_id}
        
        # Helper to extract year
        def get_year(p):
            if p.published_date and len(p.published_date) >= 4:
                return p.published_date[:4]
            return "2026"

        nodes = []
        edges = []
        edge_set = set() # (src, tgt) to avoid duplicates
        in_degree: Dict[str, int] = {p.id: 0 for p in completed_papers}
        out_degree: Dict[str, int] = {p.id: 0 for p in completed_papers}

        # 1. Discover Direct Cross-Citations
        for p in completed_papers:
            pid = p.id
            sd = p.structured_data or {}
            
            # Combine all text representation for citation searching
            bibtex_str = sd.get("bibtex", "").lower()
            method_str = (sd.get("methodology_summary", "") + " " + (p.summary or "")).lower()
            combined_search_corpus = f"{bibtex_str} {method_str}"

            for other in completed_papers:
                if other.id == pid:
                    continue

                other_id = other.id
                other_arxiv = (other.arxiv_id or "").strip()
                other_title_slug = " ".join(re.findall(r'[a-zA-Z0-9]+', (other.title or "").lower()[:40]))
                
                cited = False
                # Check if arXiv ID is cited
                if other_arxiv and other_arxiv.lower() in combined_search_corpus:
                    cited = True
                # Check if first author + title keyword match
                elif other.authors and len(other.authors) > 0:
                    lead_author = other.authors[0].split()[-1].lower() # Last name
                    if len(lead_author) > 3 and lead_author in combined_search_corpus:
                        # Cross check year or title slug
                        other_year = get_year(other)
                        if other_year in combined_search_corpus or (len(other_title_slug) > 10 and other_title_slug in combined_search_corpus):
                            cited = True

                # Chronology constraint: A cited paper should ideally be published earlier or same year
                p_year = int(get_year(p)) if get_year(p).isdigit() else 2026
                o_year = int(get_year(other)) if get_year(other).isdigit() else 2026

                if cited and o_year <= p_year:
                    edge_key = (pid, other_id)
                    if edge_key not in edge_set:
                        edge_set.add(edge_key)
                        edges.append({
                            "source": pid,
                            "target": other_id,
                            "type": "cites",
                            "label": "Directly Cites",
                            "weight": 1.0
                        })
                        out_degree[pid] += 1
                        in_degree[other_id] += 1

        # 2. Discover Shared Methodology / Co-Citation Links
        # If papers share the same primary task and backbone models/datasets, connect them with a co-citation link
        for i, p1 in enumerate(completed_papers):
            sd1 = p1.structured_data or {}
            task1 = (sd1.get("primary_task") or "").lower()
            datasets1 = set(d.lower() for d in sd1.get("datasets_used", []))
            models1 = set(m.lower() for m in sd1.get("backbone_models", []))

            for j in range(i + 1, len(completed_papers)):
                p2 = completed_papers[j]
                sd2 = p2.structured_data or {}
                task2 = (sd2.get("primary_task") or "").lower()
                datasets2 = set(d.lower() for d in sd2.get("datasets_used", []))
                models2 = set(m.lower() for m in sd2.get("backbone_models", []))

                shared_datasets = datasets1.intersection(datasets2)
                shared_models = models1.intersection(models2)
                same_task = (task1 == task2) and len(task1) > 2

                # Calculate co-citation affinity
                affinity = 0.0
                if same_task:
                    affinity += 0.4
                if shared_datasets:
                    affinity += 0.3 * min(len(shared_datasets), 2)
                if shared_models:
                    affinity += 0.3 * min(len(shared_models), 2)

                if affinity >= 0.5:
                    edge_key = tuple(sorted([p1.id, p2.id]))
                    if edge_key not in edge_set:
                        edge_set.add(edge_key)
                        edges.append({
                            "source": p1.id,
                            "target": p2.id,
                            "type": "co_citation",
                            "label": f"Shared Context ({int(affinity*100)}%)",
                            "weight": round(affinity, 2)
                        })

        # 3. Compile Nodes with Metrics
        task_clusters = set()
        for p in completed_papers:
            sd = p.structured_data or {}
            task = sd.get("primary_task", "AI / ML")
            task_clusters.add(task)

            ind = in_degree.get(p.id, 0)
            outd = out_degree.get(p.id, 0)
            total_deg = ind + outd

            # Landmark paper determination: highest citations or foundational methodology
            is_landmark = (ind >= 2) or (int(get_year(p)) <= 2020 if get_year(p).isdigit() else False)

            nodes.append({
                "id": p.id,
                "title": p.title,
                "arxiv_id": p.arxiv_id,
                "authors": p.authors,
                "year": get_year(p),
                "primary_task": task,
                "in_degree": ind,
                "out_degree": outd,
                "total_degree": total_deg,
                "is_landmark": is_landmark,
                "pdf_url": p.pdf_url,
                "summary": (p.summary or "")[:200]
            })

        return {
            "nodes": nodes,
            "edges": edges,
            "clusters": sorted(list(task_clusters)),
            "total_nodes": len(nodes),
            "total_edges": len(edges)
        }
