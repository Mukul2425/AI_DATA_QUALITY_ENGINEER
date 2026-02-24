from datetime import datetime, timezone

from app.db.session import SessionLocal
from app.models.cleaning_job import CleaningJob
from app.models.dataset import Dataset
from app.models.validation_result import ValidationResult
from app.core.config import get_settings
from app.services.cleaning import apply_cleaning_plan
from app.services.llm import generate_cleaning_plan
from app.services.processing import run_validation
from app.tasks.celery_app import celery


@celery.task(name="process_dataset")
def process_dataset_task(dataset_id: str) -> str:
    db = SessionLocal()
    dataset = None
    try:
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if not dataset:
            return "not_found"

        dataset.status = "processing"
        db.commit()

        profile, issues, score, llm_summary, cleaning_plan = run_validation(
            dataset.file_path,
            use_llm=True,
        )
        result = ValidationResult(
            dataset_id=dataset.id,
            quality_score=score,
            issues_json=issues,
            profile_json=profile,
            llm_summary=llm_summary,
            cleaning_plan_json=cleaning_plan,
        )
        db.add(result)
        dataset.status = "done"
        db.commit()
        return "ok"
    except Exception:
        if dataset:
            dataset.status = "failed"
            db.commit()
        raise
    finally:
        db.close()


@celery.task(name="clean_dataset")
def clean_dataset_task(job_id: str) -> str:
    db = SessionLocal()
    dataset = None
    job = None
    try:
        job = db.query(CleaningJob).filter(CleaningJob.id == job_id).first()
        if not job:
            return "not_found"

        dataset = db.query(Dataset).filter(Dataset.id == job.dataset_id).first()
        if not dataset:
            job.status = "failed"
            db.commit()
            return "dataset_not_found"

        job.status = "processing"
        dataset.status = "processing"
        db.commit()

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

        settings = get_settings()
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
        return "ok"
    except Exception:
        if dataset:
            dataset.status = "failed"
        if job:
            job.status = "failed"
        db.commit()
        raise
    finally:
        db.close()
