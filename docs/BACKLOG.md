# Backlog — Application Patrimoine

## 0. Où on en était, où on va

L'ancien backlog (audit technique et fonctionnel du 18-19/08/2026, 55 points) est **entièrement
clos** : 53 points traités et vérifiés dans le code actuel, 2 assumés hors périmètre (fiscalité
PEA, authentification). Il est archivé tel quel dans
[`docs/archives/AUDIT_2026-08-18.md`](archives/AUDIT_2026-08-18.md) — c'est la trace de *pourquoi*
chaque décision a été prise, elle garde sa valeur, mais elle ne décrit plus l'état courant du
produit. Vérification de clôture faite le 19/08/2026 avant réécriture de ce document : suite de
tests complète au vert (333 backend, 84 frontend), `tsc`/`oxlint`/`vite build` propres, et un
sondage ciblé sur les points les plus à risque de régression silencieuse (chargement `selectin`
toujours en place, recherche dichotomique de l'historique toujours en place, script de sauvegarde
présent, rafraîchissement toujours asynchrone en 202) — voir le détail de la méthode en fin de
document (§ 5).

Ce document est désormais **tourné vers la suite**. Contexte du changement de cap (échange du
19/08/2026) : l'utilisateur souhaite faire évoluer l'application vers quelque chose qui se
rapproche de **Finary** (agrégateur patrimonial français, cf. § 1) — en restant **gratuit et open
source**, contrairement à Finary qui est un produit commercial. Le § 1 pose la comparaison
factuelle, le § 2 en tire un backlog priorisé, le § 3 fixe ce qui reste explicitement hors
périmètre et pourquoi. Le plan d'exécution détaillé et l'ordre des lots proposé sont dans
[`docs/ROADMAP.md`](ROADMAP.md).

---

## 1. Comparaison avec Finary

Recherche menée le 19/08/2026 (site officiel `finary.com`, avis indépendants récents :
primebanque.fr, outilsinvestisseur.fr, dealfluence.fr, Trustpilot). Finary est un agrégateur
patrimonial français (fondé en 2021), commercial (gratuit limité à 2-3 comptes synchronisés, puis
Lite ≈ 55 €/an, Plus ≈ 150 €/an ou 25 €/mois, Pro ≈ 350 €/an ; lancement en 2026 de « Finary Life »,
une assurance-vie coéditée avec BlackRock et Generali).

| Axe | Finary | Application Patrimoine (aujourd'hui) | Écart |
|---|---|---|---|
| Actions, ETF, crypto | Oui, synchronisé automatiquement | Oui — via import du grand livre + `yfinance`/justETF | Équivalent en couverture, écart sur l'automatisation (§ 2.E) |
| Immobilier | Oui, valorisation automatique estimée | Valorisation manuelle (`valeur_estimee`), livré le 19/08/2026 | Traité (§ 2.A.1) — pas de valorisation automatique (aucune source gratuite fiable) |
| SCPI, assurance-vie, PER | Oui, synchronisé | Valorisation manuelle, livré le 19/08/2026 | Traité (§ 2.A.2) |
| Métaux précieux | Oui | Partiel (via ETF/ETC or, ex. `IE00B4ND3602`) | Cas générique manquant (§ 2.A) |
| Actifs alternatifs (art, montres, voitures, private equity) | Oui | Private Equity suivi (coût de revient) ; catégorie « Autre actif » livrée le 19/08/2026 pour le reste (objets de valeur, métaux physiques, parts non cotées) | Traité (§ 2.A.4) |
| Dettes / emprunts | Oui | Livré le 19/08/2026 : capital restant dû calculé (amortissement à taux fixe) ou recalé manuellement | Traité (§ 2.A.3) — patrimoine net = actifs − passifs |
| Synchronisation bancaire automatique | Oui, 10 000-20 000 établissements (Powens/Budget Insight, Plaid) | Non — import CSV du grand livre de transactions | Écart structurel, coût commercial (§ 2.E, § 3) |
| Répartition géo/sectorielle | Oui, par pays/secteur/segment | Oui — look-through justETF + yfinance, déjà audité (Increment 8/9) | Équivalent, voire plus transparent (qualité des données affichée explicitement) |
| Score de diversification | Oui (plan payant) | Oui, déjà gratuit chez nous | Déjà en avance |
| Calendrier des dividendes | Oui (reçus/confirmés/projetés, plan payant) | Dividendes perçus déjà suivis, pas de vue calendrier/projection | Nouveau (§ 2.C) |
| Projection patrimoniale (« Predict »expr) / indépendance financière | Oui, jusqu'à 30 ans (plan Plus) | Livré le 19/08/2026, gratuit : horizon jusqu'à 60 ans, calcul FIRE avec taux de retrait réglable | Traité (§ 2.B) — déjà en avance sur l'horizon |
| Scanner de frais | Oui (frais de gestion, transaction, change) | TER des fonds déjà suivi, pas de vue consolidée | Nouveau (§ 2.E) |
| Budget / catégorisation des dépenses | Oui, IA (plan Plus) | Exclu par design (increment 5 : hors suivi boursier) | Décision de scope à trancher (§ 2.F) |
| Rapport mensuel / export PDF patrimoine | Oui (plan Plus) | Export CSV seul (positions, transactions, rentabilité) | Nouveau (§ 2.D) |
| Application mobile | Oui, iOS/Android natif | Web responsive uniquement | Nouveau (§ 2.H) |
| Multi-utilisateur / partage familial | Implicite (compte utilisateur) | Non — mono-utilisateur local, sans authentification | Nouveau, nécessite de rouvrir § 7.7 (§ 2.G) |
| Communauté / classement des investissements | Oui | Non prévu | Hors périmètre assumé (§ 3) — pas de base d'utilisateurs |
| Confidentialité des données | Cloud Finary, chiffré (AES-256/SHA-256), lecture seule, régulé AMF | 100 % local, aucune donnée envoyée à un tiers hors requêtes de cotation (yfinance/justETF) | **Avantage structurel** déjà acquis, à mettre en avant plutôt qu'à combler |
| Limites connues chez Finary (avis 2026) | Bugs de synchronisation (~61 % des avis négatifs, ex. Trade Republic), pas de métriques boursières avancées (TWR, Sharpe, bêta), pas d'analyse fondamentale, pas de backtesting, tarif jugé élevé | — | Axes de différenciation possibles si on les traite bien (§ 2.B, roadmap) |

Sources consultées : [finary.com/en/app](https://finary.com/en/app),
[finary.com/en/wealth-tracking](https://finary.com/en/wealth-tracking),
[Avis Finary — outilsinvestisseur.fr](https://outilsinvestisseur.fr/finary-avis/),
[Finary 2026 — primebanque.fr](https://www.primebanque.fr/finary/),
recherche d'avis négatifs 2026 (Trustpilot ≈ 3,9/5, Google ≈ 4,2/5 fin avril 2026).

---

## 2. Backlog priorisé

Même convention que l'ancien backlog (archivé) : **sévérité** (`majeur` fonctionnalité structurante
· `mineur` confort) · **effort** (`S` < 1 h · `M` quelques heures · `L` chantier) · **état**
(`non traité` partout ici, c'est un backlog neuf) · **priorité** `P0`-`P3` (`P0` = fondation à faire
en premier, `P3` = confort différable). Le détail de séquencement (quel lot avant quel lot, et
pourquoi) est dans [`docs/ROADMAP.md`](ROADMAP.md) ; cette section liste et arbitre le contenu,
la roadmap l'ordonnance dans le temps.

### A. Nouveaux types d'actifs (fondation du reste)

#### A.1 — `majeur` · `L` · `P0` · `traité` — Immobilier

Nouveau `type_actif = "REAL_ESTATE"`. Saisie manuelle via `Holding.valeur_estimee` (montant absolu
en euros, `quantite` conventionnellement à 1) — `prix_revient_moyen` garde son sens habituel de
montant investi à l'origine, ce qui permet un vrai calcul de gain latent (contrairement à
`PRIVATE_FUND`, valorisé au coût faute d'alternative). Pas de valorisation automatique (aucune
source gratuite fiable identifiée pour de l'estimation immobilière à l'échelle d'un bien précis —
voir § 3). L'utilisateur met à jour la valeur manuellement depuis le Portefeuille (onglet
« Immobilier & Épargne »).

#### A.2 — `majeur` · `M` · `P0` · `traité` — SCPI, assurance-vie, PER

Trois nouveaux `type_actif` (`SCPI`, `LIFE_INSURANCE`, `PENSION`), même mécanisme que A.1
(`valeur_estimee`). Regroupés avec l'immobilier dans un même onglet Portefeuille plutôt que quatre
onglets séparés — leur mode de valorisation (manuel, périodique) est identique.

#### A.3 — `majeur` · `M` · `P0` · `traité` — Dettes et emprunts

Nouveau modèle `Loan` (libellé, capital initial, taux, mensualité, date de début, durée). Carte
dédiée « Dettes et emprunts » sous le tableau du Portefeuille (pas un onglet — un emprunt n'a ni
quantité ni prix, sa forme de données est trop différente d'un `Holding`). Le capital restant dû se
**soustrait** de la valeur totale du patrimoine (`services/patrimoine_service.py`) — premier vrai
passif de l'application, jusque-là entièrement composée d'actifs. Amortissement calculé par formule
standard à taux fixe (`services/loan_service.py`), avec recalage manuel prioritaire
(`capital_restant_du_manuel`) pour corriger une dérive réelle (remboursement anticipé...).

**Vérifié en conditions réelles** (19/08/2026) sur le vrai portefeuille de l'utilisateur : ligne
immobilière de test créée (200 000 € investis, 250 000 € estimés) → rendement depuis achat affiché
`+25,0 %`, correctement exclue du look-through géo/sectoriel et de la carte Rentabilité boursière
(`GET /api/analysis/2026` et `GET /api/performance` inchangés à l'euro près) ; emprunt de test créé
(150 000 €, 3,5 %/an, 800 €/mois, débuté en janvier 2020) → capital restant dû calculé à 117 847 €,
cohérent avec un amortissement de ~6,5 ans ; `GET /api/patrimoine/net` a alors renvoyé
actifs 260 999 € / passifs 117 847 € / net 143 152 € (= 260 999 − 117 847, exact), avec une
répartition par classe correctement triée par valeur décroissante. Les deux lignes de test ont
ensuite été supprimées, le patrimoine net réel de l'utilisateur revérifié inchangé (10 998,93 €).
378 tests backend (45 nouveaux) + 93 tests frontend (9 nouveaux), `tsc`/`oxlint`/`vite build`
propres.

**Incident détecté et corrigé pendant ce lot** (sans lien direct avec les nouvelles fonctionnalités,
mais découvert au premier redémarrage du backend après ces changements) : `app/database.py` choisit
la base SQLite à utiliser (`patrimoine.db` vs l'ancien nom `portfolio.db`) par simple test
d'existence de fichier — un `patrimoine.db` vide (schéma créé sans donnée, apparu on ne sait
comment plus tôt dans la session) suffisait à masquer silencieusement les 49 positions/4 059
transactions réelles de `portfolio.db`. Corrigé pour comparer le CONTENU des deux fichiers, pas
seulement leur présence (`_base_semble_vide`, cf. `docs/MANUEL_EXPLOITATION.md` § 4) ; verrouillé
par deux nouveaux tests. Aucune perte de données réelle (la vraie base n'a jamais été modifiée).

#### A.4 — `mineur` · `S` · `P1` · `traité` — Catégorie « autre actif » générique

Pour ce qui ne rentre dans aucune case (objets de valeur, métaux précieux physiques hors ETC, parts
d'entreprise non cotée hors Private Equity déjà suivi). `type_actif = "OTHER_ASSET"` avec libellé
libre et valorisation manuelle, exactement le même mécanisme que A.1/A.2 (`Holding.valeur_estimee`,
`TYPES_ACTIF_PATRIMOINE_MANUEL`) — aucune nouvelle mécanique, une seule constante ajoutée côté
backend a suffi à le brancher partout (exclusion du rafraîchissement des cours, du look-through
financier, patrimoine net). Regroupé dans le même onglet Portefeuille que A.1/A.2 (« Immobilier &
Épargne »), option « Autre actif » dans le formulaire.

### B. Projections et indépendance financière

#### B.1 — `majeur` · `M` · `P1` · `traité` — Simulateur de patrimoine (équivalent « Predict »)

Projection de la valeur du patrimoine à 5/10/20/30 ans, à partir d'hypothèses réglables (rendement
annuel moyen, épargne mensuelle ajoutée). Calcul pur (intérêts composés mensuels + apports réguliers),
aucune dépendance externe, projeté depuis le patrimoine net actuel
(`patrimoine_service.compute_patrimoine_net`). Nouvel écran Simulateur (`/simulateur`).

**Mise à jour du 20/08/2026 (fusion Simulateur/Outils)** : ce calcul, initialement côté backend
(`services/simulation_service.py`, endpoints `GET /api/patrimoine/{simulation,fire}`, recalcul
après un différé de 300 ms), a été déplacé côté client
(`frontend/src/utils/interetsComposes.ts`) au moment de fusionner l'écran Simulateur avec la page
Outils (calculateur d'intérêts composés à capital libre, ajoutée hors backlog à la demande de
l'utilisateur) : les deux ne différaient que par la source du capital de départ, jamais par le
calcul. Le patrimoine net actuel
reste lu une fois pour préremplir le capital de départ (seul appel réseau restant), mais reste
librement modifiable ; le backend `services/simulation_service.py` et ses endpoints, devenus
inutilisés, ont été retirés. Mise à jour instantanée à chaque changement d'hypothèse (plus de
différé réseau). Un **tableau de détail** (bascule Annuelle/Mensuelle : versements, intérêts,
capital, cumuls) a été ajouté à cette occasion.

#### B.2 — `majeur` · `S` · `P1` · `traité` — Indépendance financière (FIRE)

À partir d'une dépense annuelle cible saisie par l'utilisateur et d'un taux de retrait (4 % par
défaut, modifiable — le taux « règle des 4 % » est un choix méthodologique documenté, pas une vérité
universelle, présenté comme tel à l'écran), calcule le patrimoine nécessaire et, avec le même moteur
que B.1, le délai estimé pour l'atteindre. `Non atteinte` au-delà de 60 ans de projection plutôt
qu'un nombre trompeur.

**Vérifié en conditions réelles** (19/08-20/08/2026) sur le vrai patrimoine net de l'utilisateur
(10 998,93 €) : projection à 5 ans/5 %/200 €-mois → 27 716,79 € (formule fermée de capitalisation
avec versements recoupée à la main, écart < 1 centime) ; FIRE à 30 000 €/an, taux 4 % → patrimoine
nécessaire 750 000 € (= 30000 / 0.04, exact), délai estimé 52,2 ans à épargne nulle, 22 ans à
1 500 €/mois — cohérent, testé en direct dans le navigateur. 12 tests unitaires sur
`simulation_service.py` (backend, à l'origine) verrouillaient chaque formule par un calcul fermé
indépendant de la boucle implémentée (référence externe, pas juste "le code confirme le code") ;
depuis la fusion du 20/08/2026, ces mêmes scénarios de référence sont repris à l'identique côté
client dans `interetsComposes.test.ts`. 395 tests backend (+17) + 101 tests frontend (+8),
`tsc`/`oxlint`/`vite build` propres au moment de la livraison initiale.

### C. Dividendes et revenus

#### C.1 — `mineur` · `S` · `P2` · `traité` — Calendrier des dividendes perçus

Vue chronologique des dividendes déjà perçus (donnée déjà en base via les transactions
`CASH/DIVIDEND`), groupée par mois — aucune nouvelle donnée à récupérer, juste une nouvelle vue sur
l'existant. Nouveau `performance_service.compute_dividend_calendar` (regroupement par
`Transaction.date[:7]`, montant net `amount + fee + tax`, même convention algébrique que
`compute_performance`), exposé via `GET /api/performance/dividendes`. Nouvel écran `/dividendes`
(barre chronologique + détail dépliable par mois).

**Vérifié en conditions réelles** (20/08/2026) sur le vrai historique de transactions : total perçu
21,71 € sur 29 mois (mars 2024 → août 2026), détail d'un mois déplié montrant les vraies lignes
(Visa, Johnson & Johnson, Microsoft, Qualcomm, Nintendo pour juin 2025). Tests dans
`test_performance_service.py`, build frontend propre.

#### C.2 — `mineur` · `M` · `P2` · `non traité` — Projection des dividendes à 12 mois

Plus délicat : extrapoler les dividendes futurs suppose de connaître la régularité de versement de
chaque ligne (annuel, trimestriel...) et le montant par part, que `yfinance` expose partiellement
(`dividendRate`, historique de dividendes par ticker) mais pas pour les ETF de façon fiable. À
cadrer avant de s'engager : projection **approximative**, affichée comme telle (même philosophie que
la qualité des données géographiques déjà en place), pas une promesse de montant exact.

**Non traité le 20/08/2026** (volontairement, pas oublié) : en implémentant C.1/D.1/D.2/E.3/H.1 dans
la même session, ce point a été délibérément écarté — la fiabilité insuffisante de `dividendRate`
pour les ETF (déjà signalée ci-dessus) entre en tension directe avec l'exigence de l'application de
ne jamais afficher un chiffre financier dont la fiabilité n'est pas établie. Reste à cadrer avec
l'utilisateur avant tout développement (quelle marge d'erreur est acceptable, comment l'afficher).

### D. Rapports et exports

#### D.1 — `mineur` · `M` · `P2` · `traité` — Relevé de patrimoine PDF

Export d'une photographie du patrimoine à une date donnée (répartition par classe d'actif, par
compte, gains/pertes) en PDF mis en forme — au-delà des trois CSV déjà exportables. Génération
côté backend (`reportlab`, ajouté à `requirements.txt`), nouveau `services/pdf_export_service.py` :
ne calcule rien lui-même, réutilise telles quelles `patrimoine_service.compute_patrimoine_net`,
`performance_service.compute_performance` et `analysis_service.{holdings_financiers,
value_holdings, repartition_par_compte}` — pure mise en forme. Nouvel endpoint
`GET /api/export/patrimoine.pdf`, bouton dédié sur `/reglages` à côté des exports CSV existants.

**Vérifié** : 6 tests (`test_pdf_export_service.py`, extraction du texte réel du PDF via `pypdf`
plutôt qu'un simple "ne plante pas" — présence/absence des sections selon les données, montants en
euros avec séparateur de milliers). `pypdf` ajouté à `requirements-dev.txt` (vérification seulement,
jamais utilisé en production).

#### D.2 — `mineur` · `S` · `P3` · `traité` — Rapport périodique consultable

Équivalent du « rapport mensuel » Finary, mais sans envoi (l'application n'a pas de serveur mail) :
une page récapitulative d'une période écoulée (évolution, plus gros mouvements, dividendes perçus),
générée à la demande plutôt que poussée automatiquement. Nouveau `services/rapport_service.py`
(`compute_rapport_periode`) : réutilise `historical_performance_service.compute_portfolio_history`
(déjà mis en cache 24h) pour l'évolution, interroge directement `Transaction` pour les mouvements et
les dividendes de la période — aucun nouveau calcul de fond.

**Mise à jour du 20/08/2026 (rapport annuel + période personnalisée)** : à la demande de
l'utilisateur, étendu au-delà du seul mensuel. Plutôt qu'une fonction par granularité, un seul moteur
générique sur une période arbitraire (`compute_rapport_periode(db, date_debut, date_fin)`,
bornes `AAAA-MM-JJ` inclusives) : `GET /api/performance/rapport?date_debut=&date_fin=` remplace
l'ancien `?annee=&mois=`. L'écran `/rapport` gagne un sélecteur de mode (Mensuel/Annuel/Personnalisé)
qui calcule les bornes correspondantes côté client avant d'appeler ce même endpoint — le mensuel et
l'annuel ne sont donc que des raccourcis, sans code dupliqué. Validation (date de fin ≥ date de
début) à la fois côté serveur (400) et côté écran (avant même d'émettre la requête).

**Vérifié en conditions réelles** (20/08/2026) : mensuel (août 2026) → 10 961 € en fin de mois,
+5,8 %, 0,14 € de dividendes ; annuel (2026) → +65,2 % depuis le 1er janvier, 12,49 € de dividendes ;
personnalisé (01/01/2026 au 20/08/2026, période quasi identique à l'annuel) → mêmes chiffres,
confirmant la cohérence entre les trois modes. 7 tests backend (`test_rapport_service.py`) + 8 tests
frontend (`RapportPage.test.tsx`).

### E. Agrégation, import et frais

#### E.1 — `mineur` · `M` · `P2` · `non traité` — Élargir les formats de courtier reconnus

Le format Trade Republic est reconnu automatiquement ; d'autres courtiers (Boursorama, Degiro,
Interactive Brokers...) devraient passer par le mapping manuel déjà existant pour un relevé de
positions, mais pas par la reconstruction depuis un grand livre de transactions (réservée au format
Trade Republic). Ajouter la détection automatique d'un second ou troisième format d'export courant
élargirait qui peut utiliser l'application sans y toucher.

**Bloqué (20/08/2026)** : aucun fichier d'export réel d'un autre courtier n'est disponible pour ce
travail. Écrire un détecteur de format et un mapping de colonnes sans un vrai fichier de référence
reviendrait à deviner un schéma pour une donnée financière personnelle — risque de mal interpréter
silencieusement de vraies transactions d'un futur utilisateur. À reprendre dès qu'un export réel
(Boursorama, Degiro ou IBKR) est disponible pour servir de référence.

#### E.2 — `mineur` · `L` · `P3` · `non traité` — Explorer une agrégation bancaire gratuite (à valider, non engagé)

Recherché le 19/08/2026 : l'API gratuite historique du secteur (GoCardless Bank Account Data, ex
Nordigen) est **fermée aux nouveaux inscrits depuis juillet 2025** et sa documentation disparaît le
24/08/2026 — plus une option. La piste la plus proche identifiée est **Enable Banking**, qui propose
un accès « Restricted Production » gratuit pour lier **ses propres comptes** (2 700+ banques dans
30 pays européens), mais les conditions exactes (obligation ou non d'un enregistrement
réglementaire type AISP, même pour un usage strictement personnel) n'ont pas pu être confirmées
depuis leur documentation publique. **Ne pas engager de développement avant d'avoir un retour écrit
clair de leur part sur le statut réglementaire d'un usage personnel non commercial.** Ce point reste
une piste à instruire, pas un engagement — cohérent avec la prudence déjà appliquée pour justETF
(§ 2.4 de l'audit archivé).

#### E.3 — `mineur` · `S` · `P2` · `traité` — Coût total annualisé consolidé

Le TER de chaque fonds est déjà récupéré (`fetch_holding_extra_info`, pas mis en cache) ; un
indicateur consolidé (coût de gestion annuel total en euros, pondéré par la valeur de chaque ligne)
donnerait une vue immédiate du "combien ça coûte de détenir ce portefeuille" — sur le modèle du
scanner de frais Finary, mais sans les frais bancaires (que nous n'avons pas).

Nouvelle colonne `MarketDataCache.frais_gestion_pct` (additive, couverte par
`run_startup_migrations`), peuplée **une seule fois par ticker FUND** par
`market_data_service.fetch_frais_gestion` — appelée depuis `refresh_tickers` uniquement tant que la
colonne vaut `None` pour ce ticker, donc sans jamais ralentir les rafraîchissements suivants (même
principe que le reste du cache de marché). Nouvelle fonction
`analysis_service.compute_cout_gestion_consolide` (coût annuel estimé + `couverture_pct`, honnête
sur la part de la valeur des fonds pour laquelle un TER est réellement connu — même philosophie que
`compute_data_quality`). `GET /api/analysis/cout-gestion`, nouvelle carte sur le tableau de bord.

**Vérifié en conditions réelles** (20/08/2026) : carte affichée sur le vrai portefeuille avec l'état
honnête « 0 % de couverture » (aucun rafraîchissement n'a encore mis en cache les TER depuis la
livraison de cette fonctionnalité) — comportement attendu, la couverture montera au fil des
rafraîchissements. 7 tests backend (`test_market_data_service.py`, `test_analysis_service.py`) + 2
tests frontend (`CoutGestionCard.test.tsx`).

### F. Budget (décision de scope, pas juste une fonctionnalité)

#### F.1 — `majeur` · `L` · `P3` · `non traité` — Suivi des dépenses du quotidien (optionnel)

L'application exclut aujourd'hui **volontairement** les mouvements hors bourse (increment 5 :
virements bancaires, carte) — décision prise pour recentrer l'app sur le suivi boursier pur. Un
module Budget à la Finary réintroduirait ces données. **À trancher avec l'utilisateur avant tout
développement** : soit un écran strictement séparé et optionnel (import distinct, jamais mélangé
aux calculs de performance boursière existants), soit un non-objectif assumé (comme la fiscalité
PEA) si le suivi boursier doit rester le seul périmètre. Ne pas commencer sans cette décision — le
risque est de rouvrir une frontière posée délibérément lors de l'increment 5.

### G. Multi-utilisateur et partage

#### G.1 — `mineur` · `L` · `P3` · `non traité` — Partage en lecture seule (conjoint, famille)

Nécessite de rouvrir l'authentification (§ 3, actuellement hors périmètre tant que l'app reste
mono-utilisateur locale). Pas de valeur sans décision préalable sur le multi-utilisateur — à ne
considérer que si l'usage de l'application dépasse un seul foyer/personne. Le détail technique de ce
que ça impliquerait (quelles tables, quels modules, dans quel ordre) est posé en § 2.I.1, suite à
l'audit structurel du 20/08/2026.

### H. Qualité de vie et accès mobile

#### H.1 — `mineur` · `M` · `P2` · `traité` — Application installable (PWA)

Rendre le frontend installable comme une application (icône, plein écran, fonctionne hors ligne
pour les données déjà chargées) via un manifest + service worker — gratuit, pas de store, pas de
build natif à maintenir. Se rapproche de l'usage mobile de Finary sans le coût d'une vraie
application native.

`vite-plugin-pwa` (Workbox) plutôt qu'un service worker écrit à la main — la mise en cache maison est
un piège classique (versions périmées servies indéfiniment) que Workbox gère correctement de série.
`/api/*` explicitement exclu du cache (`navigateFallbackDenylist`) : les données financières
affichées doivent toujours venir du backend en direct, jamais d'une réponse figée hors-ligne — seuls
les fichiers statiques du build (JS/CSS/icônes) sont mis en cache. Icônes (192/512/maskable/
apple-touch-icon) générées depuis le logo SVG existant (`public/favicon.svg`, rendu en PNG via un
canvas navigateur) plutôt qu'ajoutées à la main. Nouvelle config `frontend-preview`
(`.claude/launch.json`, `vite preview` sur le port 4173) pour vérifier le service worker généré
contre un vrai build de production.

**Vérifié en conditions réelles** (20/08/2026) : build de production servi via `vite preview`,
`navigator.serviceWorker.getRegistrations()` confirme l'enregistrement, manifeste chargé avec les 3
icônes et les bons champs (`theme_color`, `display: standalone`...), page fonctionnelle contre le
vrai backend à travers le service worker actif.

### I. Structure du code et dette technique (audit du 20/08/2026)

Audit demandé par l'utilisateur le 20/08/2026, motivé explicitement par une envie de faire du
multi-utilisateur *plus tard* : « auditer tout le code et voir ce qui est améliorable au niveau de
la structure ». Méthode : lecture complète de `models.py`, `database.py`, `main.py`,
`scheduler_service.py`, `market_data_service.py`, `preferences_service.py`, revue des tailles de
fichiers (`wc -l` sur tout `backend/app` et `frontend/src`), `oxlint` (frontend, propre). Pas de
`pyflakes`/`ruff` disponible dans cet environnement pour une détection automatisée du code mort
côté backend — revue manuelle des imports des services les plus volumineux, rien d'évident trouvé
au-delà de ce qui a déjà été nettoyé (l'import `ForeignKey` inutilisé de `models.py` et
`analysis_service.breakdown_by`, tous deux déjà retirés, cf. audit archivé).

#### I.1 — `majeur` · `L` · `traité (Milestones 1, 2a et 2b)` — Ce qu'impliquerait un vrai multi-utilisateur (détail de G.1)

L'application est explicitement conçue comme « 100 % locale, sans authentification »
(`backend/app/main.py`, docstring de module) — ce n'est pas un oubli, c'est un choix assumé et
documenté (§ 3). L'audit confirme que cette hypothèse est câblée à quatre niveaux différents, pas
un seul :

- **Schéma de données** : aucune des 12 tables (`Holding`, `Loan`, `MarketDataCache`,
  `AllocationTarget`, `Transaction`, `TickerResolution`, `FundComposition`,
  `FundCompositionBrute`, `FundTopHolding`, `HistoriqueCache`, `ScheduledJobConfig`, `Parametre`)
  ne porte de colonne `user_id`/tenant. Toutes les requêtes de tous les routers/services supposent
  un unique jeu de données global — ajouter la colonne ne suffit pas, chaque `db.query(...)` de
  chaque service devrait être revu pour filtrer par utilisateur courant.
- **Connexion base de données** (`database.py`) : `engine`/`SessionLocal` sont calculés une seule
  fois au chargement du module, contre un unique fichier SQLite (`patrimoine.db`, ou son
  prédécesseur `portfolio.db` — cf. l'incident de sélection de base couvert en § 2.A.3). Aucune
  notion de connexion par utilisateur.
- **Authentification** : totalement absente — pas de session, pas de JWT, pas d'écran de connexion,
  nulle part dans `main.py` ou les routers. Le CORS est verrouillé sur `localhost:5173`/
  `127.0.0.1:5173` avec `allow_credentials=False` : même le mécanisme de cookie de session
  qu'exigerait une authentification n'est pas activable tel quel aujourd'hui.
- **Réglages et état d'exécution** : `preferences_service.py`/`Parametre` stocke des réglages
  globaux (méthode de coût de revient, seuil d'alerte) — un seul jeu de réglages pour toute
  l'application. `scheduler_service.py`/`market_data_service.py` vont plus loin : l'état
  d'avancement d'un rafraîchissement (`market_data_service._etat`, `_thread_courant`,
  `_dernier_rafraichissement_manuel`) est un singleton au niveau module — un seul rafraîchissement
  peut être en cours à la fois, pour tout le monde, sur toutes les positions confondues. Le job
  planifié (`ScheduledJobConfig`, clé `job_key`) n'a aucune notion d'itération par utilisateur non
  plus.

Point notable, plutôt favorable : le cache de marché (`MarketDataCache`, `TickerResolution`,
`FundComposition`/`FundCompositionBrute`/`FundTopHolding`) est déjà keyé par ticker et non par
position — c'est un atout pour un futur multi-utilisateur bien conçu (deux utilisateurs détenant le
même ETF n'auraient pas besoin de deux rafraîchissements) *à condition* qu'il reste global pendant
que `Holding`/`Loan`/`Transaction`/`AllocationTarget`/`Parametre` deviennent scopés par utilisateur.

Ce qu'il faudrait construire, dans l'ordre logique de dépendance (aucun de ces points n'a de sens
isolément) :

1. ✓ **Traité le 20/08/2026 (Milestone 1)** — Une table `User` + une vraie couche d'authentification
   (mot de passe hashé ou OAuth) — c'était le préalable bloquant déjà identifié en § 3, confirmé ici
   comme le point de départ obligé.
2. `user_id` (FK) sur `Holding`, `Loan`, `AllocationTarget`, `Transaction`, `Parametre` (et une
   déclinaison par utilisateur de `ScheduledJobConfig`), avec une revue systématique de chaque
   requête de chaque router/service pour y appliquer le filtre — pas un simple ajout de colonne.
3. Garder `MarketDataCache`/`TickerResolution`/`FundComposition*`/`FundTopHolding`/
   `HistoriqueCache` globaux et partagés (cf. point notable ci-dessus).
4. Une décision d'architecture explicite : SQLite unique partagé avec filtrage applicatif
   systématique (risque : une requête oubliée fait fuiter les données d'un autre utilisateur) vs un
   fichier SQLite par utilisateur (le mécanisme de sélection de fichier existe déjà dans
   `database.py` via `_chemin_base_par_defaut`, mais devrait passer d'un choix pris une fois au
   démarrage du process à un choix pris par requête HTTP — changement structurel de `database.py`,
   pas cosmétique).
5. Refonte de `scheduler_service.py`/`market_data_service.py` : itérer sur tous les utilisateurs à
   chaque exécution du job, ou un job par utilisateur — dans les deux cas l'état singleton actuel
   doit devenir par-utilisateur.
6. Côté frontend : `api/client.ts` fait aujourd'hui un simple `fetch('/api...')` sans en-tête
   d'authentification — un écran de connexion et un garde de route seraient à ajouter.

**Milestone 1 livré et vérifié le 20/08/2026** : point 1 ci-dessus traité — table `User` +
`AuthToken` (jeton opaque, `secrets.token_hex(32)`, 30 jours, révocable par simple `DELETE` — pas de
JWT, pas de secret de signature à gérer), mot de passe haché via `hashlib.pbkdf2_hmac` de la
bibliothèque standard (pas de nouvelle dépendance, cohérent avec `html.parser`/`bisect` déjà choisis
ailleurs dans ce projet plutôt que `lxml`/une lib de recherche). Nouveau module `backend/app/auth.py`
(`get_current_user`), routeur `backend/app/routers/auth.py` (`register`/`login`/`logout`/`me`,
inscription ouverte — application encore strictement locale). Toutes les routes existantes protégées
d'un coup via `app.include_router(..., dependencies=[Depends(get_current_user)])` dans `main.py`
plutôt qu'en touchant chaque endpoint (aucun n'a encore besoin de savoir *qui* est connecté tant que
rien n'est scopé — cf. point 2, toujours à faire). Frontend : `contexts/AuthContext.tsx` +
`hooks/useAuth.ts`, jeton en `localStorage` transporté en en-tête `Authorization: Bearer` (pas de
cookie, CORS `allow_credentials` reste `False`), `pages/LoginPage.tsx` (connexion/inscription dans un
seul écran), `App.tsx` gate tout le contenu tant que non connecté. 22 nouveaux tests backend
(`test_auth_service.py`, `test_auth_router.py`, dont la vérification explicite qu'une route
existante quelconque exige désormais un jeton) + 4 nouveaux tests frontend, **les ~400 tests
existants n'ont nécessité AUCUNE modification** grâce à un `dependency_overrides[get_current_user]`
posé dans la fixture `client` de `conftest.py`. Vérifié en conditions réelles : compte créé depuis
l'écran de connexion, patrimoine net réel (10 999 €) et les 49 positions réelles toujours visibles
une fois connecté (aucune perte de données), déconnexion → jeton effacé → tout appel API renvoie 401
→ reconnexion fonctionnelle.

**Complément du même jour** : connexion par **nom d'utilisateur** plutôt qu'email (`User.email` →
`User.username`, sans contrainte de format — un pseudo, pas une adresse email, plus adapté à une
appli locale entre quelques comptes d'un même foyer où rien n'a jamais dépendu du format email).
Avatar généré (initiale + couleur dérivée déterministiquement du nom, pas d'upload d'image) affiché
en haut à droite avec le nom d'utilisateur (`App.tsx`, composant `AvatarUtilisateur`) — cliquer
dessus déconnecte directement, sans menu intermédiaire. Un compte `demo`/`demo` a été créé
directement en base (en contournant volontairement la validation de longueur minimale du mot de
passe, réservée à l'inscription en libre-service) pour permettre une démonstration rapide sans
créer de compte personnel.

**Incident rencontré et corrigé pendant ce complément** : le rechargement à chaud (`uvicorn --reload`)
du backend s'est bloqué après une modification de `models.py` (log `WatchFiles detected changes...
Reloading...` jamais suivi de `Started server process`/`Application startup complete`) — le process
worker d'origine a continué à servir les requêtes avec l'ancien schéma (`email` requis) alors que le
code sur disque attendait déjà `username`, provoquant des `400 Bad Request` incompréhensibles au
premier abord. Diagnostiqué en comparant les PID/horodatages des process Python actifs
(`Get-Process python`) au dernier redémarrage loggé, confirmé par un `fetch` direct depuis la
console navigateur (contournant le frontend pour isoler le problème côté serveur). Résolu par un
redémarrage complet (kill + relance) plutôt que de faire confiance au rechargement à chaud après un
changement de modèle SQLAlchemy — accessoirement, ceci confirme qu'un changement de schéma est un
des cas où `--reload` n'est pas fiable, à garder en tête pour la suite (Milestone 2, qui va justement
beaucoup toucher aux modèles).

**Milestone 2a livré et vérifié le 20/08/2026** : point 2 traité pour `Holding`, `Loan`,
`AllocationTarget`, `Transaction` (`Parametre`/`ScheduledJobConfig` restent en Milestone 2b, cf.
ci-dessous) — chacune des 4 tables gagne une colonne `user_id` (FK), et chaque requête de chaque
router/service concerné (`portfolio.py`, `loans.py`, `targets.py`, `transactions.py`, `export.py`,
`analysis.py`, `portfolio_reconstruction.py`, `analysis_service.py`, `patrimoine_service.py`,
`performance_service.py`, `holding_detail_service.py`, `historical_performance_service.py`,
`rapport_service.py`) filtre désormais par `current_user.id`. Décision d'architecture (point 4,
validée avec l'utilisateur) : base SQLite unique partagée avec filtrage applicatif systématique,
plutôt qu'un fichier par utilisateur — jugé disproportionné à l'échelle d'un usage familial. Le cache
marché (`MarketDataCache`/`TickerResolution`/`FundComposition*`/`FundTopHolding`) reste global comme
prévu au point 3, avec un commentaire explicite à chaque site de requête non filtré pour ne pas le
« corriger » par erreur plus tard. Risques additionnels corrigés au passage : collision de ticker
entre deux utilisateurs (tout lookup par `ticker`/`symbol` filtre désormais aussi par `user_id`),
IDOR sur les endpoints update/delete par id (`db.get(...)` suivi d'une vérification de propriétaire,
404 — pas 403 — en cas de mismatch), dédoublonnage d'import de transactions devenu par-utilisateur
(`UniqueConstraint("transaction_id", "user_id")` plutôt qu'un identifiant unique global), et une fuite
de cache réelle trouvée pendant l'audit (`historique_cache.cle_historique_portefeuille()` était une
clé globale constante — le premier utilisateur à calculer son historique de portefeuille aurait vu sa
donnée servie à tous les autres pendant 24h ; devenue `cle_historique_portefeuille(user_id)`).

Migration de contenu (`database.migrate_isolation_utilisateur`, appelée une fois au démarrage) :
rattache toutes les lignes existantes (49 positions, 4059 transactions, 17 objectifs) au compte
`demo`, sur décision explicite de l'utilisateur le temps qu'un compte personnel soit créé. Incident
rencontré pendant le déploiement sur la vraie base : la fonction plantait
(`sqlite3.OperationalError: index ix_allocation_targets_annee already exists`) car sa détection
« déjà migré ? » ne consultait que `inspector.get_unique_constraints()`, alors que
`run_startup_migrations` (qui s'exécute juste avant) avait déjà créé la nouvelle contrainte via un
`CREATE UNIQUE INDEX` séparé — visible seulement via `inspector.get_indexes()`. Corrigé sur les deux
plans : la détection consulte désormais les deux, ET la condition de reconstruction a été inversée
pour se baser sur la présence de l'ANCIENNE contrainte à 3 colonnes plutôt que l'absence de la
nouvelle (sinon l'ancienne contrainte, plus restrictive, restait active en silence — verrouillé par
`test_migrations.py::test_migrate_isolation_utilisateur_autorise_deux_utilisateurs_sur_le_meme_objectif`,
qui échouait avant ce second correctif). `ALTER TABLE ... RENAME` ne renommant pas les index SQLite
existants, la fonction supprime aussi explicitement les index nommés de l'ancienne table avant de
recréer la nouvelle, pour éviter une collision de nom. Les 17 lignes d'objectifs, momentanément
bloquées dans une table intermédiaire suite au premier plantage, ont été récupérées manuellement sans
perte après correction. 442 tests backend au vert (dont 15 nouveaux dans
`test_isolation_utilisateurs.py`, un par endpoint scopé : liste/détail/update/delete croisés entre
deux comptes). Vérifié en conditions réelles : compte `demo` toujours au complet (49 positions, 4059
transactions, 17 objectifs) après migration ; un second compte de test créé de zéro démarre avec un
portefeuille strictement vide ; une position créée sur ce second compte n'apparaît jamais côté `demo`
et réciproquement.

**Milestone 2b livré et vérifié le 20/08/2026** : point 2 complété pour les deux réglages qui
restaient globaux (`methode_cout`, `seuil_alerte_ecart_pct`). Nouvelle table dédiée
`UserParametre`/`user_parametres` (clé composite `(cle, user_id)`) plutôt qu'un `user_id` nullable
ajouté à `Parametre` : `Parametre` ne garde qu'un seul réglage réellement global
(`version_calcul_portefeuille`, un marqueur de version du CODE de calcul et non une préférence —
mélanger les deux dans une même table aurait exigé une clé primaire avec `user_id` NULL pour les
lignes globales, plus confus qu'une seconde table pour un coût de migration identique : table neuve,
créée par `Base.metadata.create_all`, sans `ALTER TABLE`). `services/preferences_service.py` prend
désormais un `user_id` sur chaque accesseur ; `routers/settings.py` (`update_preferences`) et
`routers/analysis.py` (seuil d'alerte) le lisent depuis `current_user.id`. Effet de bord positif :
`update_preferences` ne boucle plus sur tous les comptes pour reconstruire le portefeuille au
changement de méthode de coût de revient — un changement ne touche plus que le compte qui l'a fait,
la boucle multi-compte du Milestone 2a n'était qu'un pis-aller le temps que ce point soit traité.

Audit du point 5 pendant ce Milestone : ni `startup_maintenance.reconstruire_si_regles_de_calcul_modifiees`
ni `scheduler_service.py` n'avaient en réalité besoin d'une redéfinition de leur portée.
`VERSION_CALCUL_PORTEFEUILLE` reste à raison un marqueur global (une évolution du CODE de calcul doit
recalculer TOUS les comptes, pas seulement un) — sa boucle sur tous les utilisateurs (posée au
Milestone 2a) est le comportement définitif, pas un compromis. Le scheduler
(`market_data_refresh`/`justetf_refresh`) opère sur le cache de marché, volontairement global (point
3) — il n'a jamais eu de portée par utilisateur à redéfinir. Le point 5 est donc considéré `traité`
sans changement de code supplémentaire.

Migration de contenu (`database.migrate_preferences_par_utilisateur`) : rattache les deux réglages
globaux existants (`fifo`/coût moyen pondéré, seuil d'alerte) au compte `demo`, même choix que
`migrate_isolation_utilisateur` au Milestone 2a. 5 nouveaux tests (3 de migration dans
`test_migrations.py`, 2 d'isolation croisée entre deux comptes dans
`test_isolation_utilisateurs.py`, dont un qui verrouille explicitement qu'un changement de méthode
ne reconstruit plus que le portefeuille de son auteur). 448 tests backend au vert. Vérifié en
conditions réelles : préférences du compte `demo` inchangées après migration (coût moyen pondéré,
seuil 5,0 — les valeurs déjà en place) ; un second compte réglé sur FIFO/12,0 n'affecte ni ne lit les
préférences de `demo`, dans les deux sens.

Point 6 (garde frontend) reste `non traité`, de portée mineure : `api/client.ts` gère déjà le jeton
et les 401, mais aucune redirection dédiée n'a été revue pour un contexte réellement multi-compte
au-delà de `demo`/un compte de test — à reprendre si l'usage dépasse effectivement un seul compte
actif à la fois.

#### I.2 — `mineur` · `M` · `P3` · `traité` — `market_data_service.py` devenu un fichier fourre-tout

632 lignes (le plus gros fichier du backend) : résolution de ticker, récupération de prix
(`yfinance`), repli de composition ETF, TER, et l'état de rafraîchissement asynchrone (thread +
verrou) cohabitaient dans un seul module.

Scindé en deux : `market_data_service.py` (449 lignes) garde tout ce qui concerne *comment* obtenir
un prix/une composition (résolution de ticker, `fetch_one`, `fetch_fund_composition`,
`refresh_tickers`...) ; le nouveau `market_data_refresh.py` (210 lignes) prend tout ce qui concerne
*quand*/*combien de fois* on a le droit de le faire tourner (garde-fou de fréquence manuel, état de
rafraîchissement en tâche de fond, `EtatRafraichissement`, `demarrer_rafraichissement`). Point
d'attention traité correctement : `market_data_refresh` appelle `market_data_service.refresh_tickers`
via l'attribut du module (pas un `from ... import refresh_tickers` direct), pour que les tests qui
monkeypatchent `market_data_service.refresh_tickers` continuent à intercepter l'appel réel — sans
cette précaution le split aurait cassé une dizaine de tests silencieusement à l'exécution plutôt
qu'à la relecture. Les routers (`market_data.py`, `settings.py`) et `scheduler_service.py` ont été
mis à jour en conséquence.

**Vérifié** : suite backend complète relancée après le split (400/400, aucune régression).

#### I.3 — `mineur` · `S` · `P3` · `traité` — `PortefeuillePage.tsx` (680 lignes) concentrait trop de responsabilités

Tableau des positions, filtres par catégorie, tri, édition en ligne et navigation vers la fiche
détail dans un seul composant. Aucune duplication détectée (contrairement à l'ancien souci
`formatEuro`/`formatPct`, déjà corrigé lors de l'Increment 7 via `utils/format.ts`) — juste une
taille qui gênait la lecture.

Scindé en trois : `utils/holdingCategories.ts` (84 lignes, pur — catégorisation, filtre par compte,
fraîcheur des cours) ; `components/PositionsTable.tsx` (323 lignes — le tableau trié, l'édition en
ligne, et leur état local) ; `pages/PortefeuillePage.tsx` (306 lignes — orchestration : chargement,
formulaire d'ajout, onglets, modale de suppression). Aucun changement de balisage HTML ni de
comportement : chaque bloc de JSX a été déplacé tel quel, avec des callbacks (`onSelectTicker`,
`onRequestDelete`, `onSaved`) pour les besoins qui restent au niveau de la page (modale de
suppression, ouverture de la fiche détail).

**Vérifié** : `tsc -b --noEmit` et `oxlint` propres, suite frontend complète au vert (140/140,
dont les 13 tests de `PortefeuillePage.test.tsx` inchangés), `vite build` propre, et contrôle visuel
dans le navigateur sur le vrai portefeuille (49 positions) : filtre par catégorie (Crypto → 2
positions, 305,23 €), tri par colonne (Valeur ↑), édition en ligne (Modifier/Annuler) et modale de
suppression (BTC, annulée) tous fonctionnels sans régression.

#### I.4 — `mineur` · `S` · `P2` · `non traité` — Migration de schéma limitée à l'ajout de colonnes

`database.run_startup_migrations` ajoute des colonnes nullable de façon idempotente
(`ALTER TABLE ... ADD COLUMN`), mais ne sait ni renommer une colonne, ni changer un type, ni
exécuter une migration de données complexe — ce qui a déjà nécessité des scripts one-off manuels
par le passé (ex. `migrate_rename_categorie_autres`). Ce point notait que ce serait « un vrai
risque » si le multi-utilisateur (§ 2.I.1) imposait un jour une migration de données par utilisateur
existant — c'est exactement ce qui s'est produit au Milestone 2a : `migrate_isolation_utilisateur`
a dû reconstruire `allocation_targets` à la main (renommer/recréer/recopier/supprimer, cf. détail
Milestone 2a ci-dessus) et un bug de détection a fait planter le démarrage sur la vraie base avant
d'être corrigé. Le risque prédit ici s'est donc concrètement matérialisé, pas juste en théorie.
Reste `non traité` : adopter un vrai outil de migration (Alembic) est une décision d'architecture à
part entière (nouvelle dépendance, nouveau paradigme de migration versionnée) — à proposer
explicitement plutôt qu'à engager en marge d'un autre lot, mais désormais avec un incident réel à
l'appui plutôt qu'une hypothèse.

#### I.5 — `mineur` · `S` · `P3` · `traité` — Tests sur l'isolation des données entre utilisateurs

Livré avec le Milestone 2a et complété au 2b : `tests/test_isolation_utilisateurs.py` (17 tests) —
un test par endpoint/mécanisme scopé par utilisateur (holdings liste/détail/update/delete, même
ticker chez deux comptes, emprunts, objectifs, export CSV, dédoublonnage d'import, reconstruction,
patrimoine net, performance, préférences et leur effet sur la reconstruction), chacun créant une
ligne pour le compte A puis vérifiant que le compte B ne la voit, ne la modifie ni ne la supprime.
Complété par des tests de migration dédiés dans `test_migrations.py` qui rejouent la séquence exacte
rencontrée en conditions réelles (`run_startup_migrations` puis `migrate_isolation_utilisateur`/
`migrate_preferences_par_utilisateur` sur un schéma pré-2a/2b simulé).

---

## 3. Hors périmètre (assumé)

- **Fiscalité PEA** (ex-§ 5.7 de l'audit archivé) : inchangé, l'application reste un outil de suivi
  de performance, pas un simulateur fiscal.
- **Authentification** (ex-§ 7.7) : reste hors périmètre tant que l'usage est mono-utilisateur et
  local. Redeviendrait un **préalable bloquant** (pas un point de confort) si le multi-utilisateur
  (§ 2.G) est un jour retenu — à rouvrir explicitement à ce moment-là, pas avant. Détail technique
  de ce que ça impliquerait dans le code actuel : § 2.I.1 (audit structurel du 20/08/2026).
- **Agrégation bancaire automatique façon Finary** (Powens/Budget Insight, Plaid) : hors de portée
  d'un projet gratuit et open source — ce sont des contrats commerciaux B2B avec coût par compte
  connecté, incompatibles avec l'objectif « gratuit ». L'alternative gratuite potentielle (Enable
  Banking) est une piste à instruire, pas un engagement (§ 2.E.2).
- **Trading et produits de rendement crypto intégrés** (achat/vente in-app, APY crypto) : hors
  philosophie du produit, qui reste un outil de **suivi**, jamais d'exécution d'ordres — cohérent
  avec l'interdiction déjà en place d'agir sur les comptes de l'utilisateur.
- **Fonctionnalités communautaires** (classement d'investissements, forum) : sans objet pour une
  application locale mono-utilisateur, pas de base d'utilisateurs à comparer.

---

## 4. Priorisation d'ensemble

Ordre proposé, du plus fondateur au plus différable — le détail (pourquoi cet ordre, ce que chaque
lot débloque) est dans [`docs/ROADMAP.md`](ROADMAP.md) :

1. **P0 — Fondation patrimoine net** : A.1 (immobilier), A.2 (SCPI/assurance-vie/PER), A.3 (dettes).
   **Livré et vérifié le 19/08/2026** (cf. le détail dans chaque point ci-dessus). Rien du reste
   (projections, rapports) n'avait de sens tant que le patrimoine affiché n'incluait pas l'essentiel
   de ce qu'un ménage possède réellement — c'est désormais le cas.
2. **P1 — Ce que le patrimoine permet** : B.1 (simulateur), B.2 (FIRE), A.4 (catégorie libre).
   **Livré et vérifié le 19-20/08/2026** (cf. le détail dans chaque point ci-dessus).
3. **P2 — Confort et transparence** : C.1 (calendrier dividendes), D.1 (PDF), E.3 (coût consolidé),
   H.1 (PWA). **Livré et vérifié le 20/08/2026** (cf. le détail dans chaque point ci-dessus). E.1
   (formats courtier) reste seul non traité dans ce lot, bloqué faute d'un fichier d'export réel
   d'un autre courtier — pas une question de temps ou de priorité.
4. **P3 — Chantiers plus lourds ou à trancher d'abord** : D.2 (rapport périodique) a été **livré et
   vérifié le 20/08/2026** en même temps que le lot P2 ci-dessus (spécification suffisamment claire,
   aucune décision préalable requise). Restent non traités : C.2 (projection dividendes, écartée le
   20/08/2026 pour cause de fiabilité insuffisante des données sources), E.2 (agrégation bancaire, à
   instruire avant tout code), F.1 (budget, décision de scope préalable), G.1 (partage, dépend de
   l'authentification) — les quatre pour la même raison structurelle : chacun nécessite une décision
   ou une confirmation externe qu'aucune session de développement ne peut prendre à la place de
   l'utilisateur.

---

## 5. Méthode de vérification de clôture de l'ancien audit (19/08/2026)

Avant d'archiver l'ancien backlog et d'écrire celui-ci, vérification par sondage plutôt que relecture
exhaustive des 55 points (la majorité a été traitée directement au fil de cette session, avec preuve
à l'écran à chaque fois) : contrôle du code source pour les points les plus susceptibles d'une
régression silencieuse — `lazy="selectin"` toujours présent (`models.py`, § 4.1 archivé),
recherche dichotomique (`bisect.bisect_right`) toujours en place dans `historical_performance_service.py`
(§ 4.6 archivé), rafraîchissement toujours renvoyé en 202/asynchrone (`routers/market_data.py`, § 3.7
archivé), script `backend/scripts/sauvegarde.py` toujours présent (§ 7.6 archivé), dépôt git avec
historique de commits (§ 7.2 archivé). Suite de tests complète relancée et vérifiée au vert (333
backend, 84 frontend) juste avant cette réécriture — le filet de test posé par l'ancien § 7.1 est
lui-même la meilleure garantie que les 53 points ne se sont pas silencieusement rouverts.
