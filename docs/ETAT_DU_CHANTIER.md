# État du chantier — Outil Bourse

Document de reprise, rédigé le 19/08/2026 à la demande de Paul (limite d'utilisation atteinte).
Il décrit **ce qui est fait, ce qui reste, et comment reprendre**.

Tout le travail décrit ici est **présent sur le disque et committé** dans
`C:\Users\Paul\Documents\Developpements\Outil bourse` (dépôt git initialisé au début du chantier).

---

## 1. Où en est-on

Le chantier suit le plan d'exécution en 6 lots défini dans `docs/BACKLOG.md` (§ Plan d'exécution).

| Lot | Contenu | État |
|---|---|---|
| Audit | Revue complète backend/frontend/docs, hypothèses vérifiées sur la base réelle | **Fait** |
| Backlog | 47 points priorisés, plan d'exécution justifié | **Fait** |
| Lot 0 | Socle : git, pytest, vitest, base jetable, `yfinance` neutralisé, journalisation | **Fait, vérifié** |
| Lot 1 | Exactitude des calculs financiers | **Fait, vérifié sur données réelles** |
| Lot 2 | Justesse des répartitions géo/sectorielles | **Fait, vérifié sur données réelles** |
| Lot 3 | Robustesse, validation, exploitation | **Fait, vérifié sur l'API réelle** |
| Lot 4 | Performance et caches | **Fait, vérifié sur données réelles** |
| Lot 5A | Écrans : année, tri, total, édition, fraîcheur, export CSV | **Fait, vérifié** |
| Lot 5B | Multi-compte, préférences, FIFO, alertes | **Fait, vérifié sur données réelles** |
| Lot 6A | Accessibilité, finition, mode sombre | **Fait — à revérifier (voir § 4)** |
| Lot 6B | Documentation, sauvegarde outillée, recette finale | **Reste à faire** |

### Historique git

```
69d0dd3  feat(finition): modales accessibles, confirmation stylée, mode sombre, métadonnées et messages d'erreur
3d6418e  feat(fonctionnalités): multi-compte, préférences, méthode FIFO en option, alertes sur écart aux objectifs
a18a7df  feat(écrans): année sélectionnable, tri et total du portefeuille, édition en ligne, fraîcheur des cours, export CSV Excel FR
2884b9c  perf: chargement groupé des cours, calculs ciblés, cache d'historique 24h, rafraîchissement en tâche de fond, découpage du bundle
2dcc809  feat(robustesse): validation des saisies, imports transactionnels, arbitrage saisie manuelle/reconstruction, plafonds, limitation des appels externes
5f4c5cc  feat(repartition): repli géographique par indice, qualification de la donnée, séparation donnée manquante / zone résiduelle
fea1731  fix(perf): supprime le double comptage des frais, compte les revenus boursiers manquants, garde-fous XIRR et reconstruction
bb87a18  test(socle): pytest + vitest, base jetable, yfinance neutralisé, chemin de base et journalisation configurables
49e3615  docs(backlog): audit technique et fonctionnel complet, 47 points priorisés en 6 lots
8fb4d79  chore: état initial du projet avant audit
```

Chaque lot est un commit isolé : `git revert <sha>` annule un lot sans toucher aux autres.
`git diff 8fb4d79..HEAD` montre l'intégralité du chantier.

**Couverture de tests : de 0 à environ 320 tests** (255 backend + 66 frontend d'après le dernier
lot ; les chiffres exacts sont à reconfirmer, cf. § 4).

---

## 2. Ce que ça change concrètement pour toi

### Les chiffres affichés ont changé — et c'est voulu

Mesuré sur ta base réelle (4 059 transactions, 49 positions) :

| | Avant | Après |
|---|---:|---:|
| Gain / perte total | 1 525,78 € | **1 627,94 €** |
| Rendement simple | 15,21 % | **16,22 %** |

L'écart de +100 € vient de trois corrections :
- les frais étaient comptés **deux fois** (déjà dans le coût de revient, et resoustraits ensuite) ;
- environ 86 € de revenus (Saveback, Stockperk, bonus Private Markets, PEA marketing, don) n'étaient
  comptabilisés **nulle part** ;
- les dividendes et intérêts sont désormais nets d'impôt (`amount` est brut dans l'export, la taxe
  est une ligne séparée — vérifié : exactement 30 % de prélèvement sur tes intérêts).

Trois nouveaux indicateurs apparaissent sur la carte Rentabilité : **Autres revenus**,
**Impôts prélevés**, et les libellés « Dividendes perçus (net) » / « Intérêts perçus (net) ».

### À faire de ton côté au premier lancement

1. **Lancer l'application normalement.** Les migrations s'appliquent seules au démarrage
   (nouvelles colonnes, nouvelle table, renommage des catégories). Vérifié sans perte de données
   sur une copie de ta base : 4 059 transactions et 49 positions intactes.
2. **Cliquer sur « Rafraîchir les cours »** dans Portefeuille. C'est le déclencheur du repli
   géographique par indice : sur tes 26 ETF, la couverture passe de **11 à 24**. Les deux restants
   sont un ETF thématique « Global Luxury » (aucune zone déductible de son nom) et une ligne dont
   Yahoo ne renvoie plus le libellé.
   Le rafraîchissement est désormais **non bloquant** : il tourne en tâche de fond avec une
   progression (« 12 / 49 positions ») au lieu de figer la page une minute.
3. Optionnel : dans **Réglages**, régler le seuil d'alerte, choisir FIFO plutôt que le coût moyen
   pondéré (recalcule tout le portefeuille), et tester les trois exports CSV.

### Commandes de vérification

```bash
cd backend
./venv/Scripts/python.exe -m pip install -r requirements-dev.txt
./venv/Scripts/python.exe -m pytest -q

cd ../frontend
npm install
npm run test
npm run build
npx oxlint
```

---

## 3. Ce qui reste à faire — LOT 6B

C'est le seul lot non commencé. Périmètre :

### 3.1 Mettre les quatre documents à jour
Ils décrivent encore l'application **d'avant le chantier**. À reprendre :

- **`docs/SPECIFICATIONS_FONCTIONNELLES.md`** — le plus urgent, il est franchement décalé :
  - § 3.1 : la convention de signe (`amount` brut, `fee`/`tax` séparés et algébriques) et le
    traitement des frais de `PRIVATE_MARKET_BUY` ;
  - § 3.1 : le garde-fou sur une vente sans achat correspondant, et le cas réel « vente horodatée
    avant son achat » ;
  - § 3.4 : le repli géographique par indice et la qualification de la donnée
    (`composition` / `indice` / absente) ;
  - § 3.5 : la formule corrigée du gain/perte, les « autres revenus », et les bornes du XIRR
    (non calculé sous 90 jours de détention, ni au-delà de 1 000 %/an) ;
  - § 3.5 : la méthode FIFO en option ;
  - nouveau : le compte comme annotation manuelle, et **pourquoi** la rentabilité par compte n'est
    pas calculable (le grand livre Trade Republic ne porte aucune information de compte) ;
  - nouveau : les alertes, distinctes des recommandations ;
  - § 4 : les tables `parametres`, `historique_cache`, et les colonnes `holdings.origine`,
    `fund_composition.source` ;
  - § 5 : réécrire « Limites connues » — les tests automatisés ne sont plus une limite.
- **`docs/MANUEL_UTILISATEUR.md`** — écrans modifiés : sélecteur d'année et bandeau d'alerte au
  tableau de bord, tri/total/édition en ligne/filtre par compte/fraîcheur des cours au Portefeuille,
  préférences et exports aux Réglages, mode sombre.
- **`docs/MANUEL_EXPLOITATION.md`** — variables d'environnement `OUTIL_BOURSE_DB` et
  `OUTIL_BOURSE_LOG_LEVEL`, journalisation, comment lancer les tests, migrations automatiques au
  démarrage, procédure de sauvegarde/restauration.
- **`README.md`** — mentionner les tests et le fichier `requirements-dev.txt`.
- **`docs/BACKLOG.md`** — marquer les points traités. Il n'y a pas de convention de marquage dans le
  fichier aujourd'hui : en choisir une (par exemple un `✅` en tête de titre, plus une section
  « Traité le … » en fin de document) et l'appliquer.

### 3.2 Outiller la sauvegarde (point 7.6 du backlog)
`portfolio.db` contient tout ton historique financier, sans sauvegarde automatique ni procédure de
restauration testée. Écrire un script (`backend/scripts/sauvegarde.py` ou équivalent) qui produit
une copie horodatée et cohérente de la base (utiliser l'API de sauvegarde de SQLite, pas une copie
de fichier à chaud), avec une rétention des N dernières, et documenter la restauration dans le
manuel d'exploitation. Éventuellement le brancher comme tâche planifiée.

### 3.3 Recette finale
- Relancer l'intégralité des suites backend et frontend.
- Faire tourner l'application contre une **copie** de la base réelle et parcourir les six écrans.
- Recouper une dernière fois les chiffres de la carte Rentabilité.

---

## 4. Point de vigilance : le lot 6A n'a pas été revérifié

Le lot 6A (commit `69d0dd3`) a été produit et validé par l'agent d'exécution, qui rapporte :
255 tests backend verts, 66 tests frontend verts, `oxlint` propre, build réussi, et la preuve que la
variante `dark` figure bien dans le CSS généré.

**Je n'ai pas pu rejouer ces vérifications moi-même** : mon accès au shell est devenu indisponible
juste après la fin de l'agent. Le commit est isolé et revertible.

**Première chose à faire à la reprise** : relancer les quatre commandes du § 2 et confirmer.
Points à regarder en priorité s'il y a un problème :
- le mode sombre repose sur `@custom-variant dark (&:where(.dark, .dark *));` dans
  `frontend/src/index.css` — si les couleurs sombres ne s'appliquent pas, c'est un problème d'ordre
  de spécificité entre `bg-white` et `dark:bg-slate-800` dans le CSS généré ;
- la modale accessible (`frontend/src/components/Modale.tsx`) gère une pile de modales en portée
  module ; le cas « deux modales empilées » est le plus délicat.

---

## 5. Décisions prises en cours de route

Elles sont toutes commentées dans le code, mais voici celles qui engagent le produit :

- **Frais et impôts** sont affichés à titre informatif et **ne figurent plus dans la formule** du
  gain/perte : ils sont déjà intégrés au coût de revient, aux produits de cession et aux revenus nets.
- **« Autres revenus »** est alimenté par une **liste fermée** de types de mouvements
  (`BENEFITS_SAVEBACK`, `STOCKPERK`, `BONUS`, `PEA_MARKETING`, `GIFT`, `TAX_OPTIMIZATION`). Jamais un
  `else` fourre-tout : un type inconnu reste invisible du calcul plutôt que d'y entrer en silence.
- **Rendement annualisé** : non affiché sous 90 jours de détention, ni au-delà de 1 000 %/an. Mieux
  vaut « — » qu'un pourcentage à quatre chiffres mathématiquement exact mais absurde à lire.
- **Un fonds n'est jamais classé sur son pays de domiciliation.** Sans composition réelle ni indice
  reconnu, il reste explicitement « Non catégorisé » : classer un ETF S&P 500 en « Europe » parce
  qu'il est irlandais serait pire qu'une donnée absente.
- **Le grand livre fait foi.** Une ligne saisie à la main survit à un import de transactions, sauf
  si le grand livre reconstruit le même ticker — auquel cas elle est supprimée, et l'événement est
  compté et affiché.
- **« Remplacer le portefeuille existant »** à l'import d'un relevé ne vide que les lignes que tu
  gères toi-même, pas celles issues du grand livre.
- **Le compte est une annotation manuelle.** L'export Trade Republic ne porte aucune information de
  compte : seule la répartition de la **valeur actuelle** par compte est calculable, jamais une
  rentabilité par compte. C'est dit dans l'interface.
- **Coût moyen pondéré reste la méthode par défaut**, FIFO est une option. Vérifié sur ta base :
  gains réalisés 38,35 € en coût moyen contre 65,40 € en FIFO.

---

## 6. Hors périmètre, assumé

- **Look-through géographique complet des ETF** : impossible sans source de données tierce (payante
  ou à scraper). Le repli par indice est une approximation documentée, signalée comme telle dans
  l'interface.
- **Fiscalité PEA** : non-objectif produit. L'outil suit la performance, il ne simule pas l'impôt.
- **Authentification** : sans objet tant que l'application reste sur `localhost` (uvicorn n'écoute
  que `127.0.0.1` par défaut). À rouvrir uniquement si elle devait être exposée sur le serveur
  personnel — ce serait alors un préalable bloquant, pas un point de backlog.

---

## 7. Comment reprendre

Une reprise propre tient en une phrase : **« Reprends le chantier Outil Bourse au lot 6B, en
commençant par revérifier le lot 6A. »**

Le contexte nécessaire est entièrement dans le dépôt : `docs/BACKLOG.md` pour le plan et la
justification de l'ordre, ce document pour l'état, et `git log` pour le détail de chaque lot.
