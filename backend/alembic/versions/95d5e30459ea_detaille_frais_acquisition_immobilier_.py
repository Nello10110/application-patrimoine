"""detaille frais acquisition immobilier et ajoute simulateur achat location

Revision ID: 95d5e30459ea
Revises: 3a42a82adf63
Create Date: 2026-09-10 20:43:15.934456

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '95d5e30459ea'
down_revision: Union[str, Sequence[str], None] = '3a42a82adf63'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('holding_immobilier_details', schema=None) as batch_op:
        batch_op.add_column(sa.Column('frais_notaire', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('frais_travaux', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('frais_acquisition_autres', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('simulation_loyer_estime', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('simulation_taxe_habitation_annuelle', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('simulation_charges_mensuelles', sa.Float(), nullable=True))

    # Aucune répartition connue de l'ancien total : bascule intégralement dans
    # "autres" plutôt que de perdre la donnée ou de deviner une clé de répartition.
    op.execute(
        "UPDATE holding_immobilier_details SET frais_acquisition_autres = frais_acquisition "
        "WHERE frais_acquisition IS NOT NULL"
    )

    with op.batch_alter_table('holding_immobilier_details', schema=None) as batch_op:
        batch_op.drop_column('frais_acquisition')


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('holding_immobilier_details', schema=None) as batch_op:
        batch_op.add_column(sa.Column('frais_acquisition', sa.Float(), nullable=True))

    op.execute(
        "UPDATE holding_immobilier_details SET frais_acquisition = "
        "COALESCE(frais_notaire, 0) + COALESCE(frais_travaux, 0) + COALESCE(frais_acquisition_autres, 0)"
    )

    with op.batch_alter_table('holding_immobilier_details', schema=None) as batch_op:
        batch_op.drop_column('simulation_charges_mensuelles')
        batch_op.drop_column('simulation_taxe_habitation_annuelle')
        batch_op.drop_column('simulation_loyer_estime')
        batch_op.drop_column('frais_acquisition_autres')
        batch_op.drop_column('frais_travaux')
        batch_op.drop_column('frais_notaire')
