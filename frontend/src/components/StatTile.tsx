export default function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'neutral' | 'warning' | 'good'
}) {
  // Refonte « liquid glass » (étape 2) : le libellé perd ses petites capitales gris
  // clair — elles donnaient à chaque tuile le poids d'un titre, donc aucune
  // hiérarchie. Reste un libellé discret et une valeur qui porte seule le regard.
  const toneClass = {
    neutral: 'text-ink',
    warning: 'text-avertissement',
    good: 'text-pos',
  }[tone]

  return (
    <div className="rounded-card border border-stroke bg-panel p-4 shadow-glass backdrop-blur-glass backdrop-saturate-[1.8]">
      <p className="text-xs font-semibold text-ink3">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink4">{sub}</p>}
    </div>
  )
}
