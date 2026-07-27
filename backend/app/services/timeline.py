import logging
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.services.db import DatabaseService, SessionLocal

logger = logging.getLogger("ai_research_os.timeline")

class TimelineService:

    @staticmethod
    def build_timeline(db: Session, paper_ids: List[str] = None) -> Dict[str, Any]:
        """
        Builds a chronological research evolution timeline across ingested papers.
        """
        all_papers = DatabaseService.list_papers(db)
        completed_papers = [p for p in all_papers if p.status.value == "done" or p.status == "done"]

        if paper_ids:
            completed_papers = [p for p in completed_papers if p.id in paper_ids]

        if not completed_papers:
            return {
                "milestones": [],
                "evolution_summary": "No completed papers in library to build timeline.",
                "total_papers": 0
            }

        # Helper to get year string
        def extract_year(p):
            if p.published_date and len(p.published_date) >= 4:
                return p.published_date[:4]
            return "2026"

        # Sort papers chronologically (oldest to newest)
        sorted_papers = sorted(completed_papers, key=lambda p: (extract_year(p), p.published_date or ""))

        # Group by year
        year_groups: Dict[str, List[Dict[str, Any]]] = {}
        all_tasks = set()
        all_models = set()
        all_datasets = set()

        for p in sorted_papers:
            year = extract_year(p)
            sd = p.structured_data or {}
            
            task = sd.get("primary_task", "General AI")
            models = sd.get("backbone_models", [])
            datasets = sd.get("datasets_used", [])
            metrics = sd.get("benchmark_metrics", {})
            method = sd.get("methodology_summary", p.summary or "")

            if task:
                all_tasks.add(task)
            for m in models:
                all_models.add(m)
            for d in datasets:
                all_datasets.add(d)

            item = {
                "id": p.id,
                "arxiv_id": p.arxiv_id,
                "title": p.title,
                "authors": p.authors,
                "published_date": p.published_date or year,
                "year": year,
                "primary_task": task,
                "methodology_summary": method,
                "backbone_models": models,
                "datasets_used": datasets,
                "benchmark_metrics": metrics,
                "pdf_url": p.pdf_url,
                "notes": p.notes,
                "tags": p.tags
            }

            if year not in year_groups:
                year_groups[year] = []
            year_groups[year].append(item)

        # Build chronological milestones
        milestones = []
        for year in sorted(year_groups.keys()):
            milestones.append({
                "year": year,
                "papers": year_groups[year],
                "paper_count": len(year_groups[year])
            })

        return {
            "milestones": milestones,
            "total_papers": len(sorted_papers),
            "taxonomies": {
                "unique_tasks": list(all_tasks),
                "unique_models": list(all_models),
                "unique_datasets": list(all_datasets)
            }
        }
