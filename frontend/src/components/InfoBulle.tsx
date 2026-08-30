import { IconAide } from './icons'

/** Point d'aide contextuelle à côté d'un libellé de champ — infobulle native du
 * navigateur (`title`), sans dépendance ni état. Icône SVG (`IconAide`, pas un
 * caractère « ? » textuel) et `aria-hidden` : quand ce composant est placé dans un
 * `<label>` de saisie, ni son `textContent` ni son nom accessible ne doivent
 * s'ajouter à celui du champ englobant — `getByLabelText('Valeur estimée')` doit
 * continuer à matcher exactement (un caractère texte, même `aria-hidden`, reste
 * inclus dans `textContent` et casserait ce match). Un lecteur d'écran reste libre
 * de lire le `title` via son propre mécanisme. */
export default function InfoBulle({ texte }: { texte: string }) {
  return (
    <span title={texte} aria-hidden="true" className="inline-flex cursor-help text-texte-attenue hover:text-texte">
      <IconAide className="h-3.5 w-3.5" />
    </span>
  )
}
