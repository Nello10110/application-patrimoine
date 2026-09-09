import { Field, Input } from './Field'

export interface LoanForm {
  libelle: string
  capital_initial: string
  taux_annuel_pct: string
  mensualite: string
  date_debut: string
  duree_mois: string
}

// Formulaire vierge — état initial de `LoansCard` (édition en ligne) et
// d'`AjoutHoldingForm` (mode « Un emprunt », 09/09/2026), plutôt que dupliqué à
// chaque endroit qui manipule un `LoanForm`.
export const LOAN_FORM_VIDE: LoanForm = {
  libelle: '',
  capital_initial: '',
  taux_annuel_pct: '',
  mensualite: '',
  date_debut: '',
  duree_mois: '',
}

const LARGEURS: Record<'pleineLargeur' | 'compacte' | 'grille', Record<keyof LoanForm, string>> = {
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
  // Grille à deux colonnes (`AjoutHoldingForm`, mode « Un emprunt ») : le libellé
  // occupe toute la largeur (comme le Ticker du mode « Un actif » du même
  // formulaire), les cinq champs numériques/date s'apparient par deux.
  grille: {
    libelle: 'col-span-2',
    capital_initial: '',
    taux_annuel_pct: '',
    mensualite: '',
    date_debut: '',
    duree_mois: '',
  },
}

/** Les 6 champs d'un emprunt (libellé, capital, taux, mensualité, date de début,
 * durée), partagés entre le formulaire d'ajout (`AjoutHoldingForm`, mode « Un
 * emprunt »), l'édition en ligne (tableau desktop de `LoansCard`) et l'édition en
 * carte (mobile) — backlog audit maintenabilité. `libelleAriaSuffix` (ex. « de
 * Crédit immo (édition) ») désambiguïse chaque champ pour un lecteur d'écran quand
 * plusieurs lignes portent le même libellé de champ visible ("Libellé", "Capital
 * initial"...) — omis dans le formulaire d'ajout, seule instance de ces libellés
 * visible à la fois sur l'écran. */
export default function LoanFormFields({
  form,
  onChange,
  variant,
  libelleAriaSuffix,
}: {
  form: LoanForm
  onChange: (form: LoanForm) => void
  variant: 'pleineLargeur' | 'compacte' | 'grille'
  libelleAriaSuffix?: string
}) {
  const largeurs = LARGEURS[variant]

  return (
    <>
      <Field label="Libellé" className={largeurs.libelle}>
        <Input
          value={form.libelle}
          onChange={(e) => onChange({ ...form, libelle: e.target.value })}
          aria-label={libelleAriaSuffix && `Libellé ${libelleAriaSuffix}`}
          placeholder={libelleAriaSuffix ? undefined : 'Crédit immobilier'}
        />
      </Field>
      <Field label="Capital initial" className={largeurs.capital_initial}>
        <Input
          value={form.capital_initial}
          onChange={(e) => onChange({ ...form, capital_initial: e.target.value })}
          type="number"
          step="any"
          aria-label={libelleAriaSuffix && `Capital initial ${libelleAriaSuffix}`}
        />
      </Field>
      <Field label="Taux annuel (%)" className={largeurs.taux_annuel_pct}>
        <Input
          value={form.taux_annuel_pct}
          onChange={(e) => onChange({ ...form, taux_annuel_pct: e.target.value })}
          type="number"
          step="any"
          aria-label={libelleAriaSuffix && `Taux annuel ${libelleAriaSuffix}`}
        />
      </Field>
      <Field label="Mensualité" className={largeurs.mensualite}>
        <Input
          value={form.mensualite}
          onChange={(e) => onChange({ ...form, mensualite: e.target.value })}
          type="number"
          step="any"
          aria-label={libelleAriaSuffix && `Mensualité ${libelleAriaSuffix}`}
        />
      </Field>
      <Field label="Date de début" className={largeurs.date_debut}>
        <Input
          value={form.date_debut}
          onChange={(e) => onChange({ ...form, date_debut: e.target.value })}
          type="date"
          aria-label={libelleAriaSuffix && `Date de début ${libelleAriaSuffix}`}
        />
      </Field>
      <Field label="Durée (mois)" className={largeurs.duree_mois}>
        <Input
          value={form.duree_mois}
          onChange={(e) => onChange({ ...form, duree_mois: e.target.value })}
          type="number"
          step="1"
          aria-label={libelleAriaSuffix && `Durée ${libelleAriaSuffix}`}
        />
      </Field>
    </>
  )
}
