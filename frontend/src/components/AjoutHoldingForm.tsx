import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Compte, Etablissement, Holding, Loan } from '../api/types'
import {
  TEXTE_PRIX_REVIENT,
  TEXTE_VALEUR_ESTIMEE,
  TYPES_ACTIF_SANS_ETABLISSEMENT,
  TYPE_ACTIF_OPTIONS,
  TYPES_AVEC_TAUX,
  TYPES_AVEC_ZONE_GEO,
  TYPES_EPARGNE,
  TYPES_PATRIMOINE,
  ZONES_GEO,
  identifiantDepuisNom,
  libelleTaux,
  valeurProjeteeUnAn,
} from '../utils/holdingCategories'
import { formatEuro } from '../utils/format'
import Card from './Card'
import { PrimaryButton, SegmentedControl } from './Controls'
import { Field, Input, Select } from './Field'
import EtatErreur from './EtatErreur'
import InfoBulle from './InfoBulle'
import { LOAN_FORM_VIDE, type LoanForm } from './LoanFormFields'
import LoanFormFields from './LoanFormFields'
import SelecteurEtablissement, { NOUVEAU_ETABLISSEMENT } from './SelecteurEtablissement'

// Sentinelle pour l'option "+ Nouveau compte..." du sélecteur — distincte de toute
// valeur réelle possible (un id de compte est toujours numérique).
const NOUVEAU_COMPTE = '__nouveau__'

const FORM_VIDE = {
  ticker: '',
  // Nom d'affichage (retour utilisateur du 09/09/2026) — sans objet pour un actif
  // coté (le nom vient de la donnée de marché, cf. `PositionsTable`), seul champ
  // d'identité qu'un type patrimonial montre : `ticker` reste envoyé (obligatoire
  // et unique côté serveur) mais dérivé de `nom` en arrière-plan, cf. `handleAdd`.
  nom: '',
  quantite: '',
  prix_revient_moyen: '',
  // Un id de compte existant (chaîne numérique), NOUVEAU_COMPTE, ou '' (aucun).
  compte_id: '',
  compte_nom: '',
  // Établissement du compte créé À LA VOLÉE ci-dessus (revue du 03/09/2026) — sans
  // objet si `compte_id` n'est pas `NOUVEAU_COMPTE`.
  etablissement_id: '',
  etablissement_nom: '',
  etablissement_logo_key: null as string | null,
  type_actif: '',
  valeur_estimee: '',
  taux_pct: '',
  zone_geo: '',
  versement_mensuel: '',
  date_acquisition: '',
}

/** Formulaire d'ajout manuel d'une position — extrait de `PortefeuillePage.tsx`
 * (2026-09-01) pour être réutilisable ailleurs, d'abord dans l'assistant de bienvenue
 * (`onboarding/EtapeDemarragePortefeuille.tsx`).
 *
 * Type d'actif en PREMIER champ (retour utilisateur du 09/09/2026 : « ça n'a pas de
 * sens de remplir Compte avant de savoir que c'est un bien sans compte ») — tout le
 * reste du formulaire en dépend : Quantité disparaît (fixée à 1) pour un bien valorisé
 * en bloc, Compte disparaît pour l'immobilier/un véhicule/un autre actif (aucun
 * établissement ne les détient), Zone géographique n'apparaît que pour l'immobilier et
 * une SCPI (une localisation a un sens ; pas pour un véhicule ou un contrat d'épargne).
 * Une seule page qui s'ajuste, jamais d'étapes « Suivant »/« Précédent » : aucun autre
 * formulaire de l'application n'utilise ce patron, et le nombre de champs reste modeste
 * une fois les non-pertinents masqués.
 *
 * `autoriserEmprunt` (même retour utilisateur) ouvre un second mode, bascule tout le
 * formulaire vers les six champs d'un emprunt (`LoanFormFields`, réutilisés depuis
 * `LoansCard`) et poste vers `POST /loans` plutôt que `POST /portfolio/holdings` — un
 * emprunt n'est pas un type d'actif (erreur de catégorie à ne pas reproduire dans le
 * sélecteur Type d'actif), d'où la bascule au-dessus de tout le reste, pas une option
 * de plus dans la liste. Par défaut à `false` : seul l'écran Patrimoine (là où vivent
 * déjà les emprunts, `LoansCard`) l'active — l'assistant de bienvenue, qui ne compte
 * que des positions (`onCreated`), n'a pas besoin de cette bascule.
 *
 * `onCreated` (callback, pas un état de liste porté ici) : ce composant ne connaît
 * jamais la liste des positions d'un appelant, seulement son propre formulaire —
 * l'appelant décide de la suite (recharger sa liste, incrémenter un compteur...),
 * même pattern que `onSaved` sur `PositionsTable`. */
export default function AjoutHoldingForm({
  onCreated,
  comptes: comptesFournis,
  etablissements: etablissementsFournis,
  onComptesModifies,
  sansCarte = false,
  autoriserEmprunt = false,
  onLoanCreated,
}: {
  onCreated?: (holding: Holding) => void
  /** Liste des comptes fournie par l'appelant. Absente, le composant la charge
   * lui-même — c'est le cas de l'assistant de bienvenue, qui n'a pas de parent
   * porteur de cette liste. Fournie (`PortefeuillePage`), elle évite un second
   * `GET /comptes` pour la même page : ce formulaire et `PositionsTable` sont
   * montés côte à côte et demandaient chacun la sienne (backlog Z.1). */
  comptes?: Compte[]
  /** Rendu SANS son enveloppe `Card` : la feuille d'ajout de l'écran Patrimoine
   * porte déjà son titre et son panneau de verre (maquette de la refonte) — la carte
   * y faisait un second cadre et un second titre pour le même formulaire. */
  sansCarte?: boolean
  /** Même rôle qu'`comptes` ci-dessus, pour la liste des établissements — affichée
   * uniquement quand un nouveau compte est créé à la volée. */
  etablissements?: Etablissement[]
  /** À appeler quand un compte a été créé à la volée, pour que l'appelant
   * rafraîchisse la liste qu'il porte. Sans objet en mode autonome. */
  onComptesModifies?: () => void
  /** Révèle la bascule « Un actif / Un emprunt » en tête de formulaire — cf.
   * docstring ci-dessus. */
  autoriserEmprunt?: boolean
  /** À appeler après la création d'un emprunt (mode « Un emprunt »), distinct
   * d'`onCreated` : un emprunt n'est pas un `Holding`, l'appelant a presque toujours
   * besoin d'agir différemment (ex. `PortefeuillePage` recharge `LoansCard` plutôt
   * que sa liste de positions). */
  onLoanCreated?: (loan: Loan) => void
}) {
  const [modeAjout, setModeAjout] = useState<'actif' | 'emprunt'>('actif')

  const [form, setForm] = useState(FORM_VIDE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Champ Identifiant révélé (09/09/2026) : masqué tant que l'identifiant calculé
  // depuis le Nom n'a pas été refusé par le serveur — cf. `handleAdd`. Une fois
  // révélé, il reste modifiable à la main pour la suite de cette session d'ajout.
  const [identifiantVisible, setIdentifiantVisible] = useState(false)
  const [comptesCharges, setComptesCharges] = useState<Compte[]>([])
  const [etablissementsCharges, setEtablissementsCharges] = useState<Etablissement[]>([])
  const autonome = comptesFournis === undefined
  const comptes = comptesFournis ?? comptesCharges
  const etablissements = etablissementsFournis ?? etablissementsCharges

  const [loanForm, setLoanForm] = useState<LoanForm>(LOAN_FORM_VIDE)
  const [savingLoan, setSavingLoan] = useState(false)
  const [errorLoan, setErrorLoan] = useState<string | null>(null)

  useEffect(() => {
    if (!autonome) return
    api.listComptes().then(setComptesCharges).catch(() => setComptesCharges([]))
    api.listEtablissements().then(setEtablissementsCharges).catch(() => setEtablissementsCharges([]))
  }, [autonome])

  // Type choisi = tout ce dont dépendent les autres champs (cf. docstring). Quantité
  // n'a plus de champ visible une fois fixée à 1 (bien valorisé en bloc) — posée ici
  // plutôt que laissée à la charge de l'utilisateur, comme l'ancienne note en bas de
  // formulaire le lui demandait. Compte/zone géographique sont réinitialisés en
  // quittant un type qui les concernait, pour ne jamais soumettre une valeur choisie
  // pour un type différent sans que l'utilisateur l'ait revue (le champ était alors
  // masqué, donc hors de sa vue).
  function handleTypeChange(type: string) {
    const patrimoine = TYPES_PATRIMOINE.has(type)
    const sansEtablissement = TYPES_ACTIF_SANS_ETABLISSEMENT.has(type)
    setForm((f) => ({
      ...f,
      type_actif: type,
      quantite: patrimoine ? '1' : f.quantite,
      compte_id: sansEtablissement ? '' : f.compte_id,
      compte_nom: sansEtablissement ? '' : f.compte_nom,
      zone_geo: TYPES_AVEC_ZONE_GEO.has(type) ? f.zone_geo : '',
    }))
    // Un identifiant révélé par un refus serveur ne veut plus rien dire pour un
    // type différent (l'identifiant calculé changerait de toute façon avec lui) —
    // repart masqué, recalculé au prochain essai.
    setIdentifiantVisible(false)
  }

  // Un type patrimonial identifie sa ligne par le Nom, jamais par un vrai ticker —
  // `identifiant` reste ce qu'`api.createHolding` reçoit (obligatoire, unique côté
  // serveur), mais calculé depuis le Nom tant que l'utilisateur n'a pas dû le
  // corriger à la main (`identifiantVisible`, cf. `handleAdd`). `identifiant`
  // lui-même ne dit jamais « rien n'est saisi » : `identifiantDepuisNom('')`
  // renvoie quand même `BIEN` par défaut (cf. `holdingCategories.ts`) — c'est
  // `identifiantPresent`, sur le Nom brut, qui porte cette question.
  const estPatrimoine = TYPES_PATRIMOINE.has(form.type_actif)
  const identifiant = estPatrimoine
    ? form.ticker.trim() || identifiantDepuisNom(form.nom)
    : form.ticker.trim()
  const identifiantPresent = estPatrimoine ? form.nom.trim() !== '' || form.ticker.trim() !== '' : form.ticker.trim() !== ''

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!identifiantPresent || !form.quantite) return
    setSaving(true)
    setError(null)
    try {
      const nouveauCompte = form.compte_id === NOUVEAU_COMPTE
      const nouvelEtablissement = form.etablissement_id === NOUVEAU_ETABLISSEMENT
      const holding = await api.createHolding({
        ticker: identifiant.toUpperCase(),
        nom: estPatrimoine ? form.nom.trim() || null : null,
        quantite: Number(form.quantite),
        prix_revient_moyen: form.prix_revient_moyen ? Number(form.prix_revient_moyen) : null,
        compte_id: !nouveauCompte && form.compte_id ? Number(form.compte_id) : null,
        compte_nom: nouveauCompte ? form.compte_nom.trim() || null : null,
        etablissement_id: nouveauCompte && !nouvelEtablissement && form.etablissement_id ? Number(form.etablissement_id) : null,
        etablissement_nom: nouveauCompte && nouvelEtablissement ? form.etablissement_nom.trim() || null : null,
        etablissement_logo_key: nouveauCompte && nouvelEtablissement ? form.etablissement_logo_key : null,
        type_actif: form.type_actif || null,
        valeur_estimee: form.valeur_estimee ? Number(form.valeur_estimee) : null,
        taux_pct: form.taux_pct ? Number(form.taux_pct) : null,
        zone_geo: form.zone_geo || null,
        versement_mensuel: form.versement_mensuel ? Number(form.versement_mensuel) : null,
        date_acquisition: form.date_acquisition || null,
      })
      setForm(FORM_VIDE)
      setIdentifiantVisible(false)
      // Un compte (et son établissement) a pu être créé à la volée : recharge les
      // listes pour qu'ils apparaissent dans les sélecteurs dès le prochain ajout.
      if (nouveauCompte) {
        if (autonome) {
          api.listComptes().then(setComptesCharges).catch(() => {})
          if (nouvelEtablissement) api.listEtablissements().then(setEtablissementsCharges).catch(() => {})
        } else onComptesModifies?.()
      }
      onCreated?.(holding)
    } catch (err) {
      setError((err as Error).message)
      // L'identifiant calculé automatiquement a été refusé (doublon, ou toute autre
      // raison) — le révéler, pré-rempli avec la valeur essayée, pour que
      // l'utilisateur corrige exactement ce que le message d'erreur ci-dessous
      // explique, sans avoir à deviner un identifiant qu'il n'a jamais vu.
      if (estPatrimoine) {
        setIdentifiantVisible(true)
        setForm((f) => ({ ...f, ticker: identifiant }))
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleAddLoan(e: React.FormEvent) {
    e.preventDefault()
    if (
      !loanForm.libelle.trim() ||
      !loanForm.capital_initial ||
      !loanForm.taux_annuel_pct ||
      !loanForm.mensualite ||
      !loanForm.date_debut ||
      !loanForm.duree_mois
    )
      return
    setSavingLoan(true)
    setErrorLoan(null)
    try {
      const loan = await api.createLoan({
        libelle: loanForm.libelle.trim(),
        capital_initial: Number(loanForm.capital_initial),
        taux_annuel_pct: Number(loanForm.taux_annuel_pct),
        mensualite: Number(loanForm.mensualite),
        date_debut: loanForm.date_debut,
        duree_mois: Number(loanForm.duree_mois),
      })
      setLoanForm(LOAN_FORM_VIDE)
      onLoanCreated?.(loan)
    } catch (err) {
      setErrorLoan((err as Error).message)
    } finally {
      setSavingLoan(false)
    }
  }

  const sansEtablissement = TYPES_ACTIF_SANS_ETABLISSEMENT.has(form.type_actif)
  const avecZoneGeo = TYPES_AVEC_ZONE_GEO.has(form.type_actif)

  // Valeur d'acquisition calculée en direct (maquette de la refonte) : quantité ×
  // prix de revient, affichée dès que les deux nombres sont valides. Sans objet pour
  // un type patrimonial : sa quantité (fixée à 1, jamais montrée) rendrait la
  // multiplication illisible (« 1 × 200 000 ») pour un prix de revient déjà
  // exprimé en valeur absolue. La virgule est tolérée à la lecture par prudence — les
  // deux champs sont aujourd'hui des `input[type=number]`, où le navigateur normalise
  // déjà le séparateur selon la locale, mais ce parsing survivrait à leur passage en
  // champ texte.
  const nombreSaisi = (brut: string): number | null => {
    const valeur = Number(brut.replace(',', '.'))
    return brut.trim() !== '' && Number.isFinite(valeur) ? valeur : null
  }
  const quantiteNum = nombreSaisi(form.quantite)
  const prixNum = nombreSaisi(form.prix_revient_moyen)
  const valeurAcquisition = !estPatrimoine && quantiteNum !== null && prixNum !== null ? quantiteNum * prixNum : null

  // Écart assumé à la maquette, qui exige « ticker, quantité ET prix tous trois
  // strictement positifs » pour activer le bouton. Deux raisons de ne pas la suivre
  // à la lettre ici :
  //   — un bien saisi à la main (appartement, livret) se valorise par « Valeur
  //     estimée », pas par un prix de revient ; l'exiger fermerait le formulaire à
  //     l'usage même pour lequel ce champ existe ;
  //   — une quantité négative reçoit aujourd'hui un message d'erreur explicite du
  //     serveur, plus utile qu'un bouton grisé sans explication (recette du
  //     02/09/2026, verrouillée par un test de bout en bout).
  // La correction que la maquette visait — un clic sans effet ni retour — est bien
  // en place : un identifiant (Nom pour un type patrimonial, Ticker sinon) et une
  // quantité restent obligatoires (quantité posée par `handleTypeChange` pour un
  // type patrimonial, jamais laissée vide). `identifiantPresent` calculé plus haut,
  // réutilisé ici comme dans le garde-fou de `handleAdd`.
  const saisieComplete = identifiantPresent && form.quantite.trim() !== ''
  const loanSaisieComplete =
    loanForm.libelle.trim() !== '' &&
    loanForm.capital_initial.trim() !== '' &&
    loanForm.taux_annuel_pct.trim() !== '' &&
    loanForm.mensualite.trim() !== '' &&
    loanForm.date_debut.trim() !== '' &&
    loanForm.duree_mois.trim() !== ''

  const contenu = (
    <>
      {autoriserEmprunt && (
        <div className="mb-4 w-fit">
          <SegmentedControl
            options={[
              { valeur: 'actif', libelle: 'Un actif' },
              { valeur: 'emprunt', libelle: 'Un emprunt' },
            ]}
            valeur={modeAjout}
            onChange={setModeAjout}
            ariaLabel="Qu'ajoutez-vous ?"
          />
        </div>
      )}

      {modeAjout === 'emprunt' ? (
        <form onSubmit={handleAddLoan} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <LoanFormFields form={loanForm} onChange={setLoanForm} variant="grille" />
          </div>
          <PrimaryButton
            type="submit"
            disabled={savingLoan || !loanSaisieComplete}
            title={loanSaisieComplete ? undefined : "Renseignez tous les champs de l'emprunt."}
            className="self-start"
          >
            Ajouter
          </PrimaryButton>
          {errorLoan && <EtatErreur message={errorLoan} />}
        </form>
      ) : (
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          {/* Grille à deux colonnes (maquette) : Type d'actif et Ticker seuls
              occupent toute la largeur (`col-span-2`), le reste vient par paires.
              `Input`/`Select` sont `w-full` — c'est le conteneur qui règle la
              largeur, plus le champ. */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type d'actif" className="col-span-2">
              <Select value={form.type_actif} onChange={(e) => handleTypeChange(e.target.value)}>
                {TYPE_ACTIF_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            {estPatrimoine ? (
              <>
                {/* Un bien valorisé à la main n'a pas de « ticker » — son identité,
                    c'est son Nom, pas un symbole boursier inventé pour l'occasion
                    (retour utilisateur du 09/09/2026). L'identifiant technique que le
                    serveur exige quand même (obligatoire, unique) reste calculé à
                    partir de ce Nom, cf. `identifiant`/`identifiantDepuisNom` — sans
                    champ dédié tant qu'il n'a pas été refusé. */}
                <Field label="Nom" className="col-span-2">
                  <Input
                    value={form.nom}
                    onChange={(e) => setForm({ ...form, nom: e.target.value })}
                    placeholder="Appartement Lyon, Peugeot 208..."
                  />
                </Field>
                {identifiantVisible && (
                  <div className="col-span-2">
                    {/* Le texte d'aide reste HORS du `<label>` (pas la prop `aide` de
                        `Field`) : `<label>` texte inclus dans le nom accessible du
                        champ, `getByLabelText('Identifiant')` cesserait de matcher
                        exactement une fois ce texte concaténé au libellé. */}
                    <Field label="Identifiant">
                      <Input value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })} />
                    </Field>
                    <p className="mt-1 text-xs text-ink3">Calculé depuis le Nom, en majuscules — corrigez-le si besoin.</p>
                  </div>
                )}
              </>
            ) : (
              <Field label="Ticker" className="col-span-2">
                {/* Majuscules à la SAISIE, pas seulement à l'envoi (maquette de la
                    refonte) : le champ affichait « aapl » jusqu'au dernier moment, alors
                    que la ligne créée s'appellera « AAPL ». Voir ce qu'on obtient pendant
                    qu'on tape vaut mieux qu'une normalisation invisible. */}
                <Input
                  value={form.ticker}
                  onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
                  placeholder="AAPL"
                />
              </Field>
            )}
            {!estPatrimoine && (
              <Field label="Quantité">
                <Input value={form.quantite} onChange={(e) => setForm({ ...form, quantite: e.target.value })} type="number" step="any" />
              </Field>
            )}
            <Field
              label={
                <span className="inline-flex items-center gap-1">
                  Prix de revient
                  <InfoBulle texte={TEXTE_PRIX_REVIENT} />
                </span>
              }
            >
              <Input
                value={form.prix_revient_moyen}
                onChange={(e) => setForm({ ...form, prix_revient_moyen: e.target.value })}
                type="number"
                step="any"
              />
            </Field>
            {!sansEtablissement && (
              <Field label="Compte" className={form.compte_id === NOUVEAU_COMPTE ? 'col-span-2' : undefined}>
                <Select value={form.compte_id} onChange={(e) => setForm({ ...form, compte_id: e.target.value })} aria-label="Compte">
                  {/* Un placeholder « — Choisir — » reste indispensable tant qu'aucune
                      sélection n'est faite, sinon le navigateur présélectionne
                      silencieusement le premier compte de la liste sans que l'état React
                      (`form.compte_id`, resté `''`) ne le reflète — bug réel constaté en
                      recette du 03/09/2026, pas qu'un souci d'affichage. */}
                  {form.compte_id === '' && <option value="">— Choisir —</option>}
                  {comptes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                  <option value={NOUVEAU_COMPTE}>+ Nouveau compte...</option>
                </Select>
              </Field>
            )}
            {form.compte_id === NOUVEAU_COMPTE && (
              <>
                <Field label="Nom du nouveau compte">
                  <Input
                    value={form.compte_nom}
                    onChange={(e) => setForm({ ...form, compte_nom: e.target.value })}
                    placeholder="PEA, CTO..."
                  />
                </Field>
                <Field label="Établissement">
                  <SelecteurEtablissement
                    etablissements={etablissements}
                    value={form.etablissement_id}
                    nomNouveau={form.etablissement_nom}
                    onValueChange={(v) => setForm({ ...form, etablissement_id: v })}
                    onNomNouveauChange={(v) => setForm({ ...form, etablissement_nom: v })}
                    logoKeyNouveau={form.etablissement_logo_key}
                    onLogoKeyNouveauChange={(v) => setForm({ ...form, etablissement_logo_key: v })}
                    ariaLabel="Établissement du nouveau compte"
                  />
                </Field>
              </>
            )}
            <Field
              label={
                <span className="inline-flex items-center gap-1">
                  Valeur estimée
                  <InfoBulle texte={TEXTE_VALEUR_ESTIMEE} />
                </span>
              }
            >
              <Input
                value={form.valeur_estimee}
                onChange={(e) => setForm({ ...form, valeur_estimee: e.target.value })}
                type="number"
                step="any"
                placeholder="optionnel"
              />
            </Field>
            {TYPES_AVEC_TAUX.has(form.type_actif) && (
              <Field label={libelleTaux(form.type_actif)}>
                <Input
                  value={form.taux_pct}
                  onChange={(e) => setForm({ ...form, taux_pct: e.target.value })}
                  type="number"
                  step="any"
                  placeholder={form.type_actif === 'VEHICLE' ? '-15' : '3'}
                />
              </Field>
            )}
            {TYPES_EPARGNE.has(form.type_actif) && (
              <Field label="Versement mensuel (€)">
                <Input
                  value={form.versement_mensuel}
                  onChange={(e) => setForm({ ...form, versement_mensuel: e.target.value })}
                  type="number"
                  step="any"
                  min={0}
                  placeholder="optionnel"
                />
              </Field>
            )}
            {avecZoneGeo && (
              <Field label="Zone géographique">
                <Select value={form.zone_geo} onChange={(e) => setForm({ ...form, zone_geo: e.target.value })}>
                  <option value="">Europe (par défaut)</option>
                  {ZONES_GEO.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {estPatrimoine && (
              <Field label="Date d'acquisition">
                <Input
                  value={form.date_acquisition}
                  onChange={(e) => setForm({ ...form, date_acquisition: e.target.value })}
                  type="date"
                />
              </Field>
            )}
          </div>
          {/* Désactivé tant que la ligne ne tient pas debout (recette du 02/09/2026,
              resserré par la maquette) : `handleAdd` retournait silencieusement, donc
              un clic sur « Ajouter » avec un formulaire vide ne produisait AUCUN
              retour — l'utilisateur ne savait pas ce qu'on attendait de lui. Le
              `title` dit quoi remplir plutôt que de laisser deviner. */}
          <PrimaryButton
            type="submit"
            disabled={saving || !saisieComplete}
            title={saisieComplete ? undefined : 'Renseignez au minimum un ticker et une quantité.'}
            className="self-start"
          >
            Ajouter
          </PrimaryButton>
        </form>
      )}

      {modeAjout === 'actif' && (
        <>
          {/* Encart de confirmation du calcul (maquette) : ce que la ligne vaudra à
              l'achat, avant de valider. Il ne remplace aucun champ — il rend visible la
              multiplication que l'utilisateur faisait de tête. */}
          {valeurAcquisition !== null && (
            <p className="mt-3 rounded-control bg-accent-soft px-3 py-2 text-[13px] text-accent">
              {/* Jamais masqué par « masquer les montants » : c'est le produit de deux
                  nombres que l'utilisateur vient de taper, visibles juste au-dessus dans
                  leurs champs. Le masquer cacherait un calcul, pas une donnée. Et ce
                  formulaire est aussi monté par l'assistant de bienvenue, hors du
                  fournisseur de préférences d'affichage. */}
              Valeur d'acquisition : <span className="font-semibold">{formatEuro(valeurAcquisition, 2)}</span>{' '}
              <span className="text-accent/80">({form.quantite} × {form.prix_revient_moyen})</span>
            </p>
          )}
          {estPatrimoine && (
            <p className="mt-3 text-xs text-texte-attenue">
              Immobilier, SCPI, assurance-vie, PER, compte courant/d'épargne, véhicule : valorisés par Valeur estimée
              plutôt que par quantité × prix — elle remplace le calcul et se met à jour à la main, périodiquement.
            </p>
          )}
          {TYPES_AVEC_TAUX.has(form.type_actif) &&
            valeurProjeteeUnAn(form.valeur_estimee ? Number(form.valeur_estimee) : null, form.taux_pct ? Number(form.taux_pct) : null) !==
              null && (
              <p className="mt-1 text-xs text-texte-attenue">
                Valeur projetée dans 1 an (indicatif, jamais appliqué automatiquement) :{' '}
                {valeurProjeteeUnAn(Number(form.valeur_estimee), Number(form.taux_pct))?.toLocaleString('fr-FR', {
                  style: 'currency',
                  currency: 'EUR',
                  maximumFractionDigits: 0,
                })}
              </p>
            )}
          {error && <EtatErreur message={error} />}
        </>
      )}
    </>
  )

  return sansCarte ? contenu : <Card title="Ajouter une ligne manuellement">{contenu}</Card>
}
