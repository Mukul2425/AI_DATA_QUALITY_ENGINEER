import uuid
from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db.base import Base


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename = Column(String(255), nullable=False)
    upload_time = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status = Column(String(32), default="uploaded", index=True, nullable=False)
    file_path = Column(Text, nullable=False)

    owner = relationship("User", back_populates="datasets")
    validation_results = relationship("ValidationResult", back_populates="dataset")
    cleaning_jobs = relationship("CleaningJob", back_populates="dataset")
