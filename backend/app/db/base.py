from sqlalchemy.orm import declarative_base

Base = declarative_base()

# Import models for Alembic metadata
from app.models.user import User  # noqa: E402,F401
from app.models.dataset import Dataset  # noqa: E402,F401
from app.models.validation_result import ValidationResult  # noqa: E402,F401
from app.models.cleaning_job import CleaningJob  # noqa: E402,F401
