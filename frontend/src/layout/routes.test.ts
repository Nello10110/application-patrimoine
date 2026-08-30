import { describe, expect, it } from 'vitest'
import { PAGE_COMPONENTS } from './pageComponents'
import { ROUTES } from './routes'

// Audit menus du 30/08/2026 : ces tests verrouillent la promesse de `ROUTES`
// (« source unique de vérité pour la navigation ») au lieu de la laisser reposer
// sur la seule discipline du développeur — c'est un oubli à cet endroit précis
// (une entrée « Analyse » orpheline dans 3 fichiers de menu après le retrait de sa
// route, une icône absente pour une nouvelle route) qui avait motivé la demande de
// revue. Toute violation ci-dessous doit faire échouer la suite, pas seulement se
// remarquer à l'œil dans l'application.
describe('ROUTES — cohérence structurelle', () => {
  it('chaque chemin est unique', () => {
    const chemins = ROUTES.map((r) => r.path)
    expect(new Set(chemins).size).toBe(chemins.length)
  })

  it('une route de menu (navLabel) a toujours un rang et une icône, et réciproquement', () => {
    for (const r of ROUTES) {
      if (r.navLabel) {
        expect(r.rang, `${r.path} a un navLabel mais pas de rang`).toBeDefined()
        expect(r.icone, `${r.path} a un navLabel mais pas d'icône`).toBeDefined()
      } else {
        expect(r.rang, `${r.path} a un rang mais pas de navLabel`).toBeUndefined()
        expect(r.icone, `${r.path} a une icône mais pas de navLabel`).toBeUndefined()
      }
    }
  })

  it('chaque route a un titre non vide (document.title, fil d\'Ariane)', () => {
    for (const r of ROUTES) {
      expect(r.titre.trim().length, `${r.path} a un titre vide`).toBeGreaterThan(0)
    }
  })

  // `App.tsx` génère son `<Routes>` en itérant `ROUTES` puis en résolvant
  // `PAGE_COMPONENTS[chemin]` (voir le commentaire au-dessus de cette constante) :
  // les deux listes doivent donc contenir exactement les mêmes chemins, dans les
  // deux sens. Un chemin de `ROUTES` absent de `PAGE_COMPONENTS` ne serait accessible
  // par aucune URL malgré son entrée de menu ; un chemin de `PAGE_COMPONENTS` absent
  // de `ROUTES` ne serait jamais monté.
  it('ROUTES et PAGE_COMPONENTS (App.tsx) couvrent exactement les mêmes chemins', () => {
    const cheminsRoutes = [...ROUTES.map((r) => r.path)].sort()
    const cheminsComposants = Object.keys(PAGE_COMPONENTS).sort()
    expect(cheminsComposants).toEqual(cheminsRoutes)
  })
})
