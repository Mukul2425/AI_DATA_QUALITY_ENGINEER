"""add cleaning job created_at

Revision ID: 0004_add_cleaning_job_created_at
Revises: 0003_add_user_profile_fields
Create Date: 2026-02-24
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_add_cleaning_job_created_at"
down_revision = "0003_add_user_profile_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "cleaning_jobs",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("cleaning_jobs", "created_at")
