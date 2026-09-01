import type { FormImmobilier } from '../hooks/useImmobilierDetail'
import Card from './Card'

const OPTIONS_TYPE_LOCATION = [
  { value: '', label: 'Non renseigné' },
  { value: 'nue', label: 'Location nue' },
  { value: 'meublee', label: 'Location meublée' },
  { value: 'pinel', label: 'Pinel' },
  { value: 'lmnp', label: 'LMNP' },
  { value: 'saisonniere', label: 'Saisonnière' },
]

/** Onglet *Paramètres* de la fiche immobilier (backlog 2.M.3 + 2.M.4) : formulaire de
 * caractéristiques et location seul — le cashflow/rentabilités/historique calculés
 * vivent désormais dans l'onglet *Aperçu* (`ImmobilierApercu`). */
export default function ImmobilierParametresForm({
  form,
  setForm,
  saving,
  error,
  onSave,
}: {
  form: FormImmobilier
  setForm: (f: FormImmobilier) => void
  saving: boolean
  error: string | null
  onSave: () => void
}) {
  return (
    <Card title="Immobilier — caractéristiques et location">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Type de location
          <select
            value={form.type_location}
            onChange={(e) => setForm({ ...form, type_location: e.target.value })}
            className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          >
            {OPTIONS_TYPE_LOCATION.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Loyer mensuel (€)
          <input
            type="number"
            step="any"
            value={form.loyer_mensuel}
            onChange={(e) => setForm({ ...form, loyer_mensuel: e.target.value })}
            className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Charges mensuelles (€)
          <input
            type="number"
            step="any"
            value={form.charges_mensuelles}
            onChange={(e) => setForm({ ...form, charges_mensuelles: e.target.value })}
            className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Frais annuels (taxe foncière, copropriété, assurance, gestion — total)
          <input
            type="number"
            step="any"
            value={form.frais_annuels}
            onChange={(e) => setForm({ ...form, frais_annuels: e.target.value })}
            className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Surface (m²)
          <input
            type="number"
            step="any"
            value={form.surface_m2}
            onChange={(e) => setForm({ ...form, surface_m2: e.target.value })}
            className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Nombre de pièces
          <input
            type="number"
            step="1"
            value={form.nb_pieces}
            onChange={(e) => setForm({ ...form, nb_pieces: e.target.value })}
            className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Année de construction
          <input
            type="number"
            step="1"
            value={form.annee_construction}
            onChange={(e) => setForm({ ...form, annee_construction: e.target.value })}
            className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          DPE
          <input
            value={form.dpe}
            onChange={(e) => setForm({ ...form, dpe: e.target.value })}
            placeholder="A à G"
            maxLength={2}
            className="w-20 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
      >
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </button>
      {error && <p className="mt-2 text-sm text-negatif">{error}</p>}
    </Card>
  )
}
