"""ajoute_date_acquisition_holding

Revision ID: 8643bfb5b753
Revises: dbfb7fd6fbff
Create Date: 2026-08-26 20:41:32.758970

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8643bfb5b753'
down_revision: Union[str, Sequence[str], None] = 'dbfb7fd6fbff'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('holdings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('date_acquisition', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('holdings', schema=None) as batch_op:
        batch_op.drop_column('date_acquisition')
