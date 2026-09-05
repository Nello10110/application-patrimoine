import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { CompteAvecSolde, Etablissement, Holding } from '../api/types'
import AjoutCompteForm from '../components/AjoutCompteForm'
import Card from '../components/Card'
import CompteDetailModal from '../components/CompteDetailModal'
import EtablissementLogo from '../components/EtablissementLogo'
import EtablissementsCard from '../components/EtablissementsCard'
import EtatErreur from '../components/EtatErreur'
import EtatVide from '../components/EtatVide'
import Modale from '../components/Modale'
import PlusValueParCompteCard from '../components/PlusValueParCompteCard'
import { SkeletonTexte } from '../components/Skeleton'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { TYPES_EPARGNE } from '../utils/holdingCategories'
import { formatEuro } from '../utils/format'

const SANS_ETABLISSEMENT = 'Sans établissement'

/** Écran Comptes (backlog X.1, fusionné avec l'ancien écran Épargne le 03/09/2026 —
 * demande directe de l'utilisateur) : liste de tous les comptes du foyer avec leur
 * solde, groupés par établissement — façon logiciel de budget. Couvre TOUS les
 * types d'actifs (contrairement à l'ancienne carte « Répartition par compte » du
 * Tableau de bord, restreinte au portefeuille financier), y compris l'immobilier et
 * l'épargne rattachés à un compte — dont les actions dédiées (modifier, ajouter une
 * valorisation, historique) vivent dans la fiche détaillée du compte
 * (`CompteDetailContent`/`LigneEpargne`), une ligne d'épargne étant 1:1 avec son
 * compte par convention. */
export default function ComptesPage() {
  const { montantsMasques } = usePreferencesAffichage()
  const [lignes, setLignes] = useState<CompteAvecSolde[] | null>(null)
  const [etablissements, setEtablissements] = useState<Etablissement[]>([])
  // Uniquement pour l'encart « Épargne » ci-dessous (valeur totale/versement
  // mensuel total) : `CompteAvecSolde` n'expose ni `valeur_estimee` ni
  // `versement_mensuel`, une requête séparée est indispensable — même donnée que
  // l'ancienne `EpargnePage.tsx`.
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [error, setError] = useState<string | null>(null)
  const [compteOuvert, setCompteOuvert] = useState<number | null>(null)
  // Confirmation avant suppression (recette du 02/09/2026) : le bouton se trouve
  // sur une ligne elle-même cliquable, un clic un peu large supprimait le compte
  // sans retour possible. Même patron que `PortefeuillePage`, qui confirme déjà —
  // cet écran était le seul à supprimer sèchement.
  const [confirmSuppression, setConfirmSuppression] = useState<CompteAvecSolde | null>(null)
  const [suppressionEnCours, setSuppressionEnCours] = useState(false)

  function charger() {
    setError(null)
    api
      .listComptesAvecSolde()
      .then(setLignes)
      .catch((err) => setError(err.message))
    api.listEtablissements().then(setEtablissements).catch(() => setEtablissements([]))
    api.listHoldings().then(setHoldings).catch(() => setHoldings([]))
  }

  useEffect(charger, [])

  function demanderSuppression(ligne: CompteAvecSolde, e: React.MouseEvent) {
    e.stopPropagation()
    setConfirmSuppression(ligne)
  }

  async function confirmerSuppression() {
    if (!confirmSuppression?.compte) return
    setSuppressionEnCours(true)
    try {
      await api.deleteCompte(confirmSuppression.compte.id)
      setConfirmSuppression(null)
      charger()
    } catch (err) {
      setError((err as Error).message)
      setConfirmSuppression(null)
    } finally {
      setSuppressionEnCours(false)
    }
  }

  if (error) return <EtatErreur message={error} onReessayer={charger} />
  if (!lignes) return <SkeletonTexte lignes={5} />

  const soldeTotal = lignes.reduce((somme, l) => somme + l.solde, 0)

  // Encart « Épargne » (fusion du 03/09/2026) : assurance-vie, PER, épargne
  // réglementée/salariale, compte courant — même périmètre et même calcul que
  // l'ancienne `EpargnePage.tsx`. Le Véhicule en reste exclu (décote plutôt
  // qu'épargne), toujours visible dans Portefeuille (onglet « Immobilier & Épargne »).
  const lignesEpargne = holdings.filter((h) => h.type_actif !== null && TYPES_EPARGNE.has(h.type_actif))
  const valeurEpargneTotale = lignesEpargne.reduce((somme, h) => somme + (h.valeur_estimee ?? 0), 0)
  const versementEpargneTotal = lignesEpargne.reduce((somme, h) => somme + (h.versement_mensuel ?? 0), 0)

  // Regroupement par établissement (côté client, comme `comptesDisponibles` pour
  // Portefeuille) — un groupe « Sans établissement » pour les comptes non rattachés
  // ET pour le bucket « Sans compte » (lignes du foyer jamais rattachées à un
  // compte, `l.compte === null`).
  const groupes = new Map<string, CompteAvecSolde[]>()
  for (const ligne of lignes) {
    const cle = ligne.compte?.etablissement?.nom ?? SANS_ETABLISSEMENT
    const groupe = groupes.get(cle) ?? []
    groupe.push(ligne)
    groupes.set(cle, groupe)
  }
  const nomsGroupes = Array.from(groupes.keys()).sort((a, b) =>
    a === SANS_ETABLISSEMENT ? 1 : b === SANS_ETABLISSEMENT ? -1 : a.localeCompare(b, 'fr'),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-texte">Comptes</h2>
        <span className="text-lg font-semibold text-texte">{formatEuro(soldeTotal, 0, montantsMasques)}</span>
      </div>
      <p className="text-sm text-texte-attenue">
        Tous les comptes du foyer — compte courant, PEA, compte-titres, assurance-vie, immobilier, épargne — groupés par
        établissement, avec leur solde. Clique sur un compte pour voir le détail, modifier une ligne d'épargne ou lui
        ajouter une valorisation, et définir une répartition entre détenteurs pour tout le compte en une fois.{' '}
        {/* Un compte est un contenant, les lignes de patrimoine sont ce qu'il
            contient (recette du 02/09/2026 : première incompréhension d'un
            nouvel utilisateur) — levé ici plutôt que seulement dans le manuel. */}
        <span
          className="cursor-help underline decoration-dotted"
          title="Un compte est un contenant (votre PEA, votre livret, le compte de votre appartement) ; les lignes de patrimoine sont ce qu'il contient. Clique sur un compte pour voir ses lignes."
        >
          Qu'est-ce qu'un compte ?
        </span>
      </p>

      <PlusValueParCompteCard holdings={holdings} montantsMasques={montantsMasques} />

      {lignesEpargne.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Valeur épargne totale</p>
            <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(valeurEpargneTotale, 2, montantsMasques)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Versement mensuel total</p>
            <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(versementEpargneTotal, 2, montantsMasques)}</p>
            <p className="text-xs text-texte-attenue">additionné au préremplissage du Simulateur</p>
          </div>
        </div>
      )}

      {/* Relocalisé depuis Réglages → onglet Détenteurs le 03/09/2026 (revue de
          qualité) : personne ne pensait chercher la gestion des établissements
          là-bas — elle vit désormais ici, au-dessus de la création d'un compte qui
          en a justement besoin. Réutilise la liste déjà chargée (`charger`
          ci-dessus) plutôt qu'un second `GET /etablissements` (patron Z.1). */}
      <EtablissementsCard etablissements={etablissements} onModifies={charger} />

      <Card title="Nouveau compte">
        <AjoutCompteForm etablissements={etablissements} onCreated={charger} />
      </Card>

      {lignes.length === 0 ? (
        <EtatVide
          titre="Aucun compte déclaré."
          description="Crée un compte ci-dessus (vide, ou une ligne d'épargne en choisissant un type), ou rattaches-en un directement depuis Portefeuille lors de l'ajout d'une position."
        />
      ) : (
        nomsGroupes.map((nomGroupe) => (
          <Card key={nomGroupe} title={nomGroupe}>
            <ul className="divide-y divide-bordure">
              {groupes.get(nomGroupe)!.map((ligne) => {
                const estCliquable = Boolean(ligne.compte)
                return (
                  <li key={ligne.compte?.id ?? 'sans-compte'}>
                    <div
                      role={estCliquable ? 'button' : undefined}
                      tabIndex={estCliquable ? 0 : undefined}
                      onClick={() => ligne.compte && setCompteOuvert(ligne.compte.id)}
                      onKeyDown={(e) => {
                        if (ligne.compte && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault()
                          setCompteOuvert(ligne.compte.id)
                        }
                      }}
                      className={`flex items-center justify-between py-2.5 text-sm ${estCliquable ? 'cursor-pointer hover:text-texte' : ''}`}
                    >
                      <span className="flex items-center text-texte">
                        {ligne.compte?.etablissement && (
                          <EtablissementLogo
                            logoKey={ligne.compte.etablissement.logo_key}
                            nom={ligne.compte.etablissement.nom}
                            className="mr-2"
                          />
                        )}
                        {ligne.compte?.nom ?? (
                          // Le bucket « Sans compte » n'est pas un compte : c'est le
                          // reliquat des lignes jamais rattachées. Sans cette
                          // explication, l'utilisateur cherche à le renommer ou à le
                          // supprimer (recette du 02/09/2026).
                          <span title="Ce n'est pas un compte, mais le regroupement des lignes de votre patrimoine qui ne sont rattachées à aucun compte. Pour les ranger, ouvrez la ligne concernée depuis Patrimoine et choisissez-lui un compte.">
                            Sans compte
                          </span>
                        )}
                        <span className="ml-2 text-xs text-texte-attenue">
                          {ligne.nombre_lignes} ligne{ligne.nombre_lignes > 1 ? 's' : ''}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="font-medium text-texte">{formatEuro(ligne.solde, 2, montantsMasques)}</span>
                        {ligne.compte && (
                          // Cible tactile de 44 px et libellé qui NOMME le compte
                          // (audit de design du 03/09/2026) : ce bouton mesurait
                          // 55 × 16 px, et trois d'entre eux cohabitent à quelques
                          // pixels sur un même écran — viser la mauvaise ligne
                          // était facile au doigt. Les trois annonçaient en outre
                          // « Supprimer » à l'identique à un lecteur d'écran, sans
                          // dire de quel compte il s'agissait.
                          <button
                            type="button"
                            onClick={(e) => demanderSuppression(ligne, e)}
                            aria-label={`Supprimer le compte ${ligne.compte.nom}`}
                            className="-my-2 min-h-11 shrink-0 px-2 text-xs text-negatif hover:underline"
                          >
                            Supprimer
                          </button>
                        )}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        ))
      )}

      {compteOuvert && <CompteDetailModal compteId={compteOuvert} onClose={() => setCompteOuvert(null)} />}

      {confirmSuppression?.compte && (
        <Modale onClose={() => setConfirmSuppression(null)} panelClassName="w-full max-w-sm rounded-xl bg-surface p-6 shadow-xl">
          {({ titleId }) => (
            <>
              <h2 id={titleId} className="text-lg font-semibold text-texte">
                Supprimer ce compte ?
              </h2>
              <p className="mt-2 text-sm text-texte">
                Le compte <span className="font-medium text-texte">{confirmSuppression.compte!.nom}</span> sera supprimé.
                {confirmSuppression.nombre_lignes > 0 ? (
                  <>
                    {' '}
                    Ses {confirmSuppression.nombre_lignes} ligne{confirmSuppression.nombre_lignes > 1 ? 's' : ''} de patrimoine{' '}
                    <span className="font-medium text-texte">ne sont pas supprimées</span> : elles rejoignent « Sans compte ».
                  </>
                ) : (
                  " Il ne contient aucune ligne."
                )}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmSuppression(null)}
                  disabled={suppressionEnCours}
                  className="rounded-md px-4 py-2 text-sm font-medium text-texte-attenue hover:bg-surface-elevee disabled:opacity-40"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmerSuppression}
                  disabled={suppressionEnCours}
                  className="rounded-md bg-negatif px-4 py-2 text-sm font-medium text-surface hover:opacity-90 disabled:opacity-40"
                >
                  {suppressionEnCours ? 'Suppression...' : 'Supprimer'}
                </button>
              </div>
            </>
          )}
        </Modale>
      )}
    </div>
  )
}
