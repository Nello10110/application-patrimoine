import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Dropzone from './Dropzone'

function fichier(nom = 'releve.csv'): File {
  return new File(['contenu'], nom, { type: 'text/csv' })
}

describe('Dropzone', () => {
  it('cliquer sur la zone déclenche la sélection de fichier (input caché)', () => {
    const ref = createRef<HTMLInputElement>()
    const clickSpy = vi.fn()
    render(<Dropzone ref={ref} accept=".csv" onFileSelected={vi.fn()} ariaLabel="Zone test" />)
    ref.current!.click = clickSpy

    fireEvent.click(screen.getByRole('button', { name: 'Zone test' }))

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('sélectionner un fichier via l\'input appelle onFileSelected', () => {
    const onFileSelected = vi.fn()
    render(<Dropzone accept=".csv" onFileSelected={onFileSelected} ariaLabel="Zone test" />)

    fireEvent.change(screen.getByTestId('dropzone-input-Zone test'), { target: { files: [fichier()] } })

    expect(onFileSelected).toHaveBeenCalledWith(expect.objectContaining({ name: 'releve.csv' }))
  })

  it('déposer un fichier (drag & drop) appelle onFileSelected', () => {
    const onFileSelected = vi.fn()
    render(<Dropzone accept=".csv" onFileSelected={onFileSelected} ariaLabel="Zone test" />)
    const zone = screen.getByRole('button', { name: 'Zone test' })

    fireEvent.dragOver(zone)
    expect(screen.getByText('Déposez le fichier ici')).toBeInTheDocument()

    fireEvent.drop(zone, { dataTransfer: { files: [fichier()] } })

    expect(onFileSelected).toHaveBeenCalledWith(expect.objectContaining({ name: 'releve.csv' }))
  })

  it('quitter la zone sans déposer revient au texte de repos', () => {
    render(<Dropzone accept=".csv" onFileSelected={vi.fn()} ariaLabel="Zone test" label="Dépose ici" />)
    const zone = screen.getByRole('button', { name: 'Zone test' })

    fireEvent.dragOver(zone)
    expect(screen.getByText('Déposez le fichier ici')).toBeInTheDocument()

    fireEvent.dragLeave(zone)
    expect(screen.getByText('Dépose ici')).toBeInTheDocument()
  })

  it('activation au clavier (Entrée) déclenche aussi la sélection', () => {
    const ref = createRef<HTMLInputElement>()
    const clickSpy = vi.fn()
    render(<Dropzone ref={ref} accept=".csv" onFileSelected={vi.fn()} ariaLabel="Zone test" />)
    ref.current!.click = clickSpy

    fireEvent.keyDown(screen.getByRole('button', { name: 'Zone test' }), { key: 'Enter' })

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('pendant la lecture (uploading), la zone est désactivée et affiche un message', () => {
    const ref = createRef<HTMLInputElement>()
    const clickSpy = vi.fn()
    render(<Dropzone ref={ref} accept=".csv" onFileSelected={vi.fn()} ariaLabel="Zone test" uploading />)
    ref.current!.click = clickSpy

    expect(screen.getByText('Lecture du fichier...')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zone test' }))

    expect(clickSpy).not.toHaveBeenCalled()
  })
})
