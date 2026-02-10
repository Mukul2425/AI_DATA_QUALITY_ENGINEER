import uuid
from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db.base import Base


class CleaningJob(Base):
    __tablename__ = "cleaning_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id = Column(UUID(as_uuid=True), ForeignKey("datasets.id"), nullable=False)
    cleaned_file_path = Column(Text, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(32), default="pending", index=True, nullable=False)

    dataset = relationship("Dataset", back_populates="cleaning_jobs")
