# Backlog — Application Patrimoine

Backlog unique du projet : évolutions envisagées **et** points relevés à l'audit technique et
fonctionnel du 18/08/2026 (revue complète backend, frontend, documentation, plus vérification
des hypothèses de bug sur les données réelles de la base — 4 059 transactions, 49 positions).
55 points au total (le chiffre de 47 initialement annoncé au moment de l'audit ne correspond pas
au compte réel des points listés ci-dessous — corrigé ici).

Chaque point porte :

- une **sévérité** : `bloquant` (chiffre faux affiché à l'utilisateur) · `majeur` (fonctionnalité
  faussée ou absente) · `mineur` (confort, cohérence, dette) ;
- un **effort** indicatif : `S` (< 1 h) · `M` (quelques heures) · `L` (chantier) ;
- depuis la reprise du chantier, un **état de traitement** : `traité` (corrigé et vérifié dans le
  code actuel), `hors périmètre` (assumé comme non-objectif, raison donnée dans le corps du
  point), ou `non traité` (reste à faire) ;
- l'**endroit** concerné.

Le contenu de chaque point est conservé tel qu'audité, y compris une fois traité : c'est la trace
de l'audit, elle garde sa valeur (pourquoi le point avait été soulevé, ce qui était mesuré sur la
base réelle) même après correction. Seule l'étiquette d'état de traitement, dans le titre, est
ajoutée par rapport à la version initiale de ce document.

## État d'avancement (synthèse)

Sur les 55 points : **53 traités**, **2 hors périmètre** assumés dès l'audit (5.7 fiscalité PEA,
7.7 authentification). Aucun point en attente — 2.4 (look-through géographique complet), rouvert le
19/08/2026 suite à une autorisation obtenue de justETF, a été livré et vérifié le même jour
(§ 2.4).

L'ordre d'exécution retenu est en fin de document (§ Plan d'exécution, devenu un historique — le
chantier qu'il décrit est terminé).

---

## 1. Exactitude des calculs financiers

C'est le cœur métier : ces points produisent aujourd'hui des chiffres faux à l'écran.

### 1.1 — `bloquant` · `S` · `traité` — Double comptage des frais dans le gain/perte total

`performance_service.compute_performance` retranche `frais_payes` du résultat alors que ces frais
sont **déjà** intégrés en amont :

- frais et taxes d'achat → inclus dans le coût de revient, donc déjà déduits de `gains_latents` ;
- frais de vente → déjà déduits du produit de cession, donc déjà dans `gains_realises` ;
- taxes sur dividendes et intérêts → l'export courtier crédite un montant **net**, la taxe est
  donc déjà retirée de `dividendes_percus` / `interets_percus`.

Les resoustraire les compte une seconde fois. Impact mesuré sur la base réelle : ≈ 40 € d'erreur.
`frais_payes` doit rester **affiché à titre informatif** mais sortir de la formule de résultat.

> Fichier : `backend/app/services/performance_service.py` (l. 61 et 79).

### 1.2 — `bloquant` · `M` · `traité` — Revenus boursiers non comptabilisés

Seuls `CASH/DIVIDEND` et `CASH/INTEREST_PAYMENT` entrent dans le résultat. Le grand livre contient
d'autres flux d'espèces liés au compte-titres, aujourd'hui totalement ignorés :

| Type | Occurrences en base | Montant |
|---|---:|---:|
| `BENEFITS_SAVEBACK` | 24 | +77,22 € |
| `STOCKPERK` | 1 | +25,16 € |
| `BONUS` | 6 | +9,14 € |
| `PEA_MARKETING` | 1 | +1,00 € |
| `GIFT` | 1 | −26,00 € |

Soit ≈ 86 € de résultat invisible. Il faut une catégorie « autres revenus/charges boursiers »,
alimentée par liste explicite de types (jamais par un `else` fourre-tout, qui capterait un jour un
mouvement non boursier), affichée dans la carte Rentabilité.

> Fichier : `backend/app/services/performance_service.py`.

### 1.3 — `majeur` · `S` · `traité` — Convention de signe des frais non normalisée

À l'achat le code fait `abs(tx.fee) + abs(tx.tax)`, à la vente `tx.amount + tx.fee + tx.tax` sans
valeur absolue. Le résultat n'est juste que parce que l'export Trade Republic stocke les frais en
négatif. Un export au signe inverse gonflerait silencieusement les produits de cession. La
normalisation doit se faire **une seule fois, au parsing**, et les services travailler ensuite sur
une convention garantie.

> Fichiers : `backend/app/services/transaction_import.py`, `portfolio_reconstruction.py`.

### 1.4 — `majeur` · `S` · `traité` — Aucun garde-fou sur une vente supérieure à la quantité détenue

Dans `_apply_transaction`, si `shares_sold > state.shares` (export partiel, transaction manquante,
ordre chronologique cassé), la quantité et le coût de base passent en négatif sans alerte ni trace,
et tous les chiffres en aval deviennent absurdes. Il faut borner, journaliser, et remonter
l'anomalie dans le résultat d'import.

> Fichier : `backend/app/services/portfolio_reconstruction.py` (l. 57-66).

### 1.5 — `majeur` · `M` · `traité` — XIRR : bornes et convergence non maîtrisées

`xirr` cherche la solution entre −99,9999 % et +10 000 % par bissection sur 200 itérations et
renvoie `mid` **même si la convergence n'a pas été atteinte**. Sur une position achetée il y a
quelques jours, un gain de quelques pourcents s'annualise en plusieurs milliers de pourcents :
mathématiquement exact, mais affiché tel quel c'est une aberration pour l'utilisateur.

À faire : renvoyer `None` en cas de non-convergence, et ne pas afficher de rendement annualisé sur
une position détenue depuis moins d'un seuil de temps (à définir, ~90 jours), en l'expliquant dans
l'interface plutôt qu'en affichant un nombre absurde.

> Fichier : `backend/app/services/performance_service.py` (l. 18-53).

### 1.6 — `mineur` · `S` · `traité` — Poids sectoriels des fonds non normalisés

Les poids géographiques sont normalisés (`p / total_geo`), les poids sectoriels non : la somme
observée en base vaut 1,0001 sur plusieurs fonds. Écart négligeable mais incohérent, et il empêche
d'écrire un test d'invariant « la somme des poids d'un fonds vaut 1 ».

> Fichier : `backend/app/services/market_data_service.py` (l. 184-191).

---

## 2. Justesse de la répartition géographique et sectorielle

### 2.1 — `bloquant` · `M` · `traité` — 15 ETF sur 26 n'ont aucune répartition géographique

Vérifié en base : seuls 11 des 26 fonds détenus ont des lignes `fund_composition` de type `geo`,
parce que Yahoo Finance ne renseigne pas `top_holdings` pour les 15 autres. Ces 15 fonds basculent
**intégralement** dans « Autres ». La comparaison réel vs cible géographique du tableau de bord —
qui est une des raisons d'être de l'application — est donc structurellement fausse pour la majorité
des ETF du portefeuille, **sans que l'interface le signale**.

Deux actions, cumulables et réalisables sans source de données payante :

1. **Repli sur le nom du fonds** : déduire la zone d'un ETF de son intitulé (`MSCI World`,
   `S&P 500`, `Emerging Markets`, `Euro Stoxx`, `Nikkei`, `MSCI EMU`, `FTSE All-World`…) avec une
   table de correspondance nom → répartition géographique de référence. Le mécanisme existe déjà
   pour l'émetteur (`reference_indices.guess_emetteur_from_name`), il s'agit de le décliner.
2. **Signaler explicitement l'estimation** : marquer chaque fonds selon la qualité de sa donnée
   (composition réelle / estimée par le nom / inconnue) et l'afficher, plutôt que de laisser
   croire à une répartition exacte.

> Fichiers : `backend/app/services/reference_indices.py`, `market_data_service.py`,
> `frontend/src/pages/DashboardPage.tsx`.

### 2.2 — `majeur` · `S` · `traité` — « Autres » confond deux situations distinctes

`region_for_country` renvoie `"Autres"` aussi bien pour un pays hors table de correspondance que
pour un pays inconnu, et `breakdown_with_lookthrough` ajoute encore `"Non catégorisé"` par-dessus.
Résultat : une catégorie fourre-tout impossible à interpréter. Il faut séparer « autre zone
géographique connue » de « donnée manquante », et compléter la table pays → région (elle ne couvre
aujourd'hui que 36 pays).

> Fichier : `backend/app/services/reference_indices.py`.

### 2.3 — `majeur` · `S` · `traité` — Lignes sans cotation mélangées aux autres sans avertissement

Trois lignes (deux Private Equity, une obligation) n'ont pas de cours et sont valorisées à leur
coût. Elles entrent malgré tout dans la valeur totale, dans le score de diversification et dans les
**montants de rééquilibrage en euros**, comme s'il s'agissait d'une valeur de marché. C'est
documenté dans les spécifications, mais invisible à l'endroit où le chiffre est lu.
`RiskIndicators.lignes_sans_donnees` est déjà calculé par le backend et n'est affiché nulle part.

> Fichiers : `backend/app/services/analysis_service.py`, `frontend/src/pages/DashboardPage.tsx`.

### 2.4 — `mineur` · `M` · `traité` — Look-through géographique complet des ETF (justETF)

Point historique du backlog : l'approximation top-10 extrapolée à 100 % du fonds reste une
approximation même quand elle fonctionne. Une source donnant la composition géographique complète
améliorerait la précision, en particulier sur les fonds très diversifiés. Classé **hors périmètre**
jusqu'au 19/08/2026 faute de source tierce accessible sans y être autorisé (les CGU de justETF
interdisent explicitement les requêtes automatisées, section 3.1).

**Rouvert et livré le 19/08/2026** : l'utilisateur a obtenu l'autorisation directe de justETF
(échange informel avec l'éditeur du site, à charge pour lui de s'auto-supporter — pas d'assistance
de leur part en cas de souci ; autorisation non documentée par écrit, à conserver comme preuve de
son côté).

Nouveau service `backend/app/services/justetf_service.py` : scrape la fiche ETF statique de
justETF (`GET /en/etf-profile.html?isin=...`, rendue côté serveur sans JavaScript ni session),
récupère la répartition pays/secteurs réelle (~4-5 plus grosses lignes + une ligne résiduelle
"Other"), taguée `SOURCE_JUSTETF` dans `FundComposition`. Nouveau job planifié `justetf_refresh`
(hebdomadaire par défaut, réglable depuis Réglages), throttlé, jamais bloquant, jamais
d'exception qui remonte. `market_data_service.refresh_tickers` ne recalcule plus la composition
(ni `FundComposition` ni `FundTopHolding`) d'un ticker déjà couvert par justETF, pour ne pas la
faire écraser par le rafraîchissement des prix (cadence bien plus fréquente).

**Vérifié en conditions réelles** sur le portefeuille de l'utilisateur (26 ETF détenus) :
21 ETF mis à jour avec succès, 5 échecs légitimes (ETC or physique sans notion de composition,
ETF à réplication synthétique/swap sans onglet "Holdings" sur justETF — confirmé en navigateur,
pas un défaut du parseur). Effet mesuré sur `qualite_donnees` : composition réelle du portefeuille
59,3 % → 68,5 %, "Non catégorisé" 40,7 % → 31,5 %. Composition d'un ETF spot-vérifiée ligne à ligne
contre la fiche justETF réelle (iShares Core MSCI World) : correspondance exacte.

**Explicitement hors périmètre de cette livraison** (voir docstring de `justetf_service.py`) :
réplication du bouton "Show more" de la fiche (liste complète des pays, nécessite une session AJAX
Apache Wicket à état — jugée trop fragile à rejouer hors navigateur) ; utilisation de justETF pour
enrichir la fiche détaillée d'une position (TER, émetteur) à la demande, incompatible avec la
prudence requise envers une ressource sans support.

> Fichiers : `backend/app/services/justetf_service.py` (nouveau),
> `backend/app/services/market_data_service.py`, `backend/app/services/scheduler_service.py`,
> `backend/app/services/reference_indices.py`, `backend/app/models.py`.

---

## 3. Robustesse, validation et exploitation

### 3.1 — `majeur` · `S` · `traité` — Catégorie en doublon dans les objectifs → erreur 500

`PUT /api/targets/{annee}` avec deux fois la même catégorie déclenche une `IntegrityError`
SQLAlchemy non gérée (contrainte d'unicité `uq_target_annee_type_categorie`), renvoyée en
`500 Internal Server Error` brut. Reproduit. Doit être un `400` explicite, et le doublon doit être
empêché côté formulaire.

> Fichiers : `backend/app/routers/targets.py`, `frontend/src/pages/ObjectifsPage.tsx`.

### 3.2 — `majeur` · `S` · `traité` — Absence de validation des saisies

Reproduit sur l'API : `POST /api/portfolio/holdings` accepte un ticker vide, une quantité négative
ou nulle et un prix de revient négatif ; `PUT /api/targets/{annee}` accepte des pourcentages
négatifs dès lors que la somme fait 100 ; `PUT /api/settings/jobs/{key}` accepte un intervalle nul
ou négatif. À traiter par des contraintes Pydantic (`Field(gt=0)`, `min_length`, bornes) plutôt que
par des `if` dispersés dans les routeurs.

> Fichier : `backend/app/schemas.py`.

### 3.3 — `majeur` · `S` · `traité` — Import de positions non transactionnel

`import_confirm` fait `db.query(Holding).delete()` puis insère ligne à ligne. Une erreur en cours de
boucle laisse le portefeuille **vidé**, sans rollback. À encadrer par une transaction explicite.

> Fichier : `backend/app/routers/portfolio.py` (l. 48-86).

### 3.4 — `majeur` · `S` · `traité` — Conflit non arbitré entre saisie manuelle et reconstruction

`rebuild_holdings` fait `db.query(Holding).delete()` : toute ligne ajoutée à la main disparaît au
prochain import de transactions, silencieusement. Il faut soit marquer les lignes manuelles et les
préserver, soit avertir clairement l'utilisateur avant l'import. Décision produit à prendre — la
première option est cohérente avec le multi-compte (§ 5.1).

> Fichier : `backend/app/services/portfolio_reconstruction.py` (l. 111).

### 3.5 — `mineur` · `S` · `traité` — Fichiers en attente d'import conservés indéfiniment en mémoire

`csv_import._PENDING_IMPORTS` est un dictionnaire global plafonné à 20 entrées mais **sans
expiration** : un DataFrame y reste jusqu'à éviction par un autre import. Ajouter un horodatage et
une purge.

### 3.6 — `mineur` · `S` · `traité` — Aucune limite de taille sur les fichiers importés

`await file.read()` charge l'intégralité du fichier en mémoire. Un plafond explicite avec message
d'erreur clair vaut mieux qu'un plantage du process.

### 3.7 — `majeur` · `M` · `traité` — Le rafraîchissement bloque la requête HTTP

`POST /api/settings/jobs/{key}/run-now` et `POST /api/market-data/refresh` exécutent le
rafraîchissement complet (49 positions × plusieurs appels Yahoo) **de façon synchrone**. Le worker
est bloqué et le navigateur peut dépasser son délai d'attente. À passer en tâche de fond avec un
statut consultable.

### 3.8 — `mineur` · `S` · `traité` — Enregistrement du statut de job après rollback

Dans `_run_market_data_refresh`, `_record_result` est appelé après `db.rollback()` dans le bloc
`except` : si l'erreur venait de la session, l'enregistrement du statut échoue à son tour et
l'utilisateur ne voit jamais l'échec dans les Réglages. Utiliser une session distincte.

### 3.9 — `mineur` · `S` · `traité` — Aucune configuration de journalisation

Les modules créent des `logger` mais aucun `logging.basicConfig` n'est posé : `logger.info` et
`logger.exception` ne sortent nulle part par défaut. Rien n'est exploitable en cas d'incident,
alors que le manuel d'exploitation suppose le contraire.

### 3.10 — `mineur` · `S` · `traité` — Chemin de base de données en dur

`DB_PATH` est calculé en dur dans `database.py`. Une variable d'environnement (avec cette valeur par
défaut) est le prérequis pour pouvoir tester sur une base jetable et pour sauvegarder/restaurer
proprement.

---

## 4. Performance

### 4.1 — `majeur` · `S` · `traité` — Requête N+1 sur les données de marché

`Holding.market_data` est une relation `viewonly` sans stratégie de chargement : `value_holdings`
déclenche une requête par position (49 requêtes pour afficher un tableau). Un `lazy="selectin"` ou
une jointure explicite suffit.

### 4.2 — `majeur` · `S` · `traité` — Tout le portefeuille recalculé pour une seule fiche

`holding_detail_service.build_holding_detail` appelle `performance_service.compute_holding_returns(db)`
qui relit les 4 059 transactions et revalorise les 49 lignes… pour afficher deux pourcentages.
Ajouter une variante ciblée sur un ticker.

### 4.3 — `majeur` · `M` · `traité` — `compute_positions` rejoué plusieurs fois par requête

`GET /api/performance` reconstruit les positions depuis le grand livre plusieurs fois dans un même
appel (directement, puis via les fonctions qu'il enchaîne). Un cache mémoïsé par requête ou un
passage explicite du résultat évite de relire les transactions à chaque fois.

### 4.4 — `majeur` · `M` · `traité` — Historique de prix par ligne retéléchargé à chaque ouverture

Point historique du backlog, confirmé : `compute_holding_price_history` appelle
`yfinance.history(period="max")` à chaque ouverture de la fiche détaillée. Plusieurs secondes
d'attente, à chaque fois, pour une donnée qui bouge une fois par jour. Cache horodaté en base, sur
le modèle de `MarketDataCache`.

### 4.5 — `majeur` · `M` · `traité` — Historique du portefeuille recalculé à chaque affichage

`compute_portfolio_history` retélécharge l'historique de **toutes** les lignes et recalcule la
grille hebdomadaire à chaque chargement du tableau de bord. L'interface l'admet elle-même
(« peut prendre jusqu'à une minute »). À mettre en cache, et à rafraîchir avec la tâche planifiée.

### 4.6 — `mineur` · `S` · `traité` — Recherche linéaire dans une double boucle

`_value_at` parcourt toute la série à chaque appel, dans une boucle grille × positions : le coût
croît quadratiquement avec l'ancienneté du portefeuille. Une recherche dichotomique ou un parcours
à curseur ramène le calcul à un passage unique.

### 4.7 — `mineur` · `S` · `traité` — Réponse inutile du rafraîchissement

`POST /api/market-data/refresh` renvoie l'intégralité du cache alors que le frontend rappelle
`listHoldings()` juste derrière. Renvoyer un simple compte-rendu.

### 4.8 — `mineur` · `M` · `traité` — Bundle frontend monolithique

693 kB (200 kB gzip) en un seul fichier, `recharts` chargé sur toutes les pages y compris celles
sans graphique. Découpage par route en imports dynamiques.

---

## 5. Fonctionnalités

### 5.1 — `majeur` · `L` · `traité` — Multi-portefeuille / multi-compte

Le champ `compte` existe sur `Holding` mais n'est exploité ni pour le filtrage, ni pour le calcul,
ni pour le reporting. Distinguer PEA / CTO / autres comptes permet la lecture par enveloppe, et
c'est le prérequis d'une éventuelle prise en compte fiscale (§ 5.7). À traiter conjointement avec
§ 3.4 (préservation des lignes manuelles).

### 5.2 — `majeur` · `M` · `traité` — Export CSV

Aucun export à ce jour. Positions, transactions et synthèse de performance, au format CSV, encodage
et séparateur compatibles Excel français.

### 5.3 — `majeur` · `S` · `traité` — Le tableau de bord est figé sur l'année courante

`const annee = CURRENT_YEAR` est évalué **hors du composant**, au chargement du module : l'année
n'est ni sélectionnable, ni réévaluée. Impossible de comparer le portefeuille aux objectifs d'une
autre année depuis le tableau de bord. Ajouter un sélecteur, alimenté par les années réellement
enregistrées.

### 5.4 — `mineur` · `S` · `traité` — Sélecteur d'année des Objectifs basé sur les années enregistrées

Point historique du backlog : l'écran propose année précédente / courante / suivante en dur, alors
que `GET /api/targets/` renvoie déjà la liste des années ayant des objectifs. À brancher, en
gardant la possibilité de créer une année nouvelle.

### 5.5 — `mineur` · `M` · `traité` — Alertes sur écart aux objectifs

Les recommandations ne sont consultées qu'à la demande. Un seuil configurable et une notification
visible (bandeau au chargement, indicateur dans la navigation) permettraient de réagir sans aller
chercher l'information.

### 5.6 — `mineur` · `M` · `traité` — Méthode FIFO en option

Le coût de base est calculé en coût moyen pondéré uniquement. FIFO en alternative correspondrait
mieux à certains cadres fiscaux. À exposer comme réglage, sans changer le comportement par défaut.

### 5.7 — `mineur` · `L` · `hors périmètre` — Spécificités fiscales PEA

Aucune prise en compte de la fiscalité (plus-values, durée de détention, plafond de versement).
L'application est un outil de suivi de performance, pas un simulateur fiscal : **conservé comme
non-objectif explicite**, à réévaluer seulement après le multi-compte (§ 5.1).

### 5.8 — `mineur` · `S` · `traité` — Modification d'une position impossible depuis l'interface

`PATCH /api/portfolio/holdings/{id}` existe côté backend mais n'est exposé ni dans le client API ni
dans l'interface : on ne peut que créer ou supprimer. Corriger une quantité impose de supprimer
puis recréer.

### 5.9 — `mineur` · `S` · `traité` — Type d'actif non saisissable à la main

Le formulaire d'ajout n'expose pas `type_actif`, que le backend accepte pourtant : toute ligne
ajoutée manuellement atterrit dans « Autres » et échappe au filtrage par catégorie.

### 5.10 — `mineur` · `S` · `traité` — Tableau du portefeuille sans tri ni total

49 lignes triées uniquement par ticker, sans colonne triable ni ligne de total. C'est le tableau le
plus consulté de l'application.

### 5.11 — `mineur` · `S` · `traité` — Fraîcheur des données jamais affichée

`MarketDataCache.derniere_maj` est en base mais n'apparaît sur aucun écran : impossible de savoir si
les cours affichés datent d'une heure ou d'une semaine.

### 5.12 — `mineur` · `M` · `traité` — Mode sombre

Point historique du backlog.

---

## 6. Interface, accessibilité et finition

### 6.1 — `mineur` · `S` · `traité` — Fiche détaillée en page inaccessible

La route `/portefeuille/:ticker` existe et est documentée dans les spécifications, mais **aucun lien
de l'application n'y mène** : tous les clics ouvrent la modale. La page n'est atteignable qu'en
tapant l'URL. Soit on la relie (lien « ouvrir en pleine page »), soit on la retire des
spécifications.

### 6.2 — `mineur` · `S` · `traité` — Modales non accessibles

`CompositionModal` peut ouvrir `HoldingDetailModal` par-dessus elle : aucune gestion du focus,
aucune fermeture au clavier (Échap), pas de `role="dialog"` ni de `aria-modal`, fermeture au clic
sur le fond uniquement. Le clic dans la modale enfant traverse jusqu'au conteneur parent.

### 6.3 — `mineur` · `S` · `traité` — Confirmation de suppression par `confirm()` natif

Boîte de dialogue bloquante du navigateur, non stylée, incohérente avec le reste de l'interface.

### 6.4 — `mineur` · `S` · `traité` — Métadonnées du document HTML restées par défaut

`<title>frontend</title>` et `<html lang="en">` sur une application intégralement en français.

### 6.5 — `mineur` · `S` · `traité` — `frontend/README.md` est le fichier par défaut de Vite

Aucun rapport avec le projet ; contredit le README racine.

### 6.6 — `mineur` · `S` · `traité` — Aucun rechargement possible sans F5

Ni le tableau de bord ni la page Objectifs n'offrent de bouton de rechargement ; les états d'erreur
ne sont pas remis à zéro entre deux tentatives.

> Traité en deux temps. Tableau de bord : bouton « Actualiser » qui relance l'analyse et la
> rentabilité et remet l'état d'erreur à zéro. Objectifs : la relecture des objectifs n'avait
> aucune gestion d'erreur — un échec de chargement laissait deux éditeurs **vides et silencieux**,
> et un clic sur « Enregistrer » aurait alors remplacé les objectifs réellement enregistrés par une
> répartition vide. L'échec est désormais affiché avec son motif, la saisie et l'enregistrement
> sont bloqués tant qu'il dure, et un bouton « Réessayer » relance la lecture.

### 6.7 — `mineur` · `S` · `traité` — Valeur d'une ligne recalculée côté frontend

`PortefeuillePage` refait `prix * quantite` alors que le backend calcule déjà cette valeur
ailleurs : deux sources de vérité pour un même chiffre affiché.

### 6.8 — `mineur` · `S` · `traité` — Messages d'erreur bruts

Les `detail` de l'API sont affichés tels quels à l'utilisateur, parfois dans un vocabulaire
technique.

---

## 7. Qualité, sécurité et exploitation

### 7.1 — `bloquant` · `L` · `traité` — Aucun test automatisé

Point historique du backlog, et prérequis de tout le reste : sans filet, chacune des corrections
ci-dessus est un risque de régression silencieuse sur des chiffres que rien ne recoupe.
Priorité aux modules les plus sensibles : `portfolio_reconstruction` (coût moyen pondéré),
`performance_service` (XIRR, agrégats), `analysis_service` (look-through), `transaction_import`
(parsing et exclusions).

### 7.2 — `majeur` · `S` · `traité` — Projet non versionné

Aucun dépôt git : pas d'historique, pas de retour arrière, pas de diff. Et le seul `.gitignore`
existant est dans `frontend/` — rien ne protège `backend/venv/`, `backend/patrimoine.db` (données
financières personnelles) ni les `__pycache__/`.

### 7.3 — `mineur` · `S` · `traité` — CORS trop permissif pour l'usage réel

`allow_credentials=True` avec `allow_methods=["*"]` et `allow_headers=["*"]` alors qu'aucun cookie
n'est utilisé. Sans conséquence en local, mais autant ne pas laisser l'habitude.

### 7.4 — `mineur` · `S` · `traité` — Colonnes de mapping non validées

Les noms de colonnes envoyés par le client sont utilisés tels quels comme clés de DataFrame, sans
vérifier qu'ils existent dans le fichier. Aucun risque d'injection (pandas), mais une erreur de
mapping produit un import silencieusement vide plutôt qu'un message clair.

### 7.5 — `mineur` · `S` · `traité` — Pas de limite de débit vers Yahoo Finance

Rien n'empêche d'enchaîner les rafraîchissements manuels. Yahoo Finance n'offre aucun SLA et limite
les appels : une temporisation entre appels et un délai minimal entre deux rafraîchissements évitent
de se faire couper l'accès.

### 7.6 — `mineur` · `M` · `traité` — Sauvegarde de la base non outillée

`patrimoine.db` contient l'intégralité de l'historique financier personnel, sans sauvegarde
automatique ni procédure de restauration testée. Le manuel d'exploitation décrit la sauvegarde
manuelle ; un script la rendrait fiable.

> Traité par `backend/scripts/sauvegarde.py` : copie cohérente à chaud via l'API de sauvegarde
> native de SQLite (jamais une copie de fichier, qui produirait une base corrompue si l'application
> écrit au même moment), fichier horodaté, rétention des N plus récentes, contrôle d'intégrité
> systématique après copie, et restauration qui met la base courante de côté avant de l'écraser.
> Procédure documentée dans le manuel d'exploitation.

### 7.7 — `mineur` · `S` · `hors périmètre` — Authentification

Absente, en cohérence avec un usage 100 % local sur `localhost`. **Non-objectif assumé** tant que
l'application n'est pas exposée sur le réseau. À rouvrir uniquement si elle devait être publiée sur
le serveur personnel — auquel cas ce n'est plus un point de backlog mais un préalable bloquant.

---

## Plan d'exécution (historique)

Ce plan a servi de feuille de route au chantier ; il est conservé ici tel quel comme **historique**
plutôt que comme plan à venir — les lots 0 à 5 sont terminés, et le lot 6 l'est à l'exception du
point 7.6 (sauvegarde outillée de la base) et de la mise à jour des documents (le présent lot de
révision documentaire). L'ordre retenu, du plus contraignant au plus confortable, reste la
justification de la séquence suivie : chaque lot était livrable et testable seul, un lot ne
démarrait pas tant que le précédent n'était pas vert.

### Lot 0 — Socle (prérequis, aucun changement de comportement)

`7.2` versionnement et `.gitignore` racine · `7.1` mise en place de l'outillage de test (pytest avec
base jetable et `yfinance` neutralisé, vitest côté frontend) · `3.10` chemin de base configurable ·
`3.9` journalisation.

> **Pourquoi en premier** : rien d'autre ne peut être modifié en sécurité sans filet de test ni
> retour arrière possible. Ce lot ne change aucun comportement, donc son risque est nul.

### Lot 1 — Exactitude des chiffres

`1.1` double comptage des frais · `1.2` revenus non comptabilisés · `1.3` normalisation des signes ·
`1.4` garde-fou sur les ventes · `1.5` bornes du XIRR · `1.6` normalisation des poids sectoriels.

> **Pourquoi ensuite** : l'application affiche aujourd'hui des chiffres faux sur son écran
> principal. C'est le défaut le plus grave pour un outil dont l'unique raison d'être est de dire si
> le patrimoine progresse. Chaque correction est verrouillée par un test écrit **avant** elle.

### Lot 2 — Justesse des répartitions

`2.1` repli géographique par le nom du fonds et qualification de la donnée · `2.2` séparation
« autre zone » / « donnée manquante » et extension de la table pays → région · `2.3` signalement des
lignes valorisées au coût · `5.9` type d'actif à la saisie.

> **Pourquoi ici** : deuxième raison d'être de l'outil (l'exposition réelle, ETF traversés). Elle
> est aujourd'hui fausse pour 15 des 26 ETF détenus, sans que rien ne l'indique — ce qui est pire
> qu'une donnée absente.

### Lot 3 — Robustesse et validation

`3.1` erreur 500 sur doublon · `3.2` validation des saisies · `3.3` import transactionnel ·
`3.4` arbitrage manuel vs reconstruction · `3.5` purge des imports en attente · `3.6` taille des
fichiers · `3.8` statut de job après échec · `7.3` CORS · `7.4` validation du mapping ·
`7.5` limitation des appels sortants.

> **Pourquoi ici** : une fois les calculs justes, il faut empêcher les données d'entrée de les
> refausser. Ce lot ferme les portes par lesquelles une donnée aberrante entre en base.

### Lot 4 — Performance

`4.1` N+1 · `4.2` calcul ciblé pour la fiche · `4.3` reconstruction mutualisée · `4.4` cache de
l'historique par ligne · `4.5` cache de l'historique du portefeuille · `4.6` recherche à curseur ·
`3.7` rafraîchissement non bloquant · `4.7` réponse allégée · `4.8` découpage du bundle.

> **Pourquoi ici** : optimiser avant d'avoir figé le comportement juste reviendrait à optimiser du
> code voué à changer. Les tests des lots 1 à 3 garantissent qu'aucune optimisation ne modifie un
> résultat.

### Lot 5 — Fonctionnalités

`5.3` année sélectionnable au tableau de bord · `5.4` sélecteur d'année réel · `5.8` modification
d'une position · `5.10` tri et total · `5.11` fraîcheur des données · `5.2` export CSV ·
`5.1` multi-compte · `5.5` alertes · `5.6` FIFO · `5.12` mode sombre.

> **Pourquoi ici** : construire du neuf sur une base juste, testée et rapide. À l'intérieur du lot,
> l'ordre va du plus petit rapport effort/valeur au plus gros chantier.

### Lot 6 — Finition et documentation

`6.1` à `6.8` interface et accessibilité · `7.6` sauvegarde outillée · mise à jour des quatre
documents · recette finale.

> **Pourquoi en dernier** : la documentation ne se rédige utilement qu'une fois le comportement
> définitif, et les finitions d'interface ne doivent pas retarder les corrections de fond.

### Hors périmètre, assumé

`5.7` fiscalité PEA (non-objectif produit) · `7.7` authentification (sans objet tant que
l'application reste sur `localhost`).

`2.4` look-through géographique complet a été hors périmètre pour la même raison (pas de source de
donnée tierce accessible) jusqu'au 19/08/2026 ; rouvert et livré depuis (justETF), cf. § 2.4.
