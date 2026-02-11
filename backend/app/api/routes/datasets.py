import os
from uuid import UUID
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.config import get_settings
from app.models.dataset import Dataset
from app.models.validation_result import ValidationResult
from app.schemas.dataset import DatasetOut, ValidationResultOut
from app.services.llm import generate_cleaning_plan, summarize_issues
from app.services.processing import run_validation
from app.tasks.jobs import process_dataset_task
from app.utils.files import save_upload_file

settings = get_settings()

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.post("/upload", response_model=DatasetOut)
def upload_dataset(
    file: UploadFile = File(...),
    process: bool = True,
    async_process: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")

    file.file.seek(0, os.SEEK_END)
    size = file.file.tell()
    file.file.seek(0)
    if size > settings.max_upload_bytes:
        raise HTTPException(status_code=400, detail="File exceeds size limit")

    file_path = save_upload_file(settings.upload_dir, file)

    dataset = Dataset(
        filename=file.filename,
        owner_id=current_user.id,
        status="uploaded",
        file_path=file_path,
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)

    if process and async_process:
        dataset.status = "processing"
        db.commit()
        process_dataset_task.delay(str(dataset.id))
        return dataset

    if process:
        profile, issues, score, llm_summary, cleaning_plan = run_validation(file_path, use_llm=False)
        dataset.status = "done"
        result = ValidationResult(
            dataset_id=dataset.id,
            quality_score=score,
            issues_json=issues,
            profile_json=profile,
            llm_summary=llm_summary,
            cleaning_plan_json=cleaning_plan,
        )
        db.add(result)
        db.commit()

    return dataset


@router.get("/", response_model=list[DatasetOut])
def list_datasets(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return (
        db.query(Dataset)
        .filter(Dataset.owner_id == current_user.id)
        .order_by(Dataset.upload_time.desc())
        .all()
    )


@router.get("/{dataset_id}", response_model=DatasetOut)
def get_dataset(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.owner_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.post("/{dataset_id}/process", response_model=ValidationResultOut)
def process_dataset(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.owner_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    profile, issues, score, llm_summary, cleaning_plan = run_validation(dataset.file_path, use_llm=False)
    dataset.status = "done"
    result = ValidationResult(
        dataset_id=dataset.id,
        quality_score=score,
        issues_json=issues,
        profile_json=profile,
        llm_summary=llm_summary,
        cleaning_plan_json=cleaning_plan,
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


@router.post("/{dataset_id}/process-async", response_model=DatasetOut)
def process_dataset_async(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.owner_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    dataset.status = "processing"
    db.commit()
    process_dataset_task.delay(str(dataset.id))
    return dataset


@router.post("/{dataset_id}/explain", response_model=ValidationResultOut)
def explain_dataset(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.owner_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    result = (
        db.query(ValidationResult)
        .filter(ValidationResult.dataset_id == dataset.id)
        .order_by(ValidationResult.created_at.desc())
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail="No report found")

    result.llm_summary = summarize_issues(result.issues_json)
    result.cleaning_plan_json = generate_cleaning_plan(result.issues_json)
    db.commit()
    db.refresh(result)
    return result


@router.get("/{dataset_id}/report", response_model=ValidationResultOut)
def get_latest_report(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.owner_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    result = (
        db.query(ValidationResult)
        .filter(ValidationResult.dataset_id == dataset.id)
        .order_by(ValidationResult.created_at.desc())
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail="No report found")
    return result
