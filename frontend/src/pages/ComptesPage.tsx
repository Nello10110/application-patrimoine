import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { CompteAvecSolde, Etablissement, Holding } from '../api/types'
import AjoutCompteForm from '../components/AjoutCompteForm'
import Card from '../components/Card'
import CompteDetailModal from '../components/CompteDetailModal'
import { PrimaryButton, SecondaryButton } from '../components/Controls'
import EtablissementEditModal from '../components/EtablissementEditModal'
import EtablissementLogo from '../components/EtablissementLogo'
import { IconAvertissement, IconChevron, IconCrayon } from '../components/icons'
import EtablissementsCard from '../components/EtablissementsCard'
import EtatErreur from '../components/EtatErreur'
import EtatVide from '../components/EtatVide'
import { IconFermer } from '../components/icons'
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
  // Les deux formulaires de création vivaient en cartes PERMANENTES en haut de
  // l'écran, avant même la liste des comptes (maquette : deux boutons dans
  // l'en-tête). On crée un compte de temps en temps, on consulte ses soldes tous
  // les jours — c'est la liste qui doit tenir le haut.
  const [feuille, setFeuille] = useState<null | 'compte' | 'etablissement'>(null)
  // Crayon sur l'en-tête d'un groupe (maquette) : renommer l'établissement depuis
  // l'endroit où on le voit, au lieu d'aller le chercher dans une carte séparée.
  const [etablissementEnEdition, setEtablissementEnEdition] = useState<Etablissement | null>(null)

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
    <div className="space-y-[14px]">
      <div className="flex flex-wrap items-center justify-end gap-3 md:justify-between">
        <h1 className="hidden text-[28px] font-semibold tracking-title text-ink md:block">Comptes</h1>
        <div className="flex flex-wrap items-center gap-3">
          {/* Le total du foyer à côté du titre, en 26 px (maquette de la refonte) :
              c'est le chiffre héros de cet écran, il n'a pas besoin d'une carte. */}
          <span className="text-[26px] font-semibold text-ink">{formatEuro(soldeTotal, 0, montantsMasques)}</span>
          <SecondaryButton onClick={() => setFeuille('etablissement')}>Établissement</SecondaryButton>
          <PrimaryButton onClick={() => setFeuille('compte')}>Ajouter un compte</PrimaryButton>
        </div>
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
      {lignes.length === 0 ? (
        <EtatVide
          titre="Aucun compte déclaré."
          description="Crée un compte ci-dessus (vide, ou une ligne d'épargne en choisissant un type), ou rattaches-en un directement depuis Portefeuille lors de l'ajout d'une position."
        />
      ) : (
        nomsGroupes.map((nomGroupe) => {
          const etablissementDuGroupe = etablissements.find((e) => e.nom === nomGroupe) ?? null
          return (
          <Card
            key={nomGroupe}
            title={nomGroupe}
            headerActions={
              etablissementDuGroupe && (
                <button
                  type="button"
                  onClick={() => setEtablissementEnEdition(etablissementDuGroupe)}
                  aria-label={`Modifier l'établissement ${nomGroupe}`}
                  title="Renommer, changer le logo"
                  className="flex h-11 w-11 items-center justify-center rounded-chip text-ink4 transition-colors hover:bg-hover hover:text-ink2 md:h-7 md:w-7"
                >
                  <IconCrayon className="h-[15px] w-[15px]" />
                </button>
              )
            }
          >
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
                            etablissementId={ligne.compte.etablissement.id}
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
                        {/* Retour utilisateur du 09/09/2026 : une répartition entre
                            détenteurs commencée puis rompue (le plus souvent la
                            suppression d'un détenteur qui y avait une part) laissait
                            un compte à moitié réparti sans le moindre indice —
                            jamais pour une répartition simplement jamais commencée,
                            un état valide (cf. `repartition_incomplete` côté API). */}
                        {ligne.repartition_incomplete && (
                          <span
                            className="ml-1.5 inline-flex shrink-0"
                            role="img"
                            aria-label="Répartition entre détenteurs incomplète sur au moins une ligne de ce compte"
                            title="Répartition entre détenteurs incomplète sur au moins une ligne de ce compte"
                          >
                            <IconAvertissement className="h-4 w-4 text-warn" />
                          </span>
                        )}
                      </span>
                      {/* Plus de « Supprimer » sur la ligne (recommandation
                          explicite du paquet de design) : un lien rouge à côté du
                          solde d'un compte à 89 000 €, sur une ligne elle-même
                          cliquable, est trop facile à toucher par erreur. La
                          suppression vit désormais au fond de la fiche du compte,
                          derrière sa confirmation. Le chevron dit ce que la ligne
                          fait : elle ouvre cette fiche. */}
                      <span className="flex items-center gap-3">
                        <span className="font-medium text-texte">{formatEuro(ligne.solde, 2, montantsMasques)}</span>
                        {estCliquable && <IconChevron aria-hidden className="h-4 w-4 shrink-0 rotate-180 text-ink4" />}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
          )
        })
      )}

      {compteOuvert && (
        <CompteDetailModal
          compteId={compteOuvert}
          onClose={() => setCompteOuvert(null)}
          onSupprime={() => {
            setCompteOuvert(null)
            charger()
          }}
        />
      )}

      {feuille && (
        <Modale
          onClose={() => setFeuille(null)}
          panelClassName="w-full max-w-[520px] rounded-hero border border-stroke bg-panel-hi p-6 shadow-glass-lg backdrop-blur-glass"
        >
          {({ titleId }) => (
            <>
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2 id={titleId} className="text-[22px] font-semibold tracking-title text-ink">
                  {feuille === 'compte' ? 'Ajouter un compte' : 'Établissements'}
                </h2>
                <button
                  type="button"
                  onClick={() => setFeuille(null)}
                  aria-label="Fermer"
                  className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-chip bg-track text-ink3 hover:text-ink"
                >
                  <IconFermer className="h-4 w-4" />
                </button>
              </div>
              {feuille === 'compte' ? (
                <AjoutCompteForm
                  etablissements={etablissements}
                  onCreated={() => {
                    charger()
                    setFeuille(null)
                  }}
                />
              ) : (
                <EtablissementsCard etablissements={etablissements} onModifies={charger} sansCarte />
              )}
            </>
          )}
        </Modale>
      )}

      {etablissementEnEdition && (
        <EtablissementEditModal
          etablissement={etablissementEnEdition}
          onClose={() => setEtablissementEnEdition(null)}
          onEnregistre={charger}
        />
      )}

    </div>
  )
}
