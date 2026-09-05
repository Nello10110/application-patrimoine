import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import EtablissementLogo from './EtablissementLogo'

describe('EtablissementLogo', () => {
  it('affiche un badge coloré avec les initiales pour un établissement connu du catalogue', () => {
    render(<EtablissementLogo logoKey="trade_republic" nom="Trade Republic" />)

    const badge = screen.getByText('TR')
    expect(badge).toHaveStyle({ backgroundColor: '#1b1b1f' })
  })

  it('affiche un badge neutre (icône générique) pour une clé absente du catalogue', () => {
    render(<EtablissementLogo logoKey="etablissement_disparu_du_catalogue" nom="Établissement custom" />)

    expect(screen.queryByText('TR')).not.toBeInTheDocument()
    expect(document.querySelector('svg')).toBeInTheDocument()
  })

  it('affiche un badge neutre quand aucune clé n\'est fournie (établissement personnalisé)', () => {
    render(<EtablissementLogo logoKey={null} nom="Ma banque perso" />)

    expect(document.querySelector('svg')).toBeInTheDocument()
  })
})
