"""ajoute_etablissements_comptes_structurels

Revision ID: f50410e8aa4e
Revises: db31d671e2e4
Create Date: 2026-09-01 23:30:48.435292

Écran Comptes (backlog X.1) : `holdings.compte` (texte libre) devient une vraie
relation vers deux nouvelles tables `etablissements`/`comptes`. Backfill : chaque
valeur DISTINCTE non vide de `compte`, par utilisateur, devient une ligne `Compte`
(sans établissement rattaché), et les holdings correspondants sont reliés via
`compte_id`. Les lignes sans compte annoté restent `compte_id = NULL` — état
permanent (pas une phase transitoire), `compte_id` ne passe jamais en NOT NULL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f50410e8aa4e'
down_revision: Union[str, Sequence[str], None] = 'db31d671e2e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('etablissements',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('nom', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'nom', name='uq_etablissement_user_nom')
    )
    with op.batch_alter_table('etablissements', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_etablissements_user_id'), ['user_id'], unique=False)

    op.create_table('comptes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('nom', sa.String(), nullable=False),
    sa.Column('etablissement_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['etablissement_id'], ['etablissements.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'nom', name='uq_compte_user_nom')
    )
    with op.batch_alter_table('comptes', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_comptes_etablissement_id'), ['etablissement_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_comptes_user_id'), ['user_id'], unique=False)

    # Étape 1 : `compte_id` ajoutée nullable, `compte` (texte libre) encore présente
    # pour le backfill ci-dessous — nom de FK explicite obligatoire en mode batch
    # SQLite (piège déjà rencontré par le passé sur ce projet, cf. `loans.holding_id`
    # dans `49d48b0cee7b_ajoute_detenteurs_quotites_rattachement.py`).
    with op.batch_alter_table('holdings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('compte_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_holdings_compte_id'), ['compte_id'], unique=False)
        batch_op.create_foreign_key('fk_holdings_compte_id_comptes', 'comptes', ['compte_id'], ['id'])

    # Backfill : une ligne `Compte` par valeur distincte non vide de `compte`, par
    # utilisateur (jamais partagée entre utilisateurs, cf. `uq_compte_user_nom`) ;
    # SQL brut (pas l'ORM), même pattern que `6c66f80f91c1_roles_sessions_journal_acces.py`.
    connexion = op.get_bind()
    paires = connexion.execute(
        sa.text("SELECT DISTINCT user_id, compte FROM holdings WHERE compte IS NOT NULL AND compte != ''")
    ).fetchall()
    for user_id, nom in paires:
        resultat = connexion.execute(
            sa.text(
                "INSERT INTO comptes (user_id, nom, etablissement_id, created_at, updated_at) "
                "VALUES (:user_id, :nom, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {"user_id": user_id, "nom": nom},
        )
        compte_id = resultat.lastrowid
        connexion.execute(
            sa.text("UPDATE holdings SET compte_id = :compte_id WHERE user_id = :user_id AND compte = :nom"),
            {"compte_id": compte_id, "user_id": user_id, "nom": nom},
        )
    # Les lignes `compte IS NULL` (ou déjà vide) restent `compte_id = NULL` — bucket
    # « Sans compte », comportement inchangé, jamais de valeur inventée.

    # Étape 2 : `compte` (texte libre) retirée, son rôle est désormais entièrement
    # porté par `compte_id`.
    with op.batch_alter_table('holdings', schema=None) as batch_op:
        batch_op.drop_column('compte')


def downgrade() -> None:
    """Downgrade schema."""
    # Ne restaure que le schéma (doctrine constante de ce projet, cf. les autres
    # migrations) — le backfill inverse ci-dessous est une facilité supplémentaire,
    # pas une garantie totale (un compte renommé après le backfill initial ne
    # redonnera pas son nom d'origine, par exemple).
    with op.batch_alter_table('holdings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('compte', sa.VARCHAR(), nullable=True))

    connexion = op.get_bind()
    connexion.execute(
        sa.text(
            "UPDATE holdings SET compte = (SELECT nom FROM comptes WHERE comptes.id = holdings.compte_id) "
            "WHERE compte_id IS NOT NULL"
        )
    )

    with op.batch_alter_table('holdings', schema=None) as batch_op:
        batch_op.drop_constraint('fk_holdings_compte_id_comptes', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_holdings_compte_id'))
        batch_op.drop_column('compte_id')

    with op.batch_alter_table('comptes', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_comptes_user_id'))
        batch_op.drop_index(batch_op.f('ix_comptes_etablissement_id'))

    op.drop_table('comptes')
    with op.batch_alter_table('etablissements', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_etablissements_user_id'))

    op.drop_table('etablissements')
