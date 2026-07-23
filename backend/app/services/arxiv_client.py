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

class ArxivClient:
    """
    Client for searching arXiv and fetching PDF binaries with API etiquette (~3s rate delay & custom User-Agent).
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
    async def search(cls, query: str, max_results: int = 5) -> List[PaperSearchResult]:
        await cls._enforce_rate_limit()

        results: List[PaperSearchResult] = []
        try:
            client = arxiv.Client(
                page_size=max_results,
                delay_seconds=settings.ARXIV_REQUEST_DELAY_SECONDS,
                num_retries=3
            )
            search = arxiv.Search(
                query=query,
                max_results=max_results,
                sort_by=arxiv.SortCriterion.Relevance
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
                results.append(item)
        except Exception as e:
            logger.error(f"Error executing arXiv search for '{query}': {e}")
            raise RuntimeError(f"arXiv Search Failed: {e}")

        return results

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

        headers = {
            "User-Agent": settings.ARXIV_USER_AGENT
        }

        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            res = await client.get(pdf_url, headers=headers)
            res.raise_for_status()

            with open(target_file, "wb") as f:
                f.write(res.content)

        logger.info(f"Successfully downloaded PDF for arXiv ID {arxiv_id} to {target_file}")
        return target_file
