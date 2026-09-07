import { useRef, useState } from 'react'
import { api } from '../api/client'
import type { Etablissement } from '../api/types'
import { trouverEtablissementConnu } from '../utils/etablissementsConnus'
import { invaliderLogos } from '../utils/logosEtablissements'
import { formatDateHeure } from '../utils/format'
import EtatErreur from './EtatErreur'
import EtablissementLogo from './EtablissementLogo'
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
            className="flex flex-wrap items-end gap-3 border-t border-bordure pt-4"
          >
            <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
              Nom
              <input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="w-56 rounded-control border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
              />
            </label>
            <button
              type="submit"
              disabled={occupe || !nom.trim() || nom.trim() === courant.nom}
              className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {enCours === 'nom' ? 'Enregistrement…' : 'Renommer'}
            </button>
          </form>

          <div className="mt-4 space-y-3 border-t border-bordure pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-texte-attenue">Logo</h3>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void executer('catalogue', () => api.recupererLogoCatalogue(courant.id))}
                disabled={occupe || !estDuCatalogue}
                title={
                  estDuCatalogue
                    ? undefined
                    : "Disponible uniquement pour un établissement choisi dans le catalogue — téléversez une image ou saisissez une adresse."
                }
                className="rounded-control border border-bordure px-3 py-1.5 text-sm text-texte hover:border-accent disabled:opacity-40"
              >
                {enCours === 'catalogue' ? 'Récupération…' : 'Récupérer le logo officiel'}
              </button>
              <button
                type="button"
                onClick={() => fichierRef.current?.click()}
                disabled={occupe}
                className="rounded-control border border-bordure px-3 py-1.5 text-sm text-texte hover:border-accent disabled:opacity-40"
              >
                {enCours === 'fichier' ? 'Envoi…' : 'Téléverser une image'}
              </button>
              {courant.a_un_logo && (
                <button
                  type="button"
                  onClick={() => void executer('suppression', () => api.deleteEtablissementLogo(courant.id))}
                  disabled={occupe}
                  className="rounded-control border border-bordure px-3 py-1.5 text-sm text-negatif hover:border-negatif disabled:opacity-40"
                >
                  Retirer le logo
                </button>
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
              <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-texte-attenue">
                Adresse d'une image (le serveur la télécharge et la met en cache)
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://exemple.fr/logo.png"
                  className="w-full rounded-control border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
                />
              </label>
              <button
                type="submit"
                disabled={occupe || !url.trim()}
                className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {enCours === 'url' ? 'Récupération…' : 'Utiliser cette adresse'}
              </button>
            </form>

            <p className="text-xs text-texte-attenue">
              Toute image est reconvertie en PNG (128 px) côté serveur. Une adresse saisie est re-téléchargée
              chaque semaine par la tâche planifiée « Logos des établissements » ; une image téléversée n'est,
              elle, jamais remplacée automatiquement.
            </p>
          </div>

          {error && <EtatErreur message={error} />}

          <div className="mt-4 flex justify-end border-t border-bordure pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-control border border-bordure px-4 py-2 text-sm font-medium text-texte"
            >
              Fermer
            </button>
          </div>
        </>
      )}
    </Modale>
  )
}
