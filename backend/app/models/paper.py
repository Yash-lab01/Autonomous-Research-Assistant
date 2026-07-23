from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

class PaperStatus(str, Enum):
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    PARSING = "parsing"
    EXTRACTING = "extracting"
    EMBEDDING = "embedding"
    DONE = "done"
    FAILED = "failed"

class ParagraphChunk(BaseModel):
    id: str
    paper_id: str
    page_number: int
    paragraph_id: int
    text: str
    section_name: Optional[str] = None

class StructuredPaperExtraction(BaseModel):
    title: str = Field(description="Title of the research paper")
    abstract: str = Field(description="Abstract summary")
    primary_task: str = Field(description="Primary research task or problem domain")
    methodology_summary: str = Field(description="Core methodology or algorithmic approach proposed")
    datasets_used: List[str] = Field(default_factory=list, description="Datasets evaluated on")
    backbone_models: List[str] = Field(default_factory=list, description="Base/backbone LLM or vision architectures used")
    benchmark_metrics: Dict[str, Any] = Field(default_factory=dict, description="Quantitative benchmark accuracy, FLOPs, latency")
    limitations: List[str] = Field(default_factory=list, description="Explicit or implicit limitations")
    future_work: List[str] = Field(default_factory=list, description="Proposed future research directions")
    bibtex: Optional[str] = Field(default=None, description="BibTeX citation string")

class PaperMetadata(BaseModel):
    id: str
    arxiv_id: Optional[str] = None
    doi: Optional[str] = None
    title: str
    authors: List[str] = Field(default_factory=list)
    published_date: Optional[str] = None
    categories: List[str] = Field(default_factory=list)
    pdf_url: Optional[str] = None
    local_pdf_path: Optional[str] = None
    summary: Optional[str] = None
    status: PaperStatus = PaperStatus.QUEUED
    failure_reason: Optional[str] = None
    extraction_parser: Optional[str] = None # pdfplumber vs docling
    structured_data: Optional[StructuredPaperExtraction] = None
    paragraph_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class PaperSearchQuery(BaseModel):
    query: str
    max_results: int = 5
    categories: Optional[List[str]] = None

class PaperSearchResult(BaseModel):
    arxiv_id: str
    title: str
    authors: List[str]
    published_date: str
    pdf_url: str
    summary: str
    already_ingested: bool = False

class ComparisonItem(BaseModel):
    paper_id: str
    title: str
    primary_task: str
    backbone_model: str
    datasets: List[str]
    key_metrics: Dict[str, Any]
    limitations: List[str]

class ComparisonMatrix(BaseModel):
    topic: str
    papers: List[ComparisonItem]
    synthesis_summary: str

class LiteratureReviewDraft(BaseModel):
    topic: str
    title: str
    introduction: str
    background: str
    existing_methods: str
    limitations_and_gaps: str
    future_directions: str
    references: List[Dict[str, str]] # bibtex / citation details
