import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { BudgetImportResult, ImportPreview } from '../api/types'
import ImportPage from './ImportPage'

// Ce fichier ne verrouille que la section "Mouvements bancaires (budget)"
// (backlog 2.N.1) — l'import de transactions/relevé de positions, déjà en place
// avant cet incrément, est hors de son objet.
vi.mock('../api/client', () => ({
  api: {
    importTransactions: vi.fn(),
    importPreview: vi.fn(),
    importConfirm: vi.fn(),
    importBudgetOfx: vi.fn(),
    importBudgetQif: vi.fn(),
    importBudgetCsvPreview: vi.fn(),
    importBudgetCsvConfirm: vi.fn(),
  },
}))

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

    const input = screen.getByLabelText('OFX ou QIF (aucun mapping nécessaire)')
    fireEvent.change(input, { target: { files: [fichier('releve.ofx')] } })

    await screen.findByText(/3 mouvement\(s\) importé\(s\)/)
    expect(api.importBudgetOfx).toHaveBeenCalledTimes(1)
    expect(api.importBudgetQif).not.toHaveBeenCalled()
  })

  it('un fichier .qif appelle importBudgetQif (pas importBudgetOfx)', async () => {
    vi.mocked(api.importBudgetQif).mockResolvedValue(resultat({ importees: 2 }))
    renderImportPage()

    const input = screen.getByLabelText('OFX ou QIF (aucun mapping nécessaire)')
    fireEvent.change(input, { target: { files: [fichier('releve.qif')] } })

    await screen.findByText(/2 mouvement\(s\) importé\(s\)/)
    expect(api.importBudgetQif).toHaveBeenCalledTimes(1)
  })

  it('affiche les doublons et lignes ignorées quand présents', async () => {
    vi.mocked(api.importBudgetOfx).mockResolvedValue(resultat({ importees: 1, doublons_ignores: 2, lignes_ignorees: 1 }))
    renderImportPage()

    fireEvent.change(screen.getByLabelText('OFX ou QIF (aucun mapping nécessaire)'), { target: { files: [fichier('r.ofx')] } })

    await screen.findByText(/1 mouvement\(s\) importé\(s\), 2 déjà présent\(s\), 1 ligne\(s\) illisible\(s\) ignorée\(s\)\./)
  })

  it('affiche une erreur si l\'import échoue', async () => {
    vi.mocked(api.importBudgetOfx).mockRejectedValue(new Error('format invalide'))
    renderImportPage()

    fireEvent.change(screen.getByLabelText('OFX ou QIF (aucun mapping nécessaire)'), { target: { files: [fichier('r.ofx')] } })

    await screen.findByText('format invalide')
  })

  it('CSV : aperçu puis confirmation en mode montant signé', async () => {
    vi.mocked(api.importBudgetCsvPreview).mockResolvedValue(preview())
    vi.mocked(api.importBudgetCsvConfirm).mockResolvedValue(resultat({ importees: 5 }))
    renderImportPage()

    fireEvent.change(screen.getByLabelText('CSV (mapping des colonnes)'), { target: { files: [fichier('releve.csv')] } })
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

    fireEvent.change(screen.getByLabelText('CSV (mapping des colonnes)'), { target: { files: [fichier('releve.csv')] } })
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

    fireEvent.change(screen.getByLabelText('CSV (mapping des colonnes)'), { target: { files: [fichier('releve.csv')] } })
    await screen.findByRole('columnheader', { name: 'Date' })

    expect(screen.getByRole('button', { name: "Confirmer l'import" })).toBeDisabled()
  })
})
