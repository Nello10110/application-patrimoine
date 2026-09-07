# À faire — recoller à la maquette

Feuille de route unique. Chaque ligne est un commit. Ne pas grouper : le geste 1 doit
être vérifiable seul, et le geste 2 doit précéder le geste 5.

Lire `README.md` (le diagnostic et la spec) et `CLAUDE.md` (les règles) avant de
commencer. Ouvrir `Refonte.dc.html` dans un navigateur et y aller voir chaque écran
avant de le toucher — c'est la cible, la prose ne fait que l'expliquer.

---

## Geste 1 — Jetons  ·  1 fichier  ·  ~80 % du rendu

- [ ] Remplacer `frontend/src/styles/tokens-glass.css` par celui de ce dossier
      (ajoute `--field`, `--field-hover`, `--surface-opaque`, `--warn`, `--warn-bg`)
- [ ] Dans `index.css`, repointer les alias hérités : `--surface` → `var(--field)`,
      `--surface-elevee` → `var(--hover)`, et vider le bloc `.dark` devenu inutile
- [ ] **S'arrêter, lancer l'app.** Vérifier dans les deux thèmes : un formulaire
      (Réglages → Foyer) et un survol de ligne (Patrimoine). Les champs doivent être
      des creux bordés d'un filet, les survols des voiles.

Ce seul geste corrige ~861 usages hérités sans toucher un écran.

## Geste 2 — Champs  ·  ~200 occurrences

- [ ] Copier `components/Field.tsx` dans `frontend/src/components/`
- [ ] Remplacer le motif `rounded-control border border-bordure bg-surface px-2 py-1.5`
      par `<Field label="…"><Input …/></Field>`
      (`grep -rn 'bg-surface px-2 py-1.5' frontend/src`)
- [ ] **Ne pas reporter les largeurs fixes** (`w-40`, `w-32`…) : `Input` est `w-full`,
      la largeur appartient au conteneur
- [ ] Ordre : `ReglagesPage`, `LoginPage`, `AjoutHoldingForm`, `AjoutCompteForm`,
      `CompteDetailContent`, `EtablissementEditModal`, `DeclarationPatrimoineModal`,
      `DetenteursSection`, `CategoriesEtReglesSection`, `ChampDecomposition`,
      `AjoutValorisationForm`, `LoanFormFields`, `ImmobilierParametresForm`,
      `PartageCard`, `LoansCard`, `ObjectifsSuivisSection`, `ImportTransactionsSection`,
      `LigneEpargne`, `GestionFoyerCard`, `FoyerCard`, `EtablissementsCard`,
      `PositionsTable`, `DetenteursCard`

## Geste 3 — Quatre finitions

- [ ] `EnTeteMobile` — feuille en `bg-panel-hi backdrop-blur-glass`, voile en
      `backdrop-blur-[6px]` (ou passer par `Sheet`)
- [ ] `Disclosure` — `bg-panel` + `backdrop-blur-glass`, titre via `PanelHeader`
- [ ] `App.tsx` ligne 51 — retirer `bg-surface-elevee` de l'écran de chargement
      (`<body>` porte déjà `--app-bg`)
- [ ] `DashboardPage` — l'encart d'invitation passe en `border-warn/25 bg-warn-bg text-warn`

## Geste 4 — Graphiques  ·  le plus visible sur Analyse

- [ ] Remplacer `utils/chartTheme.ts` par `utils/chartTheme.tsx` de ce dossier
      (noter l'extension : il exporte un composant)
- [ ] Copier `components/ChartFrame.tsx`
- [ ] En extraire l'usage depuis `PortfolioHistoryChart` (la référence) puis le
      consommer, pour que la règle vive à un seul endroit
- [ ] Passe des 9 autres graphiques — retirer `CartesianGrid`, masquer l'axe des
      valeurs, `AXE_CATEGORIES` sur l'axe de catégories, `RAYON_BARRE_HORIZONTALE`,
      `EPAISSEUR_BARRE`, `hauteurBarres()`, `cursor={CURSEUR_BARRE}` :
      `MetriquesAvanceesCard`, `HoldingPriceHistoryChart`, `ValorisationHistoriqueCard`
      (+ `dot={false}`), `ObjectifsSuivisSection`, `SimulateurPage`,
      `AllocationBarChart`, `RevenusSection`, `PlusValueParCompteCard`,
      `HoldingDetailContent`
- [ ] `SimulateurPage` — aligner Investi/Gains sur le mode étagé de la Synthèse
      (total en dégradé d'accent, investi en `--s3` pointillé + `--s4` à 55 %) :
      même concept, même image
- [ ] Supprimer `AllocationPieChart.tsx` (code mort depuis le retrait de la bascule)
- [ ] `PieChartCard` et `CompositionModal` → `RepartitionEmpilee`
- [ ] Retirer de `index.css` `.recharts-pie-label-text` et le filet
      `.recharts-legend-item-text`, sans objet
- [ ] **Ajouter** le bloc Répartition géographique (données déjà dans
      `ExpositionConsolideeCard`) et refaire Plus-value par compte en barres ±

## Geste 5 — Étiquettes et titres  ·  APRÈS le geste 2

- [ ] Les ~40 étiquettes en `text-xs font-medium uppercase tracking-wide` → `Label`
      ou `DataPoint` : `PerformanceCard`, `HoldingDetailContent`, `ImmobilierApercu`,
      `MetriquesAvanceesCard`, `ObjectifsSuivisSection`, `LoansCard`, `EpargneApercu`,
      `MenuCompte`, `PaletteRecherche`
- [ ] Les 4 titres de panneau en petites capitales grises → `PanelHeader` :
      `Disclosure`, `CategoriesEtReglesSection`, `ExpositionConsolideeCard`,
      `MetriquesAvanceesCard` (sous-titre)
- [ ] `PositionsTable` lignes 353 et 720 — badge « saisie manuelle » → `Badge`
- [ ] `PlusValueParCompteCard` — puces en `h-2 w-2 rounded-[3px] bg-pos` / `bg-neg`
- [ ] `AllocationChartCard` — titre `text-[19px]` → `PanelHeader` (15 px)
- [ ] `BarreControles` — le `<select>` détenteur prend la hauteur des pilules voisines

---

## Vérification finale

Dans les deux thèmes, sur Synthèse / Patrimoine / **Analyse** / Comptes / Budget /
Réglages :

- [ ] aucun rectangle opaque à l'intérieur d'un panneau
- [ ] tous les champs à la même hauteur, texte 15 px
- [ ] toutes les étiquettes de donnée en capitales 12 px / 600
- [ ] tous les titres de panneau en 15 px / 600 en encre pleine
- [ ] tous les survols sont des voiles
- [ ] aucune grille de fond, aucun axe de valeurs, aucun camembert
- [ ] aucun libellé de valeur cassé sur deux lignes en bout de barre
- [ ] Investi/Gains identique sur Synthèse et Objectifs
- [ ] rien sous 44 px de cible tactile en mobile

## Hors périmètre

Ne pas revenir sur les décisions de produit du portage : écran Analyse séparé,
Dividendes devenu un onglet, Synthèse allégée, pilule de contexte retirée, mode
« système » du thème. Elles sont validées.

Pas encore maquetté, demander avant d'inventer : écran Salaire, palette ⌘K, onglets
Comptes & sécurité / Partage / Automatisations, assistant de bienvenue, déclaration de
patrimoine PDF, période personnalisée, suppression d'un compte, et Comptes / Budget /
Objectifs en mobile.
