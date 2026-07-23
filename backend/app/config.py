import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent

class Settings(BaseSettings):
    # App Config
    APP_NAME: str = "AI Research OS"
    DEBUG: bool = True
    
    # API Keys & Models
    GROQ_API_KEY: str = ""
    GROQ_PRIMARY_MODEL: str = "llama-3.3-70b-versatile"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_FALLBACK_MODEL: str = "qwen2.5:7b"
    
    # Infrastructure
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_COLLECTION: str = "research_papers"
    REDIS_URL: str = "redis://localhost:6379/0"
    DATABASE_URL: str = f"sqlite:///{BASE_DIR}/ai_research_os.db"
    
    # Storage Paths
    STORAGE_DIR: Path = BASE_DIR / "data"
    PAPERS_DIR: Path = BASE_DIR / "data" / "papers"
    
    # arXiv Etiquette
    ARXIV_REQUEST_DELAY_SECONDS: float = 3.0
    ARXIV_USER_AGENT: str = "AI-Research-OS/1.0 (Autonomous Paper Explorer; mailto:research@local)"
    
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

# Ensure storage directories exist
settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
settings.PAPERS_DIR.mkdir(parents=True, exist_ok=True)
