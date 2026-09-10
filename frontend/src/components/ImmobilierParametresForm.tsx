import type { FormImmobilier } from '../hooks/useImmobilierDetail'
import Card from './Card'
import { PrimaryButton } from './Controls'
import { Field, Input, Select } from './Field'

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
      <label className="mb-4 flex items-center gap-1.5 text-sm text-texte">
        <input
          type="checkbox"
          checked={form.residence_principale}
          onChange={(e) => setForm({ ...form, residence_principale: e.target.checked })}
        />
        Résidence principale
      </label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Type de location">
          <Select value={form.type_location} onChange={(e) => setForm({ ...form, type_location: e.target.value })}>
            {OPTIONS_TYPE_LOCATION.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Loyer mensuel (€)">
          <Input type="number" step="any" value={form.loyer_mensuel} onChange={(e) => setForm({ ...form, loyer_mensuel: e.target.value })} />
        </Field>
        <Field label="Charges mensuelles (€)">
          <Input
            type="number"
            step="any"
            value={form.charges_mensuelles}
            onChange={(e) => setForm({ ...form, charges_mensuelles: e.target.value })}
          />
        </Field>
        <Field label="Frais annuels (taxe foncière, copropriété, assurance, gestion — total)">
          <Input type="number" step="any" value={form.frais_annuels} onChange={(e) => setForm({ ...form, frais_annuels: e.target.value })} />
        </Field>
        <Field label="Frais de notaire (€)">
          <Input type="number" step="any" value={form.frais_notaire} onChange={(e) => setForm({ ...form, frais_notaire: e.target.value })} />
        </Field>
        <Field label="Travaux (€)">
          <Input type="number" step="any" value={form.frais_travaux} onChange={(e) => setForm({ ...form, frais_travaux: e.target.value })} />
        </Field>
        <Field label="Autres frais d'acquisition (agence, garantie... — €)">
          <Input
            type="number"
            step="any"
            value={form.frais_acquisition_autres}
            onChange={(e) => setForm({ ...form, frais_acquisition_autres: e.target.value })}
          />
        </Field>
        <Field label="Surface (m²)">
          <Input type="number" step="any" value={form.surface_m2} onChange={(e) => setForm({ ...form, surface_m2: e.target.value })} />
        </Field>
        <Field label="Nombre de pièces">
          <Input type="number" step="1" value={form.nb_pieces} onChange={(e) => setForm({ ...form, nb_pieces: e.target.value })} />
        </Field>
        <Field label="Année de construction">
          <Input type="number" step="1" value={form.annee_construction} onChange={(e) => setForm({ ...form, annee_construction: e.target.value })} />
        </Field>
        <Field label="DPE" className="w-20">
          <Input value={form.dpe} onChange={(e) => setForm({ ...form, dpe: e.target.value })} placeholder="A à G" maxLength={2} />
        </Field>
      </div>

      <hr className="my-4 border-stroke" />
      <h3 className="mb-1 text-sm font-semibold text-ink">Simulateur achat vs location</h3>
      <p className="mb-3 text-xs text-texte-attenue">
        Ces valeurs alimentent uniquement la comparaison avec la location (onglet « Achat vs location » de la page
        Analyse) — elles ne comptent jamais dans le calcul de rentabilité ci-dessus.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Loyer mensuel estimé pour un bien équivalent (€)">
          <Input
            type="number"
            step="any"
            value={form.simulation_loyer_estime}
            onChange={(e) => setForm({ ...form, simulation_loyer_estime: e.target.value })}
          />
        </Field>
        <Field label="Taxe d'habitation annuelle (€)">
          <Input
            type="number"
            step="any"
            value={form.simulation_taxe_habitation_annuelle}
            onChange={(e) => setForm({ ...form, simulation_taxe_habitation_annuelle: e.target.value })}
          />
        </Field>
        <Field label="Charges mensuelles de comparaison (copropriété, assurance, entretien — €)">
          <Input
            type="number"
            step="any"
            value={form.simulation_charges_mensuelles}
            onChange={(e) => setForm({ ...form, simulation_charges_mensuelles: e.target.value })}
          />
        </Field>
      </div>

      <PrimaryButton onClick={onSave} disabled={saving} className="mt-4">
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </PrimaryButton>
      {error && <p className="mt-2 text-sm text-negatif">{error}</p>}
    </Card>
  )
}
