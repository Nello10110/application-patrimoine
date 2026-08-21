"""roles_sessions_journal_acces

Revision ID: 6c66f80f91c1
Revises: 49d48b0cee7b
Create Date: 2026-08-21 16:01:16.169971

Backlog 2.L.2 : rôles (propriétaire/membre/invité), sessions enrichies
(id_session/ip/user_agent/derniere_utilisation) et journal d'accès. Deux backfills
manuels (au-delà de ce qu'`autogenerate` produit) sont nécessaires avant de
contraindre `auth_tokens.derniere_utilisation` à NOT NULL : les jetons déjà actifs
en base (jusqu'à 30 jours d'ancienneté, TTL du jeton) doivent rester valides après
cette migration, pas perdre leur session.
"""
import secrets
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6c66f80f91c1'
down_revision: Union[str, Sequence[str], None] = '49d48b0cee7b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('access_log_entries',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('timestamp', sa.DateTime(), nullable=False),
    sa.Column('username_saisi', sa.String(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('ip', sa.String(), nullable=True),
    sa.Column('action', sa.String(), nullable=False),
    sa.Column('resultat', sa.String(), nullable=False),
    sa.Column('raison', sa.String(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('access_log_entries', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_access_log_entries_timestamp'), ['timestamp'], unique=False)
        batch_op.create_index(batch_op.f('ix_access_log_entries_user_id'), ['user_id'], unique=False)

    op.create_table('perimetres_invites',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('detenteur_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['detenteur_id'], ['detenteurs.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'detenteur_id', name='uq_perimetre_invite_user_detenteur')
    )
    with op.batch_alter_table('perimetres_invites', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_perimetres_invites_detenteur_id'), ['detenteur_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_perimetres_invites_user_id'), ['user_id'], unique=False)

    # Étape 1 : colonnes ajoutées nullable (une base existante a des jetons actifs
    # sans valeur pour ces nouveaux champs) — `derniere_utilisation` est contrainte
    # à NOT NULL dans une seconde passe, après backfill.
    with op.batch_alter_table('auth_tokens', schema=None) as batch_op:
        batch_op.add_column(sa.Column('id_session', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('derniere_utilisation', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('ip', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('user_agent', sa.String(), nullable=True))
        batch_op.create_index(batch_op.f('ix_auth_tokens_id_session'), ['id_session'], unique=False)

    # Backfill : chaque jeton déjà actif reçoit un `id_session` distinct (identifiant
    # PUBLIC de la session, cf. modèle) et `derniere_utilisation` = `created_at` (à
    # défaut d'un historique réel d'activité, la meilleure approximation disponible).
    connexion = op.get_bind()
    for token, in connexion.execute(sa.text("SELECT token FROM auth_tokens WHERE id_session IS NULL")).fetchall():
        connexion.execute(
            sa.text("UPDATE auth_tokens SET id_session = :id_session WHERE token = :token"),
            {"id_session": secrets.token_hex(8), "token": token},
        )
    connexion.execute(sa.text("UPDATE auth_tokens SET derniere_utilisation = created_at WHERE derniere_utilisation IS NULL"))

    # Étape 2 : `derniere_utilisation` désormais entièrement peuplée, contrainte à
    # NOT NULL pour correspondre au modèle (`Mapped[datetime]`, sans `| None`).
    with op.batch_alter_table('auth_tokens', schema=None) as batch_op:
        batch_op.alter_column('derniere_utilisation', existing_type=sa.DateTime(), nullable=False)

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('role', sa.String(), server_default='proprietaire', nullable=False))
        batch_op.add_column(sa.Column('owner_user_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_users_owner_user_id'), ['owner_user_id'], unique=False)
        # Nom de contrainte explicite (mode batch SQLite) : `create_foreign_key(None, ...)`
        # échoue sans nom — gotcha déjà rencontré dans une révision précédente de ce projet.
        batch_op.create_foreign_key('fk_users_owner_user_id_users', 'users', ['owner_user_id'], ['id'])


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_constraint('fk_users_owner_user_id_users', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_users_owner_user_id'))
        batch_op.drop_column('owner_user_id')
        batch_op.drop_column('role')

    with op.batch_alter_table('auth_tokens', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_auth_tokens_id_session'))
        batch_op.drop_column('user_agent')
        batch_op.drop_column('ip')
        batch_op.drop_column('derniere_utilisation')
        batch_op.drop_column('id_session')

    with op.batch_alter_table('perimetres_invites', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_perimetres_invites_user_id'))
        batch_op.drop_index(batch_op.f('ix_perimetres_invites_detenteur_id'))

    op.drop_table('perimetres_invites')
    with op.batch_alter_table('access_log_entries', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_access_log_entries_user_id'))
        batch_op.drop_index(batch_op.f('ix_access_log_entries_timestamp'))

    op.drop_table('access_log_entries')
