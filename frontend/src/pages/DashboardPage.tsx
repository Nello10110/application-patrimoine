import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { PatrimoineHistoryPoint, PortfolioHistoryPoint } from '../api/types'
import Card from '../components/Card'
import { SecondaryButton } from '../components/Controls'
import PatrimoineNetCard from '../components/PatrimoineNetCard'
import PortfolioHistoryChart, { ControlesCourbe } from '../components/PortfolioHistoryChart'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'

/** Écran d'accueil — délibérément court (demande directe de l'utilisateur du
 * 07/09/2026 : « je veux un écran d'accueil un peu plus light »).
 *
 * Il ne répond qu'à la question qu'on se pose en ouvrant l'application : combien, et
 * dans quel sens ça va. Le chiffre, sa variation, la courbe, les trois poches et la
 * répartition par type — rien d'autre.
 *
 * Tout le reste (rentabilité, métriques avancées, répartitions géographique et
 * sectorielle, qualité des données, exposition consolidée, coût de gestion, revenus)
 * a rejoint l'écran `Analyse`, où il est rangé par question plutôt qu'empilé sous un
 * repli « Détail » que personne n'ouvrait. Trois appels réseau coûteux
 * (`/analysis`, `/performance`, `/analysis/cout-gestion`) partent avec lui : cet
 * écran ne charge plus que les deux historiques dont dépend la courbe, et la liste
 * des positions pour savoir si le portefeuille est vide. */
export default function DashboardPage() {
  const { detenteurId } = usePreferencesAffichage()

  // Mode étagé porté ici plutôt que dans le graphique : sa pilule vit dans l'en-tête
  // du bloc héros (maquette), rendue par `PatrimoineNetCard`, alors que le tracé
  // qu'elle pilote est plus bas. Un seul état pour les deux.
  const [modeEtage, setModeEtage] = useState(false)

  // Historique du portefeuille (backlog 2.K.6) : remonté ici plutôt que chargé dans
  // `PortfolioHistoryChart` lui-même — partagé avec `PatrimoineNetCard` (variation
  // affichée sur le chiffre principal), un seul appel réseau pour les deux. Endpoint
  // coûteux (jusqu'à une minute), chargé une seule fois au montage.
  const [historique, setHistorique] = useState<PortfolioHistoryPoint[] | null>(null)
  const [chargementHistorique, setChargementHistorique] = useState(true)
  const [erreurHistorique, setErreurHistorique] = useState<string | null>(null)

  // Historique combiné financier + immobilier/épargne − emprunts (feature Net/Brut/
  // Financier sur toute la page Synthèse) — même philosophie que `historique`
  // ci-dessus (partagé entre `PatrimoineNetCard` et `PortfolioHistoryChart`), mais
  // rechargé quand `detenteurId` change (la série diffère selon la vue).
  const [patrimoineHistorique, setPatrimoineHistorique] = useState<PatrimoineHistoryPoint[] | null>(null)
  const [chargementPatrimoineHistorique, setChargementPatrimoineHistorique] = useState(true)
  const [erreurPatrimoineHistorique, setErreurPatrimoineHistorique] = useState<string | null>(null)

  // Portefeuille vide : la liste des positions suffit à le savoir. `/analysis`, qui
  // portait cette information jusqu'ici, agrège en plus les compositions de fonds et
  // les répartitions — beaucoup de travail serveur pour une question binaire, et il
  // n'a plus de raison d'être appelé depuis cet écran.
  const [portefeuilleVide, setPortefeuilleVide] = useState(false)

  function chargerHistorique() {
    setChargementHistorique(true)
    setErreurHistorique(null)
    api
      .getPortfolioHistory()
      .then((res) => setHistorique(res.points))
      .catch((err) => setErreurHistorique(err.message))
      .finally(() => setChargementHistorique(false))
  }

  function chargerPatrimoineHistorique() {
    setChargementPatrimoineHistorique(true)
    setErreurPatrimoineHistorique(null)
    api
      .getPatrimoineHistory(detenteurId)
      .then((res) => setPatrimoineHistorique(res.points))
      .catch((err) => setErreurPatrimoineHistorique(err.message))
      .finally(() => setChargementPatrimoineHistorique(false))
  }

  // Silencieux en cas d'échec : ce drapeau ne pilote qu'un encart d'invitation. Une
  // erreur réseau ne doit pas faire apparaître « aucune position » à quelqu'un qui en
  // a — l'absence d'encart est le repli sûr.
  function chargerPortefeuilleVide() {
    api
      .listHoldings()
      .then((lignes) => setPortefeuilleVide(lignes.length === 0))
      .catch(() => setPortefeuilleVide(false))
  }

  function chargerDonnees() {
    chargerHistorique()
    chargerPatrimoineHistorique()
    chargerPortefeuilleVide()
  }

  useEffect(chargerHistorique, [])
  useEffect(chargerPortefeuilleVide, [])
  useEffect(chargerPatrimoineHistorique, [detenteurId])

  const chargement = chargementHistorique || chargementPatrimoineHistorique

  return (
    <div className="space-y-[14px]">
      <div className="flex items-center justify-end md:justify-between">
        <h1 className="hidden text-[28px] font-semibold tracking-title text-ink md:block">Tableau de bord</h1>
        <SecondaryButton onClick={chargerDonnees} disabled={chargement} className="min-h-11 md:min-h-0">
          {chargement ? 'Actualisation...' : 'Actualiser'}
        </SecondaryButton>
      </div>

      <PatrimoineNetCard
        historiquePortefeuille={{ points: historique, loading: chargementHistorique }}
        historiquePatrimoine={{ points: patrimoineHistorique, loading: chargementPatrimoineHistorique }}
        controlesCourbe={<ControlesCourbe stacked={modeEtage} onStackedChange={setModeEtage} />}
        courbe={
          <PortfolioHistoryChart
            stacked={modeEtage}
            points={historique}
            loading={chargementHistorique}
            error={erreurHistorique}
            onRetry={chargerHistorique}
            pointsPatrimoine={patrimoineHistorique}
            loadingPatrimoine={chargementPatrimoineHistorique}
            errorPatrimoine={erreurPatrimoineHistorique}
            onRetryPatrimoine={chargerPatrimoineHistorique}
          />
        }
      />

      {/* Encart teinté : même exception que `QualiteDonneesCard` (backlog 2.K.1) —
          hors des 9 jetons sémantiques, pas de jeton de fond teinté multi-nuances
          disponible pour ce besoin. C'est un appel à l'action, pas de l'information
          complémentaire : il reste sur l'écran d'accueil quand tout le reste part. */}
      {portefeuilleVide && (
        <Card className="border-avertissement/25 bg-avertissement/10">
          <p className="text-sm text-avertissement">
            Aucune position dans le portefeuille. Commence par{' '}
            <Link to="/import" className="font-medium underline">
              importer ton portefeuille
            </Link>
            .
          </p>
        </Card>
      )}

      {/* Le contenu déplacé doit rester trouvable depuis l'endroit d'où il vient :
          sans ce lien, quelqu'un qui consultait la répartition sectorielle sous le
          repli « Détail » n'aurait aucun moyen de deviner où elle est passée. */}
      <p className="text-[13px] text-ink3">
        Répartitions, rentabilité, qualité des données et revenus ont leur écran :{' '}
        <Link to="/analyse" className="font-medium text-accent hover:underline">
          voir l'analyse détaillée
        </Link>
        .
      </p>
    </div>
  )
}
