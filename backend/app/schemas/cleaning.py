from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class CleaningJobOut(BaseModel):
    id: UUID
    dataset_id: UUID
    status: str
    cleaned_file_path: str | None = None
    completed_at: datetime | None = None

    class Config:
        from_attributes = True
