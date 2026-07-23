import json
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, DateTime, Enum as SQLEnum
from sqlalchemy.orm import declarative_base
from app.models.paper import PaperStatus

Base = declarative_base()

class PaperORM(Base):
    __tablename__ = "papers"

    id = Column(String, primary_key=True, index=True)
    arxiv_id = Column(String, unique=True, index=True, nullable=True)
    doi = Column(String, nullable=True)
    title = Column(String, index=True, nullable=False)
    authors_json = Column(Text, default="[]")
    published_date = Column(String, nullable=True)
    categories_json = Column(Text, default="[]")
    pdf_url = Column(String, nullable=True)
    local_pdf_path = Column(String, nullable=True)
    summary = Column(Text, nullable=True)
    status = Column(SQLEnum(PaperStatus), default=PaperStatus.QUEUED, index=True)
    failure_reason = Column(Text, nullable=True)
    extraction_parser = Column(String, nullable=True)
    structured_data_json = Column(Text, nullable=True)
    paragraph_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def authors(self):
        return json.loads(self.authors_json or "[]")

    @authors.setter
    def authors(self, value):
        self.authors_json = json.dumps(value or [])

    @property
    def categories(self):
        return json.loads(self.categories_json or "[]")

    @categories.setter
    def categories(self, value):
        self.categories_json = json.dumps(value or [])

    @property
    def structured_data(self):
        if not self.structured_data_json:
            return None
        return json.loads(self.structured_data_json)

    @structured_data.setter
    def structured_data(self, value):
        if value is None:
            self.structured_data_json = None
        elif isinstance(value, str):
            self.structured_data_json = value
        else:
            self.structured_data_json = json.dumps(value)


class ParagraphORM(Base):
    __tablename__ = "paragraphs"

    id = Column(String, primary_key=True, index=True)
    paper_id = Column(String, index=True, nullable=False)
    page_number = Column(Integer, nullable=False)
    paragraph_id = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    section_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
