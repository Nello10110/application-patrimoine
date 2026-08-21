# Bilan du chantier — Application Patrimoine

Chantier d'audit et de refonte mené du 18 au 19/08/2026. Ce document remplace la note de reprise
rédigée en cours de route : **le chantier est terminé, les six lots sont livrés.**

---

## 1. Ce qui a été fait

Audit complet (backend, frontend, documentation), avec vérification systématique des hypothèses
sur la base réelle — 4 059 transactions, 49 positions. 55 points relevés, priorisés en 6 lots dans
`docs/BACKLOG.md`, exécutés dans l'ordre : **52 traités, 3 hors périmètre assumés.**

| Lot | Contenu |
|---|---|
| 0 | Socle : git, pytest, vitest, base jetable, `yfinance` neutralisé, journalisation |
| 1 | Exactitude des calculs financiers |
| 2 | Justesse des répartitions géographiques et sectorielles |
| 3 | Robustesse, validation des saisies, exploitation |
| 4 | Performance et caches |
| 5 | Fonctionnalités : écrans, export CSV, multi-compte, FIFO, alertes |
| 6 | Accessibilité, mode sombre, documentation, sauvegarde outillée |

**Couverture de tests : de 0 à 354** — 284 backend, 70 frontend. `tsc`, `vite build` et `oxlint`
sont propres.

Chaque lot est un commit isolé : `git revert <sha>` annule un lot sans toucher aux autres,
`git diff 8fb4d79..HEAD` montre l'intégralité du chantier.

---

## 2. Ce que ça change pour toi

### Les chiffres affichés ont changé — et c'est voulu

Mesuré sur ta base réelle :

| | Avant | Après |
|---|---:|---:|
| Gain / perte total | 1 525,78 € | **1 627,94 €** |
| Rendement simple | 15,21 % | **16,22 %** |

L'écart de +102 € vient de quatre corrections :

- les frais étaient comptés **deux fois** — déjà intégrés au coût de revient et aux produits de
  cession, puis resoustraits une seconde fois du résultat ;
- environ 86 € de revenus (Saveback, Stockperk, bonus Private Markets, PEA marketing, don)
  n'étaient comptabilisés **nulle part** ;
- les dividendes et intérêts sont désormais **nets** d'impôt — `amount` est un montant brut dans
  l'export du courtier, la taxe est une ligne séparée (vérifié : exactement 30 % de prélèvement
  forfaitaire sur tes intérêts) ;
- les frais d'entrée de tes deux fonds non cotés entrent enfin au coût de revient (2 €).

Trois indicateurs apparaissent sur la carte Rentabilité : **Autres revenus**, **Impôts prélevés**,
et les libellés « Dividendes perçus (net) » / « Intérêts perçus (net) ».

### Au premier lancement

Rien à faire de particulier : les migrations de schéma et de contenu s'appliquent seules, et le
portefeuille est **reconstruit automatiquement une fois** puisque les règles de calcul ont changé
(cf. `docs/MANUEL_EXPLOITATION.md` § 6). Les journaux le confirment par une ligne
`remise à niveau: portefeuille reconstruit (49 position(s))`.

Une seule action utile de ta part : **cliquer sur « Rafraîchir les cours »** dans Portefeuille.
C'est ce qui déclenche le repli géographique par indice — sur tes 26 ETF, la couverture passe de
**11 à 24**. Les deux restants sont un ETF thématique « Global Luxury » (aucune zone déductible de
son nom) et une ligne dont le fournisseur ne renvoie plus le libellé. Le rafraîchissement tourne
désormais en tâche de fond avec une progression, au lieu de figer la page une minute.

### Vérifier par toi-même

```bash
cd backend
./venv/Scripts/python.exe -m pip install -r requirements-dev.txt
./venv/Scripts/python.exe -m pytest -q          # 284 tests

cd ../frontend
npm install
npm run test                                     # 70 tests
npm run build
npx oxlint
```

Et pour sauvegarder la base avant toute manipulation :

```bash
cd backend
./venv/Scripts/python.exe scripts/sauvegarde.py
```

---

## 3. Décisions qui engagent le produit

Toutes sont commentées dans le code et détaillées dans `docs/SPECIFICATIONS_FONCTIONNELLES.md`.

- **Frais et impôts** sont affichés à titre informatif et **ne figurent plus dans la formule** du
  gain/perte : ils sont déjà intégrés au coût de revient, aux produits de cession et aux revenus nets.
- **« Autres revenus »** est alimenté par une **liste fermée** de types de mouvements. Jamais un
  `else` fourre-tout : un type inconnu reste invisible du calcul plutôt que d'y entrer en silence.
- **Rendement annualisé** : non affiché sous 90 jours de détention, ni au-delà de 1 000 %/an. Mieux
  vaut « — » qu'un pourcentage à quatre chiffres mathématiquement exact mais absurde à lire.
- **Un fonds n'est jamais classé sur son pays de domiciliation.** Sans composition réelle ni indice
  reconnu, il reste explicitement « Non catégorisé » : classer un ETF S&P 500 en « Europe » parce
  qu'il est irlandais serait pire qu'une donnée absente.
- **Le grand livre fait foi.** Une ligne saisie à la main survit à un import de transactions, sauf
  si le grand livre reconstruit le même ticker — auquel cas elle est supprimée, et l'événement est
  compté et affiché.
- **Le compte est une annotation manuelle.** L'export du courtier ne porte aucune information de
  compte : seule la répartition de la **valeur actuelle** par compte est calculable, jamais une
  rentabilité par compte. C'est dit dans l'interface.
- **Coût moyen pondéré reste la méthode par défaut**, FIFO est une option qui déclenche un recalcul
  complet. Sur ta base : gains réalisés 38,35 € en coût moyen contre 65,40 € en FIFO.
- **Une vente sans achat correspondant** n'est signalée qu'en fin de traitement, jamais bornée en
  cours de route — ce qui préserve un cas réel de ton historique : un titre offert vendu à 16h12
  dont la ligne d'achat n'est horodatée qu'à 16h20 le même jour.

---

## 4. Hors périmètre, assumé

- **Look-through géographique complet des ETF** : impossible sans source de données tierce (payante
  ou à scraper). Le repli par indice est une approximation documentée, signalée comme telle dans
  l'interface via l'encart de qualité des données.
- **Fiscalité PEA** : non-objectif produit. L'outil suit la performance, il ne simule pas l'impôt.
- **Authentification** : sans objet tant que l'application reste sur `localhost`. À rouvrir
  uniquement si elle devait être exposée sur le serveur personnel — ce serait alors un préalable
  bloquant, pas un point de backlog.

---

## 5. Pistes pour la suite

Rien ne bloque, mais si le sujet revient :

- les répartitions de repli par indice (`services/reference_indices.py`) sont des approximations
  figées : elles méritent une relecture annuelle. Le test paramétré qui vérifie que chaque entrée
  somme à 1 protège des fautes de frappe, pas d'une dérive des indices réels ;
- la qualité des données géographiques reste le premier levier d'amélioration fonctionnelle, si une
  source de composition complète devenait accessible ;
- **backlog 2.L.2, livré 21/08/2026** : le rôle « membre » n'a qu'une granularité grossière (par type
  de ressource, pas par quotité individuelle) ; le filtrage serveur de l'invité ne couvre que
  Patrimoine net/Portefeuille/Emprunts ; TOTP et migration du jeton vers un cookie `Secure`/
  `SameSite=Strict` restent à faire avant une exposition réellement publique ; HTTPS/reverse proxy
  restent la responsabilité de l'utilisateur sur son homelab (non documentés en détail ici).
