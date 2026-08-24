import { useState } from 'react'
import type { ReactNode } from 'react'
import { IconChevron } from './icons'

const CLE_STOCKAGE = 'patrimoine:dashboard-detail-ouvert'

function etatStocke(defaut: boolean): boolean {
  if (typeof window === 'undefined') return defaut
  const brut = window.localStorage.getItem(CLE_STOCKAGE)
  return brut === null ? defaut : brut === '1'
}

/** Section repliable (backlog 2.K.6, hiérarchie de lecture du tableau de bord) —
 * état persisté dans `localStorage`, même pattern que `useSidebarRepliee` : un
 * réglage d'interface qui doit survivre au rechargement, pas un état de session
 * éphémère. Même convention de rotation de chevron que `Sidebar.tsx` (non tourné =
 * ouvert, `rotate-180` = fermé), pour rester cohérent visuellement. */
export default function Disclosure({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [ouvert, setOuvert] = useState(() => etatStocke(defaultOpen))

  function basculer() {
    setOuvert((avant) => {
      const suivant = !avant
      window.localStorage.setItem(CLE_STOCKAGE, suivant ? '1' : '0')
      return suivant
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={basculer}
        aria-expanded={ouvert}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-bordure bg-surface px-4 py-3 text-left hover:bg-surface-elevee"
      >
        <span className="text-sm font-semibold uppercase tracking-wide text-texte-attenue">{title}</span>
        <IconChevron className={`h-4 w-4 shrink-0 text-texte-attenue transition-transform ${ouvert ? '' : 'rotate-180'}`} />
      </button>
      {ouvert && <div className="mt-4 space-y-6">{children}</div>}
    </div>
  )
}
