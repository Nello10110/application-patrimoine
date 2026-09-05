import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SelecteurEtablissement, { NOUVEAU_ETABLISSEMENT } from './SelecteurEtablissement'

describe('SelecteurEtablissement', () => {
  it('choisir un établissement connu dans le catalogue préremplit le nom et pose la clé de logo', () => {
    const onNomNouveauChange = vi.fn()
    const onLogoKeyNouveauChange = vi.fn()
    render(
      <SelecteurEtablissement
        etablissements={[]}
        value={NOUVEAU_ETABLISSEMENT}
        nomNouveau=""
        onValueChange={vi.fn()}
        onNomNouveauChange={onNomNouveauChange}
        logoKeyNouveau={null}
        onLogoKeyNouveauChange={onLogoKeyNouveauChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Trade Republic/ }))

    expect(onLogoKeyNouveauChange).toHaveBeenCalledWith('trade_republic')
    expect(onNomNouveauChange).toHaveBeenCalledWith('Trade Republic')
  })

  it('taper dans le champ texte libre réinitialise la clé de logo choisie', () => {
    const onLogoKeyNouveauChange = vi.fn()
    render(
      <SelecteurEtablissement
        etablissements={[]}
        value={NOUVEAU_ETABLISSEMENT}
        nomNouveau="Trade Republic"
        onValueChange={vi.fn()}
        onNomNouveauChange={vi.fn()}
        logoKeyNouveau="trade_republic"
        onLogoKeyNouveauChange={onLogoKeyNouveauChange}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText("Boursorama, Caisse d'Épargne..."), { target: { value: 'Trade Republic modifié' } })

    expect(onLogoKeyNouveauChange).toHaveBeenCalledWith(null)
  })

  it('sans onLogoKeyNouveauChange fourni, le catalogue ne s\'affiche pas (compatibilité ascendante)', () => {
    render(
      <SelecteurEtablissement
        etablissements={[]}
        value={NOUVEAU_ETABLISSEMENT}
        nomNouveau=""
        onValueChange={vi.fn()}
        onNomNouveauChange={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: /Trade Republic/ })).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText("Boursorama, Caisse d'Épargne...")).toBeInTheDocument()
  })
})
