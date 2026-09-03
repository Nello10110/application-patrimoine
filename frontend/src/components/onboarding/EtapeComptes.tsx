import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { Compte, Etablissement } from '../../api/types'
import AjoutCompteForm from '../AjoutCompteForm'
import Card from '../Card'
import EtablissementsCard from '../EtablissementsCard'
import EtatErreur from '../EtatErreur'
import EtatVide from '../EtatVide'
import { SkeletonTexte } from '../Skeleton'

/** Étape "Comptes" de `steps.ts` (backlog X.3, demande directe de l'utilisateur en
 * suite de X.1/X.2 : « une jolie interface invitant l'utilisateur à renseigner ses
 * établissements et ses comptes »). Même patron que les autres étapes réutilisant un
 * composant existant tel quel pour les établissements (`EtablissementsCard`) ; la
 * liste des comptes et leur création (`AjoutCompteForm`, extrait de `ComptesPage.tsx`
 * pour ce partage) sont composées ici directement — pas de solde affiché (à ce stade
 * du parcours, généralement avant toute saisie de position, un solde serait toujours
 * à zéro et n'apporterait rien), contrairement à l'écran Comptes complet. */
export default function EtapeComptes() {
  const [comptes, setComptes] = useState<Compte[] | null>(null)
  const [etablissements, setEtablissements] = useState<Etablissement[]>([])
  const [error, setError] = useState<string | null>(null)

  function charger() {
    setError(null)
    api
      .listComptes()
      .then(setComptes)
      .catch((err) => setError(err.message))
    api.listEtablissements().then(setEtablissements).catch(() => setEtablissements([]))
  }

  useEffect(charger, [])

  async function handleDelete(id: number) {
    setError(null)
    try {
      await api.deleteCompte(id)
      charger()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-texte">
        Si le patrimoine est réparti sur plusieurs banques ou courtiers (compte courant, PEA, compte-titres,
        assurance-vie, immobilier...), déclare-les ici pour tout regrouper par établissement sur l'écran{' '}
        <span className="font-medium text-texte">Comptes</span> et définir une répartition entre détenteurs pour un
        compte entier en une fois. Sans objet, ou pas encore prêt ? Cette étape se passe sans rien saisir — un compte se
        crée de toute façon à la volée depuis le formulaire d'ajout d'une position.
      </p>

      <EtablissementsCard etablissements={etablissements} onModifies={charger} />

      {/* Titre distinct de celui de l'étape (`WelcomeWizard.tsx` affiche déjà
          "Comptes" comme titre de la carte englobante) — éviter deux titres
          identiques dans la même vue. */}
      <Card title="Comptes créés">
        {comptes === null ? (
          <SkeletonTexte />
        ) : comptes.length === 0 ? (
          <EtatVide titre="Aucun compte déclaré." />
        ) : (
          <ul className="mb-4 divide-y divide-bordure">
            {comptes.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-texte">
                  {c.nom} <span className="text-xs text-texte-attenue">({c.etablissement?.nom ?? 'Sans établissement'})</span>
                </span>
                <button onClick={() => handleDelete(c.id)} className="text-xs text-negatif hover:underline">
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-bordure pt-4">
          <AjoutCompteForm etablissements={etablissements} onCreated={charger} />
        </div>
        {error && <EtatErreur message={error} onReessayer={charger} />}
      </Card>
    </div>
  )
}
