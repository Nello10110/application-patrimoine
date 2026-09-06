"""ajoute logo reel etablissement

Revision ID: 0ae37889dae2
Revises: 5e50a51b64c4
Create Date: 2026-09-05 00:00:00.000000

Logos réels des établissements (retour utilisateur du 05/09/2026, en suite de
`5e50a51b64c4` qui n'apportait qu'un badge généré) : PNG normalisé stocké en
base64 (`logo_png`), sa provenance (`logo_source` : catalogue/url/upload), l'URL
à re-télécharger pour la source "url", l'empreinte SHA-256 qui évite au job
hebdomadaire de réécrire une image identique, et la date de dernière mise à jour.
Colonnes additives, nullables, aucun backfill : un établissement sans logo
retombe sur le badge généré déjà en place.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0ae37889dae2'
down_revision: Union[str, Sequence[str], None] = '5e50a51b64c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('etablissements', schema=None) as batch_op:
        batch_op.add_column(sa.Column('logo_png', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('logo_source', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('logo_source_url', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('logo_empreinte', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('logo_maj_le', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('etablissements', schema=None) as batch_op:
        batch_op.drop_column('logo_maj_le')
        batch_op.drop_column('logo_empreinte')
        batch_op.drop_column('logo_source_url')
        batch_op.drop_column('logo_source')
        batch_op.drop_column('logo_png')
