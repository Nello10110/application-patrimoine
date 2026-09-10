import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Etablissement, LedgerImportApercu, LedgerImportConfirmInput, LedgerImportResult } from '../api/types'
import ImportLedgerSection from './ImportLedgerSection'

vi.mock('../api/client', () => ({
  api: {
    importLedgerApercu: vi.fn(),
    importLedgerConfirm: vi.fn(),
  },
}))

function etablissement(overrides: Partial<Etablissement> = {}): Etablissement {
  return {
    id: 1,
    nom: 'Ledger',
    logo_key: 'ledger',
    a_un_logo: false,
    logo_source: null,
    logo_maj_le: null,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    ...overrides,
  }
}

function apercu(overrides: Partial<LedgerImportApercu> = {}): LedgerImportApercu {
  return {
    file_token: 'token-1',
    lignes_lues: 3,
    lignes_ignorees_statut: 0,
    lignes_ignorees_type_operation: {},
    devises: [
      { ticker: 'BTC', nb_operations: 2, montant_total_eur: 700 },
      { ticker: 'PKN', nb_operations: 1, montant_total_eur: 0.06 },
    ],
    etablissements: [etablissement()],
    ...overrides,
  }
}

function resultat(overrides: Partial<LedgerImportResult> = {}): LedgerImportResult {
  return {
    lignes_lues: 3,
    importees: 2,
    mises_a_jour: 0,
    doublons_ignores: 0,
    lignes_ignorees: 0,
    positions_recalculees: 1,
    anomalies_detectees: 0,
    comptes_crees: 1,
    ...overrides,
  }
}

function fichier(nom: string): File {
  return new File(['contenu'], nom, { type: 'text/csv' })
}

function renderCard() {
  return render(
    <MemoryRouter>
      <ImportLedgerSection />
    </MemoryRouter>,
  )
}

async function ouvrirApercu(apercuMocke: LedgerImportApercu) {
  vi.mocked(api.importLedgerApercu).mockResolvedValue(apercuMocke)
  renderCard()

  fireEvent.change(screen.getByTestId('dropzone-input-Wallet crypto Ledger'), { target: { files: [fichier('ledger.csv')] } })
  await screen.findByLabelText('Établissement *')
}

describe('ImportLedgerSection', () => {
  it('affiche une case à cocher par devise détectée, toutes cochées par défaut', async () => {
    await ouvrirApercu(apercu())

    expect(screen.getByLabelText(/^BTC/)).toBeChecked()
    expect(screen.getByLabelText(/^PKN/)).toBeChecked()
  })

  it("décocher une devise l'exclut du payload de confirmation", async () => {
    vi.mocked(api.importLedgerConfirm).mockResolvedValue(resultat())
    await ouvrirApercu(apercu())

    fireEvent.click(screen.getByLabelText(/^PKN/))
    fireEvent.change(screen.getByLabelText('Établissement *'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: "Confirmer l'import" }))

    await screen.findByText(/opération\(s\) importée\(s\)/)
    const payload = vi.mocked(api.importLedgerConfirm).mock.calls[0][0] as LedgerImportConfirmInput
    expect(payload.devises_selectionnees).toEqual(['BTC'])
  })

  it('le bouton de confirmation reste désactivé sans établissement choisi', async () => {
    await ouvrirApercu(apercu())

    expect(screen.getByRole('button', { name: "Confirmer l'import" })).toBeDisabled()
  })

  it('le bouton de confirmation se désactive si toutes les devises sont décochées', async () => {
    await ouvrirApercu(apercu({ devises: [{ ticker: 'BTC', nb_operations: 1, montant_total_eur: 100 }] }))
    fireEvent.change(screen.getByLabelText('Établissement *'), { target: { value: '1' } })
    expect(screen.getByRole('button', { name: "Confirmer l'import" })).not.toBeDisabled()

    fireEvent.click(screen.getByLabelText(/^BTC/))

    expect(screen.getByRole('button', { name: "Confirmer l'import" })).toBeDisabled()
  })

  it('affiche le bandeau de résultat après confirmation', async () => {
    vi.mocked(api.importLedgerConfirm).mockResolvedValue(resultat({ importees: 2, mises_a_jour: 1, doublons_ignores: 0, comptes_crees: 1 }))
    await ouvrirApercu(apercu())

    fireEvent.change(screen.getByLabelText('Établissement *'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: "Confirmer l'import" }))

    expect(await screen.findByText(/2 opération\(s\) importée\(s\), 1 mise\(s\) à jour/)).toBeInTheDocument()
    expect(screen.getByText(/1 compte\(s\) créé\(s\)/)).toBeInTheDocument()
  })
})
