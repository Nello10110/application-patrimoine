import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ZoneGeographiqueInfo } from '../api/types'
import Card from '../components/Card'
import EtatErreur from '../components/EtatErreur'
import { SkeletonTexte } from '../components/Skeleton'

// Couleurs distinctes par zone (bordure + badge), choisies pour rester lisibles en
// clair comme en sombre — purement décoratif, aucun lien avec les couleurs des
// graphiques du Tableau de bord (qui restent neutres pour rester lisibles à plus
// grande échelle, cf. `utils/chartTheme`).
const STYLE_PAR_ZONE: Record<string, { emoji: string; bordure: string; badge: string }> = {
  'Amérique du Nord': {
    emoji: '🌎',
    bordure: 'border-l-blue-500',
    badge: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  },
  Europe: {
    emoji: '🏰',
    bordure: 'border-l-indigo-500',
    badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  },
  Japon: {
    emoji: '🎌',
    bordure: 'border-l-rose-500',
    badge: 'bg-rose-50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  },
  'Asie-Pacifique (hors Japon)': {
    emoji: '🌏',
    bordure: 'border-l-amber-500',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
  'Marchés émergents': {
    emoji: '🌱',
    bordure: 'border-l-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  'Autres zones': {
    emoji: '🧭',
    bordure: 'border-l-slate-400',
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  },
}

interface SecteurInfo {
  emoji: string
  nom: string
  description: string
  exemples: string
}

// Contenu purement pédagogique (pas de calcul associé) : gardé ici en statique
// plutôt que côté backend, contrairement aux zones géographiques (§ ci-dessus)
// qui, elles, reflètent une vraie règle de classement du portefeuille.
const SECTEURS: SecteurInfo[] = [
  {
    emoji: '💻',
    nom: "Technologies de l'information",
    description: 'Logiciels, matériel informatique, semi-conducteurs : les entreprises qui construisent les outils numériques du quotidien.',
    exemples: 'Apple, Microsoft, Nvidia',
  },
  {
    emoji: '🏦',
    nom: 'Financières',
    description: 'Banques, assurances, sociétés de gestion : le secteur qui fait circuler l’argent.',
    exemples: 'BNP Paribas, JPMorgan',
  },
  {
    emoji: '🏥',
    nom: 'Santé',
    description: 'Pharmacie, biotechnologies, équipements médicaux et hospitaliers.',
    exemples: 'Sanofi, Pfizer',
  },
  {
    emoji: '🛍️',
    nom: 'Consommation discrétionnaire',
    description: 'Ce qu’on achète par envie plutôt que par nécessité : automobile, loisirs, hôtellerie, luxe, e-commerce.',
    exemples: 'LVMH, Amazon, Tesla',
  },
  {
    emoji: '🏭',
    nom: 'Industrie',
    description: 'Machines, aéronautique, transport, construction, défense.',
    exemples: 'Airbus, Safran',
  },
  {
    emoji: '📡',
    nom: 'Communication',
    description: 'Télécoms, médias, réseaux sociaux, jeux vidéo, streaming.',
    exemples: 'Meta, Netflix, Alphabet (Google)',
  },
  {
    emoji: '🛒',
    nom: 'Consommation de base',
    description: 'Ce qu’on achète par nécessité, quelle que soit la conjoncture : alimentation, hygiène, boissons.',
    exemples: 'Danone, Procter & Gamble',
  },
  {
    emoji: '⚡',
    nom: 'Énergie',
    description: 'Pétrole, gaz, énergies renouvelables, services pétroliers.',
    exemples: 'TotalEnergies, ExxonMobil',
  },
  {
    emoji: '🧱',
    nom: 'Matériaux',
    description: 'Matières premières transformées : chimie, mines, papier, emballage, acier.',
    exemples: 'Air Liquide, ArcelorMittal',
  },
  {
    emoji: '💡',
    nom: 'Services publics',
    description: 'Électricité, eau, gaz distribués aux particuliers et entreprises — secteur réglementé, généralement stable.',
    exemples: 'EDF, Veolia',
  },
  {
    emoji: '🏢',
    nom: 'Immobilier',
    description: 'Foncières cotées, promoteurs, gestion de patrimoine immobilier.',
    exemples: 'Unibail-Rodamco-Westfield',
  },
]

interface QuestionReponse {
  question: string
  reponse: string
}

const QUESTIONS_CHIFFRES: QuestionReponse[] = [
  {
    question: '🔍 C’est quoi le "look-through" ?',
    reponse:
      'Un ETF "Monde" ne dit pas grand-chose en soi : c’est un panier de centaines d’actions. Le look-through consiste à regarder DANS le panier pour savoir ce qu’il contient vraiment (quels pays, quels secteurs), plutôt que de s’arrêter au nom du fonds. C’est ce qui permet à l’appli de vous dire "35% Amérique du Nord" même si vous ne détenez "que" quelques ETF.',
  },
  {
    question: '❓ "Non catégorisé" vs "Autres zones/secteurs", quelle différence ?',
    reponse:
      '"Non catégorisé" veut dire qu’on n’a tout simplement pas la donnée (aucune composition connue pour ce titre). "Autres zones"/"Autres secteurs" veut dire qu’on SAIT où est la position, mais que ça ne rentre dans aucune des grandes catégories habituelles (ex. un pays comme le Zimbabwe, ou un secteur de niche). La nuance compte : la première mérite un rafraîchissement des données, la seconde est juste une catégorie résiduelle légitime.',
  },
  {
    question: '⚖️ Coût moyen pondéré vs FIFO, lequel choisir ?',
    reponse:
      'Ce sont deux façons de calculer le prix de revient quand on vend une partie d’une position achetée en plusieurs fois. Le coût moyen pondéré fait une moyenne de tous les achats. FIFO ("premier entré, premier sorti") considère qu’on revend d’abord les titres les plus anciens. Les deux sont corrects, mais donnent un gain/perte différent à la vente — certains cadres fiscaux imposent l’un ou l’autre. Réglable dans l’écran Réglages.',
  },
  {
    question: '📈 Le rendement annualisé (XIRR), ça veut dire quoi ?',
    reponse:
      'C’est le taux de croissance annuel moyen qui, appliqué à chacun de vos versements (à leur date exacte), retomberait sur la valeur actuelle de votre portefeuille. Contrairement à une simple division gain/investi, il tient compte du MOMENT où l’argent a été investi — un euro investi il y a 3 ans ne "pèse" pas pareil qu’un euro investi hier.',
  },
  {
    question: '🎯 Le score de diversification, comment il est calculé ?',
    reponse:
      'Basé sur l’indice de Herfindahl-Hirschman (un classique en économie pour mesurer la concentration) : plus une seule ligne pèse lourd dans le portefeuille, plus le score baisse. 100/100 serait un portefeuille parfaitement réparti entre un très grand nombre de lignes égales ; un score qui chute signale qu’une poignée de positions domine tout.',
  },
  {
    question: '🧩 Pourquoi la répartition géo d’un ETF est parfois "estimée" ?',
    reponse:
      'Certains fournisseurs de données ne donnent pas toujours le détail pays/secteur d’un fonds. Dans ce cas, l’appli déduit une estimation à partir de l’indice suivi (ex. un "MSCI World" suit une répartition mondiale connue et stable) plutôt que d’afficher "Non catégorisé". L’écran "Qualité des données" du Tableau de bord indique toujours si un chiffre est mesuré ou estimé.',
  },
]

interface GlossaireEntry {
  terme: string
  definition: string
}

const GLOSSAIRE: GlossaireEntry[] = [
  { terme: 'ETF', definition: 'Fonds coté en bourse qui réplique un indice (ex. le CAC 40 ou le S&P 500) — on l’achète et le vend comme une action, mais il contient plusieurs dizaines à plusieurs milliers de titres.' },
  { terme: 'ISIN', definition: 'Le "numéro de sécurité sociale" d’un titre financier : un code unique à 12 caractères qui l’identifie sans ambiguïté, quel que soit le courtier ou la place boursière.' },
  { terme: 'PEA / CTO', definition: 'Deux enveloppes pour détenir des titres en France. Le PEA (Plan d’Épargne en Actions) a un cadre fiscal avantageux mais des restrictions (titres européens surtout, plafond de versement). Le CTO (Compte-Titres Ordinaire) n’a pas ces limites, mais une fiscalité moins favorable.' },
  { terme: 'TER', definition: '"Total Expense Ratio" : les frais de gestion annuels d’un fonds, en % de l’encours, prélevés automatiquement — pas besoin de les payer à part, ils réduisent simplement la performance du fonds chaque année.' },
  { terme: 'Drawdown', definition: 'La perte maximale subie entre un plus haut et le creux qui a suivi, sur une période donnée. Un bon indicateur de "à quel point ça peut faire mal" avant de remonter.' },
  { terme: 'Volatilité', definition: 'À quel point le prix d’un titre bouge dans le temps. Une volatilité élevée veut dire des variations plus fortes (à la hausse comme à la baisse) — pas forcément une mauvaise performance, mais un trajet plus mouvementé.' },
  { terme: 'Plus-value latente / réalisée', definition: 'Latente : le gain "sur le papier" d’une position toujours détenue, qui peut encore monter ou redescendre. Réalisée : le gain devenu définitif au moment de la vente.' },
  { terme: 'Rééquilibrage', definition: 'Ajuster ses positions pour revenir vers ses objectifs de répartition, quand le marché a fait dériver le portefeuille loin de la cible initiale.' },
]

function ZoneCard({ zone }: { zone: ZoneGeographiqueInfo }) {
  const style = STYLE_PAR_ZONE[zone.zone] ?? STYLE_PAR_ZONE['Autres zones']
  return (
    <div className={`rounded-xl border border-l-4 border-bordure bg-surface p-4 shadow-sm ${style.bordure}`}>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-texte">
        <span aria-hidden="true">{style.emoji}</span>
        {zone.zone}
      </p>
      {zone.pays.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {zone.pays.map((pays) => (
            <span key={pays} className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}>
              {pays}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-texte-attenue">
          Pas de liste fixe : c’est la catégorie résiduelle pour un pays connu mais qui ne rentre dans aucune des 5 autres zones
          (ex. certains petits marchés d’Europe de l’Est ou d’Asie centrale). Elle grandira automatiquement si l’appli reconnaît un
          jour de nouveaux pays.
        </p>
      )}
    </div>
  )
}

function SectorCard({ secteur }: { secteur: SecteurInfo }) {
  return (
    <div className="rounded-xl border border-bordure bg-surface p-4 shadow-sm">
      <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-texte">
        <span aria-hidden="true">{secteur.emoji}</span>
        {secteur.nom}
      </p>
      <p className="text-xs text-texte">{secteur.description}</p>
      <p className="mt-2 text-xs text-texte-attenue">Ex. {secteur.exemples}</p>
    </div>
  )
}

function AccordeonItem({ question, reponse }: QuestionReponse) {
  return (
    <details className="group rounded-lg border border-bordure p-3 open:bg-surface-elevee">
      <summary className="cursor-pointer list-none text-sm font-medium text-texte marker:content-none">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
        {question}
      </summary>
      <p className="mt-2 pl-4 text-sm text-texte">{reponse}</p>
    </details>
  )
}

export default function AidePage() {
  const [zones, setZones] = useState<ZoneGeographiqueInfo[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  function charger() {
    setErreur(null)
    api
      .getZonesGeographiques()
      .then(setZones)
      .catch((err) => setErreur(err.message))
  }

  useEffect(charger, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-texte">🧭 Aide &amp; FAQ</h2>
        <p className="mt-1 text-sm text-texte-attenue">
          Un petit guide pour comprendre ce que racontent vraiment les chiffres du Tableau de bord — pensé pour un premier
          passage dans l’investissement, promis, sans jargon inutile.
        </p>
      </div>

      <Card title="🌍 Les 6 zones géographiques">
        <p className="mb-4 text-sm text-texte">
          Chaque position du portefeuille est rattachée à une zone selon le pays où se trouve réellement l’activité de
          l’entreprise (pas le pays où le fonds est domicilié administrativement). Voici les pays connus de chaque zone,
          directement depuis les règles utilisées par l’application.
        </p>
        {erreur && <EtatErreur message={erreur} onReessayer={charger} />}
        {!zones && !erreur && <SkeletonTexte lignes={3} />}
        {zones && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {zones.map((zone) => (
              <ZoneCard key={zone.zone} zone={zone} />
            ))}
          </div>
        )}
      </Card>

      <Card title="🏷️ Les 11 secteurs d'activité">
        <p className="mb-4 text-sm text-texte">
          En plus de la zone géographique, chaque position est aussi rattachée à un secteur — le TYPE d’activité de
          l’entreprise, indépendamment d’où elle se trouve.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECTEURS.map((secteur) => (
            <SectorCard key={secteur.nom} secteur={secteur} />
          ))}
        </div>
      </Card>

      <Card title="🤔 Comprendre les chiffres de l'application">
        <div className="space-y-2">
          {QUESTIONS_CHIFFRES.map((qa) => (
            <AccordeonItem key={qa.question} {...qa} />
          ))}
        </div>
      </Card>

      <Card title="📡 D'où viennent les données ?">
        <div className="space-y-3 text-sm text-texte">
          <p>
            <span className="font-medium text-texte">Yahoo Finance</span> fournit les cours des
            actions/cryptos et une partie de la composition des fonds, rafraîchis automatiquement (cadence réglable dans
            Réglages).
          </p>
          <p>
            <span className="font-medium text-texte">justETF</span> fournit le cours de référence
            des ETF ainsi que leur composition géographique/sectorielle détaillée et leur description, sous une autorisation
            spécifique obtenue par l’utilisateur — traité avec beaucoup d’égards (rafraîchissement peu fréquent, pour ne pas
            solliciter leur service à l’excès).
          </p>
          <p>
            Aucune donnée n’est envoyée à l’extérieur : l’application tourne entièrement en local, sur votre machine. Elle
            va simplement chercher les cours dont elle a besoin, comme le ferait n’importe quel site financier.
          </p>
        </div>
      </Card>

      <Card title="📖 Petit glossaire">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {GLOSSAIRE.map((entry) => (
            <div key={entry.terme}>
              <dt className="text-sm font-semibold text-texte">{entry.terme}</dt>
              <dd className="text-xs text-texte">{entry.definition}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  )
}
