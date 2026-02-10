from app.db.session import SessionLocal
from app.models.dataset import Dataset
from app.models.validation_result import ValidationResult
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

        profile, issues, score, llm_summary = run_validation(dataset.file_path, use_llm=True)
        result = ValidationResult(
            dataset_id=dataset.id,
            quality_score=score,
            issues_json=issues,
            profile_json=profile,
            llm_summary=llm_summary,
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
