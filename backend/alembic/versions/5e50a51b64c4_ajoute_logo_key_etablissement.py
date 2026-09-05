"""ajoute logo_key etablissement

Revision ID: 5e50a51b64c4
Revises: d02157f45e6c
Create Date: 2026-09-05 00:00:00.000000

Refonte de l'écran Import (05/09/2026, demande directe de l'utilisateur) :
catalogue d'établissements connus avec badge coloré. `logo_key` référence une
entrée du catalogue statique frontend (`utils/etablissementsConnus.ts`), jamais
une clé étrangère — colonne additive, nullable, aucun backfill (tous les
établissements existants deviennent "personnalisés", badge neutre).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5e50a51b64c4'
down_revision: Union[str, Sequence[str], None] = 'd02157f45e6c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('etablissements', schema=None) as batch_op:
        batch_op.add_column(sa.Column('logo_key', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('etablissements', schema=None) as batch_op:
        batch_op.drop_column('logo_key')
