import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Compte, Detenteur, Etablissement, Holding, Loan } from '../api/types'
import CompteDetailContent from './CompteDetailContent'

vi.mock('../api/client', () => ({
  api: {
    listEtablissements: vi.fn().mockResolvedValue([]),
    updateCompte: vi.fn(),
    listLoans: vi.fn().mockResolvedValue([]),
    listDetenteurs: vi.fn().mockResolvedValue([]),
    setCompteQuotites: vi.fn(),
    // Ligne d'épargne inline (fusion de l'écran Épargne, 03/09/2026) — `LigneEpargne`
    // en a besoin pour ses propres actions (Modifier/Ajouter une valorisation/Supprimer).
    getHoldingValuationHistory: vi.fn().mockResolvedValue([]),
    setHoldingValorisation: vi.fn(),
    updateHolding: vi.fn(),
    deleteHolding: vi.fn(),
  },
}))

vi.mock('../hooks/usePreferencesAffichage', () => ({
  usePreferencesAffichage: () => ({ lentille: 'net', setLentille: vi.fn(), montantsMasques: false, toggleMontantsMasques: vi.fn() }),
}))

function compte(overrides: Partial<Compte> = {}): Compte {
  return { id: 1, nom: 'PEA', etablissement: null, created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00', ...overrides }
}

function etablissement(overrides: Partial<Etablissement> = {}): Etablissement {
  return { id: 1, nom: 'Banque Test', created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00', ...overrides }
}

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 1,
    ticker: 'AAA',
    nom: null,
    quantite: 10,
    prix_revient_moyen: 100,
    compte: null,
    devise: 'EUR',
    type_actif: 'STOCK',
    origine: 'manuel',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    market_data: null,
    rendement_depuis_achat_pct: null,
    rendement_annualise_pct: null,
    valeur: 1000,
    valeur_estimee: null,
    date_valeur_estimee: null,
    taux_pct: null,
    zone_geo: null,
    versement_mensuel: null,
    date_acquisition: null,
    ...overrides,
  }
}

function loan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 1,
    libelle: 'Prêt appartement',
    capital_initial: 200000,
    taux_annuel_pct: 3,
    mensualite: 1000,
    date_debut: '2020-01-01T00:00:00',
    duree_mois: 240,
    capital_restant_du_manuel: null,
    derniere_maj_manuelle: null,
    capital_restant_du: 150000,
    holding_id: null,
    etablissement_id: null,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    ...overrides,
  }
}

function detenteur(overrides: Partial<Detenteur> = {}): Detenteur {
  return { id: 1, nom: 'Alice', type: 'personne', created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00', ...overrides }
}

function renderContent(c: Compte, holdings: Holding[], onChanged = vi.fn()) {
  return render(
    <MemoryRouter>
      <CompteDetailContent compte={c} holdings={holdings} onChanged={onChanged} />
    </MemoryRouter>,
  )
}

describe('CompteDetailContent — informations et solde', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listEtablissements).mockResolvedValue([])
    vi.mocked(api.listLoans).mockResolvedValue([])
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
  })

  it('affiche le nom du compte et son établissement', () => {
    renderContent(compte({ nom: 'CTO', etablissement: etablissement({ nom: 'Boursorama' }) }), [])

    expect(screen.getByRole('heading', { name: 'CTO' })).toBeInTheDocument()
    expect(screen.getByText('Boursorama')).toBeInTheDocument()
  })

  it('affiche "Sans établissement" quand le compte n\'en a aucun', () => {
    renderContent(compte({ etablissement: null }), [])

    expect(screen.getByText('Sans établissement')).toBeInTheDocument()
  })

  it('le solde additionne la valeur de chaque ligne rattachée', () => {
    renderContent(compte(), [holding({ id: 1, valeur: 1000 }), holding({ id: 2, valeur: 500 })])

    expect(screen.getByText('1 500,00 €')).toBeInTheDocument()
    expect(screen.getByText('2 lignes rattachées')).toBeInTheDocument()
  })

  it('renommer le compte et changer son établissement appelle updateCompte puis onChanged', async () => {
    vi.mocked(api.listEtablissements).mockResolvedValue([etablissement({ id: 5, nom: 'Boursorama' })])
    vi.mocked(api.updateCompte).mockResolvedValue(compte())
    const onChanged = vi.fn()
    renderContent(compte({ nom: 'PEA' }), [], onChanged)

    const champNom = screen.getByLabelText('Nom du compte')
    fireEvent.change(champNom, { target: { value: 'PEA Renommé' } })
    fireEvent.change(await screen.findByLabelText('Établissement'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(() => expect(api.updateCompte).toHaveBeenCalledWith(1, { nom: 'PEA Renommé', etablissement_id: 5 }))
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled())
  })
})

describe('CompteDetailContent — lignes rattachées', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listEtablissements).mockResolvedValue([])
    vi.mocked(api.listLoans).mockResolvedValue([])
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
  })

  it('affiche un état vide quand aucune ligne n\'est rattachée', () => {
    renderContent(compte(), [])

    expect(screen.getByText('Aucune ligne rattachée à ce compte.')).toBeInTheDocument()
  })

  it('liste chaque ligne avec un lien vers sa fiche détaillée', () => {
    renderContent(compte(), [holding({ id: 7, ticker: 'AAPL', nom: 'Apple Inc.', valeur: 1500 })])

    const lien = screen.getByRole('link', { name: 'Apple Inc.' })
    expect(lien).toHaveAttribute('href', '/patrimoine/AAPL')
    // `.getAllByText` : "1 500,00 €" apparaît aussi sur la carte Solde (une seule
    // ligne dans ce scénario, même montant) — on vérifie juste sa présence ici.
    expect(screen.getAllByText('1 500,00 €').length).toBeGreaterThan(0)
  })

  it("suggère la fiche détaillée pour mettre à jour la valeur, uniquement pour un compte mono-ligne", () => {
    const { rerender } = renderContent(compte(), [holding({ id: 1 })])
    expect(screen.getByText(/ouvre sa fiche détaillée ci-dessus/)).toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <CompteDetailContent compte={compte()} holdings={[holding({ id: 1 }), holding({ id: 2 })]} onChanged={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.queryByText(/ouvre sa fiche détaillée ci-dessus/)).not.toBeInTheDocument()
  })
})

describe('CompteDetailContent — ligne d\'épargne inline (fusion de l\'écran Épargne, 03/09/2026)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listEtablissements).mockResolvedValue([])
    vi.mocked(api.listLoans).mockResolvedValue([])
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    vi.mocked(api.getHoldingValuationHistory).mockResolvedValue([])
  })

  function ligneEpargne(overrides: Partial<Holding> = {}): Holding {
    return holding({
      id: 1,
      ticker: 'AV1',
      nom: 'Assurance-vie Boursorama',
      type_actif: 'LIFE_INSURANCE',
      valeur_estimee: 10000,
      date_valeur_estimee: '2026-01-01T00:00:00',
      versement_mensuel: 200,
      ...overrides,
    })
  }

  it('affiche les actions Modifier/Ajouter une valorisation/Supprimer au lieu du simple lien vers la fiche', () => {
    renderContent(compte(), [ligneEpargne()])

    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter une valorisation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
    expect(screen.queryByText(/ouvre sa fiche détaillée ci-dessus/)).not.toBeInTheDocument()
  })

  it('modifier le nom et le versement mensuel appelle updateHolding puis onChanged', async () => {
    vi.mocked(api.updateHolding).mockResolvedValue(ligneEpargne({ nom: 'Renommée', versement_mensuel: 350 }))
    const onChanged = vi.fn()
    renderContent(compte(), [ligneEpargne()], onChanged)

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    // Deux champs "Nom du compte" sur l'écran : celui de la carte "Informations"
    // (compte) et celui du formulaire d'édition de LA LIGNE — ce dernier vient en
    // second dans le DOM.
    const [, champNomLigne] = screen.getAllByLabelText('Nom du compte')
    fireEvent.change(champNomLigne, { target: { value: 'Renommée' } })
    fireEvent.change(screen.getByLabelText('Versement mensuel (€)'), { target: { value: '350' } })
    const [, boutonEnregistrerLigne] = screen.getAllByRole('button', { name: 'Enregistrer' })
    fireEvent.click(boutonEnregistrerLigne)

    await vi.waitFor(() => expect(api.updateHolding).toHaveBeenCalledWith(1, { nom: 'Renommée', versement_mensuel: 350 }))
    expect(await screen.findByText('Renommée')).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalled()
  })

  it('ajouter une valorisation appelle setHoldingValorisation puis onChanged', async () => {
    vi.mocked(api.setHoldingValorisation).mockResolvedValue(ligneEpargne({ valeur_estimee: 10500, date_valeur_estimee: '2026-02-01T00:00:00' }))
    const onChanged = vi.fn()
    renderContent(compte(), [ligneEpargne()], onChanged)

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une valorisation' }))
    fireEvent.change(screen.getByLabelText('Valeur (€)'), { target: { value: '10500' } })
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-02-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une valorisation' }))

    await vi.waitFor(() =>
      expect(api.setHoldingValorisation).toHaveBeenCalledWith('AV1', { valeur: 10500, date: '2026-02-01', versement: null }),
    )
    expect(onChanged).toHaveBeenCalled()
  })

  it('supprimer une ligne demande confirmation avant deleteHolding, puis appelle onChanged', async () => {
    vi.mocked(api.deleteHolding).mockResolvedValue({ ok: true })
    const onChanged = vi.fn()
    renderContent(compte(), [ligneEpargne()], onChanged)

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    const boiteDialogue = await screen.findByRole('dialog')
    await within(boiteDialogue).findByText('Supprimer cette ligne ?')
    expect(api.deleteHolding).not.toHaveBeenCalled()

    fireEvent.click(within(boiteDialogue).getByRole('button', { name: 'Supprimer' }))

    await vi.waitFor(() => expect(api.deleteHolding).toHaveBeenCalledWith(1))
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('un compte avec une ligne STOCK et une ligne épargne mélange lien simple et actions inline', () => {
    renderContent(compte(), [holding({ id: 2, ticker: 'AAPL', type_actif: 'STOCK', valeur: 1500 }), ligneEpargne()])

    expect(screen.getByRole('link', { name: 'AAPL' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument()
  })
})

describe('CompteDetailContent — emprunts rattachés (backlog X.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listEtablissements).mockResolvedValue([])
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
  })

  it("n'affiche aucune carte quand aucun emprunt n'est rattaché à une ligne du compte", async () => {
    vi.mocked(api.listLoans).mockResolvedValue([loan({ holding_id: 999 })])
    renderContent(compte(), [holding({ id: 1 })])

    await vi.waitFor(() => expect(api.listLoans).toHaveBeenCalled())
    expect(screen.queryByText('Emprunts rattachés')).not.toBeInTheDocument()
  })

  it("affiche l'emprunt dont le holding_id correspond à une ligne du compte", async () => {
    vi.mocked(api.listLoans).mockResolvedValue([
      loan({ id: 9, libelle: 'Prêt appartement', holding_id: 1, capital_restant_du: 150000 }),
      loan({ id: 10, libelle: 'Prêt autre bien', holding_id: 999 }),
    ])
    renderContent(compte(), [holding({ id: 1 })])

    await screen.findByText('Emprunts rattachés')
    expect(screen.getByText('Prêt appartement')).toBeInTheDocument()
    expect(screen.getByText('150 000,00 € restant')).toBeInTheDocument()
    expect(screen.queryByText('Prêt autre bien')).not.toBeInTheDocument()
  })
})

describe('CompteDetailContent — répartition entre détenteurs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listEtablissements).mockResolvedValue([])
    vi.mocked(api.listLoans).mockResolvedValue([])
  })

  it("n'affiche pas la carte si le compte n'a aucune ligne", () => {
    renderContent(compte(), [])

    expect(screen.queryByText('Répartition entre détenteurs')).not.toBeInTheDocument()
  })

  it("n'affiche pas la carte si aucun détenteur n'est déclaré", async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    renderContent(compte(), [holding({ id: 1 })])

    await vi.waitFor(() => expect(api.listDetenteurs).toHaveBeenCalled())
    expect(screen.queryByText('Répartition entre détenteurs')).not.toBeInTheDocument()
  })

  it('mentionne le nombre de lignes et d\'emprunts concernés par le remplacement', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([detenteur()])
    vi.mocked(api.listLoans).mockResolvedValue([loan({ holding_id: 1 })])
    renderContent(compte(), [holding({ id: 1 }), holding({ id: 2 })])

    await screen.findByText('Répartition entre détenteurs')
    expect(screen.getByText(/2 lignes, et 1 emprunt rattaché/)).toBeInTheDocument()
  })

  it('le bouton Enregistrer est désactivé tant que la somme ne fait pas 100 %', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([detenteur({ nom: 'Alice' }), detenteur({ id: 2, nom: 'Bob' })])
    renderContent(compte(), [holding({ id: 1 })])
    await screen.findByText('Répartition entre détenteurs')

    fireEvent.change(screen.getByLabelText('Alice'), { target: { value: '60' } })

    // Deux boutons "Enregistrer" sur la page (formulaire Informations, puis
    // Répartition entre détenteurs) — celui de la répartition vient en second.
    const [, boutonRepartition] = screen.getAllByRole('button', { name: 'Enregistrer' })
    expect(boutonRepartition).toBeDisabled()
    expect(screen.getByText(/Total actuel : 60/)).toBeInTheDocument()
  })

  it('soumettre une répartition valide appelle setCompteQuotites et affiche la confirmation', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([detenteur({ nom: 'Alice' }), detenteur({ id: 2, nom: 'Bob' })])
    vi.mocked(api.setCompteQuotites).mockResolvedValue({ ok: true })
    renderContent(compte({ id: 3 }), [holding({ id: 1 })])
    await screen.findByText('Répartition entre détenteurs')

    fireEvent.change(screen.getByLabelText('Alice'), { target: { value: '70' } })
    fireEvent.change(screen.getByLabelText('Bob'), { target: { value: '30' } })
    const [, boutonRepartition] = screen.getAllByRole('button', { name: 'Enregistrer' })
    fireEvent.click(boutonRepartition)

    await vi.waitFor(() =>
      expect(api.setCompteQuotites).toHaveBeenCalledWith(3, [
        { detenteur_id: 1, quotite_pct: 70 },
        { detenteur_id: 2, quotite_pct: 30 },
      ]),
    )
    expect(await screen.findByText('Répartition appliquée à toutes les lignes du compte.')).toBeInTheDocument()
  })
})
