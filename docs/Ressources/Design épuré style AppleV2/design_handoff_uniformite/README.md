# Passe d'uniformité — refonte « liquid glass »

Correctif à appliquer par-dessus le portage déjà réalisé (dépôt à `c393a8ed`).
Ce n'est pas une nouvelle refonte : la DA est validée, la coque et les écrans sont
portés. Il s'agit de fermer l'écart de matière qui subsiste à l'intérieur des panneaux.

## Diagnostic

Le portage est solide : plus aucune classe de l'ancienne palette (`slate-*`,
`indigo-*`, `emerald-*`) dans `pages/` ni `components/`, la coque `App.tsx` est
la bonne, `Card` enveloppe bien `GlassPanel`, et `Controls.tsx` respecte les 44 px.

La non-uniformité vient d'**une seule décision**, documentée dans `index.css` :

> `--surface` / `--surface-elevee` restent OPAQUES. Un panneau de verre tire sa
> matière du fond qu'il filtre ; une carte translucide posée dans une autre carte
> translucide n'a plus rien à filtrer et devient un voile gris.

Le raisonnement est juste — **pour des panneaux imbriqués**. Il est faux pour les
champs, les puces et les survols, qui dans la maquette sont explicitement
translucides. Et comme **environ 861 usages** de `bg-surface` / `bg-surface-elevee` /
`border-bordure` subsistent, l'application affiche aujourd'hui :

1. **des champs de saisie blancs opaques** dans des panneaux de verre — le défaut le
   plus visible, il y en a sur presque chaque écran ;
2. **des survols en gris clair opaque** (`hover:bg-surface-elevee`) qui claquent, là
   où la maquette pose un `--hover` translucide à 4 % ;
3. **des sous-blocs et listes opaques** (`Disclosure`, `CategoriesEtReglesSection`,
   les `<ul>` bordés des modales) posés dans du verre ;
4. **la feuille modale mobile d'`EnTeteMobile`** en `bg-surface` opaque, alors que
   toutes les feuilles des maquettes sont `--panel-hi` + flou.

À quoi s'ajoutent deux défauts indépendants des jetons — que le geste 1 ne corrige
donc pas du tout :

5. **les champs font 30 px de haut** (`px-2 py-1.5 text-sm`) contre 42 px en texte de
   15 px dans la maquette. Dans un formulaire à côté d'un bouton de 44 px, l'écart
   se voit immédiatement — et il n'existe aucune primitive de champ, donc les
   ~200 champs répètent la chaîne de classes à la main et ont commencé à dériver.
6. **les graphiques suivent deux langages de forme différents** — un seul (la courbe
   de la Synthèse) applique le langage de la maquette, les neuf autres ont gardé la
   grille en pointillés et les axes complets de Recharts. C'est le défaut le plus
   visible sur l'écran Analyse. Détaillé au geste 4.
7. **trois styles d'étiquette coexistent** pour un même rôle (capitales semi-gras,
   capitales medium, minuscules medium), et quatre titres de panneau ont gardé les
   petites capitales gris clair que la refonte avait retirées. Détaillé au geste 5.

## Le correctif, en cinq gestes

### Geste 1 — Les jetons (le gros du résultat, en un seul fichier)

Remplacer `frontend/src/styles/tokens-glass.css` par celui de ce dossier. Il ajoute
trois jetons de matière interne :

| Jeton | Clair | Sombre | Rôle |
| --- | --- | --- | --- |
| `--field` | `rgba(22,24,29,0.035)` | `rgba(0,0,0,0.22)` | fond d'un champ de saisie |
| `--field-hover` | `rgba(22,24,29,0.06)` | `rgba(0,0,0,0.3)` | son survol |
| `--surface-opaque` | `#f7f8fb` | `#1e2229` | échappatoire, cas rares uniquement |

**Pourquoi un creux et non un fill plus clair.** Un champ à `--chip`
(`rgba(255,255,255,0.55)`) posé sur un panneau à `--panel` (`0.56`) a la même valeur
que son support : il disparaît. C'est très probablement ce qui a conduit à le laisser
blanc opaque. La bonne réponse n'est ni l'un ni l'autre : une teinte d'**encre** très
faible, qui se lit comme un renfoncement, plus le filet `--hairline` qui en dessine le
bord. C'est le motif de formulaire d'iOS, il tient dans les deux thèmes, et il reste
translucide donc cohérent avec le verre.

Puis, dans `index.css`, repointer le bloc d'alias hérités :

```css
:root {
  --surface: var(--field);                    /* était #ffffff */
  --surface-elevee: var(--hover);             /* était #f4f6fa */
  --bordure: var(--hairline);
  --texte: var(--ink);
  --texte-attenue: var(--ink3);
  --positif: var(--pos);
  --negatif: var(--neg);
  --avertissement: var(--warn);               /* jeton désormais dans tokens-glass */
}

.dark {
  /* Plus rien à redéclarer : les sept alias ci-dessus pointent vers des jetons
     que `[data-theme]` redéfinit déjà. Un seul bloc suffit. */
}
```

**Ce seul geste corrige les points 1 à 4** sur les ~861 usages hérités, sans toucher
un écran. C'est le même levier que l'étape 2 du portage initial — agir sur le jeton
plutôt que sur les appelants.

Deux vérifications au navigateur juste après, dans les deux thèmes :

- un formulaire (Réglages → Foyer, ou l'ajout d'une ligne) : les champs doivent se
  lire comme des creux bordés d'un filet, pas comme des rectangles blancs ;
- un survol de ligne de tableau (Patrimoine) : le survol doit être un voile, pas un
  aplat gris.

### Geste 2 — La primitive de champ (corrige le point 5)

Copier `components/Field.tsx` dans `frontend/src/components/`. Il livre `Field`
(libellé + champ), `Input`, `Select`, `Textarea`, plus `Sheet` / `SheetActions` pour
les feuilles modales.

Puis remplacer, mécaniquement, le motif répété. Le motif source est très régulier —
`grep -rn 'bg-surface px-2 py-1.5' frontend/src` les trouve tous :

```tsx
// avant
<label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
  Nom du foyer
  <input
    value={nom}
    onChange={(e) => setNom(e.target.value)}
    className="w-40 rounded-control border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
  />
</label>

// après
<Field label="Nom du foyer">
  <Input value={nom} onChange={(e) => setNom(e.target.value)} />
</Field>
```

Deux règles pour cette passe :

- **Ne pas reporter les largeurs fixes** (`w-40`, `w-32`, `w-28`…). Elles datent des
  formulaires en ligne de l'ancienne UI. `Input` prend `w-full` : la largeur se règle
  sur le conteneur (`grid-cols-2 gap-3`, ou `max-w-[420px]` sur la colonne), comme
  dans les maquettes. C'est ce qui fait qu'un formulaire paraît rangé.
- **Ordre de passage**, du plus visible au moins : `ReglagesPage`,
  `AjoutHoldingForm`, `AjoutCompteForm`, `CompteDetailContent`,
  `EtablissementEditModal`, `DeclarationPatrimoineModal`, `DetenteursSection`,
  `CategoriesEtReglesSection`, `ChampDecomposition`, `AjoutValorisationForm`, le reste.

### Geste 3 — Les quatre finitions restantes

1. **`EnTeteMobile`** — la feuille passe de `bg-surface` à
   `bg-panel-hi backdrop-blur-glass backdrop-saturate-[1.8]`, et son voile prend
   `backdrop-blur-[6px]` (ou utiliser `Sheet` directement).
2. **`Disclosure`** — `border border-bordure bg-surface` → `bg-panel` +
   `backdrop-blur-glass` ; son titre suit `PanelHeader` (15 px / 600 en encre pleine),
   plus les petites capitales grises.
3. **`App.tsx` ligne 51** — l'écran de chargement garde `bg-surface-elevee`, devenu un
   voile translucide sans rien derrière. Le retirer : `<body>` porte déjà `--app-bg`.
4. **`DashboardPage`** — l'encart d'invitation utilise `border-avertissement/25
   bg-avertissement/10` avec un commentaire notant l'absence de jeton. `--warn` /
   `--warn-bg` existent maintenant : `border-warn/25 bg-warn-bg text-warn`.

## Geste 4 — Les graphiques (le plus visible sur l'écran Analyse)

Diagnostic distinct des trois gestes précédents, et plus lourd. Les COULEURS des
graphiques sont correctement portées (`utils/chartTheme.ts` pointe bien vers
`--s1`…`--s5`, `--hairline`, `--ink4`, et l'infobulle est en verre). Le problème est
la FORME : **deux langages graphiques cohabitent dans l'application**.

`PortfolioHistoryChart` (la courbe de la Synthèse) suit la maquette — aucune grille,
aucun axe dessiné (`hide` sur les deux, ils calculent l'échelle sans l'afficher), un
trait d'accent de 2,5 px, une aire dégradée, cinq repères de date en HTML sous le
tracé. C'est le bon.

**Les neuf autres ont gardé l'allure par défaut de Recharts** : `CartesianGrid
strokeDasharray="3 3"` et deux axes complets avec graduations. La Synthèse respire ;
on passe sur Analyse et chaque graphique redevient une planche technique. C'est
exactement l'impression de « pas unifié » — et aucun de mes trois premiers gestes ne
la corrige, puisqu'il ne s'agit pas de jetons.

### La règle à imposer

Un graphique de cette application raconte une **forme** et un **ordre de grandeur**.
La valeur précise s'obtient à l'infobulle, au survol du point voulu — c'est sa raison
d'être. Donc :

- **jamais de `CartesianGrid`** ;
- un axe n'est dessiné que s'il porte des **libellés irremplaçables** — l'axe des
  catégories d'un diagramme en barres. L'axe des **valeurs** est toujours masqué ;
- une **courbe** n'a aucun axe : cinq repères de date en HTML, sous le tracé ;
- **jamais de point** sur une courbe (`dot={false}`), **jamais d'étiquette** posée sur
  une part.

### Fichiers à livrer

| Fichier | À en faire quoi |
| --- | --- |
| `utils/chartTheme.tsx` | Remplace `utils/chartTheme.ts` (noter le changement d'extension : il exporte désormais un composant JSX, `DegradeAire`). Les couleurs existantes sont conservées à l'identique ; s'ajoutent les décisions de forme — épaisseurs de trait, rayons de barre, échelle de hauteurs, style d'axe de catégories, curseur de survol, style de légende. |
| `components/ChartFrame.tsx` | `ChartFrame` (cadre d'une courbe, extrait de `PortfolioHistoryChart`), `reperesTemporels()` (les cinq repères, même règle partout) et `RepartitionEmpilee` (barre empilée + liste, en HTML — le remplacement des camemberts). |

### Passe fichier par fichier

Neuf fichiers, tous le même geste : retirer la grille, masquer l'axe des valeurs,
passer par `ChartFrame` pour les courbes.

| Fichier | Ce qui cloche | Correctif |
| --- | --- | --- |
| `PortfolioHistoryChart.tsx` | rien — c'est la référence | en extraire `ChartFrame` puis le consommer, pour que la règle vive à un seul endroit |
| `MetriquesAvanceesCard.tsx` | grille + 2 axes complets ; `<Legend />` nue (14 px par défaut) ; un `<select>` en `bg-surface px-2 py-1.5` | `ChartFrame` + `hauteur="panneau"` ; `wrapperStyle={STYLE_LEGENDE}` ; le select passe en `<Select>` (geste 2) |
| `HoldingPriceHistoryChart.tsx` | grille + 2 axes | `ChartFrame`, repères via `reperesTemporels` |
| `ValorisationHistoriqueCard.tsx` | grille + 2 axes ; **`dot={{ r: 3 }}`** — la seule courbe à points de l'application | `ChartFrame` ; `dot={false}` |
| `ObjectifsSuivisSection.tsx` | 2 axes ; « Cible » sans `strokeWidth` (retombe à 1 px) | `ChartFrame` ; `TRAIT_REPERE` + `POINTILLES_REPERE` sur Cible, `TRAIT_PRINCIPAL` sur Réel |
| `SimulateurPage.tsx` | grille + 2 axes ; et surtout **aires en aplat** (`Investi` `fill="var(--s4)"`, `Gains` `fill="var(--s2)"`) là où le mode étagé de la Synthèse rend le même concept en dégradé d'accent + `--s4` à 55 % | `ChartFrame` ; **aligner sur le mode étagé** : total en `url(#…)` dégradé d'accent, investi en `--s3` pointillé + `--s4` à `fillOpacity={0.55}`. Investi/Gains est le MÊME concept sur les deux écrans, il doit avoir la même image |
| `AllocationBarChart.tsx` | grille verticale ; axe X des valeurs dessiné ; `radius={[0, 4, 4, 0]}` (hors échelle) | retirer la grille et l'axe X ; `AXE_CATEGORIES` sur l'axe Y ; `RAYON_BARRE_HORIZONTALE`, `EPAISSEUR_BARRE`, `hauteurBarres()`, `cursor={CURSEUR_BARRE}` |
| `RevenusSection.tsx` | idem | idem |
| `PlusValueParCompteCard.tsx` | idem ; et `var(--color-positif)`/`var(--color-negatif)` au lieu de `--pos`/`--neg` — un troisième chemin d'indirection pour une seule couleur | idem + `COULEUR_POSITIF`/`COULEUR_NEGATIF` |
| `HoldingDetailContent.tsx` (barres de poids) | idem | idem |

### Les camemberts restants

La première décision structurelle de la refonte était : *un seul langage graphique,
plus de camembert doublé d'une liste qui répète les mêmes chiffres.*
`AllocationChartCard` l'a bien appliquée — sa bascule barres/camembert a été retirée,
avec un raisonnement juste. **Trois composants y ont échappé** :

1. **`AllocationPieChart.tsx`** — plus rendu nulle part depuis le retrait de la
   bascule : **code mort, à supprimer**.
2. **`PieChartCard.tsx`** — toujours utilisé (composition d'un fonds). Camembert avec
   étiquettes de pourcentage posées sur les parts et légende Recharts.
   → `RepartitionEmpilee`.
3. **`CompositionModal.tsx`** — camembert lui aussi, et il s'ouvre **depuis l'écran
   Analyse** (clic sur une barre de répartition) : c'est le plus visible des trois.
   → `RepartitionEmpilee`.

Une fois les trois traités, retirer aussi de `index.css` la règle
`.recharts-pie-label-text` et le filet `.recharts-legend-item-text`, devenus sans objet.

### Trois détails qui se voient

- **Hauteurs** : 180 / 260 / 320 / `max(220, n × 44)` selon les fichiers, sans
  échelle. `HAUTEUR` en pose trois marches (`heros` 180, `panneau` 260, `encart` 200)
  et `hauteurBarres()` traite le cas des barres de catégories.
- **Légendes** : trois traitements coexistent — `fontSize: 11` sur les camemberts,
  `<Legend />` nue à 14 px dans `MetriquesAvanceesCard`, et une légende HTML à 11 px
  faite main dans `ControlesCourbe`. Garder la HTML comme référence, et
  `STYLE_LEGENDE` quand la légende Recharts est justifiée (deux séries nommées).
- **Curseur de survol** : Recharts pose un gris plein derrière la barre survolée.
  `CURSEUR_BARRE` le remplace par le voile `--hover`, celui des lignes de tableau.

### Deux blocs de la maquette absents du code

L'écran Analyse de la maquette porte deux blocs que le portage n'a pas :

1. **Répartition géographique** — barre empilée, puis liste en trois colonnes :
   libellé + puce, montant en `--ink3`, et le **pourcentage en 15 px / 600** comme
   valeur dominante (c'est le chiffre que l'on vient chercher ici, pas le montant).
   L'intitulé porte « exposition consolidée, ETF décomposés » : un MSCI World doit
   compter pour ses 64 % américains, pas comme une ligne « Monde » — c'est ce qui
   rend le chiffre juste. `ExpositionConsolideeCard` calcule déjà cette donnée ;
   il lui manque cette forme.
2. **Plus-value par compte** — barres positives et négatives de part et d'autre d'un
   filet `--hairline` central, valeur dans une colonne dédiée à droite, teintée
   `--pos` / `--neg`. Remplace le tableau actuel de `PlusValueParCompteCard`.

Les deux sont du HTML (barre empilée + grille CSS), sans Recharts.

### Le piège de mise en page des barres horizontales

Rencontré et corrigé dans la maquette, il se reproduira à l'identique en React.

Une barre en pourcentage et son libellé de valeur, **frères dans la même ligne flex**,
donnent un pourcentage résolu sur TOUTE la ligne : à 100 %, la barre réclame la largeur
entière et le libellé tombe à sa largeur minimale — « 79 728 € » se casse en
« 79 728 » puis « € ».

La forme correcte est une **colonne de valeur dédiée dans la grille**, la barre seule
dans sa piste en `minmax(0,1fr)` :

```
grid-template-columns: 150px minmax(0,1fr) 90px;   /* secteurs, géographie */
grid-template-columns: 110px minmax(0,1fr) minmax(0,1fr) 90px;  /* plus-value ± */
```

plus `white-space: nowrap` sur la valeur. Côté Recharts, l'équivalent est de ne pas
poser de `<LabelList>` en bout de barre : garder la valeur hors du graphique, dans la
grille du panneau.

### Vérification de ce geste

Ouvrir Analyse, onglet Portefeuille, dans les deux thèmes, et comparer avec la
Synthèse : **aucun pointillé de grille**, aucun axe de valeurs, aucun camembert, et
les barres ont l'extrémité arrondie de la barre de répartition. Puis onglet Revenus,
puis Objectifs, puis la fiche d'une position — même langage partout.

## Geste 5 — Typographie des étiquettes et titres de panneau

Deuxième cause majeure de l'impression de « pas unifié », et elle non plus n'est pas
un problème de jetons : **trois styles d'étiquette coexistent pour un seul rôle.**

| Style | Occurrences | Où |
| --- | --- | --- |
| `text-xs font-semibold uppercase tracking-wide text-ink3` | ~15 | écrans portés (`PatrimoineNetCard`, `BarreControles`, `EnTeteMobile`) — **le bon** |
| `text-xs font-medium uppercase tracking-wide text-texte-attenue` | ~40 | `PerformanceCard`, `HoldingDetailContent`, `ImmobilierApercu`, `MetriquesAvanceesCard`, `ObjectifsSuivisSection`, `LoansCard`, `EpargneApercu` |
| `text-xs font-medium text-texte-attenue` | ~150 | tous les libellés de champ |

Les trois pointent vers la même couleur — c'est la **graisse** (500 vs 600) et la
**casse** qui diffèrent. Deux panneaux côte à côte, l'un en capitales semi-gras,
l'autre en minuscules medium : ça se voit tout de suite, et aucun changement de jeton
ne peut le rattraper.

Même chose pour les **titres de panneau**. La refonte a remplacé les petites capitales
gris clair par du 15 px / 600 en encre pleine, avec un motif explicite
(`PanelHeader`) — « plus les petites capitales gris clair de l'ancienne `Card title`,
qui rendaient chaque section aussi importante, donc aucune ». Quatre composants ont
gardé l'ancien style : `Disclosure`, `CategoriesEtReglesSection`,
`ExpositionConsolideeCard`, `MetriquesAvanceesCard` (son sous-titre « Comparaison à un
indice »), tous en `text-sm font-semibold uppercase tracking-wide text-texte-attenue`.

### Correctif

`components/Field.tsx` livre trois primitives de plus :

- **`Label`** — le style unique d'étiquette. `Field` le consomme déjà.
- **`DataPoint`** — étiquette + valeur empilées (le motif de `StatTile` et des grilles
  de détail) : étiquette 12 px, valeur 22 px / 600, note optionnelle 12 px.
- **`Badge`** — pastille d'annotation en cinq tons. `PositionsTable` compose encore la
  sienne à la main en `bg-surface-elevee` (lignes 353 et 720), ce qui donne une
  pastille opaque dans un tableau de verre.

Passe à faire, dans cet ordre :

1. les ~40 étiquettes en capitales medium → `Label` ou `DataPoint` selon qu'elles
   sont seules ou suivies d'une valeur ;
2. les quatre titres de panneau en petites capitales → `PanelHeader` ;
3. les deux badges de `PositionsTable` → `Badge ton="neutre"` ;
4. les ~150 étiquettes de champ : elles disparaissent d'elles-mêmes avec le geste 2,
   puisque `Field` porte `Label`. **Ne pas les traiter deux fois** — faire le geste 2
   d'abord.

### Détails de finition repérés au passage

- **`PlusValueParCompteCard`** — puces de légende en `bg-positif` / `bg-negatif` avec
  `rounded-sm` (2 px, hors échelle). Les puces des maquettes sont `h-2 w-2
  rounded-[3px]`, et les couleurs passent par `bg-pos` / `bg-neg`.
- **`LoginPage`** — champs en `px-3 py-2.5 text-sm` (36 px), contre 42 px en 15 px
  ailleurs. C'est le premier écran que l'on voit : le passer en `Field` + `Input`.
- **`AllocationChartCard`** — titre en `text-[19px]`, seule occurrence de cette
  taille. L'échelle de la refonte a 15 (titre de panneau) et 28 (titre d'écran) :
  choisir 15 px via `PanelHeader`.
- **`BarreControles`** — le `<select>` de détenteur est en `px-2 py-1`, plus petit
  que les pilules voisines de la même barre. Lui donner la hauteur des pilules.

## Ce qu'il ne faut pas faire

- **Ne pas réécrire les 861 usages à la main.** Le geste 1 les traite tous. Seuls les
  ~200 champs du geste 2 méritent une passe, parce que leur gabarit est faux, pas
  seulement leur couleur.
- **Ne pas supprimer la famille de jetons héritée.** Les faire pointer vers les
  jetons de verre suffit et coûte un fichier ; les remplacer un à un coûte une
  semaine de diff mécanique pour le même rendu.
- **Ne pas revenir sur les décisions de produit prises pendant le portage** (écran
  Analyse séparé, Dividendes devenu un onglet, pilule de contexte retirée, Synthèse
  allégée, mode « système » du thème). Elles sont assumées et bien documentées dans
  le code — la présente passe ne touche que la matière.
- **Ne pas ajouter de `backdrop-filter` à un élément déjà posé dans un panneau
  flouté** : le flou ne se cumule pas et coûte une couche de composition. Le verre
  est pour les panneaux ; à l'intérieur, `--field`, `--chip`, `--track` et `--hover`
  suffisent.

## Vérification finale

Dans les deux thèmes, sur Synthèse / Patrimoine / Comptes / Budget / Réglages :

- aucun rectangle blanc (clair) ni gris-bleu (sombre) opaque à l'intérieur d'un panneau ;
- tous les champs de saisie ont la même hauteur et le même texte de 15 px ;
- toutes les étiquettes de donnée sont en capitales 12 px / 600 ;
- tous les titres de panneau sont en 15 px / 600 en encre pleine ;
- tous les survols sont des voiles ;
- toutes les feuilles modales ont un voile flouté et s'ancrent en haut ;
- rien sous 44 px de cible tactile en mobile ;
- aucun pointillé de grille, aucun axe de valeurs, aucun camembert dans un graphique ;
- Investi/Gains a la même image sur la Synthèse et sur Objectifs ;
- Analyse porte les blocs Répartition géographique et Plus-value par compte, dans la
  forme de la maquette ;
- aucun libellé de valeur cassé sur deux lignes en bout de barre.

## Maquettes de référence

`Refonte.dc.html` (desktop) et `Refonte mobile.dc.html`, dans ce dossier.

**La maquette desktop porte désormais un écran Analyse** — il n'y était pas, puisqu'il a
été créé pendant le portage. Le langage graphique des gestes 4 et 5 y est donc visible
plutôt que seulement décrit : barres horizontales à extrémité en pilule sans grille ni
axe de valeurs, barre empilée + liste à la place du camembert, courbe de comparaison à
deux épaisseurs de trait avec légende à 11 px, plus-value par compte en barres
positives et négatives de part et d'autre d'un filet. **Ouvrir cet écran avant de
commencer le geste 4** — c'est la cible.
