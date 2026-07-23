import logging
from typing import List, Dict, Any, Optional
from app.config import settings
from app.models.paper import ParagraphChunk

logger = logging.getLogger("ai_research_os.vector_store")

class VectorStoreService:
    """
    Qdrant Vector Store wrapper with embedded fallback.
    Indexes paragraph chunks for exact paragraph-level citation RAG.
    """

    def __init__(self):
        self.qdrant_client = None
        self.encoder = None
        self.in_memory_store: List[Dict[str, Any]] = [] # Fallback if Qdrant server is unavailable
        self._init_client()

    def _init_client(self):
        try:
            from sentence_transformers import SentenceTransformer
            self.encoder = SentenceTransformer("all-MiniLM-L6-v2")
            logger.info("SentenceTransformer encoder 'all-MiniLM-L6-v2' loaded successfully.")
        except Exception as e:
            logger.warning(f"Could not load SentenceTransformer locally ({e}). RAG will use fallback keyword match.")

        try:
            from qdrant_client import QdrantClient
            from qdrant_client.http import models as rest_models
            
            client = QdrantClient(url=settings.QDRANT_URL, timeout=5.0)
            # Test connection
            client.get_collections()
            self.qdrant_client = client
            
            # Ensure collection exists
            collections = [c.name for c in client.get_collections().collections]
            if settings.QDRANT_COLLECTION not in collections:
                client.create_collection(
                    collection_name=settings.QDRANT_COLLECTION,
                    vectors_config=rest_models.VectorParams(
                        size=384, # SentenceTransformers all-MiniLM-L6-v2 dimension
                        distance=rest_models.Distance.COSINE
                    )
                )
                logger.info(f"Created Qdrant collection '{settings.QDRANT_COLLECTION}'.")
        except Exception as e:
            logger.warning(f"Qdrant connection to {settings.QDRANT_URL} unavailable ({e}). Using in-memory RAG vector fallback.")
            self.qdrant_client = None

    def upsert_paragraphs(self, paragraphs: List[ParagraphChunk]):
        if not paragraphs:
            return

        if self.encoder is None:
            # Simple keyword storage in memory fallback
            for p in paragraphs:
                self.in_memory_store.append({
                    "id": p.id,
                    "paper_id": p.paper_id,
                    "page_number": p.page_number,
                    "paragraph_id": p.paragraph_id,
                    "text": p.text,
                    "vector": None
                })
            return

        texts = [p.text for p in paragraphs]
        embeddings = self.encoder.encode(texts, show_progress_bar=False).tolist()

        if self.qdrant_client:
            try:
                from qdrant_client.http import models as rest_models
                points = [
                    rest_models.PointStruct(
                        id=idx, # Hash or incremental integer
                        vector=emb,
                        payload={
                            "chunk_id": p.id,
                            "paper_id": p.paper_id,
                            "page_number": p.page_number,
                            "paragraph_id": p.paragraph_id,
                            "text": p.text
                        }
                    )
                    for idx, (p, emb) in enumerate(zip(paragraphs, embeddings), start=abs(hash(paragraphs[0].paper_id)) % 1000000)
                ]
                self.qdrant_client.upsert(
                    collection_name=settings.QDRANT_COLLECTION,
                    points=points
                )
                logger.info(f"Upserted {len(paragraphs)} paragraph vectors to Qdrant.")
                return
            except Exception as e:
                logger.warning(f"Qdrant upsert failed ({e}). Falling back to memory store.")

        # Fallback in-memory vector store
        for p, emb in zip(paragraphs, embeddings):
            self.in_memory_store.append({
                "id": p.id,
                "paper_id": p.paper_id,
                "page_number": p.page_number,
                "paragraph_id": p.paragraph_id,
                "text": p.text,
                "vector": emb
            })

    def search_paragraphs(self, query: str, paper_ids: Optional[List[str]] = None, top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Searches for relevant paragraph chunks using semantic vector search.
        """
        if self.encoder is not None:
            query_vector = self.encoder.encode([query])[0].tolist()
        else:
            query_vector = None

        if self.qdrant_client and query_vector:
            try:
                from qdrant_client.http import models as rest_models
                query_filter = None
                if paper_ids:
                    query_filter = rest_models.Filter(
                        must=[
                            rest_models.FieldCondition(
                                key="paper_id",
                                match=rest_models.MatchValue(value=pid)
                            )
                            for pid in paper_ids
                        ]
                    )
                results = self.qdrant_client.search(
                    collection_name=settings.QDRANT_COLLECTION,
                    query_vector=query_vector,
                    query_filter=query_filter,
                    limit=top_k
                )
                return [
                    {
                        "chunk_id": res.payload.get("chunk_id"),
                        "paper_id": res.payload.get("paper_id"),
                        "page_number": res.payload.get("page_number"),
                        "paragraph_id": res.payload.get("paragraph_id"),
                        "text": res.payload.get("text"),
                        "score": res.score
                    }
                    for res in results
                ]
            except Exception as e:
                logger.warning(f"Qdrant search failed ({e}). Searching in-memory fallback.")

        # In-memory search fallback (Cosine Similarity or Keyword match)
        matched = []
        for item in self.in_memory_store:
            if paper_ids and item["paper_id"] not in paper_ids:
                continue
            
            # Simple keyword matching score if vector search unavailable
            score = 0.0
            if query_vector and item.get("vector"):
                # Compute dot product
                score = sum(a * b for a, b in zip(query_vector, item["vector"]))
            else:
                words = set(query.lower().split())
                item_words = set(item["text"].lower().split())
                overlap = len(words.intersection(item_words))
                score = float(overlap)

            matched.append({
                "chunk_id": item["id"],
                "paper_id": item["paper_id"],
                "page_number": item["page_number"],
                "paragraph_id": item["paragraph_id"],
                "text": item["text"],
                "score": score
            })

        matched.sort(key=lambda x: x["score"], reverse=True)
        return matched[:top_k]

# Global singleton
vector_store = VectorStoreService()
