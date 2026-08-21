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
  const toneClass = {
    neutral: 'text-texte',
    warning: 'text-avertissement',
    good: 'text-positif',
  }[tone]

  return (
    <div className="rounded-xl border border-bordure bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-texte-attenue">{sub}</p>}
    </div>
  )
}
