"""add user profile fields

Revision ID: 0003_add_user_profile_fields
Revises: 0002_add_cleaning_plan_json
Create Date: 2026-02-24
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_add_user_profile_fields"
down_revision = "0002_add_cleaning_plan_json"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("full_name", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("organization", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "organization")
    op.drop_column("users", "full_name")
