# Handoff — Refonte « liquid glass » de l'application Patrimoine

## Vue d'ensemble

Refonte visuelle et hiérarchique complète de l'application (React + TypeScript + Tailwind + Vite,
dépôt `Nello10110/application-patrimoine`, branche `main`). Le design existant a été jugé
« utilisable mais template de base, sans âme », avec des incohérences dans les graphiques,
la hiérarchie des menus et les données affichées.

La refonte livre un système unique, deux modes (clair et sombre), inspiré du langage
Liquid Glass d'Apple : surfaces de verre translucides sur un fond à halos colorés,
un seul accent, une seule famille de couleurs pour tous les graphiques.

**Trois décisions structurelles portent la refonte, au-delà du style :**

1. **Un seul chiffre héros par écran.** L'ancienne Synthèse affichait « Patrimoine net »
   trois fois (titre de carte, libellé, valeur) et empilait 4 StatTile de même poids.
   Désormais : un chiffre à 54px, puis trois poches (financier / immobilier net / épargne),
   puis la répartition. Rien d'autre ne concurrence le héros.
2. **La période est pilotée sur le graphique, pas dans la barre du haut.** L'ancienne
   `BarreControles` portait un sélecteur de période global qui contredisait les périodes
   locales de chaque carte. La période vit maintenant à côté de la courbe qu'elle change.
3. **Un seul langage graphique.** Le camembert 7 couleurs + la liste qui répétait les mêmes
   chiffres sont remplacés par une barre empilée unique et une famille de bleus dégradée
   (`--s1` … `--s5`), du plus au moins important. Plus jamais deux représentations du même jeu de données.

## À propos des fichiers de design

Les fichiers `.dc.html` de ce paquet sont des **références de design créées en HTML** :
des prototypes qui montrent l'intention visuelle et le comportement attendu.
Ce n'est **pas du code de production à copier tel quel**.

Le travail consiste à **recréer ces designs dans l'environnement existant du dépôt** —
React + TypeScript + Tailwind, avec ses patterns actuels (`components/`, `pages/`, `layout/routes.ts`) —
en s'appuyant sur les fichiers prêts à l'emploi fournis ici (`tokens-glass.css`,
`tailwind.config.additions.js`, `components/*`), qui sont eux du vrai code de production.

## Fidélité

**Haute fidélité (hifi).** Couleurs, typographie, espacements, rayons, ombres et interactions
sont définitifs. Le rendu doit être reproduit au pixel. Toutes les valeurs sont dans
`tokens-glass.css` — ne jamais coder une couleur en dur dans un composant.

---

## Plan de portage, dans cet ordre

Chaque étape est livrable seule : à la fin de chacune, l'app tourne et est cohérente.
Ne pas commencer une étape avant que la précédente soit fusionnée.

### Étape 1 — Les jetons et le thème (environ une demi-journée, aucun écran touché)

1. Copier `tokens-glass.css` dans `frontend/src/styles/tokens-glass.css`.
2. En haut de `frontend/src/index.css`, avant les directives Tailwind :
   `@import './styles/tokens-glass.css';`
3. Fusionner `tailwind.config.additions.js` dans le `theme.extend` de `tailwind.config.js`
   et ajouter la ligne `darkMode`.
4. Copier `components/useTheme.ts` dans `frontend/src/hooks/useTheme.ts`.
5. Dans `frontend/index.html`, à l'intérieur de `<head>`, poser le thème avant le premier
   rendu pour éviter le flash blanc :

   ```html
   <script>
     (function () {
       var t = localStorage.getItem('patrimoine.theme');
       if (t !== 'clair' && t !== 'sombre') {
         t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'sombre' : 'clair';
       }
       document.documentElement.dataset.theme = t;
     })();
   </script>
   ```

6. Appeler `useTheme()` une fois dans `App.tsx`.

À ce stade, rien n'a changé visuellement : les anciennes classes `bg-white`, `text-slate-500`
sont toujours là. C'est voulu — les jetons sont en place, prêts à être consommés.

### Étape 2 — Les primitives (environ une journée)

Copier `components/GlassPanel.tsx` et `components/Controls.tsx` dans `frontend/src/components/`.

Puis réécrire l'actuel `components/Card.tsx` comme une simple enveloppe de `GlassPanel` +
`PanelHeader`, en gardant sa signature de props actuelle. **Tous les écrans passent au verre
d'un coup, sans toucher une seule page.** C'est le moment où la refonte devient visible.

Ensuite, remplacer les rangées de boutons `bg-slate-900 text-white` par `<SegmentedControl>` :
elles existent dans `BarreControles.tsx` (Vue net/brut/financier), `PortefeuillePage.tsx`
(filtres de type d'actif), `BudgetPage.tsx` et `RapportPage.tsx` (mensuel/annuel/personnalisé),
`HoldingDetailPage.tsx` (onglets), `ReglagesPage.tsx` (onglets).

`StatTile.tsx` : conserver le composant, mais supprimer ses petites capitales gris clair en 12px
au profit de `text-xs font-semibold text-ink3` et passer la valeur à `text-2xl font-semibold text-ink`.

### Étape 3 — La barre de contrôles et la navigation (environ une journée)

- `BarreControles.tsx` : retirer le sélecteur de période (il descend dans chaque graphique,
  étape 4) et le remplacer par la pilule de contexte de l'écran courant. Il reste : le
  segmenté Vue, le sélecteur de détenteur, le contexte, puis à droite « montants » et « thème ».
  La barre doit tenir sur **une seule ligne** jusqu'à 1000px — d'où les libellés courts
  (« Visibles » / « Masqués », « Clair » / « Sombre »).
- `Sidebar.tsx` : rayon 11px sur les items, item actif en dégradé d'accent avec halo,
  items inactifs en `text-ink2` sans fond. Réglages et le compte utilisateur descendent
  dans un pied séparé par un filet `border-hairline`. Le bouton « Replier » disparaît :
  la sidebar est à largeur fixe (222px) sur desktop, et devient un `BottomNav` sur mobile.
- `FilDAriane.tsx` : supprimer. Le fil d'Ariane ne servait qu'à l'écran Détail, où un
  simple lien retour « ← Patrimoine » en 13px accent le remplace.

### Étape 4 — Les écrans, un par un

Ordre recommandé, du plus rentable au moins : Synthèse, Patrimoine, Détail, Comptes,
Budget, Rapport, Objectifs, Réglages, Connexion. Chaque écran est spécifié ci-dessous.

### Étape 5 — Mobile (environ deux jours)

Maquetté dans `Refonte mobile.dc.html` (Synthèse, Patrimoine, Détail). Voir la section
« Mobile » plus bas. Comptes, Budget et Objectifs se déclinent sur les mêmes gabarits.

---

## Écrans

Les mesures ci-dessous sont celles du prototype. Les noms de jetons renvoient à `tokens-glass.css`.

### Coque commune (toutes les pages sauf Connexion)

- Racine : `height: 100vh; overflow: hidden; padding: 14px; display: flex; gap: 14px`.
  Le fond (`--app-bg`) est sur `body`, `background-attachment: fixed`.
- Sidebar : 222px de large, `flex-shrink: 0`, `GlassPanel` en `rounded-panel`, `padding: 16px 12px`.
- Colonne de contenu : `flex: 1; display: flex; flex-direction: column; gap: 14px`.
  La barre de contrôles est fixe en haut de cette colonne ; **seule la zone sous elle défile**
  (`flex: 1; min-height: 0; overflow-y: auto`) — plus de `position: sticky`.
- Espacement vertical entre panneaux : `gap: 14px`, partout, sans exception.

### Synthèse

Bloc héros (`GlassPanel niveau="hero"`, `padding: 24px 26px 8px`) :

- Sur-titre « Patrimoine net · Foyer » — 13px / 500 / `--ink3`.
- Chiffre — **54px / 600 / letter-spacing −0.035em / `--ink`**.
- Sous le chiffre : `DeltaBadge` « ↑ 6,4 % » + « +29 280 € sur 12 mois » en 13px `--ink3`.
- À droite, aligné en haut : `SegmentedControl` 1M / 3M / 1A / 5A / Tout (taille `sm`).
- Courbe : SVG `viewBox="0 0 1000 190"`, `preserveAspectRatio="none"`, hauteur 180px.
  Trait `--accent` 2,5px avec `vector-effect="non-scaling-stroke"` (indispensable :
  sans lui, le `preserveAspectRatio="none"` déforme l'épaisseur du trait).
  Aire sous la courbe : dégradé vertical de `--accent` à 34 % d'opacité vers 0.
  **La courbe et les libellés d'axe changent avec la période choisie** — cinq jeux de
  données distincts, pas un seul redimensionné.
- Cinq libellés d'axe en 11px `--ink4`, `justify-content: space-between`.

Trois poches (`grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px`) :
chacune est un `GlassPanel` cliquable (`rounded-card`, `padding: 16px 18px`) qui navigue —
Financier → Patrimoine, Immobilier net et Épargne → Comptes. Libellé 12px / 600 / `--ink3`
en capitales, valeur 26px / 600, note 13px.

Répartition (`GlassPanel`, `padding: 18px 20px`) : barre empilée de 12px de haut,
`border-radius: 999px`, `overflow: hidden`, `gap: 2px` entre segments, largeurs 43,6 / 30,6 /
12,5 / 7,2 / 6,1 %, couleurs `--s1` … `--s5`. Sous elle, une grille
`repeat(auto-fit, minmax(150px, 1fr))` : puce de 8px en `border-radius: 3px`, libellé 12px
`--ink3`, montant 16px / 600, pourcentage 12px `--ink4`.

Deux panneaux de pied côte à côte (`minmax(260px, 1fr)`) : « Qualité du portefeuille »
(trois barres de progression de 6px sur fond `--track`) et « À venir » (trois lignes
séparées par `border-hairline`).

### Patrimoine

- Titre 28px / 600 / −0.025em. Sous-titre **calculé** : nombre de lignes retenues + filtre
  actif + horodatage des cours. Il ne doit jamais dire « 7 lignes » quand un filtre en montre 2.
- Actions à droite : `SecondaryButton` « Rafraîchir » + `PrimaryButton` « Ajouter une ligne ».
- `SegmentedControl` de filtres : Tous / Actions / ETF / Crypto. **Pas de filtre
  « Immo & épargne »** — ces lignes vivent dans l'écran Comptes, et la puce renvoyait un tableau vide.
- Tableau : ce n'est plus un `<table>` mais une grille CSS
  `1.6fr 0.7fr 0.9fr 1fr 0.8fr 0.8fr`, `gap: 12px`, `padding: 13px 20px` par ligne,
  chaque ligne étant un `<button>` pleine largeur qui navigue vers le Détail.
  En-tête 11px / 600 / letter-spacing 0.06em / `--ink3`.
- Chaque ligne porte un jeton carré de 32px (`rounded-[9px]`, fond `--accent-soft`,
  texte `--accent` 11px / 700) avec le sigle du ticker, puis nom (14px / 600) et
  métadonnée (12px `--ink4`) empilés.
- **Pied de tableau : total, nombre de lignes et performance globale sont recalculés
  depuis le tableau filtré**, jamais depuis le portefeuille entier. La performance globale
  est `(somme des valeurs − somme des coûts) / somme des coûts`, pas une moyenne des
  pourcentages individuels.

### Détail d'une position

Bloc héros : nom en 24px / 600 + badge de type (`--accent-soft`) + badge de compte (`--track`),
valeur en 40px / 600, `DeltaBadge` + plus-value latente en euros. Segmenté 1M / 1A / Tout à droite.
Courbe identique à la Synthèse. Lien retour « ← Patrimoine » en 13px `--accent` au-dessus du bloc.

Quatre `GlassPanel` (`minmax(170px, 1fr)`) : quantité, prix de revient, cours actuel, annualisé.
Puis deux panneaux : « Émetteur » (texte 14px / 1.55 + deux chiffres de frais sous un filet)
et « Exposition géographique » (barre empilée + quatre lignes).

### Comptes

Titre + total du foyer en 26px / 600 aligné à droite. Un `GlassPanel` par établissement :
en-tête avec jeton carré de 28px (fond `--track`, initiales), nom 15px / 600, total à droite ;
puis une `PanelRow` par compte — nom 14px / 500, détail 12px `--ink4`, solde 14px / 600,
chevron `--ink4`. Les lignes non rattachées à un établissement passent sous
« Sans établissement », pas dans un panneau à part.

### Budget

Bloc héros : « Disponible ce mois » + chiffre 48px, puis une barre empilée de 12px qui
décompose le mois (logement / épargne / courses / loisirs / non dépensé — ce dernier en
`--track`), avec sa légende en 13px sous elle. C'est le remplacement de la liste de barres
de progression par catégorie de l'ancien écran.

Quatre `GlassPanel` : entrées, sorties, taux d'épargne, reste à vivre.
Puis panneau « Mouvements » : `PanelRow` avec jeton d'icône de 32px, libellé + date empilés,
catégorie en pilule `--track`, montant à droite (`min-width: 110px; text-align: right`).
L'ancien `<select>` de catégorie par ligne disparaît de la vue de lecture : la
recatégorisation se fait au clic sur la pilule.

### Rapport

Bloc héros « D'où vient l'évolution ? » : quatre colonnes en escalier de 150px de haut —
début de période (`--s3`), investi par toi (`--s2`), généré seul (`--pos`), fin de période (`--s1`).
Les hauteurs sont proportionnelles aux montants ; chaque colonne porte son montant au-dessus
et son libellé en dessous. Note explicative en 13px `--ink3`, `max-width: 70ch`.
Trois `GlassPanel` (évolution, dividendes, frais) puis « Plus gros mouvements ».

### Objectifs

Bloc héros : « Indépendance financière atteinte en » + année en 48px avec « · dans 22 ans »
en 22px / 500 `--ink3` sur la même ligne. À droite, deux `input[type=range]`
(`accent-color: var(--accent)`) : versement mensuel et rendement visé — les hypothèses se
règlent au curseur, plus dans un formulaire de quatre champs numériques.
Courbe de projection avec une seconde courbe en pointillés `--ink4` (le versé seul, sans
rendement) et une ligne d'objectif horizontale en pointillés.
Trois `GlassPanel` (valeur finale, total versé, dont intérêts), puis panneau « Jalons » :
libellé sur 180px, barre de progression en `flex: 1`, valeur à droite sur 130px.

### Réglages

Colonne unique en `max-width: 760px`. Trois `GlassPanel` : « Apparence » (thème en segmenté,
masquer les montants en interrupteur 46×28px), « Détenteurs » (avatar 30px en dégradé,
nom, rôle, quote-part), « Exporter » (deux `SecondaryButton` CSV + un `PrimaryButton` PDF).
Les cinq onglets de l'ancien écran deviennent des panneaux empilés : il y a peu de réglages,
les onglets cachaient plus qu'ils n'organisaient.

### Connexion

Un seul `GlassPanel niveau="hero"` de 400px de large, centré, `rounded-[26px]`,
`padding: 30px 28px`. Logo carré de 44px en dégradé d'accent, titre « Bon retour » en 26px / 600,
sous-titre 14px `--ink3`, deux champs (`rounded-[12px]`, fond `--chip`, bordure `--hairline`,
libellé 12px / 600 en capitales `--ink3`), bouton primaire pleine largeur, bouton SSO secondaire.
Les onglets « Se connecter / Créer un compte » disparaissent : la création de compte est un lien.

---

### Mode étagé (graphique de la Synthèse)

Reprise de l'option « Mode étagé (investi + gains) » de l'actuel `PortfolioHistoryChart`,
sous forme d'une pilule à droite, au-dessus du graphique, à côté du sélecteur de période
(état actif : fond `--accent-soft`, texte `--accent`, `aria-pressed`).

Actif, le graphique superpose **deux aplats depuis la même ligne de base** :

1. l'aire du total, dégradé `--accent` (déjà présente),
2. par-dessus, l'aire de l'investi en `--s4` à `fill-opacity: 0.55`, plus sa courbe en
   pointillés `--s3` 1,5px (`stroke-dasharray="5 4"`).

Les gains sont donc la tranche visible entre les deux courbes. Une légende
« Investi / Gains » apparaît à côté de la pilule.

**Contrainte de données, à ne pas rater au portage** : la courbe de l'investi ne doit
jamais croiser celle du total, et sa part doit rester cohérente avec la performance
annoncée par le chiffre héros — dans le prototype l'investi représente 87–90 % du total
sur 12 mois, pour un +6,4 %. Une première version du prototype affichait 34 % d'investi
(donc 66 % de gains) tout en annonçant +6,4 % juste au-dessus : c'est précisément le type
d'incohérence que cette refonte doit supprimer. Calculer l'investi depuis les
transactions réelles, jamais depuis une courbe décorative.

### Feuille d'ajout d'une ligne (écran Patrimoine)

L'actuel formulaire en carte permanente en haut de `PortefeuillePage` devient une
**feuille modale** ouverte par le bouton primaire « Ajouter une ligne ».

- Voile : `rgba(10,11,14,0.28)` + `backdrop-filter: blur(6px)`, ancré en `flex-start`
  avec `overflow-y: auto` (indispensable : la feuille dépasse le pli sur un portable).
- Feuille : `max-width: 520px`, `rounded-[24px]`, `padding: 24px 26px`, `--panel-hi`,
  `--shadow-lg`. Titre 22px / 600, sous-titre 13px `--ink3`, bouton de fermeture rond
  de 30px en `--track`.
- Champs en grille 2 colonnes, le ticker sur toute la largeur : ticker (forcé en
  majuscules à la saisie), quantité, prix de revient, type d'actif, compte.
  **Le champ « prix actuel » disparaît** — le cours vient du ticker.
- Sous les champs, un encart `--accent-soft` affiche la **valeur d'acquisition calculée
  en direct** (quantité × prix de revient) dès que les deux nombres sont valides.
  Accepter la virgule décimale à la saisie.
- Le bouton « Ajouter la ligne » est désactivé (`--track`, `--ink4`, `cursor: not-allowed`)
  tant que ticker, quantité et prix ne sont pas tous trois valides et strictement positifs.

### Feuille d'édition des comptes et établissements (écran Comptes)

L'écran Comptes de l'app actuelle permet de supprimer mais pas de créer ni renommer
proprement. La refonte ajoute :

- **En-tête** : un bouton secondaire « Établissement » et un bouton primaire
  « Ajouter un compte », à droite du total du foyer.
- **Crayon sur chaque en-tête d'établissement** (icône 15px, bouton rond de 28px,
  `--ink4` → `--ink2` au survol) → le renommer ; le nouveau nom s'applique à tous ses comptes.
- **Crayon sur chaque ligne de compte** → nom, établissement de rattachement, type de
  compte, et la **répartition entre détenteurs au curseur** (avatars aux deux extrémités,
  `input[type=range]` en `accent-color: var(--accent)`, valeur « 61 / 39 % » à droite).
  Cette répartition par compte existait dans l'app actuelle mais n'était pas maquettée.

**Une seule feuille sert les quatre cas** — nouveau/modifier × compte/établissement — avec
titre, sous-titre et champs conditionnels. Ne pas en faire quatre modales.

Le mode « établissement » n'affiche que le champ Nom ; le mode « compte » affiche en plus
les deux selects et le curseur de répartition. Bouton « Enregistrer » désactivé si le nom est vide.

**Suppression : non maquettée, et volontairement.** Dans l'app actuelle c'est un lien
« Supprimer » rouge à côté de chaque solde — trop facile à toucher par erreur sur un compte
à 89 000 €. Recommandation : la placer en bas de la feuille d'édition, avec confirmation
explicite (saisie du nom du compte pour les comptes non vides).

### Mobile (390 × 844)

Maquetté dans `Refonte mobile.dc.html`, mêmes jetons, clair et sombre.

- **Barre d'onglets** en bas, en verre (`--panel-hi` + `--blur`, `border-top: 1px solid var(--stroke)`,
  `box-shadow: 0 -8px 30px`), 5 entrées : Synthèse, Patrimoine, Comptes, Budget, Objectifs.
  Icône 23px + libellé 10px, empilés ; onglet actif en `--accent`, inactifs en `--ink4`.
  `padding: 8px 12px 26px` pour la zone d'accueil iOS, puis la barre d'accueil
  (134 × 5px, `--ink` à 28 % d'opacité).
- Le contenu défile **sous** la barre translucide (motif iOS) : le scroller porte
  `padding-bottom: 100px`.
- **Cibles tactiles : 44px minimum, sans exception.** Les pilules segmentées font
  `min-height: 44px; padding: 13px 0` (contre 26px sur desktop, où la souris le permet) ;
  les boutons ronds (œil, ajouter, avatar) font 44 × 44 ; le lien retour du Détail porte
  `padding: 12px 8px` et un `margin-left: -8px` pour garder son alignement optique à gauche.
  C'est le point le plus facile à casser au portage.
- **Synthèse** : chiffre héros à 40px (contre 54 sur desktop), poches en 2 colonnes + 1
  pleine largeur, et le **sélecteur de période passe SOUS le graphique** — à portée du pouce,
  sur toute la largeur.
- **Patrimoine** : le tableau devient une liste. Jeton de 36px, nom + compte empilés,
  puis valeur et performance empilées à droite. Aucun défilement horizontal.
- **Détail** : la grille de 4 cartes devient une liste de lignes label / valeur dans un
  seul panneau. Le lien retour est la **seule** sortie de l'écran — ne pas le supprimer.
- Comptes, Budget et Objectifs : pas encore maquettés en mobile. Le prototype affiche un
  état « pas encore dessiné » honnête plutôt qu'un faux écran.

## Interactions et comportement

- **Navigation** : sidebar (7 sections + Réglages), cartes de poche de la Synthèse,
  lignes du tableau Patrimoine → Détail, lien retour du Détail.
- **Thème** : bascule dans la barre du haut et dans Réglages, persistée en `localStorage`
  sous `patrimoine.theme`, initialisée depuis `prefers-color-scheme`.
- **Masquer les montants** : remplace **tous** les montants par `••• •••`, sur tous les écrans,
  y compris les totaux et les libellés de légende. Dans le prototype, un seul helper `e()`
  enveloppe chaque valeur — reproduire ce point d'entrée unique côté formatage plutôt que
  de conditionner chaque affichage.
- **Période** : change la courbe **et** les libellés d'axe (5 jeux de données distincts).
- **Filtres du Patrimoine** : recalculent lignes, total, compte de lignes et performance globale.
- **Mode étagé** : superpose l'investi sous le total, suit la période choisie, affiche sa légende.
- **Feuilles modales** : voile flouté, ancrage haut + `overflow-y: auto`, fermeture par la
  croix ou « Annuler », bouton de validation désactivé tant que la saisie est incomplète.
- **Survol** : `--hover` sur les lignes et items de nav ; les poches de la Synthèse passent
  de `--panel` à `--panel-hi`. Aucune transformation, aucun `scale`.
- **Focus clavier** : `outline: 2px solid var(--accent); outline-offset: 2px` — global,
  défini dans `tokens-glass.css`.
- **Transitions** : uniquement sur `background-color` et `color`, 150 ms. Le verre ne s'anime pas.

## État

```ts
ecran: 'synthese' | 'patrimoine' | 'detail' | 'comptes' | 'budget'
      | 'rapport' | 'objectifs' | 'dividendes' | 'reglages' | 'login'  // = React Router
vue: 'net' | 'brut' | 'financier'      // global, dans BarreControles
periode: '1M' | '3M' | '1A' | '5A' | 'Tout'  // local à chaque graphique
filtre: 'Tous' | 'Actions' | 'ETF' | 'Crypto' // local à PortefeuillePage
theme: 'clair' | 'sombre'              // useTheme(), sur <html data-theme>
masque: boolean                         // global, persisté
etage: boolean                          // local au graphique de la Synthèse
ajoutOuvert: boolean                    // local à PortefeuillePage (feuille d'ajout)
fiche: null | 'compte' | 'compte-nouveau' | 'etab' | 'etab-nouveau'  // local à ComptesPage
```

`vue`, `masque` et le détenteur sélectionné restent dans le contexte global existant.
`periode` et `filtre` descendent au niveau du composant qui les utilise — c'est précisément
la correction de l'incohérence signalée.

## Jetons de design

Tous dans `tokens-glass.css`, avec les deux thèmes. Résumé :

| Rôle | Clair | Sombre |
| --- | --- | --- |
| Encre principale | `#16181d` | `#ffffff` |
| Encre secondaire | `#4b5262` | `#d5d9e0` |
| Encre tertiaire | `#6b7280` | `#9aa1ad` |
| Encre discrète | `#9aa1ad` | `#6b7280` |
| Accent | `#2a6df4` | `#7db0ff` |
| Positif | `#0f7a4f` | `#4ce6a4` |
| Négatif | `#c0392b` | `#ff8a7a` |
| Verre | `rgba(255,255,255,0.56)` | `rgba(255,255,255,0.07)` |
| Bord de verre | `rgba(255,255,255,0.7)` | `rgba(255,255,255,0.13)` |
| Filet | `rgba(22,24,29,0.09)` | `rgba(255,255,255,0.12)` |

- **Flou** : `blur(28px) saturate(180%)` — le `saturate` fait la moitié de l'effet, ne pas l'oublier.
- **Rayons** : 11px (contrôles), 18px (cartes), 20px (panneaux), 22px (héros), 999px (pilules).
  Aucune autre valeur.
- **Espacements** : 14px entre panneaux, 18–20px de padding interne, 24–26px dans les héros.
- **Typographie** : pile système Apple. Échelle utilisée : 11, 12, 13, 14, 15, 16, 22, 24, 26, 28, 40, 44, 48, 54px.
  Graisses : 500 (courant), 600 (tout ce qui est titre ou chiffre). Jamais 700 sauf les jetons de ticker.
- **Interlettrage** : −0.035em sur les chiffres héros, −0.025em sur les titres d'écran,
  −0.01em sur les titres de panneau, 0.06em sur les en-têtes de tableau en capitales.

## Accessibilité — deux points à ne pas manquer

1. Le verre sur fond coloré fait tomber le contraste. Tous les textes du prototype sont en
   encre pleine opacité (jamais en `opacity` ni en `color-mix`) précisément pour tenir
   4,5:1. Ne pas introduire de texte semi-transparent.
2. `tokens-glass.css` contient un repli `@supports not (backdrop-filter)` et un bloc
   `prefers-reduced-transparency` qui rendent les panneaux opaques. Les conserver.

## Ressources

Aucune image, aucune police à télécharger, aucune dépendance nouvelle.
Les icônes sont des SVG inline en `stroke-width: 1.7`, `viewBox="0 0 20 20"`, tracés à la main
dans le prototype — les remplacer par l'équivalent Lucide (`lucide-react`) au portage,
en gardant `strokeWidth={1.7}` et une taille de 18px en nav, 14–15px dans les pilules.

## Fichiers de ce paquet

| Fichier | Nature |
| --- | --- |
| `Refonte.dc.html` | Prototype de référence desktop — 9 écrans navigables, clair + sombre. **La source de vérité visuelle.** |
| `Refonte mobile.dc.html` | Prototype mobile 390×844 — Synthèse, Patrimoine, Détail, clair + sombre. |
| `État actuel.dc.html` | Recréation fidèle de l'UI actuelle, pour comparer avant/après. |
| `tokens-glass.css` | **Code de production** — à copier tel quel. |
| `tailwind.config.additions.js` | À fusionner dans `tailwind.config.js`. |
| `components/GlassPanel.tsx` | **Code de production** — panneau, en-tête, ligne de liste. |
| `components/Controls.tsx` | **Code de production** — segmenté, pilules, boutons, badge de variation. |
| `components/useTheme.ts` | **Code de production** — thème persisté sur `<html data-theme>`. |

Fichiers du dépôt concernés, par écran : voir `github.md` à la racine du projet
(section « Screen map »).
