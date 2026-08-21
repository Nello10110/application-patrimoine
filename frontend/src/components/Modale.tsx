import { useEffect, useId, useRef, type ReactNode } from 'react'

// Pile des modales actuellement ouvertes (LOT 6.2), une entrée par instance montée.
// Portée module (pas de contexte React) car deux modales empilées (ex. `HoldingDetailModal`
// ouverte par-dessus `CompositionModal`) ne sont PAS forcément imbriquées dans le DOM
// l'une dans l'autre (elles sont rendues comme des frères dans leur composant parent
// respectif) : la propagation d'événement DOM ne suffit donc pas à savoir laquelle est
// « au-dessus ». La dernière entrée de la pile est toujours la modale du dessus.
const pileModales: symbol[] = []

function estAuSommet(cle: symbol): boolean {
  return pileModales.length > 0 && pileModales[pileModales.length - 1] === cle
}

const SELECTEUR_FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function elementsFocusables(conteneur: HTMLElement): HTMLElement[] {
  return Array.from(conteneur.querySelectorAll<HTMLElement>(SELECTEUR_FOCUSABLE))
}

/** Modale accessible réutilisable (LOT 6.2) : `role="dialog"`/`aria-modal`, fermeture
 * au clavier (Échap — seulement pour la modale du dessus quand elles sont empilées),
 * focus déplacé dedans à l'ouverture puis restauré sur l'élément déclencheur à la
 * fermeture, piège du focus (Tab/Maj+Tab bouclent à l'intérieur), et clic à
 * l'intérieur qui ne se propage pas vers le fond (donc ne déclenche pas `onClose`).
 *
 * `children` est une render prop recevant `titleId`, l'identifiant à poser sur
 * l'élément de titre du contenu (référencé par `aria-labelledby`) : chaque appelant a
 * un titre à l'apparence différente (cf. `CompositionModal`, `HoldingDetailModal`), on
 * ne l'impose donc pas ici. */
export default function Modale({
  onClose,
  children,
  panelClassName = 'w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl',
}: {
  onClose: () => void
  children: (ctx: { titleId: string }) => ReactNode
  panelClassName?: string
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const cleRef = useRef(Symbol('modale'))
  const declencheurRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const cle = cleRef.current
    pileModales.push(cle)

    // Élément qui avait le focus juste avant l'ouverture (le déclencheur, ex. le
    // bouton/lien cliqué) : on y reviendra à la fermeture. Pour des modales empilées,
    // c'est un élément de la modale parente (encore montée) — le focus y revient donc
    // naturellement, jamais sur la page derrière.
    declencheurRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const panel = panelRef.current
    if (panel) {
      const premier = elementsFocusables(panel)[0]
      ;(premier ?? panel).focus()
    }

    return () => {
      pileModales.splice(pileModales.indexOf(cle), 1)
      declencheurRef.current?.focus()
    }
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const cle = cleRef.current
      if (!estAuSommet(cle)) return // laisse la modale du dessus (empilée) gérer seule cet évènement

      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }

      if (e.key === 'Tab') {
        const panel = panelRef.current
        if (!panel) return
        const focusables = elementsFocusables(panel)
        if (focusables.length === 0) {
          e.preventDefault()
          panel.focus()
          return
        }
        const premier = focusables[0]
        const dernier = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === premier) {
          e.preventDefault()
          dernier.focus()
        } else if (!e.shiftKey && document.activeElement === dernier) {
          e.preventDefault()
          premier.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 dark:bg-black/60" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`relative max-h-[85vh] overflow-y-auto ${panelClassName}`}
      >
        {children({ titleId })}
      </div>
    </div>
  )
}
