from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class DatasetOut(BaseModel):
    id: UUID
    filename: str
    upload_time: datetime
    owner_id: UUID
    status: str

    class Config:
        from_attributes = True


class ValidationResultOut(BaseModel):
    id: UUID
    dataset_id: UUID
    quality_score: int
    issues_json: list[dict]
    profile_json: dict
    llm_summary: str | None = None
    cleaning_plan_json: dict | None = None
    created_at: datetime

    class Config:
        from_attributes = True
