"""create stock_quotes table

Revision ID: 0001
Revises:
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stock_quotes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("symbol", sa.String(10), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("price", sa.Numeric(12, 4), nullable=False),
        sa.Column("volume", sa.Integer(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stock_quotes_symbol", "stock_quotes", ["symbol"])


def downgrade() -> None:
    op.drop_index("ix_stock_quotes_symbol", table_name="stock_quotes")
    op.drop_table("stock_quotes")
