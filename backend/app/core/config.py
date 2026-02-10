from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "AI Data Quality Engineer"
    env: str = "local"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 60

    database_url: str = "postgresql+psycopg2://postgres:postgres@db:5432/ai_data_quality"

    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = "redis://redis:6379/0"
    celery_result_backend: str = "redis://redis:6379/1"

    max_upload_mb: int = 25
    upload_dir: str = "/app/uploads"
    cleaned_dir: str = "/app/cleaned"

    llm_provider: str = "gemini"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-1.5-flash"

    class Config:
        env_file = ".env"
        case_sensitive = False

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
