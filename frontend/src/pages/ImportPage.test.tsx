import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { BudgetImportResult, Etablissement, ImportPreview } from '../api/types'
import ImportPage from './ImportPage'

// Ce fichier verrouille la section "Mouvements bancaires (budget)" (backlog
// 2.N.1) et, depuis la refonte import du 05/09/2026, l'obligation d'établissement
// sur le relevé de positions dès qu'une colonne Compte est mappée — l'import de
// transactions (`ImportTransactionsSection`), déjà couvert ailleurs, reste hors
// de son objet.
vi.mock('../api/client', () => ({
  api: {
    importTransactions: vi.fn(),
    importPreview: vi.fn(),
    importConfirm: vi.fn(),
    importBudgetOfx: vi.fn(),
    importBudgetQif: vi.fn(),
    importBudgetCsvPreview: vi.fn(),
    importBudgetCsvConfirm: vi.fn(),
    // Établissement des comptes créés à la volée (refonte import, 05/09/2026) —
    // chargé une fois au montage, y compris quand ce fichier n'exerce que la
    // section budget ci-dessous.
    listEtablissements: vi.fn().mockResolvedValue([]),
  },
}))

function etablissement(overrides: Partial<Etablissement> = {}): Etablissement {
  return { id: 1, nom: 'Boursorama', logo_key: null, created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00', ...overrides }
}

function previewPositions(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    file_token: 'token-positions',
    columns: ['Ticker', 'Quantité', 'Compte'],
    rows: [{ Ticker: 'AAPL', Quantité: '10', Compte: 'PEA' }],
    total_rows: 1,
    ...overrides,
  }
}

function fichier(nom: string, contenu = 'contenu'): File {
  return new File([contenu], nom, { type: 'text/plain' })
}

function preview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    file_token: 'token-1',
    columns: ['Date', 'Libellé', 'Montant'],
    rows: [{ Date: '01/02/2026', Libellé: 'Salaire', Montant: '2000' }],
    total_rows: 1,
    ...overrides,
  }
}

function resultat(overrides: Partial<BudgetImportResult> = {}): BudgetImportResult {
  return { lignes_lues: 1, importees: 1, doublons_ignores: 0, lignes_ignorees: 0, categorisees_automatiquement: 0, ...overrides }
}

function renderImportPage() {
  return render(
    <MemoryRouter>
      <ImportPage />
    </MemoryRouter>,
  )
}

describe('ImportPage — mouvements bancaires (backlog 2.N.1)', () => {
  it('un fichier .ofx appelle importBudgetOfx (pas importBudgetQif)', async () => {
    vi.mocked(api.importBudgetOfx).mockResolvedValue(resultat({ importees: 3 }))
    renderImportPage()

    const input = screen.getByTestId('dropzone-input-Mouvements bancaires (OFX ou QIF)')
    fireEvent.change(input, { target: { files: [fichier('releve.ofx')] } })

    await screen.findByText(/3 mouvement\(s\) importé\(s\)/)
    expect(api.importBudgetOfx).toHaveBeenCalledTimes(1)
    expect(api.importBudgetQif).not.toHaveBeenCalled()
  })

  it('un fichier .qif appelle importBudgetQif (pas importBudgetOfx)', async () => {
    vi.mocked(api.importBudgetQif).mockResolvedValue(resultat({ importees: 2 }))
    renderImportPage()

    const input = screen.getByTestId('dropzone-input-Mouvements bancaires (OFX ou QIF)')
    fireEvent.change(input, { target: { files: [fichier('releve.qif')] } })

    await screen.findByText(/2 mouvement\(s\) importé\(s\)/)
    expect(api.importBudgetQif).toHaveBeenCalledTimes(1)
  })

  it('affiche les doublons et lignes ignorées quand présents', async () => {
    vi.mocked(api.importBudgetOfx).mockResolvedValue(resultat({ importees: 1, doublons_ignores: 2, lignes_ignorees: 1 }))
    renderImportPage()

    fireEvent.change(screen.getByTestId('dropzone-input-Mouvements bancaires (OFX ou QIF)'), { target: { files: [fichier('r.ofx')] } })

    await screen.findByText(/1 mouvement\(s\) importé\(s\), 2 déjà présent\(s\), 1 ligne\(s\) illisible\(s\) ignorée\(s\)\./)
  })

  it('affiche une erreur si l\'import échoue', async () => {
    vi.mocked(api.importBudgetOfx).mockRejectedValue(new Error('format invalide'))
    renderImportPage()

    fireEvent.change(screen.getByTestId('dropzone-input-Mouvements bancaires (OFX ou QIF)'), { target: { files: [fichier('r.ofx')] } })

    await screen.findByText('format invalide')
  })

  it('CSV : aperçu puis confirmation en mode montant signé', async () => {
    vi.mocked(api.importBudgetCsvPreview).mockResolvedValue(preview())
    vi.mocked(api.importBudgetCsvConfirm).mockResolvedValue(resultat({ importees: 5 }))
    renderImportPage()

    fireEvent.change(screen.getByTestId('dropzone-input-Mouvements bancaires (CSV)'), { target: { files: [fichier('releve.csv')] } })
    await screen.findByRole('columnheader', { name: 'Date' })

    fireEvent.change(screen.getByLabelText('Colonne Date *'), { target: { value: 'Date' } })
    fireEvent.change(screen.getByLabelText('Colonne Libellé *'), { target: { value: 'Libellé' } })
    fireEvent.change(screen.getByLabelText('Colonne Montant *'), { target: { value: 'Montant' } })
    fireEvent.click(screen.getByRole('button', { name: "Confirmer l'import" }))

    await screen.findByText(/5 mouvement\(s\) importé\(s\)/)
    expect(api.importBudgetCsvConfirm).toHaveBeenCalledWith({
      file_token: 'token-1',
      date_col: 'Date',
      libelle_col: 'Libellé',
      montant_col: 'Montant',
      debit_col: null,
      credit_col: null,
      compte: null,
    })
  })

  it('CSV : bascule débit/crédit envoie les bonnes colonnes, montant_col à null', async () => {
    vi.mocked(api.importBudgetCsvPreview).mockResolvedValue(preview({ columns: ['Date', 'Libellé', 'Débit', 'Crédit'] }))
    vi.mocked(api.importBudgetCsvConfirm).mockResolvedValue(resultat())
    renderImportPage()

    fireEvent.change(screen.getByTestId('dropzone-input-Mouvements bancaires (CSV)'), { target: { files: [fichier('releve.csv')] } })
    await screen.findByRole('columnheader', { name: 'Date' })

    fireEvent.change(screen.getByLabelText('Colonne Date *'), { target: { value: 'Date' } })
    fireEvent.change(screen.getByLabelText('Colonne Libellé *'), { target: { value: 'Libellé' } })
    fireEvent.click(screen.getByLabelText('Deux colonnes débit/crédit séparées'))
    fireEvent.change(screen.getByLabelText('Colonne Débit'), { target: { value: 'Débit' } })
    fireEvent.change(screen.getByLabelText('Colonne Crédit'), { target: { value: 'Crédit' } })
    fireEvent.click(screen.getByRole('button', { name: "Confirmer l'import" }))

    await screen.findByText(/mouvement\(s\) importé\(s\)/)
    expect(api.importBudgetCsvConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ montant_col: null, debit_col: 'Débit', credit_col: 'Crédit' }),
    )
  })

  it('le bouton de confirmation reste désactivé tant que Date/Libellé/Montant ne sont pas choisis', async () => {
    vi.mocked(api.importBudgetCsvPreview).mockResolvedValue(preview())
    renderImportPage()

    fireEvent.change(screen.getByTestId('dropzone-input-Mouvements bancaires (CSV)'), { target: { files: [fichier('releve.csv')] } })
    await screen.findByRole('columnheader', { name: 'Date' })

    expect(screen.getByRole('button', { name: "Confirmer l'import" })).toBeDisabled()
  })
})

describe('ImportPage — relevé de positions, établissement des comptes créés (refonte import, 05/09/2026)', () => {
  it("sans colonne Compte mappée, aucun sélecteur d'établissement n'apparaît et la confirmation ne l'exige pas", async () => {
    vi.mocked(api.importPreview).mockResolvedValue(previewPositions())
    vi.mocked(api.importConfirm).mockResolvedValue({ imported: 1, skipped: 0, errors: [] })
    renderImportPage()

    fireEvent.change(screen.getByTestId('dropzone-input-Relevé de positions'), { target: { files: [fichier('releve.csv')] } })
    await screen.findByRole('columnheader', { name: 'Ticker' })

    expect(screen.queryByText('Établissement des comptes créés *')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Colonne Ticker *'), { target: { value: 'Ticker' } })
    fireEvent.change(screen.getByLabelText('Colonne Quantité *'), { target: { value: 'Quantité' } })
    fireEvent.click(screen.getByRole('button', { name: "Confirmer l'import" }))

    await screen.findByText(/1 ligne\(s\) importée\(s\)/)
    expect(api.importConfirm).toHaveBeenCalledWith(expect.objectContaining({ etablissement_id: null, etablissement_nom: null }))
  })

  it('colonne Compte mappée sans établissement choisi : la confirmation reste désactivée', async () => {
    vi.mocked(api.listEtablissements).mockResolvedValueOnce([etablissement()])
    vi.mocked(api.importPreview).mockResolvedValue(previewPositions())
    renderImportPage()

    fireEvent.change(screen.getByTestId('dropzone-input-Relevé de positions'), { target: { files: [fichier('releve.csv')] } })
    await screen.findByRole('columnheader', { name: 'Ticker' })
    fireEvent.change(screen.getByLabelText('Colonne Ticker *'), { target: { value: 'Ticker' } })
    fireEvent.change(screen.getByLabelText('Colonne Quantité *'), { target: { value: 'Quantité' } })
    fireEvent.change(screen.getByLabelText('Compte (optionnel)'), { target: { value: 'Compte' } })

    await screen.findByText('Établissement des comptes créés *')
    expect(screen.getByRole('button', { name: "Confirmer l'import" })).toBeDisabled()
  })

  it('colonne Compte mappée avec un établissement existant choisi : la confirmation le transmet', async () => {
    vi.mocked(api.listEtablissements).mockResolvedValueOnce([etablissement({ id: 7, nom: 'Boursorama' })])
    vi.mocked(api.importPreview).mockResolvedValue(previewPositions())
    vi.mocked(api.importConfirm).mockResolvedValue({ imported: 1, skipped: 0, errors: [] })
    renderImportPage()

    fireEvent.change(screen.getByTestId('dropzone-input-Relevé de positions'), { target: { files: [fichier('releve.csv')] } })
    await screen.findByRole('columnheader', { name: 'Ticker' })
    fireEvent.change(screen.getByLabelText('Colonne Ticker *'), { target: { value: 'Ticker' } })
    fireEvent.change(screen.getByLabelText('Colonne Quantité *'), { target: { value: 'Quantité' } })
    fireEvent.change(screen.getByLabelText('Compte (optionnel)'), { target: { value: 'Compte' } })
    await screen.findByText('Établissement des comptes créés *')

    fireEvent.change(screen.getByLabelText('Établissement des comptes créés'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: "Confirmer l'import" }))

    await screen.findByText(/1 ligne\(s\) importée\(s\)/)
    expect(api.importConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ compte_col: 'Compte', etablissement_id: 7, etablissement_nom: null }),
    )
  })
})
