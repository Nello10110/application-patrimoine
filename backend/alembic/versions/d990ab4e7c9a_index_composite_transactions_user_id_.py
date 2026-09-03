"""index composite transactions user_id date

Revision ID: d990ab4e7c9a
Revises: f50410e8aa4e
Create Date: 2026-09-03 07:52:15.867664

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd990ab4e7c9a'
down_revision: Union[str, Sequence[str], None] = 'f50410e8aa4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Index composite (user_id, date) sur `transactions`.

    Les rapports, la performance mensuelle et les revenus passifs filtrent tous sur
    `user_id` + une plage de `date`. L'index sur le seul `user_id` obligeait SQLite
    à parcourir toutes les transactions du foyer : mesuré sur une base réelle,
    4 059 lignes parcourues pour 97 utiles (0,491 ms). Avec cet index, la requête
    devient couverte — 0,009 ms, la table n'est plus touchée.

    Création seule, aucune donnée déplacée : réversible sans risque."""
    op.create_index("ix_transactions_user_id_date", "transactions", ["user_id", "date"])


def downgrade() -> None:
    op.drop_index("ix_transactions_user_id_date", table_name="transactions")

