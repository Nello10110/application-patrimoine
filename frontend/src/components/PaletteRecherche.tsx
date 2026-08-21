import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { Holding, Loan } from '../api/types'
import { useAuth } from '../hooks/useAuth'
import { routesDuRang } from '../layout/routes'
import { IconChevron, IconRecherche } from './icons'
import Modale from './Modale'

type Resultat = { type: 'route' | 'holding' | 'loan'; label: string; sousLabel?: string; to: string }

function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
}

/** Palette de recherche globale `Ctrl/⌘+K` (backlog 2.K.2) : atteindre un écran, une
 * position ou un emprunt sans passer par la navigation. Aucune dépendance tierce
 * (filtrage en mémoire, cf. discipline du projet) — données déjà exposées côté
 * frontend (`api.listHoldings`/`listLoans`, `ROUTES`), chargées paresseusement à la
 * première ouverture plutôt qu'à chaque montage de page. */
export default function PaletteRecherche({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [ouvert, setOuvert] = useState(false)
  const [requete, setRequete] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [holdings, setHoldings] = useState<Holding[] | null>(null)
  const [loans, setLoans] = useState<Loan[] | null>(null)

  useEffect(() => {
    function champDeSaisieActif(): boolean {
      const el = document.activeElement
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable
    }
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'k') return
      if (champDeSaisieActif() && !ouvert) return
      e.preventDefault()
      setOuvert((v) => !v)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [ouvert])

  useEffect(() => {
    if (!ouvert || holdings !== null) return
    // Chargement paresseux (à la première ouverture seulement) : les emprunts n'ont
    // pas d'ancre de navigation dédiée (limitation assumée, cf. plan), inclus
    // uniquement pour la recherche par nom.
    api.listHoldings().then(setHoldings).catch(() => setHoldings([]))
    api.listLoans().then(setLoans).catch(() => setLoans([]))
  }, [ouvert, holdings])

  const resultats = useMemo<Resultat[]>(() => {
    const q = normaliser(requete.trim())
    const routes: Resultat[] = [...routesDuRang('consultation', user?.role), ...routesDuRang('administration', user?.role)]
      .filter((r) => r.navLabel)
      .map((r) => ({ type: 'route', label: r.navLabel!, to: r.path }))
    const posHoldings: Resultat[] = (holdings ?? []).map((h) => ({
      type: 'holding',
      label: h.ticker,
      sousLabel: h.nom ?? undefined,
      to: `/patrimoine/${encodeURIComponent(h.ticker)}`,
    }))
    const posLoans: Resultat[] = (loans ?? []).map((l) => ({ type: 'loan', label: l.libelle, to: '/patrimoine' }))

    const tout = [...routes, ...posHoldings, ...posLoans]
    if (!q) return tout.slice(0, 20)
    return tout.filter((r) => normaliser(r.label).includes(q) || (r.sousLabel && normaliser(r.sousLabel).includes(q))).slice(0, 20)
  }, [requete, holdings, loans, user?.role])

  function fermer() {
    setOuvert(false)
    setRequete('')
    setActiveIndex(0)
  }

  function ouvrirResultat(r: Resultat) {
    navigate(r.to)
    fermer()
  }

  function onKeyDownRecherche(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, resultats.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const r = resultats[activeIndex]
      if (r) ouvrirResultat(r)
    }
  }

  const LABEL_TYPE: Record<Resultat['type'], string> = { route: 'Écrans', holding: 'Positions', loan: 'Emprunts' }

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        title="Recherche (Ctrl/⌘ + K)"
        aria-label="Recherche"
        className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-texte-attenue hover:bg-surface-elevee"
      >
        <IconRecherche className="h-4 w-4 shrink-0" />
        {!compact && <span className="truncate">Rechercher…</span>}
      </button>

      {ouvert && (
        <Modale onClose={fermer} panelClassName="w-full max-w-lg rounded-xl bg-surface shadow-xl">
          {({ titleId }) => (
            <div className="flex max-h-[70vh] flex-col">
              <h2 id={titleId} className="sr-only">
                Recherche
              </h2>
              <div className="flex items-center gap-2 border-b border-bordure px-4 py-3">
                <IconRecherche className="h-4 w-4 shrink-0 text-texte-attenue" />
                <input
                  autoFocus
                  value={requete}
                  onChange={(e) => {
                    setRequete(e.target.value)
                    setActiveIndex(0)
                  }}
                  onKeyDown={onKeyDownRecherche}
                  placeholder="Un écran, une position, un emprunt…"
                  className="w-full bg-transparent text-sm text-texte outline-none placeholder:text-texte-attenue"
                />
              </div>
              <div className="overflow-y-auto py-2">
                {resultats.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-texte-attenue">Aucun résultat.</p>
                ) : (
                  (['route', 'holding', 'loan'] as const).map((type) => {
                    const items = resultats.filter((r) => r.type === type)
                    if (items.length === 0) return null
                    return (
                      <div key={type} className="px-2 py-1">
                        <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-texte-attenue">{LABEL_TYPE[type]}</p>
                        {items.map((r) => {
                          const index = resultats.indexOf(r)
                          return (
                            <button
                              key={`${r.type}-${r.to}-${r.label}`}
                              onClick={() => ouvrirResultat(r)}
                              onMouseEnter={() => setActiveIndex(index)}
                              className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm ${
                                index === activeIndex ? 'bg-surface-elevee text-texte' : 'text-texte-attenue'
                              }`}
                            >
                              <span className="truncate">
                                {r.label}
                                {r.sousLabel && <span className="ml-1.5 text-xs text-texte-attenue">{r.sousLabel}</span>}
                              </span>
                              <IconChevron className="h-3.5 w-3.5 shrink-0 rotate-180" />
                            </button>
                          )
                        })}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </Modale>
      )}
    </>
  )
}
