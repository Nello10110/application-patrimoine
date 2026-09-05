import { forwardRef, useState } from 'react'
import { IconImport } from './icons'

/** Zone de dépôt de fichier réutilisable (refonte import, 05/09/2026, retour
 * utilisateur : « pas assez d'information, on a l'impression que ça ne marche
 * pas ») — remplace les `<input type="file">` nus utilisés jusqu'ici sur les 3
 * écrans d'import (`ImportTransactionsSection`, `BankImportSection`×2,
 * `ImportPage` relevé de positions). Curseur en main sur toute la zone, état
 * « glisser actif » distinct du survol, texte explicite plutôt que le seul widget
 * natif du navigateur (qui diffère par OS/navigateur et n'a aucun état visuel).
 *
 * L'`<input>` reste dans le DOM (juste visuellement masqué, `sr-only`) plutôt que
 * remplacé par un `<div>` cliqué en JS seul : les sélecteurs Playwright existants
 * (`page.locator('input[type="file"]')`, `e2e/import.spec.ts`) continuent de le
 * trouver et d'y déposer un fichier via `setInputFiles`, sans modification.
 *
 * `ref` (transmise via `forwardRef`) référence directement l'`<input>` caché — même
 * usage qu'avant (`inputRef.current.value = ''` après un import réussi, pour
 * pouvoir réimporter le même fichier)." */
const Dropzone = forwardRef<
  HTMLInputElement,
  {
    accept: string
    hint?: string
    label?: string
    uploading?: boolean
    onFileSelected: (file: File) => void
    ariaLabel?: string
  }
>(function Dropzone({ accept, hint, label = 'Glissez un fichier ici ou cliquez pour parcourir', uploading = false, onFileSelected, ariaLabel }, ref) {
  const [dragActive, setDragActive] = useState(false)

  function ouvrirSelecteur() {
    if (!uploading && ref && typeof ref !== 'function') ref.current?.click()
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(false)
    if (uploading) return
    const file = e.dataTransfer.files?.[0]
    if (file) onFileSelected(file)
  }

  return (
    <div
      role="button"
      tabIndex={uploading ? -1 : 0}
      aria-label={ariaLabel ?? label}
      aria-disabled={uploading}
      onClick={ouvrirSelecteur}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          ouvrirSelecteur()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!uploading) setDragActive(true)
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      className={`flex flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
        uploading
          ? 'cursor-not-allowed border-bordure opacity-60'
          : dragActive
            ? 'cursor-pointer border-accent bg-accent/10'
            : 'cursor-pointer border-bordure hover:border-accent/50 hover:bg-surface-elevee'
      }`}
    >
      <IconImport className={`h-6 w-6 ${dragActive ? 'text-accent' : 'text-texte-attenue'}`} />
      <p className="text-sm font-medium text-texte">
        {uploading ? 'Lecture du fichier...' : dragActive ? 'Déposez le fichier ici' : label}
      </p>
      {hint && !uploading && <p className="text-xs text-texte-attenue">{hint}</p>}
      <input
        ref={ref}
        type="file"
        accept={accept}
        disabled={uploading}
        // `tabIndex={-1}` : seul le conteneur ci-dessus (role="button") est un
        // arrêt de tabulation — sans ça, cet input cliqué par programme en
        // créerait un second, invisible, juste derrière au clavier.
        tabIndex={-1}
        data-testid={`dropzone-input-${ariaLabel ?? label}`}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFileSelected(file)
        }}
        className="sr-only"
      />
    </div>
  )
})

export default Dropzone
