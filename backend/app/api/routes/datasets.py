import csv
import io
import os
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
import pandas as pd
from fpdf import FPDF
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.config import get_settings
from app.models.cleaning_job import CleaningJob
from app.models.dataset import Dataset
from app.models.validation_result import ValidationResult
from app.schemas.cleaning import CleaningJobOut
from app.schemas.dataset import DatasetOut, DatasetPreviewOut, ValidationHistoryOut, ValidationResultOut
from app.services.cleaning import apply_cleaning_plan
from app.services.llm import generate_cleaning_plan, summarize_issues
from app.services.processing import run_validation
from app.tasks.jobs import clean_dataset_task, process_dataset_task
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


@router.post("/{dataset_id}/clean", response_model=CleaningJobOut)
def clean_dataset(
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
        profile, issues, score, llm_summary, cleaning_plan = run_validation(dataset.file_path, use_llm=False)
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

    if not result.cleaning_plan_json:
        result.cleaning_plan_json = generate_cleaning_plan(result.issues_json)
        db.commit()
        db.refresh(result)

    job = CleaningJob(dataset_id=dataset.id, status="processing")
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        cleaned_path = apply_cleaning_plan(
            dataset.file_path,
            result.cleaning_plan_json,
            settings.cleaned_dir,
        )
        job.cleaned_file_path = cleaned_path
        job.status = "done"
        job.completed_at = datetime.now(timezone.utc)
        db.commit()

        profile, issues, score, llm_summary, cleaning_plan = run_validation(
            cleaned_path,
            use_llm=False,
        )
        cleaned_result = ValidationResult(
            dataset_id=dataset.id,
            quality_score=score,
            issues_json=issues,
            profile_json=profile,
            llm_summary=llm_summary,
            cleaning_plan_json=cleaning_plan,
        )
        db.add(cleaned_result)
        dataset.status = "done"
        db.commit()
    except Exception:
        job.status = "failed"
        db.commit()
        raise

    return job


@router.post("/{dataset_id}/clean-async", response_model=CleaningJobOut)
def clean_dataset_async(
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

    job = CleaningJob(dataset_id=dataset.id, status="queued")
    db.add(job)
    db.commit()
    db.refresh(job)

    clean_dataset_task.delay(str(job.id))
    return job


@router.get("/{dataset_id}/cleaning-latest", response_model=CleaningJobOut)
def get_latest_cleaning_job(
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

    job = (
        db.query(CleaningJob)
        .filter(CleaningJob.dataset_id == dataset.id)
        .order_by(CleaningJob.created_at.desc())
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="No cleaning job found")
    return job


@router.get("/{dataset_id}/cleaned-file")
def download_cleaned_file(
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

    job = (
        db.query(CleaningJob)
        .filter(CleaningJob.dataset_id == dataset.id, CleaningJob.status == "done")
        .order_by(CleaningJob.completed_at.desc().nullslast())
        .first()
    )
    if not job or not job.cleaned_file_path or not os.path.exists(job.cleaned_file_path):
        raise HTTPException(status_code=404, detail="Cleaned file not available")

    filename = os.path.basename(job.cleaned_file_path)
    return FileResponse(job.cleaned_file_path, filename=filename)


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


@router.get("/{dataset_id}/report.json")
def download_report_json(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = get_latest_report(dataset_id, db, current_user)
    content = {
        "dataset_id": str(result.dataset_id),
        "quality_score": result.quality_score,
        "issues": result.issues_json,
        "profile": result.profile_json,
        "llm_summary": result.llm_summary,
        "cleaning_plan": result.cleaning_plan_json,
        "created_at": result.created_at.isoformat(),
    }
    return JSONResponse(
        content=content,
        headers={"Content-Disposition": f"attachment; filename=report-{dataset_id}.json"},
    )


@router.get("/{dataset_id}/report.csv")
def download_report_csv(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = get_latest_report(dataset_id, db, current_user)

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["type", "message", "column", "count", "null_pct"],
    )
    writer.writeheader()

    issues = result.issues_json or []
    if not issues:
        writer.writerow({"type": "none", "message": "No issues detected"})
    else:
        for issue in issues:
            writer.writerow({
                "type": issue.get("type"),
                "message": issue.get("message"),
                "column": issue.get("column"),
                "count": issue.get("count"),
                "null_pct": issue.get("null_pct"),
            })

    output.seek(0)
    headers = {"Content-Disposition": f"attachment; filename=report-{dataset_id}.csv"}
    return StreamingResponse(output, media_type="text/csv", headers=headers)


@router.get("/{dataset_id}/report.pdf")
def download_report_pdf(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = get_latest_report(dataset_id, db, current_user)

    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.owner_id == current_user.id)
        .first()
    )

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "Data Quality Report", ln=True)

    pdf.set_font("Helvetica", size=11)
    pdf.cell(0, 8, f"Dataset: {dataset.filename if dataset else dataset_id}", ln=True)
    pdf.cell(0, 8, f"Created at: {result.created_at.isoformat()}", ln=True)
    pdf.cell(0, 8, f"Quality score: {result.quality_score}", ln=True)
    pdf.cell(0, 8, f"Issues count: {len(result.issues_json or [])}", ln=True)
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Summary", ln=True)
    pdf.set_font("Helvetica", size=10)
    summary = result.llm_summary or "No LLM summary available."
    pdf.multi_cell(0, 6, summary)
    pdf.ln(2)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Issues", ln=True)
    pdf.set_font("Helvetica", size=10)
    if not result.issues_json:
        pdf.multi_cell(0, 6, "No issues detected.")
    else:
        for issue in result.issues_json[:25]:
            line = f"- {issue.get('type', 'issue')}: {issue.get('message', '')}"
            pdf.multi_cell(0, 6, line)
    pdf.ln(2)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Cleaning Plan", ln=True)
    pdf.set_font("Helvetica", size=10)
    plan = result.cleaning_plan_json or {}
    steps = plan.get("steps", []) if isinstance(plan, dict) else []
    if not steps:
        pdf.multi_cell(0, 6, "No cleaning plan available.")
    else:
        for step in steps[:20]:
            pdf.multi_cell(0, 6, f"- {step.get('action')}: {step.get('details')}")

    pdf_bytes = pdf.output(dest="S").encode("latin-1")
    headers = {"Content-Disposition": f"attachment; filename=report-{dataset_id}.pdf"}
    return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf", headers=headers)


@router.get("/{dataset_id}/preview", response_model=DatasetPreviewOut)
def preview_dataset(
    dataset_id: UUID,
    limit: int = 5,
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
    if not os.path.exists(dataset.file_path):
        raise HTTPException(status_code=404, detail="Dataset file missing")

    safe_limit = max(1, min(limit, 20))
    df = pd.read_csv(dataset.file_path, nrows=safe_limit)
    return DatasetPreviewOut(columns=df.columns.tolist(), rows=df.to_dict(orient="records"))


@router.get("/{dataset_id}/history", response_model=list[ValidationHistoryOut])
def get_dataset_history(
    dataset_id: UUID,
    limit: int = 12,
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

    safe_limit = max(1, min(limit, 50))
    results = (
        db.query(ValidationResult)
        .filter(ValidationResult.dataset_id == dataset.id)
        .order_by(ValidationResult.created_at.desc())
        .limit(safe_limit)
        .all()
    )
    history = [
        ValidationHistoryOut(
            id=item.id,
            quality_score=item.quality_score,
            issues_count=len(item.issues_json or []),
            created_at=item.created_at,
        )
        for item in reversed(results)
    ]
    return history
