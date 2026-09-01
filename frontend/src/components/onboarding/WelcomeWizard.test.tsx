import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api/client'
import { AuthContext, type AuthContextValue } from '../../contexts/authContextObject'
import WelcomeWizard from './WelcomeWizard'
import { ETAPES_ONBOARDING } from './steps'

// Étapes 2, 3 et 4 (`PreferencesCard`/`DetenteursCard`/"Démarrer le portefeuille")
// chargent leurs propres données au montage — stubs neutres par défaut (portefeuille
// vide), ce fichier ne verrouille que le déroulé de l'assistant lui-même.
vi.mock('../../api/client', () => ({
  api: {
    getPreferences: vi.fn().mockResolvedValue({ methode_cout: 'cout_moyen_pondere', taux_imposition_pct: null }),
    updatePreferences: vi.fn(),
    listDetenteurs: vi.fn().mockResolvedValue([]),
    createDetenteur: vi.fn(),
    deleteDetenteur: vi.fn(),
    listHoldings: vi.fn().mockResolvedValue([]),
    createHolding: vi.fn(),
    importTransactions: vi.fn(),
  },
}))

function utilisateurFactice(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: { id: 1, username: 'testeur', role: 'proprietaire', onboarding_termine: false },
    loading: false,
    login: async () => {},
    register: async () => {},
    logout: () => {},
    completeOnboarding: vi.fn(),
    ...overrides,
  }
}

// `listHoldings` (comme les autres mocks à valeur unique) n'est jamais réinitialisé
// automatiquement entre les tests (pas de `clearMocks`/`resetMocks` dans la config
// Vitest de ce projet) — sans ce reset, un `mockResolvedValue(...)` posé par un test
// "portefeuille déjà peuplé" fuirait silencieusement vers les tests suivants.
beforeEach(() => {
  vi.mocked(api.listHoldings).mockResolvedValue([])
})

function renderWizard(auth: AuthContextValue, onClose?: () => void) {
  return render(
    // `MemoryRouter` : l'étape "Démarrer le portefeuille" embarque
    // `ImportTransactionsSection`, qui utilise `useNavigate()` (bouton "Voir le
    // tableau de bord" après un import réussi) — sans routeur, son montage lève.
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <WelcomeWizard onClose={onClose} />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('WelcomeWizard', () => {
  it('affiche la première étape ("Bienvenue") au montage', () => {
    renderWizard(utilisateurFactice())

    expect(screen.getByRole('heading', { name: 'Bienvenue' })).toBeInTheDocument()
    expect(screen.getByText(`Étape 1 sur ${ETAPES_ONBOARDING.length}`)).toBeInTheDocument()
  })

  it('"Suivant" avance les étapes, "Précédent" recule, dans l\'ordre déclaré', () => {
    renderWizard(utilisateurFactice())

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(screen.getByRole('heading', { name: 'Préférences' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(screen.getByRole('heading', { name: 'Détenteurs du foyer' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }))
    expect(screen.getByRole('heading', { name: 'Préférences' })).toBeInTheDocument()
  })

  it('le bouton "Précédent" est désactivé sur la première étape', () => {
    renderWizard(utilisateurFactice())

    expect(screen.getByRole('button', { name: 'Précédent' })).toBeDisabled()
  })

  it('"Passer l\'assistant" termine l\'onboarding et ferme immédiatement, sans attendre la dernière étape', async () => {
    const completeOnboarding = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    renderWizard(utilisateurFactice({ completeOnboarding }), onClose)

    fireEvent.click(screen.getByRole('button', { name: "Passer l'assistant" }))

    await vi.waitFor(() => expect(completeOnboarding).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('la dernière étape affiche "Terminer" (pas "Suivant"), qui appelle aussi la complétion', async () => {
    const completeOnboarding = vi.fn().mockResolvedValue(undefined)
    renderWizard(utilisateurFactice({ completeOnboarding }))

    for (let i = 0; i < ETAPES_ONBOARDING.length - 1; i++) fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))

    expect(screen.getByRole('heading', { name: 'Terminé' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Suivant' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }))
    await vi.waitFor(() => expect(completeOnboarding).toHaveBeenCalledTimes(1))
  })

  it('en mode relecture (onboarding déjà terminé), "Terminer" ferme sans rappeler l\'API', async () => {
    const completeOnboarding = vi.fn()
    const onClose = vi.fn()
    renderWizard(utilisateurFactice({ user: { id: 1, username: 'testeur', role: 'proprietaire', onboarding_termine: true }, completeOnboarding }), onClose)

    fireEvent.click(screen.getByRole('button', { name: "Passer l'assistant" }))

    expect(completeOnboarding).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("l'étape Préférences réutilise réellement PreferencesCard (méthode de coût affichée)", async () => {
    renderWizard(utilisateurFactice())
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))

    expect(await screen.findByText('Coût moyen pondéré')).toBeInTheDocument()
    expect(api.getPreferences).toHaveBeenCalled()
  })

  it("l'étape Détenteurs réutilise réellement DetenteursCard (état vide affiché)", async () => {
    renderWizard(utilisateurFactice())
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))

    expect(await screen.findByText('Aucun détenteur déclaré.')).toBeInTheDocument()
  })

  it("l'étape Détenteurs affiche les détenteurs déjà déclarés (état réel, pas un formulaire vide)", async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([
      { id: 1, nom: 'Alice', type: 'personne', created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00' },
    ])
    renderWizard(utilisateurFactice())
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))

    expect(await screen.findByText('Alice')).toBeInTheDocument()
  })

  it("l'étape \"Démarrer le portefeuille\" reconnaît les positions déjà existantes plutôt que de proposer de repartir à vide", async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([
      { ticker: 'AAPL', quantite: 10 } as never,
      { ticker: 'MSFT', quantite: 5 } as never,
    ])
    renderWizard(utilisateurFactice())
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))

    expect(await screen.findByText(/compte déjà/)).toBeInTheDocument()
    expect(screen.getByText('2 positions', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(/commencer à vide/)).not.toBeInTheDocument()
  })

  it("l'étape \"Démarrer le portefeuille\" embarque réellement l'ajout manuel ET l'import, pas de simples liens de renvoi", async () => {
    renderWizard(utilisateurFactice())
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))

    await screen.findByRole('heading', { name: 'Ajouter une ligne manuellement' })
    expect(screen.getByRole('heading', { name: 'Historique de transactions (format détecté automatiquement)' })).toBeInTheDocument()
    expect(screen.getByLabelText('Ticker')).toBeInTheDocument()
  })

  it('ajouter une position depuis le formulaire embarqué met à jour le compteur affiché, en direct', async () => {
    vi.mocked(api.createHolding).mockResolvedValue({ ticker: 'AAPL', quantite: 10 } as never)
    renderWizard(utilisateurFactice())
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))

    expect(await screen.findByText(/Ajoute une première position/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'aapl' } })
    fireEvent.change(screen.getByLabelText('Quantité'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    expect(await screen.findByText(/compte déjà/)).toBeInTheDocument()
    expect(api.createHolding).toHaveBeenCalledWith(expect.objectContaining({ ticker: 'AAPL', quantite: 10 }))
  })

  it('un import de transactions réussi recharge le compteur affiché (pas juste son propre bandeau)', async () => {
    vi.mocked(api.listHoldings).mockResolvedValueOnce([]).mockResolvedValueOnce([{ ticker: 'AAPL' } as never, { ticker: 'MSFT' } as never])
    vi.mocked(api.importTransactions).mockResolvedValue({
      lignes_lues: 10,
      importees: 8,
      doublons_ignores: 0,
      mouvements_hors_bourse_exclus: 2,
      positions_recalculees: 2,
      anomalies_detectees: 0,
      lignes_manuelles_remplacees: 0,
    })
    renderWizard(utilisateurFactice())
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    await screen.findByText(/Ajoute une première position/)

    const fichier = new File(['contenu'], 'transactions.csv', { type: 'text/csv' })
    const input = document.querySelector('input[type="file"][accept=".csv"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [fichier] } })

    await screen.findByText(/position\(s\) recalculée\(s\)/)
    expect(await screen.findByText(/compte déjà/)).toBeInTheDocument()
  })

  it('la "Bienvenue" et le message final s\'adaptent au rejeu (onboarding déjà terminé)', () => {
    renderWizard(utilisateurFactice({ user: { id: 1, username: 'testeur', role: 'proprietaire', onboarding_termine: true } }))

    expect(screen.getByText(/Retour sur le parcours/)).toBeInTheDocument()
    expect(screen.queryByText(/ça prend deux minutes/)).not.toBeInTheDocument()
  })
})
