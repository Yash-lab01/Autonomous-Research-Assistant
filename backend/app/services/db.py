import json
from typing import List, Optional
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.config import settings
from app.models.db_models import Base, PaperORM, ParagraphORM
from app.models.paper import PaperMetadata, PaperStatus, ParagraphChunk, StructuredPaperExtraction

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class DatabaseService:
    @staticmethod
    def get_paper_by_arxiv_id(db: Session, arxiv_id: str) -> Optional[PaperORM]:
        if not arxiv_id:
            return None
        return db.query(PaperORM).filter(PaperORM.arxiv_id == arxiv_id).first()

    @staticmethod
    def get_paper_by_id(db: Session, paper_id: str) -> Optional[PaperORM]:
        return db.query(PaperORM).filter(PaperORM.id == paper_id).first()

    @staticmethod
    def create_paper(db: Session, paper_data: PaperMetadata) -> PaperORM:
        db_paper = PaperORM(
            id=paper_data.id,
            arxiv_id=paper_data.arxiv_id,
            doi=paper_data.doi,
            title=paper_data.title,
            published_date=paper_data.published_date,
            pdf_url=paper_data.pdf_url,
            local_pdf_path=paper_data.local_pdf_path,
            summary=paper_data.summary,
            status=paper_data.status,
            failure_reason=paper_data.failure_reason,
            extraction_parser=paper_data.extraction_parser,
            paragraph_count=paper_data.paragraph_count
        )
        db_paper.authors = paper_data.authors
        db_paper.categories = paper_data.categories
        if paper_data.structured_data:
            db_paper.structured_data = paper_data.structured_data.model_dump()
            
        db.add(db_paper)
        db.commit()
        db.refresh(db_paper)
        return db_paper

    @staticmethod
    def update_paper_status(
        db: Session,
        paper_id: str,
        status: PaperStatus,
        failure_reason: Optional[str] = None,
        extraction_parser: Optional[str] = None,
        structured_data: Optional[StructuredPaperExtraction] = None,
        paragraph_count: Optional[int] = None
    ) -> Optional[PaperORM]:
        paper = db.query(PaperORM).filter(PaperORM.id == paper_id).first()
        if not paper:
            return None
        paper.status = status
        if failure_reason is not None:
            paper.failure_reason = failure_reason
        if extraction_parser is not None:
            paper.extraction_parser = extraction_parser
        if structured_data is not None:
            paper.structured_data = structured_data.model_dump()
        if paragraph_count is not None:
            paper.paragraph_count = paragraph_count
            
        db.commit()
        db.refresh(paper)
        return paper

    @staticmethod
    def save_paragraphs(db: Session, paragraphs: List[ParagraphChunk]):
        db_paragraphs = [
            ParagraphORM(
                id=p.id,
                paper_id=p.paper_id,
                page_number=p.page_number,
                paragraph_id=p.paragraph_id,
                text=p.text,
                section_name=p.section_name
            )
            for p in paragraphs
        ]
        db.add_all(db_paragraphs)
        db.commit()

    @staticmethod
    def list_papers(db: Session, skip: int = 0, limit: int = 100) -> List[PaperORM]:
        return db.query(PaperORM).order_by(PaperORM.created_at.desc()).offset(skip).limit(limit).all()

    @staticmethod
    def get_paragraphs_by_paper(db: Session, paper_id: str) -> List[ParagraphORM]:
        return db.query(ParagraphORM).filter(ParagraphORM.paper_id == paper_id).order_by(ParagraphORM.page_number, ParagraphORM.paragraph_id).all()
