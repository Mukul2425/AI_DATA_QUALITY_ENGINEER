"""add cleaning_plan_json

Revision ID: 0002_add_cleaning_plan_json
Revises: 0001_init
Create Date: 2026-02-11
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002_add_cleaning_plan_json"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "validation_results",
        sa.Column("cleaning_plan_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("validation_results", "cleaning_plan_json")
