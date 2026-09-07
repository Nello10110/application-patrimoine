import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Pile des modales actuellement ouvertes (LOT 6.2), une entrée par instance montée.
// Portée module (pas de contexte React) car deux modales empilées (ex. `HoldingDetailModal`
// ouverte par-dessus `CompositionModal`) ne sont PAS forcément imbriquées dans le DOM
// l'une dans l'autre (elles sont rendues comme des frères dans leur composant parent
// respectif) : la propagation d'événement DOM ne suffit donc pas à savoir laquelle est
// « au-dessus ». La dernière entrée de la pile est toujours la modale du dessus.
const pileModales: symbol[] = []

/** Distance de glissement au-delà de laquelle une feuille ancrée en bas se ferme.
 * Assez pour qu'un frôlement ne la referme pas, assez peu pour que le geste soit
 * bref. */
const SEUIL_FERMETURE_PX = 60

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
 * ne l'impose donc pas ici.
 *
 * `variant="bottom"` (backlog 2.K.4, mobile) : le panneau s'ancre en bas de l'écran
 * plutôt qu'au centre — même mécanique de pile/piège du focus/fermeture au clic sur
 * le fond, seul le positionnement change. L'appelant garde la main sur l'arrondi/le
 * padding via `panelClassName` (ex. `rounded-t-2xl` plutôt que `rounded-panel`). */
export default function Modale({
  onClose,
  children,
  panelClassName = 'w-full max-w-lg rounded-panel border border-stroke bg-panel-hi shadow-glass-lg backdrop-blur-glass p-6',
  variant = 'center',
}: {
  onClose: () => void
  children: (ctx: { titleId: string }) => ReactNode
  panelClassName?: string
  variant?: 'center' | 'bottom'
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

  // Fermeture au glissement vers le bas, pour la variante ancrée en bas (retour
  // utilisateur du 07/09/2026 : « on peut pas le fermer en slidant vers le bas »).
  // C'est le geste attendu d'une feuille sur mobile, au même titre qu'Échap au
  // clavier — sans lui, la seule sortie était un bouton.
  //
  // Conditionné à `defilement === 0` : une feuille dont le contenu défile doit
  // pouvoir être parcourue vers le haut sans se refermer au premier mouvement. On ne
  // ferme donc que si le doigt part alors que la feuille est déjà en haut de son
  // contenu.
  const [glissement, setGlissement] = useState(0)
  const departRef = useRef<number | null>(null)

  function onTouchStart(e: React.TouchEvent) {
    if (variant !== 'bottom') return
    departRef.current = (panelRef.current?.scrollTop ?? 0) === 0 ? e.touches[0].clientY : null
  }

  function onTouchMove(e: React.TouchEvent) {
    if (departRef.current === null) return
    setGlissement(Math.max(0, e.touches[0].clientY - departRef.current))
  }

  function onTouchEnd() {
    if (departRef.current !== null && glissement > SEUIL_FERMETURE_PX) onCloseRef.current()
    departRef.current = null
    setGlissement(0)
  }

  // Voile de la maquette : `rgba(10,11,14,0.28)` + un flou de 6 px, et non un noir
  // à 40/60 % opaque. Un voile aussi sombre écrasait le panneau de verre posé
  // dessus — c'est le verre qui doit filtrer la page, pas le voile qui doit
  // l'éteindre.
  const conteneurClassName =
    variant === 'bottom'
      ? 'fixed inset-0 z-50 flex items-end justify-center bg-[rgba(10,11,14,0.28)] backdrop-blur-[6px]'
      : 'fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,11,14,0.28)] p-4 backdrop-blur-[6px]'

  return createPortal(
    // Fond cliquable pour fermer (backdrop) : mouse-only par construction, la
    // fermeture clavier passe par Échap ci-dessus — jamais dans l'ordre de
    // tabulation, un gestionnaire clavier n'aurait rien à écouter (voir les
    // exceptions jsx-a11y correspondantes dans .oxlintrc.json).
    <div className={conteneurClassName} onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={glissement > 0 ? { transform: `translateY(${glissement}px)` } : undefined}
        className={`relative max-h-[85vh] overflow-y-auto ${panelClassName}`}
      >
        {children({ titleId })}
      </div>
    </div>,
    // Portail sur `<body>`, et non rendu là où la modale est déclarée : un ancêtre
    // portant `backdrop-filter` devient un BLOC CONTENANT pour ses descendants en
    // `position: fixed` (règle CSS peu connue, même effet que `transform`). La
    // feuille « Plus » est déclarée à l'intérieur de `BottomNav`, qui est justement
    // en verre — elle se retrouvait donc enfermée dans la barre de 64 px : illisible,
    // et sans presque aucun fond à toucher pour la refermer (retour utilisateur du
    // 07/09/2026). Le portail met toutes les modales hors d'atteinte de ce piège,
    // aujourd'hui et pour les prochaines.
    document.body,
  )
}
