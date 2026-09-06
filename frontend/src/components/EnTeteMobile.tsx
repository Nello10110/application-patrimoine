import { useEffect, useState } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { api } from '../api/client'
import type { Detenteur } from '../api/types'
import type { Lentille } from '../contexts/preferencesAffichageContextObject'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { useAuth } from '../hooks/useAuth'
import { ROUTES } from '../layout/routes'
import { SegmentedControl } from './Controls'
import { IconOeil, IconOeilBarre } from './icons'
import Modale from './Modale'

const LIBELLE_LENTILLE: Record<Lentille, string> = {
  net: 'vue nette',
  brut: 'vue brute',
  financier: 'vue financière',
}

const OPTIONS_LENTILLE: { valeur: Lentille; libelle: string; aide: string }[] = [
  {
    valeur: 'net',
    libelle: 'Net',
    aide: "Tout ce que vous possédez, MOINS ce que vous devez (emprunts en cours).",
  },
  { valeur: 'brut', libelle: 'Brut', aide: 'Tout ce que vous possédez, sans déduire les emprunts.' },
  { valeur: 'financier', libelle: 'Financier', aide: 'Portefeuille financier seul : actions, ETF, crypto, obligations.' },
]

/** En-tête de l'application sous 768 px (maquette « Refonte mobile ») — remplace
 * `BarreControles`, désormais `hidden md:flex`.
 *
 * La maquette ne garde en haut d'écran que ce qu'un pouce atteint et qu'un œil lit
 * d'un coup : le titre de l'écran, une ligne de contexte, et deux cibles rondes de
 * 44 px. La barre de contrôles desktop y entrait à sept commandes empilées dans une
 * bande qui défilait horizontalement — illisible et inatteignable.
 *
 * Rien n'est perdu pour autant : la lentille et le détenteur, retirés de la barre
 * visible, deviennent la LIGNE DE CONTEXTE (« Foyer · vue nette ») et sont modifiables
 * en la touchant — elle est le bouton qui ouvre la feuille de réglages. Un état affiché
 * qu'on touche pour le changer, plutôt qu'un état affiché DEUX fois (un libellé plus un
 * sélecteur). Le thème, lui, vit déjà dans la feuille « Plus » de `BottomNav` sur
 * mobile : le remettre ici en ferait un troisième emplacement. */
export default function EnTeteMobile() {
  const { lentille, setLentille, montantsMasques, toggleMontantsMasques, detenteurId, setDetenteurId } =
    usePreferencesAffichage()
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [detenteurs, setDetenteurs] = useState<Detenteur[]>([])
  const [reglagesOuverts, setReglagesOuverts] = useState(false)

  useEffect(() => {
    api.listDetenteurs().then(setDetenteurs).catch(() => setDetenteurs([]))
  }, [])

  // `matchPath` et non une égalité stricte : la fiche d'une position (`/patrimoine/:ticker`)
  // doit afficher son titre d'écran comme les autres.
  const titreEcran = ROUTES.find((r) => matchPath({ path: r.path, end: true }, pathname))?.titre ?? 'Patrimoine'
  const nomDetenteur = detenteurId === null ? 'Foyer' : (detenteurs.find((d) => d.id === detenteurId)?.nom ?? 'Foyer')
  const initiale = (user?.nom || user?.username || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="flex shrink-0 items-center gap-2.5 px-1 pb-1 md:hidden">
      <button
        type="button"
        onClick={() => setReglagesOuverts(true)}
        aria-haspopup="dialog"
        className="flex min-w-0 flex-col items-start text-left"
      >
        <h1 className="truncate text-[20px] font-semibold tracking-hero text-ink">{titreEcran}</h1>
        <span className="truncate text-[12px] text-ink3">
          {nomDetenteur} · {LIBELLE_LENTILLE[lentille]}
        </span>
      </button>

      <button
        type="button"
        onClick={toggleMontantsMasques}
        aria-pressed={montantsMasques}
        aria-label={`${montantsMasques ? 'Afficher' : 'Masquer'} les montants`}
        className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-chip border border-hairline bg-chip text-ink2"
      >
        {montantsMasques ? <IconOeilBarre className="h-[18px] w-[18px]" /> : <IconOeil className="h-[18px] w-[18px]" />}
      </button>

      <button
        type="button"
        onClick={() => setReglagesOuverts(true)}
        aria-haspopup="dialog"
        aria-label="Réglages d'affichage"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-chip bg-[image:var(--accent-grad)] text-[15px] font-semibold text-white shadow-accent"
      >
        {initiale}
      </button>

      {reglagesOuverts && (
        <Modale
          onClose={() => setReglagesOuverts(false)}
          variant="bottom"
          panelClassName="w-full rounded-t-2xl border-t border-stroke bg-panel-hi p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-glass-lg backdrop-blur-glass"
        >
          {({ titleId }) => (
            <div className="space-y-4">
              <div className="mx-auto h-1 w-10 rounded-chip bg-track" aria-hidden="true" />
              <h2 id={titleId} className="text-[15px] font-semibold text-ink">
                Réglages d'affichage
              </h2>

              <div className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink3">Vue</span>
                <SegmentedControl
                  options={OPTIONS_LENTILLE}
                  valeur={lentille}
                  onChange={setLentille}
                  ariaLabel="Vue"
                  className="w-full [&>button]:flex-1"
                />
              </div>

              {detenteurs.length > 0 && (
                <div className="space-y-1.5">
                  <label htmlFor="detenteur-mobile" className="block text-xs font-semibold uppercase tracking-wide text-ink3">
                    Détenteur
                  </label>
                  <select
                    id="detenteur-mobile"
                    value={detenteurId ?? ''}
                    onChange={(e) => setDetenteurId(e.target.value === '' ? null : Number(e.target.value))}
                    className="min-h-11 w-full rounded-control border border-hairline bg-chip px-3 text-[15px] text-ink2"
                  >
                    <option value="">Foyer</option>
                    {detenteurs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nom}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </Modale>
      )}
    </div>
  )
}
