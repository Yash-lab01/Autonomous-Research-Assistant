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

    @staticmethod
    async def ask_figure(image_path: str, question: str, paper_title: str = "") -> str:
        """
        Interactive Multimodal Figure Inspector:
        Sends the diagram image and user question to the local vision model or Groq LLM
        to produce a detailed, technical explanation of the architecture, workflow, or plot.
        """
        encoded = VisionCaptioner._encode_image(image_path)
        if not encoded:
            return "Could not load or encode the figure image."

        context = f"from the research paper: '{paper_title}'" if paper_title else "from an academic research paper"
        system_instruction = (
            f"You are an expert AI scientist analyzing an academic figure {context}. "
            "Examine the architecture components, data flows, notations, legends, and metrics in detail. "
            "Answer the researcher's question thoroughly and accurately based on the visual evidence."
        )

        payload = {
            "model": settings.OLLAMA_VISION_MODEL,
            "prompt": f"{system_instruction}\n\nResearcher Question: {question}\n\nDetailed Analysis:",
            "images": [encoded],
            "stream": False,
            "options": {
                "temperature": 0.2,
                "num_predict": 400
            }
        }

        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                res = await client.post(
                    f"{settings.OLLAMA_BASE_URL}/api/generate",
                    json=payload
                )
                if res.status_code == 200:
                    data = res.json()
                    answer = data.get("response", "").strip()
                    if answer:
                        return answer
        except Exception as e:
            logger.warning(f"Ollama vision Q&A failed ({e}). Attempting text synthesis fallback...")

        # Fallback to general LLM if local vision model is unavailable
        from app.services.llm_factory import LLMFactory
        fallback_prompt = (
            f"A researcher is asking about a diagram {context}.\n"
            f"Question: {question}\n\n"
            "Provide a clear technical analysis of the expected system components and concepts based on standard AI research conventions:"
        )
        return await LLMFactory.invoke_llm(prompt=fallback_prompt, workload_type="interactive")

