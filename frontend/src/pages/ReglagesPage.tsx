import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type { ScheduledJob } from '../api/types'
import Card from '../components/Card'
import { CLASSES_BOUTON_PRIMAIRE, CLASSES_BOUTON_SECONDAIRE, SecondaryButton, SegmentedControl } from '../components/Controls'
import DeclarationPatrimoineModal from '../components/DeclarationPatrimoineModal'
import DetenteursCard from '../components/DetenteursCard'
import EtatErreur from '../components/EtatErreur'
import EtatVide from '../components/EtatVide'
import FoyerCard from '../components/FoyerCard'
import GestionFoyerCard from '../components/GestionFoyerCard'
import { IconBouclier, IconHorloge, IconPartage, IconPersonne, IconReglages } from '../components/icons'
import JobCard from '../components/JobCard'
import JournalAccesCard from '../components/JournalAccesCard'
import WelcomeWizard from '../components/onboarding/WelcomeWizard'
import PartageCard from '../components/PartageCard'
import PreferencesCard from '../components/PreferencesCard'
import SauvegardeDonneesCard from '../components/SauvegardeDonneesCard'
import SessionsCard from '../components/SessionsCard'
import { SkeletonTexte } from '../components/Skeleton'
import { useAuth } from '../hooks/useAuth'

type OngletKey = 'general' | 'detenteurs' | 'securite' | 'partage' | 'automatisations'

const ONGLETS: { key: OngletKey; label: string; Icone: typeof IconReglages }[] = [
  { key: 'general', label: 'Général', Icone: IconReglages },
  { key: 'detenteurs', label: 'Détenteurs', Icone: IconPersonne },
  { key: 'securite', label: 'Comptes & sécurité', Icone: IconBouclier },
  { key: 'partage', label: 'Partage', Icone: IconPartage },
  { key: 'automatisations', label: 'Automatisations', Icone: IconHorloge },
]

const ONGLET_PAR_DEFAUT: OngletKey = 'general'

/** Barre d'onglets (retour utilisateur : la page à une seule colonne, avec une
 * dizaine de cartes empilées, était devenue difficile à parcourir). Sélection
 * portée par l'URL (`?onglet=...`, même pattern que les filtres de
 * `PortefeuillePage.tsx` — backlog 2.K.2) plutôt qu'un état local : un lien direct
 * vers un onglet précis (ex. depuis un message d'erreur) reste possible, et le
 * retour navigateur restitue l'onglet précédent. Clé omise de l'URL quand elle vaut
 * l'onglet par défaut.
 *
 * Chaque section vit dans son propre composant (`components/*Card.tsx`) — cette
 * page ne fait plus que les assembler sous les onglets, cf. backlog audit
 * maintenabilité (même raison que le découpage passé de `PortefeuillePage.tsx`,
 * § I.3). */
export default function ReglagesPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const ongletParam = searchParams.get('onglet') as OngletKey | null
  const onglet = ONGLETS.some((o) => o.key === ongletParam) ? (ongletParam as OngletKey) : ONGLET_PAR_DEFAUT

  function setOnglet(suivant: OngletKey) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (suivant === ONGLET_PAR_DEFAUT) next.delete('onglet')
      else next.set('onglet', suivant)
      return next
    })
  }

  const [jobs, setJobs] = useState<ScheduledJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [declarationOuverte, setDeclarationOuverte] = useState(false)
  const [assistantOuvert, setAssistantOuvert] = useState(false)

  function chargerJobs() {
    setLoading(true)
    setError(null)
    api
      .listJobs()
      .then(setJobs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(chargerJobs, [])

  function updateJobInState(updated: ScheduledJob) {
    setJobs((prev) => prev.map((j) => (j.job_key === updated.job_key ? updated : j)))
  }

  return (
    // Colonne unique de 760 px (maquette de la refonte) : des réglages se lisent en
    // liste, jamais en grille — au-delà de cette largeur, l'œil perd le début de la
    // ligne suivante.
    // Les ONGLETS RESTENT, contrairement à la maquette qui les remplaçait par des
    // panneaux empilés au motif qu'« il y a peu de réglages ». C'est vrai du
    // prototype (3 panneaux), pas de cette application (une douzaine, dont le
    // journal d'accès et les tâches planifiées) : ils avaient justement été
    // introduits en réponse au retour « une dizaine de cartes empilées, difficile à
    // parcourir ». Les empiler à nouveau ramènerait le défaut signalé.
    <div className="mx-auto max-w-[760px] space-y-[14px]">
      <h1 className="hidden text-[28px] font-semibold tracking-title text-ink md:block">Réglages</h1>

      <SegmentedControl
        options={ONGLETS.map(({ key, label, Icone }) => ({
          valeur: key,
          libelle: (
            <span className="flex items-center gap-1.5">
              <Icone className="h-4 w-4" />
              {label}
            </span>
          ),
        }))}
        valeur={onglet}
        onChange={setOnglet}
        ariaLabel="Catégories de réglages"
        semantique="onglets"
        // Sous 768 px, les cinq onglets se repliaient sur trois lignes DANS la
        // gouttière arrondie du contrôle segmenté, qui n'est pas faite pour ça — la
        // rangée défile horizontalement à la place (motif iOS), et reprend sa largeur
        // naturelle dès qu'elle tient.
        className="max-w-full flex-nowrap overflow-x-auto md:w-fit md:flex-wrap md:overflow-visible"
      />

      {onglet === 'general' && (
        <div className="space-y-[14px]">
          {user?.role === 'proprietaire' && (
            <Card title="Assistant de bienvenue">
              <p className="mb-4 text-sm text-texte">
                Le parcours guidé affiché à la création de ce compte — utile pour redécouvrir les réglages de départ, ou
                revoir ceux qui n'auraient pas été renseignés au premier passage.
              </p>
              <SecondaryButton onClick={() => setAssistantOuvert(true)}>
                Revoir l'assistant de bienvenue
              </SecondaryButton>
            </Card>
          )}
          <FoyerCard />
          <PreferencesCard />
          <Card title="Exporter">
            <p className="mb-4 text-sm text-texte">
              Fichiers CSV compatibles Excel (séparateur point-virgule, décimale virgule), téléchargés directement par le
              navigateur.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="/api/export/positions"
                className={CLASSES_BOUTON_SECONDAIRE}
              >
                Positions
              </a>
              <a
                href="/api/export/transactions"
                className={CLASSES_BOUTON_SECONDAIRE}
              >
                Transactions
              </a>
              <a
                href="/api/export/performance"
                className={CLASSES_BOUTON_SECONDAIRE}
              >
                Rentabilité
              </a>
            </div>

            <p className="mb-4 mt-6 text-sm text-texte">
              Relevé de patrimoine PDF : une photographie mise en forme, prête à imprimer ou archiver — patrimoine net,
              répartition et rentabilité globale.
            </p>
            <a
              href="/api/export/patrimoine.pdf"
              className={CLASSES_BOUTON_PRIMAIRE}
            >
              Relevé de patrimoine (PDF)
            </a>

            <p className="mb-4 mt-6 text-sm text-texte">
              Déclaration de patrimoine (backlog 2.Q.2) : un document paramétrable pour un tiers concret (banque pour un prêt,
              notaire pour une donation) — sélection actif par actif, filtrage par détenteur, profil emprunteur optionnel.
            </p>
            <SecondaryButton onClick={() => setDeclarationOuverte(true)}>
              Déclaration de patrimoine (PDF)
            </SecondaryButton>
          </Card>
          {/* Sauvegarde complète (backlog Y.1) : carte distincte de « Exporter »
              ci-dessus — celle-ci ne produit pas un document à lire mais un
              fichier ré-importable, et porte l'action destructrice d'import. */}
          <SauvegardeDonneesCard />
        </div>
      )}

      {onglet === 'detenteurs' && (
        <div className="space-y-[14px]">
          <DetenteursCard />
        </div>
      )}

      {onglet === 'securite' && (
        <div className="space-y-[14px]">
          <GestionFoyerCard />
          <SessionsCard />
          <JournalAccesCard />
        </div>
      )}

      {onglet === 'partage' && (
        <div className="space-y-[14px]">
          <PartageCard />
        </div>
      )}

      {onglet === 'automatisations' && (
        <div className="space-y-[14px]">
          {loading && <SkeletonTexte />}
          {error && <EtatErreur message={error} onReessayer={chargerJobs} />}
          {!loading && !error && jobs.length === 0 && <EtatVide titre="Aucune tâche planifiée." />}
          {jobs.map((job) => (
            <JobCard key={job.job_key} job={job} onChange={updateJobInState} />
          ))}
        </div>
      )}

      {declarationOuverte && <DeclarationPatrimoineModal onClose={() => setDeclarationOuverte(false)} />}
      {assistantOuvert && (
        // Pas le composant `Modale.tsx` habituel (fond assombri + panneau centré) :
        // l'assistant occupe tout l'écran, même traitement que lors du premier
        // lancement (`App.tsx`) — seul `role="dialog"`/`aria-modal` est repris ici,
        // pour que le contenu de Réglages en dessous reste correctement ignoré par
        // les technologies d'assistance tant que l'assistant est ouvert (et, au
        // passage, distingue sans ambiguïté son titre "Bienvenue" de la carte
        // "Assistant de bienvenue" affichée juste en dessous).
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Assistant de bienvenue">
          <WelcomeWizard onClose={() => setAssistantOuvert(false)} />
        </div>
      )}
    </div>
  )
}
