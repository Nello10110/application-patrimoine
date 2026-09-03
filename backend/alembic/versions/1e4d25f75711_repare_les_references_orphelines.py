"""repare les references orphelines

Revision ID: 1e4d25f75711
Revises: d990ab4e7c9a
Create Date: 2026-09-03 07:53:49.964036

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '1e4d25f75711'
down_revision: str | Sequence[str] | None = 'd990ab4e7c9a'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Repare les references pendantes constatees en base reelle (revue du 03/09/2026,
    `PRAGMA foreign_key_check` : 12 violations).

    Deux causes distinctes, deux traitements distincts :

    1. `access_log_entries.user_id` pointant vers un compte supprime (10 lignes). Le
       journal d'acces SURVIT volontairement a la suppression d'un membre - c'est tout
       son interet - mais `delete_household_member` ne detachait pas la reference.
       On la met a NULL : `username_saisi` continue de dire qui s'etait connecte, la
       ligne de journal reste lisible. Corrige a la source dans `routers/auth.py`.

    2. `holding_valuation_history.holding_id` pointant vers une ligne supprimee
       (2 lignes). Fuite reelle, deja fermee pour l'avenir par
       `_detacher_references_avant_suppression` (`routers/portfolio.py`) ; ces deux
       lignes en sont un residu anterieur. Elles ne sont rattachables a rien et
       n'apparaissent nulle part dans l'application : on les supprime.

    Migration idempotente : reexecutee sur une base saine, elle ne touche rien."""
    connexion = op.get_bind()
    connexion.execute(
        sa.text(
            "UPDATE access_log_entries SET user_id = NULL "
            "WHERE user_id IS NOT NULL "
            "AND user_id NOT IN (SELECT id FROM users)"
        )
    )
    connexion.execute(
        sa.text("DELETE FROM holding_valuation_history WHERE holding_id NOT IN (SELECT id FROM holdings)")
    )


def downgrade() -> None:
    """Irreversible par nature : on ne peut pas readresser une reference vers une
    ligne qui n'existe plus, ni ressusciter des points de valorisation orphelins.
    Aucune operation - conforme a la doctrine du depot (les downgrade restaurent le
    schema, jamais une garantie sur les donnees)."""
