import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import Modale from './Modale'

// Harnais minimal : un déclencheur (bouton) ouvre la modale, `onClose` la referme.
// Deux boutons à l'intérieur pour vérifier le piège du focus (Tab/Maj+Tab).
function Harnais({ onClose }: { onClose?: () => void }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <div>
      <button onClick={() => setOuvert(true)}>Ouvrir</button>
      {ouvert && (
        <Modale
          onClose={() => {
            setOuvert(false)
            onClose?.()
          }}
        >
          {({ titleId }) => (
            <>
              <h2 id={titleId}>Titre de la modale</h2>
              <button>Premier</button>
              <button>Dernier</button>
            </>
          )}
        </Modale>
      )}
    </div>
  )
}

// `fireEvent.click` (contrairement à `userEvent.click`, absent des dépendances de ce
// projet) ne déplace pas le focus tout seul : on le simule explicitement pour que
// `document.activeElement` soit bien le déclencheur au moment où la modale s'ouvre,
// comme lors d'un vrai clic dans un navigateur.
function cliquerEnFocusant(element: HTMLElement) {
  element.focus()
  fireEvent.click(element)
}

describe('Modale (LOT 6.2)', () => {
  it('porte role="dialog", aria-modal, et aria-labelledby pointant le titre', async () => {
    render(<Harnais />)
    cliquerEnFocusant(screen.getByRole('button', { name: 'Ouvrir' }))

    const dialogue = await screen.findByRole('dialog')
    expect(dialogue).toHaveAttribute('aria-modal', 'true')
    const titre = screen.getByText('Titre de la modale')
    expect(dialogue).toHaveAttribute('aria-labelledby', titre.id)
  })

  it('déplace le focus à l\'intérieur de la modale à l\'ouverture', async () => {
    render(<Harnais />)
    cliquerEnFocusant(screen.getByRole('button', { name: 'Ouvrir' }))

    await screen.findByRole('dialog')
    expect(screen.getByRole('button', { name: 'Premier' })).toHaveFocus()
  })

  it('restaure le focus sur le déclencheur à la fermeture', async () => {
    render(<Harnais />)
    const declencheur = screen.getByRole('button', { name: 'Ouvrir' })
    cliquerEnFocusant(declencheur)

    await screen.findByRole('dialog')
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(declencheur).toHaveFocus()
  })

  it('Échap ferme la modale', async () => {
    const onClose = vi.fn()
    render(<Harnais onClose={onClose} />)
    cliquerEnFocusant(screen.getByRole('button', { name: 'Ouvrir' }))
    await screen.findByRole('dialog')

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('le clic à l\'intérieur ne se propage pas vers le fond (backdrop)', async () => {
    render(<Harnais />)
    cliquerEnFocusant(screen.getByRole('button', { name: 'Ouvrir' }))
    const dialogue = await screen.findByRole('dialog')

    fireEvent.click(dialogue)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('piège le focus : Tab depuis le dernier élément revient au premier', async () => {
    render(<Harnais />)
    cliquerEnFocusant(screen.getByRole('button', { name: 'Ouvrir' }))
    await screen.findByRole('dialog')

    const premier = screen.getByRole('button', { name: 'Premier' })
    const dernier = screen.getByRole('button', { name: 'Dernier' })
    dernier.focus()

    fireEvent.keyDown(document, { key: 'Tab' })

    expect(premier).toHaveFocus()
  })

  it('piège le focus : Maj+Tab depuis le premier élément va au dernier', async () => {
    render(<Harnais />)
    cliquerEnFocusant(screen.getByRole('button', { name: 'Ouvrir' }))
    await screen.findByRole('dialog')

    const premier = screen.getByRole('button', { name: 'Premier' })
    const dernier = screen.getByRole('button', { name: 'Dernier' })
    premier.focus()

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })

    expect(dernier).toHaveFocus()
  })

  describe('modales empilées', () => {
    function HarnaisEmpile() {
      const [parentOuvert, setParentOuvert] = useState(true)
      const [enfantOuvert, setEnfantOuvert] = useState(false)
      return (
        <>
          {parentOuvert && (
            <Modale onClose={() => setParentOuvert(false)}>
              {({ titleId }) => (
                <>
                  <h2 id={titleId}>Modale parente</h2>
                  <button onClick={() => setEnfantOuvert(true)}>Ouvrir enfant</button>
                </>
              )}
            </Modale>
          )}
          {enfantOuvert && (
            <Modale onClose={() => setEnfantOuvert(false)}>
              {({ titleId }) => (
                <>
                  <h2 id={titleId}>Modale enfant</h2>
                  <button>Action enfant</button>
                </>
              )}
            </Modale>
          )}
        </>
      )
    }

    it('Échap ne ferme que la modale du dessus, et le focus revient dans la modale parente', async () => {
      render(<HarnaisEmpile />)

      const boutonOuvrirEnfant = await screen.findByRole('button', { name: 'Ouvrir enfant' })
      cliquerEnFocusant(boutonOuvrirEnfant)

      // Deux modales ouvertes : la parente (toujours montée) et l'enfant (par-dessus).
      expect(await screen.findAllByRole('dialog')).toHaveLength(2)
      expect(screen.getByRole('button', { name: 'Action enfant' })).toHaveFocus()

      fireEvent.keyDown(document, { key: 'Escape' })

      // Une seule modale reste : la parente, avec son titre encore présent.
      const dialogues = screen.getAllByRole('dialog')
      expect(dialogues).toHaveLength(1)
      expect(screen.getByText('Modale parente')).toBeInTheDocument()
      expect(screen.queryByText('Modale enfant')).not.toBeInTheDocument()

      // Le focus revient dans la modale parente (sur son déclencheur), pas sur la page.
      expect(boutonOuvrirEnfant).toHaveFocus()
    })
  })
})

/** Deux corrections du 07/09/2026, remontées à l'usage sur mobile : la feuille
 * « Plus » s'affichait illisible et ne se fermait ni au clic sur le fond ni au
 * glissement. */
describe('Modale — portail et glissement (correction du 07/09/2026)', () => {
  it('se rend sur <body>, hors de son parent de déclaration', () => {
    // Cause réelle du bug : `BottomNav` porte un `backdrop-filter`, ce qui en fait un
    // BLOC CONTENANT pour ses descendants en `position: fixed`. La feuille déclarée
    // dedans se retrouvait enfermée dans la barre de 64 px. Le portail l'en sort.
    const { container } = render(
      <Modale onClose={vi.fn()} variant="bottom">
        {({ titleId }) => <h2 id={titleId}>Feuille</h2>}
      </Modale>,
    )

    expect(container).toBeEmptyDOMElement()
    expect(document.body).toContainElement(screen.getByRole('dialog'))
  })

  it('se ferme au glissement vers le bas quand la feuille est en haut de son contenu', () => {
    const onClose = vi.fn()
    render(
      <Modale onClose={onClose} variant="bottom">
        {({ titleId }) => <h2 id={titleId}>Feuille</h2>}
      </Modale>,
    )
    const panneau = screen.getByRole('dialog')

    fireEvent.touchStart(panneau, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(panneau, { touches: [{ clientY: 200 }] })
    fireEvent.touchEnd(panneau)

    expect(onClose).toHaveBeenCalled()
  })

  it('ne se ferme pas sur un frôlement (sous le seuil)', () => {
    const onClose = vi.fn()
    render(
      <Modale onClose={onClose} variant="bottom">
        {({ titleId }) => <h2 id={titleId}>Feuille</h2>}
      </Modale>,
    )
    const panneau = screen.getByRole('dialog')

    fireEvent.touchStart(panneau, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(panneau, { touches: [{ clientY: 130 }] })
    fireEvent.touchEnd(panneau)

    expect(onClose).not.toHaveBeenCalled()
  })

  // Une feuille dont le contenu défile doit pouvoir être parcourue vers le haut sans
  // se refermer au premier mouvement.
  it('ne se ferme pas si le contenu est déjà défilé', () => {
    const onClose = vi.fn()
    render(
      <Modale onClose={onClose} variant="bottom">
        {({ titleId }) => <h2 id={titleId}>Feuille</h2>}
      </Modale>,
    )
    const panneau = screen.getByRole('dialog')
    Object.defineProperty(panneau, 'scrollTop', { value: 120, configurable: true })

    fireEvent.touchStart(panneau, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(panneau, { touches: [{ clientY: 300 }] })
    fireEvent.touchEnd(panneau)

    expect(onClose).not.toHaveBeenCalled()
  })

  // Le glissement est un geste tactile : sur la modale centrée, il ne doit rien faire.
  it('ne ferme jamais une modale centrée au glissement', () => {
    const onClose = vi.fn()
    render(
      <Modale onClose={onClose}>
        {({ titleId }) => <h2 id={titleId}>Centrée</h2>}
      </Modale>,
    )
    const panneau = screen.getByRole('dialog')

    fireEvent.touchStart(panneau, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(panneau, { touches: [{ clientY: 400 }] })
    fireEvent.touchEnd(panneau)

    expect(onClose).not.toHaveBeenCalled()
  })
})
