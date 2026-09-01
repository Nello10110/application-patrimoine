export interface LoanForm {
  libelle: string
  capital_initial: string
  taux_annuel_pct: string
  mensualite: string
  date_debut: string
  duree_mois: string
}

const LARGEURS: Record<'pleineLargeur' | 'compacte', Record<keyof LoanForm, string>> = {
  pleineLargeur: {
    libelle: 'w-full',
    capital_initial: 'w-full',
    taux_annuel_pct: 'w-full',
    mensualite: 'w-full',
    date_debut: 'w-full',
    duree_mois: 'w-full',
  },
  compacte: {
    libelle: 'w-40',
    capital_initial: 'w-32',
    taux_annuel_pct: 'w-28',
    mensualite: 'w-28',
    date_debut: 'w-36',
    duree_mois: 'w-24',
  },
}

/** Les 6 champs d'un emprunt (libellé, capital, taux, mensualité, date de début,
 * durée), partagés entre le formulaire d'ajout, l'édition en ligne (tableau
 * desktop) et l'édition en carte (mobile) — cf. `LoansCard.tsx`, backlog audit
 * maintenabilité. `libelleAriaSuffix` (ex. « de Crédit immo (édition) »)
 * désambiguïse chaque champ pour un lecteur d'écran quand plusieurs lignes
 * portent le même libellé de champ visible ("Libellé", "Capital initial"...) —
 * omis dans le formulaire d'ajout, seule instance de ces libellés visible à la
 * fois sur l'écran. */
export default function LoanFormFields({
  form,
  onChange,
  variant,
  libelleAriaSuffix,
}: {
  form: LoanForm
  onChange: (form: LoanForm) => void
  variant: 'pleineLargeur' | 'compacte'
  libelleAriaSuffix?: string
}) {
  const largeurs = LARGEURS[variant]
  const padding = variant === 'pleineLargeur' ? 'px-3 py-2' : 'px-2 py-1.5'
  const inputClassName = (champ: keyof LoanForm) =>
    `${largeurs[champ]} rounded-md border border-bordure bg-surface ${padding} text-sm text-texte`

  return (
    <>
      <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
        Libellé
        <input
          value={form.libelle}
          onChange={(e) => onChange({ ...form, libelle: e.target.value })}
          aria-label={libelleAriaSuffix && `Libellé ${libelleAriaSuffix}`}
          placeholder={libelleAriaSuffix ? undefined : 'Crédit immobilier'}
          className={inputClassName('libelle')}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
        Capital initial
        <input
          value={form.capital_initial}
          onChange={(e) => onChange({ ...form, capital_initial: e.target.value })}
          type="number"
          step="any"
          aria-label={libelleAriaSuffix && `Capital initial ${libelleAriaSuffix}`}
          className={inputClassName('capital_initial')}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
        Taux annuel (%)
        <input
          value={form.taux_annuel_pct}
          onChange={(e) => onChange({ ...form, taux_annuel_pct: e.target.value })}
          type="number"
          step="any"
          aria-label={libelleAriaSuffix && `Taux annuel ${libelleAriaSuffix}`}
          className={inputClassName('taux_annuel_pct')}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
        Mensualité
        <input
          value={form.mensualite}
          onChange={(e) => onChange({ ...form, mensualite: e.target.value })}
          type="number"
          step="any"
          aria-label={libelleAriaSuffix && `Mensualité ${libelleAriaSuffix}`}
          className={inputClassName('mensualite')}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
        Date de début
        <input
          value={form.date_debut}
          onChange={(e) => onChange({ ...form, date_debut: e.target.value })}
          type="date"
          aria-label={libelleAriaSuffix && `Date de début ${libelleAriaSuffix}`}
          className={inputClassName('date_debut')}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
        Durée (mois)
        <input
          value={form.duree_mois}
          onChange={(e) => onChange({ ...form, duree_mois: e.target.value })}
          type="number"
          step="1"
          aria-label={libelleAriaSuffix && `Durée ${libelleAriaSuffix}`}
          className={inputClassName('duree_mois')}
        />
      </label>
    </>
  )
}
