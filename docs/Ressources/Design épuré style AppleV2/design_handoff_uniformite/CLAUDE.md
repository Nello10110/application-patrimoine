# Instructions — passe d'uniformité « liquid glass »

Correctif par-dessus le portage déjà en place.

**Ordre de lecture :**
1. `A-FAIRE.md` — la feuille de route en cases à cocher. C'est ton plan de travail.
2. `README.md` — le diagnostic et la spec écran par écran. À lire en entier.
3. Ouvrir `Refonte.dc.html` dans un navigateur et parcourir les écrans. **C'est la
   cible** ; la prose ne fait que l'expliquer. Ne pas coder un écran sans l'avoir vu.

## Le résumé en cinq lignes

Trois causes, indépendantes :
1. `--surface` / `--surface-elevee` gardés opaques, avec ~861 usages hérités dessus :
   champs et survols blancs opaques dans des panneaux de verre. **Se corrige par les
   jetons, en un fichier.**
2. Les graphiques suivent **deux langages de forme** : un seul applique celui de la
   maquette, les neuf autres ont gardé grille en pointillés et axes complets de
   Recharts. C'est le plus visible sur l'écran Analyse.
3. **Trois styles d'étiquette** et deux styles de titre de panneau coexistent.

Les points 2 et 3 ne sont pas des problèmes de couleur : aucun changement de jeton ne
les corrige. Ils demandent des primitives partagées, fournies dans ce dossier.

## Ordre imposé

1. **Geste 1 — jetons.** Remplacer `frontend/src/styles/tokens-glass.css` par celui de
   ce dossier, puis repointer le bloc d'alias hérités de `index.css` comme indiqué.
   S'arrêter là, lancer l'app, vérifier un formulaire et un survol dans les deux
   thèmes. C'est 80 % du résultat visuel.
2. **Geste 2 — primitive de champ.** Copier `components/Field.tsx`, puis remplacer le
   motif de champ répété, écran par écran, dans l'ordre donné par le README.
3. **Geste 3 — quatre finitions** nommées et localisées dans le README.
4. **Geste 4 — graphiques.** Remplacer `utils/chartTheme.ts` par le `.tsx` de ce
   dossier, copier `components/ChartFrame.tsx`, puis la passe des dix fichiers de
   graphiques (tableau dans le README). Supprimer `AllocationPieChart.tsx` (code
   mort) et remplacer les deux camemberts restants par `RepartitionEmpilee`.
5. **Geste 5 — étiquettes et titres.** `Label`, `DataPoint`, `Badge` (dans
   `Field.tsx`), puis la passe décrite dans le README. **Après** le geste 2 : les
   ~150 étiquettes de champ disparaissent avec lui.

Un commit par geste, pas un seul gros : chacun doit être vérifiable isolément.

## Règles non négociables

- **Aucune couleur en dur.** Tout passe par les jetons. Trois jetons nouveaux sont
  disponibles : `--field`, `--field-hover`, `--surface-opaque`, plus `--warn` /
  `--warn-bg`.
- **Ne pas réécrire les 861 usages hérités à la main.** Le geste 1 les traite en un
  point. Seuls les champs du geste 2 sont repris, parce que leur gabarit est faux.
- **Ne pas reporter les largeurs fixes des champs** (`w-40`, `w-32`…) : `Input` est
  `w-full`, la largeur appartient au conteneur.
- **Ne pas revenir sur les décisions de produit du portage** (écran Analyse séparé,
  Dividendes en onglet, Synthèse allégée, pilule de contexte retirée, mode « système »
  du thème). Elles sont validées. Cette passe ne touche que la matière visuelle.
- **44 px minimum** pour toute cible tactile en mobile, toujours.
- **Pas de `backdrop-filter` imbriqué** dans un panneau déjà flouté.
- **Aucun `CartesianGrid`, aucun axe de valeurs dessiné, aucun camembert.** Un
  graphique dit une forme et un ordre de grandeur ; la valeur exacte est à l'infobulle.
- **Un seul style d'étiquette** (`Label`) et un seul style de titre de panneau
  (`PanelHeader`). Ne pas en recomposer à la main.

## Fichiers

| Fichier | À en faire quoi |
| --- | --- |
| `A-FAIRE.md` | La feuille de route, un commit par ligne. Ton plan de travail. |
| `README.md` | Le diagnostic et la spec. À lire en entier. |
| `Refonte.dc.html` | Maquette desktop, 10 écrans dont Analyse. **La vérité visuelle** — à ouvrir dans un navigateur. |
| `Refonte mobile.dc.html` | Maquette mobile 390×844. |
| `support.js` | Runtime des maquettes. À ignorer. |
| `tokens-glass.css` | Remplace `frontend/src/styles/tokens-glass.css`. |
| `components/Field.tsx` | Copier dans `frontend/src/components/`. Livre `Field`, `Input`, `Select`, `Textarea`, `Sheet`, `SheetActions`, `Label`, `DataPoint`, `Badge`. |
| `utils/chartTheme.tsx` | Remplace `frontend/src/utils/chartTheme.ts` (extension `.tsx` : exporte un composant). |
| `components/ChartFrame.tsx` | Copier dans `frontend/src/components/`. |

Les maquettes de référence (`Refonte.dc.html`, `Refonte mobile.dc.html`) sont dans le
paquet précédent, `design_handoff_refonte_liquid_glass/`.
