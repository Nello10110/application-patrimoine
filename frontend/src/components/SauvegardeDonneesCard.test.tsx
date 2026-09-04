import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { AuthContext, type AuthContextValue } from '../contexts/authContextObject'
import SauvegardeDonneesCard from './SauvegardeDonneesCard'

vi.mock('../api/client', () => ({
  api: {
    downloadExportDonnees: vi.fn(),
    apercuImportDonnees: vi.fn(),
    importerDonnees: vi.fn(),
    effacerFoyer: vi.fn(),
  },
}))

function fichierExport(nom = 'export.json') {
  return new File(['{"format":"patrimoine-export"}'], nom, { type: 'application/json' })
}

function champFichier(): HTMLInputElement {
  return screen.getByLabelText('Fichier de sauvegarde à restaurer') as HTMLInputElement
}

// `SauvegardeDonneesCard` lit `useAuth()` (revue du 05/09/2026, réinitialisation du
// foyer) pour connaître la phrase de confirmation attendue — même patron de contexte
// factice que `ReglagesPage.test.tsx`.
function renderCard(foyerNom: string | null = null) {
  const utilisateurFactice: AuthContextValue = {
    user: { id: 1, username: 'testeur', role: 'proprietaire', onboarding_termine: true, holdings_sans_compte: 0, foyer_nom: foyerNom },
    loading: false,
    login: async () => {},
    register: async () => {},
    logout: () => {},
    completeOnboarding: async () => {},
    refetchUser: async () => {},
  }
  render(
    <AuthContext.Provider value={utilisateurFactice}>
      <SauvegardeDonneesCard />
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // `URL.createObjectURL` n'existe pas dans jsdom : le téléchargement piloté côté
  // client s'appuie dessus, on le neutralise plutôt que de tester le navigateur.
  URL.createObjectURL = vi.fn(() => 'blob:factice')
  URL.revokeObjectURL = vi.fn()
})

describe('SauvegardeDonneesCard — export', () => {
  it('télécharge un fichier JSON au clic sur Exporter', async () => {
    vi.mocked(api.downloadExportDonnees).mockResolvedValue(new Blob(['{}'], { type: 'application/json' }))
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: /Exporter mes données/ }))

    await waitFor(() => expect(api.downloadExportDonnees).toHaveBeenCalledTimes(1))
    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it("affiche l'erreur si l'export échoue, sans casser la carte", async () => {
    vi.mocked(api.downloadExportDonnees).mockRejectedValue(new Error('panne export'))
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: /Exporter mes données/ }))

    expect(await screen.findByText('panne export')).toBeInTheDocument()
  })

  it('annonce que les cours et les données sensibles ne sont pas inclus', () => {
    renderCard()

    expect(screen.getByText(/se retéléchargent seuls/)).toBeInTheDocument()
    expect(screen.getByText(/document confidentiel/)).toBeInTheDocument()
  })
})

describe('SauvegardeDonneesCard — import', () => {
  it("choisir un fichier n'importe rien : il est d'abord analysé, puis confirmé", async () => {
    vi.mocked(api.apercuImportDonnees).mockResolvedValue({
      exporte_le: '2026-09-02T10:00:00',
      contenu: { holdings: 12, comptes: 3 },
    })
    renderCard()

    fireEvent.change(champFichier(), { target: { files: [fichierExport()] } })

    const modale = await screen.findByRole('dialog')
    // Analysé, mais RIEN d'importé tant que l'utilisateur n'a pas confirmé.
    expect(api.apercuImportDonnees).toHaveBeenCalledTimes(1)
    expect(api.importerDonnees).not.toHaveBeenCalled()
    // Le contenu est annoncé en clair, avec des libellés lisibles.
    expect(within(modale).getByText('lignes de patrimoine')).toBeInTheDocument()
    expect(within(modale).getByText('12')).toBeInTheDocument()
    expect(within(modale).getByText(/irréversible/)).toBeInTheDocument()
  })

  it('confirmer déclenche réellement l\'import et affiche le décompte restauré', async () => {
    vi.mocked(api.apercuImportDonnees).mockResolvedValue({ exporte_le: null, contenu: { holdings: 2 } })
    vi.mocked(api.importerDonnees).mockResolvedValue({ ok: true, contenu: { holdings: 2, comptes: 1 } })
    renderCard()
    fireEvent.change(champFichier(), { target: { files: [fichierExport()] } })
    const modale = await screen.findByRole('dialog')

    fireEvent.click(within(modale).getByRole('button', { name: 'Remplacer mes données' }))

    await waitFor(() => expect(api.importerDonnees).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/3 enregistrements restaurés/)).toBeInTheDocument()
  })

  it("annuler ferme la confirmation sans rien importer", async () => {
    vi.mocked(api.apercuImportDonnees).mockResolvedValue({ exporte_le: null, contenu: { holdings: 2 } })
    renderCard()
    fireEvent.change(champFichier(), { target: { files: [fichierExport()] } })
    const modale = await screen.findByRole('dialog')

    fireEvent.click(within(modale).getByRole('button', { name: 'Annuler' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.importerDonnees).not.toHaveBeenCalled()
  })

  it("un fichier invalide est signalé à l'analyse, sans jamais ouvrir la confirmation", async () => {
    vi.mocked(api.apercuImportDonnees).mockRejectedValue(new Error("Ce fichier n'est pas un export de cette application."))
    renderCard()

    fireEvent.change(champFichier(), { target: { files: [fichierExport('photo.json')] } })

    expect(await screen.findByText(/pas un export de cette application/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.importerDonnees).not.toHaveBeenCalled()
  })

  it("un échec pendant l'import est affiché et referme la confirmation", async () => {
    vi.mocked(api.apercuImportDonnees).mockResolvedValue({ exporte_le: null, contenu: { holdings: 2 } })
    vi.mocked(api.importerDonnees).mockRejectedValue(new Error('Import impossible : base verrouillée'))
    renderCard()
    fireEvent.change(champFichier(), { target: { files: [fichierExport()] } })
    const modale = await screen.findByRole('dialog')

    fireEvent.click(within(modale).getByRole('button', { name: 'Remplacer mes données' }))

    expect(await screen.findByText(/base verrouillée/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it("prévient explicitement que l'import remplace tout", () => {
    renderCard()

    expect(screen.getByText(/remplace intégralement/)).toBeInTheDocument()
  })
})

describe('SauvegardeDonneesCard — réinitialisation du foyer (revue du 05/09/2026)', () => {
  it('affiche "SUPPRIMER" comme phrase attendue quand le foyer est sans nom', async () => {
    renderCard(null)

    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le foyer' }))

    const modale = await screen.findByRole('dialog')
    expect(within(modale).getByText(/« SUPPRIMER »/)).toBeInTheDocument()
  })

  it('affiche le nom du foyer comme phrase attendue quand il est défini', async () => {
    renderCard('Famille Dupont')

    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le foyer' }))

    const modale = await screen.findByRole('dialog')
    expect(within(modale).getByText(/« Famille Dupont »/)).toBeInTheDocument()
  })

  it('le bouton de confirmation reste désactivé tant que la saisie ne correspond pas exactement', async () => {
    renderCard(null)
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le foyer' }))
    const modale = await screen.findByRole('dialog')
    const champ = within(modale).getByLabelText('Confirmation de la réinitialisation du foyer')
    const boutonConfirmer = within(modale).getByRole('button', { name: 'Réinitialiser définitivement' })

    expect(boutonConfirmer).toBeDisabled()

    fireEvent.change(champ, { target: { value: 'supprimer' } }) // casse différente : ne compte pas
    expect(boutonConfirmer).toBeDisabled()

    fireEvent.change(champ, { target: { value: 'SUPPRIMER' } })
    expect(boutonConfirmer).toBeEnabled()
  })

  it('confirmer avec la saisie exacte appelle effacerFoyer puis recharge la page', async () => {
    vi.mocked(api.effacerFoyer).mockResolvedValue({ ok: true })
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true })
    renderCard(null)
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le foyer' }))
    const modale = await screen.findByRole('dialog')
    fireEvent.change(within(modale).getByLabelText('Confirmation de la réinitialisation du foyer'), { target: { value: 'SUPPRIMER' } })

    fireEvent.click(within(modale).getByRole('button', { name: 'Réinitialiser définitivement' }))

    await waitFor(() => expect(api.effacerFoyer).toHaveBeenCalledWith('SUPPRIMER'))
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })

  it('annuler referme la modale sans jamais appeler effacerFoyer', async () => {
    renderCard(null)
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le foyer' }))
    const modale = await screen.findByRole('dialog')

    fireEvent.click(within(modale).getByRole('button', { name: 'Annuler' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.effacerFoyer).not.toHaveBeenCalled()
  })

  it('un échec renvoyé par le serveur (confirmation incorrecte) est affiché, sans recharger la page', async () => {
    vi.mocked(api.effacerFoyer).mockRejectedValue(new Error('Confirmation incorrecte. Tapez exactement « SUPPRIMER » pour confirmer.'))
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true })
    renderCard(null)
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le foyer' }))
    const modale = await screen.findByRole('dialog')
    fireEvent.change(within(modale).getByLabelText('Confirmation de la réinitialisation du foyer'), { target: { value: 'SUPPRIMER' } })

    fireEvent.click(within(modale).getByRole('button', { name: 'Réinitialiser définitivement' }))

    expect(await screen.findByText(/Confirmation incorrecte/)).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })

  it('annonce clairement que les comptes du foyer ne sont pas supprimés', () => {
    renderCard(null)

    expect(screen.getByText(/comptes du foyer/)).toBeInTheDocument()
  })
})
