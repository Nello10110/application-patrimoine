import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTheme } from './useTheme'

const CLE_STOCKAGE = 'patrimoine:theme'

// jsdom n'implémente pas `matchMedia` : on le simule nous-mêmes, avec un moyen de
// déclencher les écouteurs `change` pour tester le suivi du mode "système".
function creerMatchMediaMock(matchesInitial: boolean) {
  let matches = matchesInitial
  const listeners = new Set<() => void>()
  const mql = {
    get matches() {
      return matches
    },
    addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
  }
  function setMatches(value: boolean) {
    matches = value
    listeners.forEach((cb) => cb())
  }
  return { mql, setMatches }
}

describe('useTheme (LOT 5.12)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.documentElement.classList.remove('dark')
    window.localStorage.clear()
  })

  it('vaut "système" par défaut, sans préférence stockée', () => {
    const { mql } = creerMatchMediaMock(false)
    vi.stubGlobal('matchMedia', () => mql)

    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('systeme')
  })

  it('bascule vers "sombre", persiste dans localStorage, et pose la classe dark sur <html>', () => {
    const { mql } = creerMatchMediaMock(false)
    vi.stubGlobal('matchMedia', () => mql)
    const { result } = renderHook(() => useTheme())

    act(() => result.current.setTheme('sombre'))

    expect(result.current.theme).toBe('sombre')
    expect(window.localStorage.getItem(CLE_STOCKAGE)).toBe('sombre')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('bascule vers "clair" et retire la classe dark', () => {
    const { mql } = creerMatchMediaMock(true)
    vi.stubGlobal('matchMedia', () => mql)
    const { result } = renderHook(() => useTheme())

    act(() => result.current.setTheme('sombre'))
    act(() => result.current.setTheme('clair'))

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem(CLE_STOCKAGE)).toBe('clair')
  })

  it('relit la préférence persistée dès le montage', () => {
    window.localStorage.setItem(CLE_STOCKAGE, 'sombre')
    const { mql } = creerMatchMediaMock(false)
    vi.stubGlobal('matchMedia', () => mql)

    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('sombre')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('en mode "système", suit les changements de préférence système tant que le composant est monté', () => {
    const { mql, setMatches } = creerMatchMediaMock(false)
    vi.stubGlobal('matchMedia', () => mql)
    const { result } = renderHook(() => useTheme())

    act(() => result.current.setTheme('systeme'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    act(() => setMatches(true))
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    act(() => setMatches(false))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
