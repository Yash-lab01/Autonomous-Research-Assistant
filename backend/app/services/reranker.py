import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger("ai_research_os.reranker")

class RerankerService:
    """
    High-Precision Cross-Encoder Re-Ranking Service.
    Evaluates joint attention between user query and retrieved candidate chunks
    to eliminate irrelevant background context and minimize hallucinations.
    """
    _instance = None

    @classmethod
    def get_instance(cls) -> "RerankerService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self, model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"):
        self.model_name = model_name
        self.model = None
        self._init_model()

    def _init_model(self):
        try:
            from sentence_transformers import CrossEncoder
            logger.info(f"Loading CrossEncoder model '{self.model_name}'...")
            self.model = CrossEncoder(self.model_name, max_length=512)
            logger.info(f"CrossEncoder model '{self.model_name}' loaded successfully.")
        except Exception as e:
            logger.warning(
                f"Could not load CrossEncoder model locally ({e}). "
                "Re-ranking will gracefully fall back to Hybrid RRF scores."
            )
            self.model = None

    def rerank(
        self,
        query: str,
        chunks: List[Dict[str, Any]],
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Re-ranks a candidate list of chunks using full cross-attention scoring.
        """
        if not chunks:
            return []

        if self.model is None or len(chunks) <= 1:
            return chunks[:top_k]

        try:
            # Build query-passage pairs
            pairs = [(query, c.get("text", "")[:1000]) for c in chunks]
            scores = self.model.predict(pairs)

            # Attach scores to chunks
            scored_chunks = []
            for chunk, score in zip(chunks, scores):
                c = dict(chunk)
                c["rerank_score"] = float(score)
                scored_chunks.append(c)

            # Sort by cross-encoder score descending
            scored_chunks.sort(key=lambda x: x["rerank_score"], reverse=True)
            logger.info(f"Re-ranked {len(chunks)} chunks down to top {min(top_k, len(chunks))}.")
            return scored_chunks[:top_k]

        except Exception as e:
            logger.error(f"Cross-encoder re-ranking failed: {e}. Falling back to input ranking.")
            return chunks[:top_k]


# Global singleton
reranker = RerankerService()
