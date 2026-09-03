import { renderHook, waitFor, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { TOLERANCE_SOMME_PCT, useEditeurQuotites } from './useEditeurQuotites'

vi.mock('../api/client', () => ({ api: { listDetenteurs: vi.fn() } }))

const HORODATAGE = '2026-01-01T00:00:00'
const DETENTEURS = [
  { id: 1, nom: 'Alice', type: 'personne' as const, created_at: HORODATAGE, updated_at: HORODATAGE },
  { id: 2, nom: 'Bob', type: 'personne' as const, created_at: HORODATAGE, updated_at: HORODATAGE },
]

describe('useEditeurQuotites', () => {
  beforeEach(() => {
    vi.mocked(api.listDetenteurs).mockResolvedValue(DETENTEURS)
  })

  it('distingue un échec de chargement d’une absence de détenteur', async () => {
    // Régression du 03/09/2026 : les trois éditeurs faisaient
    // `.catch(() => setDetenteurs([]))` puis s'effaçaient si la liste était vide.
    // Un GET en échec faisait donc DISPARAÎTRE le bloc de répartition, sans
    // message ni bouton Réessayer — indiscernable de « aucun détenteur déclaré ».
    vi.mocked(api.listDetenteurs).mockRejectedValue(new Error('réseau injoignable'))
    const { result } = renderHook(() => useEditeurQuotites({ enregistrer: vi.fn() }))

    await waitFor(() => expect(result.current.erreurChargement).toBe('réseau injoignable'))
    expect(result.current.detenteurs).toEqual([])
  })

  it('valide la somme des quotités à 100 % avec la tolérance partagée', async () => {
    const { result } = renderHook(() => useEditeurQuotites({ enregistrer: vi.fn() }))
    await waitFor(() => expect(result.current.detenteurs).toHaveLength(2))

    // Formulaire vierge : rien à valider, l'enregistrement reste possible.
    expect(result.current.totalValide).toBe(true)

    act(() => result.current.setValeur(1, '60'))
    await waitFor(() => expect(result.current.totalValide).toBe(false))

    act(() => result.current.setValeur(2, '40'))
    await waitFor(() => expect(result.current.totalValide).toBe(true))
  })

  it('n’envoie que les quotités strictement positives', async () => {
    const enregistrer = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useEditeurQuotites({ enregistrer }))
    await waitFor(() => expect(result.current.detenteurs).toHaveLength(2))

    act(() => result.current.setValeur(1, '100'))
    act(() => result.current.setValeur(2, '0'))
    await act(async () => { await result.current.handleSave() })

    expect(enregistrer).toHaveBeenCalledWith([{ detenteur_id: 1, quotite_pct: 100 }])
    expect(result.current.enregistre).toBe(true)
  })

  it('expose une tolérance unique, partagée par les trois éditeurs', () => {
    // Elle vivait en trois exemplaires et avait déjà divergé (littéral en dur dans
    // `DetenteursSection`). Ce test verrouille l'unicité de la règle.
    expect(TOLERANCE_SOMME_PCT).toBe(0.01)
  })
})
