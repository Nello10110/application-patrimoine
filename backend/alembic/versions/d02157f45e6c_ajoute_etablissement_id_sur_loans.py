"""ajoute etablissement id sur loans

Revision ID: d02157f45e6c
Revises: 1e4d25f75711
Create Date: 2026-09-03 17:35:52.489183

Établissement du CRÉDIT (revue du 03/09/2026, demande directe de l'utilisateur) —
délibérément découplé de `holding_id` : le bien financé peut rester sans
établissement (cas normal d'un immobilier) pendant que sa banque prêteuse, elle, en
a un. Colonne additive, nullable, aucun backfill : la base réelle ne compte qu'un
seul emprunt, qui restera `NULL` jusqu'à édition par l'utilisateur — l'établissement
(quelle banque réelle) n'est pas une donnée qu'une migration peut deviner.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd02157f45e6c'
down_revision: Union[str, Sequence[str], None] = '1e4d25f75711'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nom de FK explicite obligatoire en mode batch SQLite (piège déjà rencontré sur
    # ce projet, cf. `f50410e8aa4e_ajoute_etablissements_comptes_.py`).
    with op.batch_alter_table('loans', schema=None) as batch_op:
        batch_op.add_column(sa.Column('etablissement_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_loans_etablissement_id'), ['etablissement_id'], unique=False)
        batch_op.create_foreign_key('fk_loans_etablissement_id_etablissements', 'etablissements', ['etablissement_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('loans', schema=None) as batch_op:
        batch_op.drop_constraint('fk_loans_etablissement_id_etablissements', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_loans_etablissement_id'))
        batch_op.drop_column('etablissement_id')
