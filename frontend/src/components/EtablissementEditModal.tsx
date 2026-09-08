import { useRef, useState } from 'react'
import { api } from '../api/client'
import type { Etablissement } from '../api/types'
import { trouverEtablissementConnu } from '../utils/etablissementsConnus'
import { invaliderLogos } from '../utils/logosEtablissements'
import { formatDateHeure } from '../utils/format'
import { PrimaryButton, SecondaryButton } from './Controls'
import EtatErreur from './EtatErreur'
import EtablissementLogo from './EtablissementLogo'
import { Field, Input } from './Field'
import Modale from './Modale'

const LIBELLES_SOURCE: Record<string, string> = {
  catalogue: 'récupéré sur le site officiel',
  url: 'récupéré depuis une adresse',
  upload: 'image téléversée',
}

/** Vue d'édition d'un établissement (retour utilisateur, 05/09/2026 : « pouvoir
 * éditer l'établissement avec une vue dédiée où on pourrait aller mettre l'image ou
 * l'URL ») — remplace le renommage en ligne de `EtablissementsCard`, devenu trop
 * étroit dès qu'il a fallu y loger la gestion du logo.
 *
 * Quatre façons de poser un logo, dans l'ordre où elles se présentent à l'écran :
 * le récupérer sur le site officiel (seulement pour un établissement du catalogue),
 * téléverser une image, saisir une adresse, ou le retirer. Toutes passent par le
 * serveur, qui normalise en PNG et valide l'adresse (cf. `services/logo_service.py`).
 *
 * `onEnregistre` est appelé après toute modification pour que l'appelant recharge sa
 * liste — le cache de logos, lui, est invalidé ici (`invaliderLogos`), ce qui
 * rafraîchit tous les badges déjà affichés ailleurs sans que l'appelant s'en occupe. */
export default function EtablissementEditModal({
  etablissement,
  onClose,
  onEnregistre,
}: {
  etablissement: Etablissement
  onClose: () => void
  onEnregistre: () => void
}) {
  const [courant, setCourant] = useState(etablissement)
  const [nom, setNom] = useState(etablissement.nom)
  const [url, setUrl] = useState('')
  const [enCours, setEnCours] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fichierRef = useRef<HTMLInputElement>(null)

  const estDuCatalogue = Boolean(trouverEtablissementConnu(etablissement.logo_key))

  async function executer(cle: string, action: () => Promise<Etablissement | void>) {
    setEnCours(cle)
    setError(null)
    try {
      const maj = await action()
      if (maj) setCourant(maj)
      invaliderLogos()
      onEnregistre()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setEnCours(null)
    }
  }

  const occupe = enCours !== null

  return (
    <Modale onClose={onClose}>
      {({ titleId }) => (
        <>
          <div className="mb-4 flex items-center gap-3">
            <EtablissementLogo
              etablissementId={courant.id}
              logoKey={courant.logo_key}
              nom={courant.nom}
              taille="lg"
            />
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-texte">
                {courant.nom}
              </h2>
              <p className="text-xs text-texte-attenue">
                {courant.a_un_logo && courant.logo_source
                  ? `Logo ${LIBELLES_SOURCE[courant.logo_source] ?? courant.logo_source}${
                      courant.logo_maj_le ? ` · ${formatDateHeure(courant.logo_maj_le)}` : ''
                    }`
                  : 'Aucun logo — un badge par défaut est affiché.'}
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (nom.trim() && nom.trim() !== courant.nom) {
                void executer('nom', () => api.updateEtablissement(courant.id, nom.trim()))
              }
            }}
            className="flex flex-wrap items-end gap-3 border-t border-hairline pt-4"
          >
            <Field label="Nom" className="w-56">
              <Input value={nom} onChange={(e) => setNom(e.target.value)} />
            </Field>
            <PrimaryButton type="submit" disabled={occupe || !nom.trim() || nom.trim() === courant.nom}>
              {enCours === 'nom' ? 'Enregistrement…' : 'Renommer'}
            </PrimaryButton>
          </form>

          <div className="mt-4 space-y-3 border-t border-hairline pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink3">Logo</h3>

            <div className="flex flex-wrap gap-2">
              <SecondaryButton
                onClick={() => void executer('catalogue', () => api.recupererLogoCatalogue(courant.id))}
                disabled={occupe || !estDuCatalogue}
                title={
                  estDuCatalogue
                    ? undefined
                    : "Disponible uniquement pour un établissement choisi dans le catalogue — téléversez une image ou saisissez une adresse."
                }
              >
                {enCours === 'catalogue' ? 'Récupération…' : 'Récupérer le logo officiel'}
              </SecondaryButton>
              <SecondaryButton onClick={() => fichierRef.current?.click()} disabled={occupe}>
                {enCours === 'fichier' ? 'Envoi…' : 'Téléverser une image'}
              </SecondaryButton>
              {courant.a_un_logo && (
                <SecondaryButton
                  onClick={() => void executer('suppression', () => api.deleteEtablissementLogo(courant.id))}
                  disabled={occupe}
                  className="text-neg hover:bg-neg-bg"
                >
                  Retirer le logo
                </SecondaryButton>
              )}
            </div>

            <input
              ref={fichierRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/x-icon"
              aria-label="Image du logo"
              className="sr-only"
              onChange={(e) => {
                const fichier = e.target.files?.[0]
                if (!fichier) return
                void executer('fichier', () => api.uploadEtablissementLogo(courant.id, fichier))
                e.target.value = ''
              }}
            />

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (url.trim()) void executer('url', () => api.setEtablissementLogoUrl(courant.id, url.trim()))
              }}
              className="flex flex-wrap items-end gap-3"
            >
              <Field label="Adresse d'une image (le serveur la télécharge et la met en cache)" className="flex-1">
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://exemple.fr/logo.png" />
              </Field>
              <PrimaryButton type="submit" disabled={occupe || !url.trim()}>
                {enCours === 'url' ? 'Récupération…' : 'Utiliser cette adresse'}
              </PrimaryButton>
            </form>

            <p className="text-xs text-ink3">
              Toute image est reconvertie en PNG (128 px) côté serveur. Une adresse saisie est re-téléchargée
              chaque semaine par la tâche planifiée « Logos des établissements » ; une image téléversée n'est,
              elle, jamais remplacée automatiquement.
            </p>
          </div>

          {error && <EtatErreur message={error} />}

          <div className="mt-4 flex justify-end border-t border-hairline pt-4">
            <SecondaryButton onClick={onClose}>Fermer</SecondaryButton>
          </div>
        </>
      )}
    </Modale>
  )
}
