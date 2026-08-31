"""ajoute_versement_sur_holding_valuation_history

Revision ID: db31d671e2e4
Revises: 8643bfb5b753
Create Date: 2026-08-30 22:49:54.617698

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'db31d671e2e4'
down_revision: Union[str, Sequence[str], None] = '8643bfb5b753'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('holding_valuation_history', schema=None) as batch_op:
        batch_op.add_column(sa.Column('versement', sa.Float(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('holding_valuation_history', schema=None) as batch_op:
        batch_op.drop_column('versement')
