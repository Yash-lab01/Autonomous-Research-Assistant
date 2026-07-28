import asyncio
import logging
import time
import httpx
import arxiv
from pathlib import Path
from typing import List, Optional
from app.config import settings
from app.models.paper import PaperSearchResult

logger = logging.getLogger("ai_research_os.arxiv_client")

class ArxivRateLimitError(Exception):
    """Raised when arXiv returns 429 or 503 — caller should surface this as HTTP 429."""
    pass

class ArxivClient:
    """
    Client for searching arXiv and fetching PDF binaries with API etiquette & custom User-Agent.
    The synchronous arxiv library is run via run_in_executor to never block the async event loop.
    """

    _last_request_time: float = 0.0

    @classmethod
    async def _enforce_rate_limit(cls):
        now = time.time()
        elapsed = now - cls._last_request_time
        if elapsed < settings.ARXIV_REQUEST_DELAY_SECONDS:
            await asyncio.sleep(settings.ARXIV_REQUEST_DELAY_SECONDS - elapsed)
        cls._last_request_time = time.time()

    @classmethod
    async def search(cls, query: str, max_results: int = 5, sort_by: str = "relevance") -> List[PaperSearchResult]:
        """
        Search arXiv for papers.
        sort_by: "relevance" (best match) | "date" (newest submitted) | "updated" (recently revised)
        """
        await cls._enforce_rate_limit()

        # Map string option to arxiv library SortCriterion
        sort_map = {
            "relevance": arxiv.SortCriterion.Relevance,
            "date":      arxiv.SortCriterion.SubmittedDate,
            "updated":   arxiv.SortCriterion.LastUpdatedDate,
        }
        sort_criterion = sort_map.get(sort_by, arxiv.SortCriterion.Relevance)

        def _sync_search() -> List[PaperSearchResult]:
            """Run the blocking arxiv library in a thread pool to avoid freezing the event loop."""
            results_list: List[PaperSearchResult] = []
            try:
                client = arxiv.Client(
                    page_size=max_results,
                    delay_seconds=1.0,
                    num_retries=1
                )
                search = arxiv.Search(
                    query=query,
                    max_results=max_results,
                    sort_by=sort_criterion
                )
                for result in client.results(search):
                    arxiv_id = result.entry_id.split("/")[-1].split("v")[0]
                    authors = [a.name for a in result.authors]
                    published_str = result.published.strftime("%Y-%m-%d") if result.published else ""
                    item = PaperSearchResult(
                        arxiv_id=arxiv_id,
                        title=result.title.replace("\n", " ").strip(),
                        authors=authors,
                        published_date=published_str,
                        pdf_url=result.pdf_url,
                        summary=result.summary.replace("\n", " ").strip()
                    )
                    results_list.append(item)
            except Exception as e:
                err_str = str(e)
                logger.error(f"Error executing arXiv search for '{query}': {e}")
                if "429" in err_str or "503" in err_str:
                    raise ArxivRateLimitError(
                        "arXiv is temporarily rate-limiting requests. "
                        "Please wait 30–60 seconds and try again."
                    )
                raise RuntimeError(f"arXiv Search Failed: {e}")
            return results_list

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _sync_search)

    @classmethod
    async def download_pdf(cls, pdf_url: str, arxiv_id: str) -> Path:
        """
        Downloads a paper PDF to settings.PAPERS_DIR.
        """
        await cls._enforce_rate_limit()

        target_file = settings.PAPERS_DIR / f"{arxiv_id}.pdf"
        if target_file.exists() and target_file.stat().st_size > 5000:
            logger.info(f"PDF for {arxiv_id} already exists locally at {target_file}")
            return target_file

        headers = {"User-Agent": settings.ARXIV_USER_AGENT}

        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            res = await client.get(pdf_url, headers=headers)
            res.raise_for_status()
            with open(target_file, "wb") as f:
                f.write(res.content)

        logger.info(f"Successfully downloaded PDF for arXiv ID {arxiv_id} to {target_file}")
        return target_file
