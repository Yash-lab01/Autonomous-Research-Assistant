import base64
import logging
from pathlib import Path
from typing import Optional
import httpx
from app.config import settings

logger = logging.getLogger("ai_research_os.vision")

FIGURE_CAPTION_PROMPT = """You are analyzing a figure extracted from an academic research paper.
Describe what this figure shows in 1-2 concise sentences, focusing on:
- What type of figure it is (architecture diagram, results table, benchmark chart, flowchart, etc.)
- The key information or system being depicted

Be specific and technical. Do NOT say "the image shows" — just describe it directly.
Example: "System architecture of the two-stage GraphRAG pipeline, showing the community detection module feeding into the global/local retrieval router."
"""

class VisionCaptioner:
    """
    Generates AI captions for extracted paper figures using a local Ollama vision model.
    Falls back to a descriptive placeholder if the model is unavailable or times out.
    """

    @staticmethod
    def _encode_image(image_path: str) -> Optional[str]:
        """Base64-encode an image file for the Ollama vision API."""
        try:
            with open(image_path, "rb") as f:
                return base64.b64encode(f.read()).decode("utf-8")
        except Exception as e:
            logger.warning(f"Failed to encode image {image_path}: {e}")
            return None

    @staticmethod
    async def caption_figure(image_path: str, page_number: int, paper_title: str = "") -> str:
        """
        Send a figure image to the local Ollama vision model and return an AI-generated caption.
        Returns a fallback string if the model is not available.
        """
        encoded = VisionCaptioner._encode_image(image_path)
        if not encoded:
            return f"Figure extracted from page {page_number}"

        context = f" from the paper: {paper_title}" if paper_title else ""
        prompt = f"Describe this figure{context}."

        payload = {
            "model": settings.OLLAMA_VISION_MODEL,
            "prompt": FIGURE_CAPTION_PROMPT + "\n\n" + prompt,
            "images": [encoded],
            "stream": False,
            "options": {
                "temperature": 0.1,
                "num_predict": 120  # Keep captions concise
            }
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(
                    f"{settings.OLLAMA_BASE_URL}/api/generate",
                    json=payload
                )
                if res.status_code == 200:
                    data = res.json()
                    caption = data.get("response", "").strip()
                    if caption:
                        logger.info(f"Vision caption generated for {Path(image_path).name}")
                        return caption
        except httpx.TimeoutException:
            logger.warning(f"Vision model timed out for {image_path} — using fallback caption")
        except httpx.ConnectError:
            logger.warning("Ollama not reachable for vision captioning — using fallback")
        except Exception as e:
            logger.error(f"Vision captioning error for {image_path}: {e}")

        return f"Figure extracted from page {page_number}"

    @staticmethod
    async def is_available() -> bool:
        """Check if the configured vision model is available in Ollama."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
                if res.status_code == 200:
                    models = [m["name"] for m in res.json().get("models", [])]
                    vision_model = settings.OLLAMA_VISION_MODEL
                    # Match by prefix (e.g. "qwen2.5vl:3b" matches "qwen2.5vl:3b")
                    return any(vision_model in m or m in vision_model for m in models)
        except Exception:
            pass
        return False
