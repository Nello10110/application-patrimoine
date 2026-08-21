import type { ReactNode } from 'react'

// État vide uniforme (backlog 2.K.1), remplace les `<p>Aucun...</p>` répétés dans
// une dizaine de fichiers. `description` est un `ReactNode` (pas une simple chaîne)
// pour couvrir les messages avec lien inline déjà présents (ex. « Aucune donnée.
// Importer un relevé. »), sans avoir à réintroduire du HTML dans une prop texte.
export default function EtatVide({ titre, description }: { titre: string; description?: ReactNode }) {
  return (
    <div className="py-6 text-center">
      <p className="text-sm text-texte-attenue">{titre}</p>
      {description && <p className="mt-1 text-sm text-texte-attenue">{description}</p>}
    </div>
  )
}
