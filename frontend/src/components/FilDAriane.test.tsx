import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import FilDAriane from './FilDAriane'

// `FilDAriane` est monté en FRÈRE de `<Routes>` dans `App.tsx`, jamais comme
// descendant d'une `<Route>` — reproduit ici tel quel (pas de `<Routes>` englobant)
// pour verrouiller que le composant n'utilise jamais `useParams()` (qui renverrait
// toujours `{}` dans ce montage réel) et extrait bien le ticker via `matchPath`.
function renderFil(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FilDAriane />
    </MemoryRouter>,
  )
}

describe('FilDAriane (backlog 2.K.2)', () => {
  it("n'affiche rien sur l'accueil", () => {
    const { container } = renderFil('/')
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche Synthèse > écran courant pour une route de premier niveau', () => {
    renderFil('/dividendes')
    expect(screen.getByRole('link', { name: 'Synthèse' })).toHaveAttribute('href', '/')
    expect(screen.getByText('Dividendes')).toHaveAttribute('aria-current', 'page')
  })

  it('affiche Synthèse > Patrimoine > ticker pour la fiche détaillée', () => {
    renderFil('/patrimoine/AAPL')
    expect(screen.getByRole('link', { name: 'Synthèse' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Patrimoine' })).toHaveAttribute('href', '/patrimoine')
    expect(screen.getByText('AAPL')).toHaveAttribute('aria-current', 'page')
  })
})
