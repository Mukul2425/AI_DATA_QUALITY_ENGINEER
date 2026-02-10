from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery = Celery(
    "ai_data_quality",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)
