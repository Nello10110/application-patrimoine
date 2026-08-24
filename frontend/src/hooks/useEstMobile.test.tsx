import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { simulerLargeurEcran } from '../test/matchMedia'
import { useEstMobile } from './useEstMobile'

function Sonde() {
  const estMobile = useEstMobile()
  return <p>{estMobile ? 'mobile' : 'desktop'}</p>
}

describe('useEstMobile (backlog 2.K.4)', () => {
  it('renvoie false (desktop) par défaut — le stub de test simule un viewport large', () => {
    render(<Sonde />)
    expect(screen.getByText('desktop')).toBeInTheDocument()
  })

  it('renvoie true quand `window.matchMedia` signale un viewport mobile', () => {
    simulerLargeurEcran(true)
    render(<Sonde />)
    expect(screen.getByText('mobile')).toBeInTheDocument()
  })
})
