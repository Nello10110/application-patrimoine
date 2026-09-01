# Roadmap — vers une alternative libre et gratuite à Finary

Ce document détaille comment enchaîner les points du backlog priorisé (`docs/BACKLOG.md` § 2) pour
tendre vers la cible fixée le 19/08/2026 : une application de suivi patrimonial complet, dans
l'esprit de Finary, mais **locale, gratuite et open source**. Il complète le backlog (qui liste et
arbitre *quoi* faire) en répondant à *dans quel ordre* et *pourquoi*.

## Vision

Aujourd'hui, l'application est un **excellent tracker boursier** : reconstruction fidèle du
portefeuille depuis le grand livre de transactions, rentabilité XIRR correcte, look-through
géo/sectoriel des ETF audité ligne à ligne contre justETF, données 100 % locales. Ce qui manque pour
se rapprocher de Finary n'est pas la qualité du calcul (déjà solide, déjà testée) mais la
**largeur** : Finary montre *tout* le patrimoine d'un ménage (immobilier, épargne réglementée,
assurance-vie, dettes), pas seulement le compte-titres. La roadmap suit cette logique : élargir
d'abord ce qui est *possédé et dû*, puis ce que ça *permet de projeter*, puis le confort d'usage
quotidien.

**Ce qui est déjà acquis et qu'il ne faut pas perdre en route** : la transparence sur la qualité des
données (composition réelle vs estimée vs inconnue, affichée explicitement — Finary ne le fait pas),
le 100 % local (aucune donnée envoyée à un tiers hors requêtes de cotation strictement nécessaires),
et un score de diversification déjà gratuit alors qu'il est payant chez Finary. Ce sont des atouts
de positionnement, pas seulement des cases à cocher.

## Vue d'ensemble des phases

```mermaid
flowchart LR
    P1["Phase 1 ✓ livrée 19/08/2026\nPatrimoine net complet\nimmobilier · SCPI/AV/PER · dettes"]
    P2["Phase 2 ✓ livrée 20/08/2026\nProjections\nsimulateur · FIRE"]
    P3["Phase 3 ✓ livrée 20/08/2026\nConfort quotidien\ndividendes · PDF · coût consolidé · PWA"]
    P4["Phase 4 ✓ tranchée 21/08/2026\nbudget → Lot 6 · partage → Q.1\nreste : E.2 agrégation bancaire"]
    L["Lots 4-9 ✓ livrés 21-31/08/2026\nUX/UI · foyer · budget · objectifs\nanalyses avancées · retours terrain\n(docs/BACKLOG.md § 4)"]
    P1 --> P2 --> P3 --> P4 --> L
```

---

## Phase 1 — Patrimoine net complet (fondation) — livrée le 19/08/2026

**Backlog** : A.1 (immobilier), A.2 (SCPI/assurance-vie/PER), A.3 (dettes et emprunts).
**Effort total** : `L`. **Pourquoi en premier** : c'est la promesse centrale d'un agrégateur
patrimonial — *tout* voir au même endroit. Sans elle, les phases suivantes (projections, rapports)
calculeraient juste plus vite ou plus joliment un chiffre qui reste partiel. C'est aussi la phase la
moins risquée techniquement : ce sont des types d'actifs supplémentaires valorisés manuellement, sur
un modèle déjà rodé (`PRIVATE_FUND` existe déjà et suit exactement ce patron).

Étapes concrètes :

1. **Modèle de données** : trois nouveaux `type_actif` (`REAL_ESTATE`, `SCPI`, `LIFE_INSURANCE`,
   `PENSION` — quatre en réalité, voir A.2) sur `Holding`, valorisés manuellement comme
   `PRIVATE_FUND` l'est déjà (pas de tentative de cotation automatique — ce sont des supports sans
   cours quotidien). Nouveau modèle `Loan` (capital initial, taux, mensualité, dates, capital restant
   dû) — première vraie notion de **passif** dans l'application, jusqu'ici entièrement composée
   d'actifs.
2. **Patrimoine net** : le Tableau de bord distingue désormais Actifs / Passifs / **Net** (Actifs −
   Passifs), au lieu de la seule « Valeur des positions » actuelle. C'est le changement le plus
   visible de la phase, et celui qui rapproche le plus visuellement l'app de Finary.
3. **Écrans** : formulaire de saisie/édition étendu (déjà en place pour l'ajout manuel, à
   généraliser), nouvel onglet Portefeuille pour Immobilier/Épargne/Dettes (les onglets existants —
   Actions/ETF/Crypto/Obligations/Private Equity — suivent déjà ce patron, cf. LOT récent).
4. **Objectifs et répartition** : décider si ces nouveaux actifs entrent dans la répartition
   géo/sectorielle (probablement non — un bien immobilier ou une assurance-vie multi-supports n'a
   pas de géographie unique évidente) ou dans une nouvelle dimension de répartition (« par classe
   d'actif » : Actions / Immobilier / Épargne / Liquidités — c'est ainsi que Finary structure sa vue
   principale). Recommandation : ajouter cette répartition par classe d'actif plutôt que de forcer
   ces nouveaux actifs dans le look-through géo/sectoriel existant, qui n'a pas de sens pour eux.

### Ce qui a été livré (19/08/2026) — écart avec le plan ci-dessus

- **Immobilier + SCPI/assurance-vie/PER regroupés dans un seul onglet** « Immobilier & Épargne »,
  pas quatre onglets séparés comme envisagé au point 3 — leur mode de valorisation (manuel,
  `Holding.valeur_estimee`) est identique, un onglet par type aurait dispersé sans raison.
- **Les dettes ne sont PAS un onglet du tableau des positions** : un emprunt n'a ni quantité ni prix,
  sa forme de données est trop différente d'un `Holding` pour partager la même table. Livré comme
  une **carte séparée** « Dettes et emprunts » sous le tableau du Portefeuille, avec son propre CRUD.
- **Répartition par classe d'actif** (point 4) : tranchée comme prévu — nouvelle dimension, n'entre
  pas dans le look-through géo/sectoriel existant. Affichée directement dans la carte « Patrimoine
  net » du Tableau de bord (`GET /api/patrimoine/net`), pas dans un écran séparé.
- **Deux périmètres de calcul distincts et documentés** (`docs/SPECIFICATIONS_FONCTIONNELLES.md`
  § 3.11) : le portefeuille financier (`analysis_service.holdings_financiers`, exclut les 4 nouveaux
  types) reste seul consulté par le look-through géo/sectoriel, les objectifs et la carte Rentabilité
  boursière ; le patrimoine net (`patrimoine_service.py`) est une vue additive séparée.

**Vérification faite** : recette en conditions réelles sur le portefeuille de l'utilisateur (ligne
immobilière + emprunt de test, créés puis supprimés après contrôle), patrimoine net recoupé à l'euro
près (actifs − passifs), non-régression confirmée sur `/api/analysis/{annee}` et `/api/performance`
(inchangés), 378 tests backend + 93 tests frontend au vert. Détail complet dans
[`docs/BACKLOG.md`](BACKLOG.md) § 2.A.3.

---

## Phase 2 — Ce que le patrimoine permet (projections) — livrée le 20/08/2026

**Backlog** : B.1 (simulateur de patrimoine), B.2 (indépendance financière), A.4 (catégorie libre).
**Effort total** : `M`. **Pourquoi ensuite** : ces fonctionnalités n'ont de sens qu'une fois le
patrimoine net réellement complet (Phase 1) — projeter un patrimoine qui ne compte pas l'immobilier
ni les dettes donnerait une trajectoire fausse. C'est en revanche la phase à plus fort effet
d'engagement : c'est la fonctionnalité phare payante de Finary (« Predict »), reproductible ici en
calcul pur, sans aucune dépendance externe ni coût.

Étapes concrètes :

1. **Moteur de projection** : intérêts composés + apports mensuels réguliers, sur la valeur nette
   actuelle (Phase 1), avec hypothèses réglables (rendement annuel moyen, épargne mensuelle) —
   fonction pure côté backend, testable unitairement sans aucun état externe.
2. **Écran Simulateur** : graphique de trajectoire à 5/10/20/30 ans, curseurs pour les hypothèses,
   reformulé pour rester honnête (afficher une fourchette ou au moins un avertissement sur le
   caractère hypothétique — dans l'esprit de la transparence déjà pratiquée pour la qualité des
   données géographiques).
3. **Indépendance financière** : dépense annuelle cible saisie par l'utilisateur, taux de retrait
   réglable (4 % par défaut, expliqué comme un choix méthodologique et non une vérité universelle),
   date d'atteinte estimée en combinant avec le moteur de projection.
4. **Catégorie libre** (A.4) : petit complément à la Phase 1, glissé ici car sans urgence propre —
   réutilise le patron déjà construit en Phase 1, aucun nouveau mécanisme.

**Vérification faite** : chaque formule du moteur de projection verrouillée par un test comparant
son résultat à une formule fermée indépendante (capitalisation composée, valeur future d'une suite
de versements — mêmes mathématiques que l'amortissement d'emprunt de la Phase 1, appliquées en sens
inverse), pas seulement par une relecture du code. Testé en direct dans le navigateur sur le
patrimoine net réel de l'utilisateur (10 998,93 €) : projection et FIRE réactifs aux changements
d'hypothèses (le patrimoine nécessaire augmente avec un taux de retrait plus prudent, le délai
diminue avec plus d'épargne mensuelle — invariants de sens vérifiés, pas seulement de valeur). 395
tests backend (+17) + 101 tests frontend (+8). Détail complet dans [`docs/BACKLOG.md`](BACKLOG.md)
§ 2.B.2.

**Mise à jour du 20/08/2026** : le moteur de projection a depuis été déplacé côté client et fusionné
avec la page Outils (calculateur d'intérêts composés générique, ajoutée hors backlog à la demande de
l'utilisateur) — même calcul, capital de départ désormais librement modifiable en plus du patrimoine
net réel. Voir le détail dans [`docs/BACKLOG.md`](BACKLOG.md) § 2.B.1. Le backend
`services/simulation_service.py` et ses endpoints ont été retirés, devenus inutilisés.

---

## Phase 3 — Confort et transparence au quotidien — livrée le 20/08/2026

**Backlog** : C.1 (calendrier dividendes), D.1 (relevé PDF), E.1 (formats de courtier), E.3 (coût
consolidé), H.1 (PWA). **Effort total** : `M`. **Pourquoi ici** : ce sont des améliorations
d'usage quotidien plutôt que des fondations — elles rendent l'application plus agréable à ouvrir
souvent (l'habitude d'usage est justement ce qui fait la valeur perçue d'un Finary), mais aucune
n'est bloquante pour une autre. Regroupées ensemble parce qu'elles sont indépendantes les unes des
autres et peuvent être livrées dans n'importe quel ordre interne selon l'envie du moment.

Points notables :

- **C.1** ne demande aucune nouvelle donnée (les dividendes perçus sont déjà en base) — juste une
  nouvelle vue, donc un bon point d'entrée rapide en tout début de phase.
- **D.1** (export PDF) réutilise la même logique de calcul que les CSV déjà exportables — surtout un
  travail de mise en forme.
- **E.1** élargit qui peut utiliser l'application sans changer aucun comportement pour l'utilisateur
  actuel (Trade Republic reste inchangé).
- **H.1** (PWA) est purement frontend, sans impact backend — candidat à traiter en parallèle du
  reste si besoin de varier.

### Ce qui a été livré (20/08/2026) — écart avec le plan ci-dessus

- **C.1, D.1, E.3, H.1 : livrés et vérifiés en conditions réelles** — détail complet dans
  [`docs/BACKLOG.md`](BACKLOG.md) § 2 (C.1, D.1, E.3, H.1).
- **E.1 seul non livré**, et volontairement : au moment d'écrire le code de détection de format, aucun
  fichier d'export réel d'un autre courtier (Boursorama, Degiro, IBKR) n'était disponible. Deviner un
  schéma de parsing pour une donnée financière personnelle sans référence réelle aurait risqué de mal
  interpréter silencieusement les transactions d'un futur utilisateur — écarté plutôt que livré à
  l'aveugle. Reste dans le backlog (§ 2.E.1), à reprendre dès qu'un export réel est disponible.
- **D.2 (Phase 4) livré en même temps** que ce lot : sa spécification était suffisamment claire et ne
  dépendait d'aucune décision préalable, contrairement aux quatre autres points de la Phase 4 — voir
  ci-dessous.

387 backend / 107 frontend avant ce lot → 415 backend / 107 frontend après (C.1/D.1/E.3/D.2 ont
chacun leurs tests dédiés ; H.1 est vérifié par un contrôle en conditions réelles, pas par des tests
unitaires — un service worker généré par Workbox n'a pas de logique métier propre à verrouiller).
`tsc`/`oxlint`/`vite build` propres.

---

## Phase 4 — Décisions à trancher avant d'aller plus loin — tranchée le 21/08/2026

**Backlog d'origine** : F.1 (budget), E.2 (agrégation bancaire), C.2 (projection des dividendes),
~~D.2 (rapport périodique)~~ **livré le 20/08/2026, voir Phase 3**, G.1 (partage). Cette phase
n'était pas un chantier de développement à proprement parler, c'était une liste de **décisions
produit ou de vérifications externes** à faire avant que le développement ait un sens — trois des
quatre points ont depuis été tranchés :

- **F.1 (budget)** : **entré dans le périmètre le 21/08/2026**, devenu le Lot 6 « Flux »
  (`docs/BACKLOG.md` § 2.N, livré 24/08/2026) — écran Budget complet, import CSV/OFX/QIF,
  catégorisation par règles explicites (jamais IA), récurrences détectées, jonction avec le
  patrimoine (taux d'épargne réel, préremplissage du Simulateur).
- **G.1 (partage)** : tranché en même temps, devenu **Q.1** (`docs/BACKLOG.md` § 2.Q.1, lien de
  partage révocable, livré 25/08/2026) — plus simple que ce qu'envisageait G.1 à l'origine (pas
  besoin d'ouvrir un compte au destinataire).
- **C.2** (projection des dividendes) : absorbé par **P.3** (`docs/BACKLOG.md` § 2.P.3, livré
  25/08/2026), qui traite le même besoin en séparant ce qui est certain de ce qui est estimé plutôt
  que d'abandonner l'ensemble à cause de sa partie la moins fiable.
- **E.2 (agrégation bancaire)** : **seul point encore en attente** — demande toujours une réponse
  écrite d'Enable Banking sur le statut réglementaire d'un usage personnel avant tout code
  (`docs/BACKLOG.md` § 2.E.2). GoCardless (l'alternative gratuite historique) reste fermée depuis
  juillet 2025.

---

## Et après la Phase 4 ?

Cette roadmap, écrite le 19-20/08/2026, s'arrête à la Phase 4. La suite du chantier (refonte UX/UI,
foyer/détenteurs, profondeur du modèle d'actifs, budget, objectifs, analyses avancées, partage —
sections **K à Q** de `docs/BACKLOG.md`) a été planifiée et exécutée directement en **Lots 4 à 8**
dans `docs/BACKLOG.md` § 4, sans être réécrite ici en `Phase 5/6/...` : le changement de nomenclature
(« Lot » plutôt que « Phase ») date du 21/08/2026, quand le cadrage a basculé du seul suivi boursier
vers Finary comme référence explicite (§ 1 du backlog). Une fois ces lots livrés et l'usage réel
commencé, une quinzaine de retours directs de l'utilisateur (sections **R à W**) ont été regroupés a
posteriori en **Lot 9 « Retours terrain »** — voir `docs/BACKLOG.md` § 4 pour l'état actuel complet
(neuf lots clos, trois points isolés hors lot dont E.2 ci-dessus) et l'artefact « Roadmap Patrimoine »
publié pour une vue visuelle à jour.

## Ce qui reste hors périmètre quoi qu'il arrive

Voir `docs/BACKLOG.md` § 3 pour le détail et la justification : fiscalité PEA, agrégation bancaire
commerciale type Powens/Plaid, trading/rendement crypto intégré, fonctionnalités communautaires.
L'authentification, elle, est **sortie** de cette liste le 21/08/2026 (cible d'usage devenue le
foyer, exposition depuis le serveur personnel) — voir `docs/BACKLOG.md` § 3. Aucun des points
restants n'est reconsidéré par cette roadmap — les y renvoyer explicitement évite qu'ils ne
reviennent par la bande au fil des phases.
