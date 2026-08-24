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

**Mise à jour du 21/08/2026.** Nouvelle campagne d'observation, cette fois **sur Finary connecté**
(compte réel de l'utilisateur, `app.finary.com/v2`), écran par écran, doublée d'un **audit UX/UI du
frontend actuel** et de trois décisions de cadrage prises le même jour :

1. la cible d'usage devient le **foyer, avec exposition depuis le serveur personnel** — ce qui fait
   sortir l'authentification du hors-périmètre (§ 3) pour en faire un préalable bloquant ;
2. le **budget entre dans le périmètre**, en lot dédié (§ 2.N) — l'ancien § F.1 est tranché ;
3. l'**UX/UI devient un lot à part entière** (§ 2.K), placé en tête de la file d'exécution.

Les sections **K à Q** du § 2 sont nouvelles, la comparaison du § 1 a été refondue à partir de
l'observation directe, et la priorisation d'ensemble (§ 4) a été réécrite en cinq lots. Le document
d'entrée pour les équipes de développement est désormais
[`docs/EXPRESSION_DE_BESOIN.md`](EXPRESSION_DE_BESOIN.md) ; ce backlog reste la trace des arbitrages.

---

## 1. Comparaison avec Finary

Deux campagnes d'observation. La première (19/08/2026) était **documentaire** : site officiel
`finary.com` et avis indépendants. La seconde (**21/08/2026**) est une **observation directe du
produit connecté**, sur le compte réel de l'utilisateur (`app.finary.com/v2`, formule gratuite,
patrimoine renseigné : 2 biens immobiliers, 2 contrats d'assurance-vie, 3 emprunts) — écran par
écran, y compris les fiches de détail, les réglages et les modales de partage. Cette seconde
campagne a fait apparaître des fonctionnalités que la documentation commerciale ne montre pas, et
c'est elle qui alimente les nouveaux lots K à Q du § 2.

### 1.1 Ce que Finary expose réellement (relevé du 21/08/2026)

**Navigation** : `Synthèse` · `Patrimoine` · `Objectifs` (badge « NOUVEAU ») · `Analyse` · `Budget` ·
`Investir` · `Outils` · `Communauté` · `Premium offert`, dans une **barre latérale verticale
repliable**. L'en-tête porte cinq actions transverses : *Partager mon patrimoine*, *Déclaration de
patrimoine*, *Cacher les montants*, *Notifications*, *Action requise*, plus un bouton d'appel à
l'action *Compléter mon patrimoine*.

| Bloc observé | Ce que Finary fait | Ce que nous faisons aujourd'hui |
|---|---|---|
| **Trois lentilles de patrimoine** | Sélecteur global : *Patrimoine brut* (actifs hors passifs), *Patrimoine net* (actifs − passifs), *Patrimoine financier* (actifs liquides hors comptes bancaires). S'applique au chiffre-clé, au graphique et aux répartitions | Patrimoine net seul, calculé mais non commutable |
| **Période globale** | `1J 7J 1M 3M 6M YTD 1A TOUT`, persistante d'un écran à l'autre | Sélecteur d'année par écran, non transverse |
| **Détenteurs (quotités)** | Chaque actif **et chaque passif** porte des détenteurs avec un pourcentage. Réglages → *Famille et entreprises* gère les personnes **et les sociétés** (SCI, holding). Filtre et regroupement par détenteur dans les tableaux | Absent. Le champ « compte » est une simple annotation |
| **Part détenue / part nette** | Sur un bien : *Part détenue* 50 % → 102 200 €, *Part nette* 16 % → 14 461 €, après déduction de l'emprunt rattaché | Absent. Actifs et passifs sont additionnés globalement, jamais rapprochés |
| **Emprunt rattaché à un actif** | Un passif se lie à un bien (`Emprunts liés`), ce qui rend la part nette calculable | Les emprunts existent mais flottent, sans rattachement |
| **Immobilier** | Valorisation automatique **PriceHubble** : valeur estimée, prix/m², *niveau de confiance*, positionnement sur une échelle de marché (« au-dessus du marché »). Fiche structurée en 8 sections : Description, Caractéristiques, Location, Détails, Pièces, Emprunts liés, Détention, Supprimer. Le bloc *Location* porte type (Pinel, …), périodicité, loyer mensuel, charges mensuelles, frais annuels → **cashflow** et **rentabilité** calculés | Valeur estimée saisie à la main, sans loyer, sans charges, sans cashflow ni rentabilité |
| **Fiche d'actif** | Trois onglets systématiques : *Aperçu* (valeur, courbe, indicateurs), *Analyse* (marché, détention), *Paramètres* (formulaire sectionné avec sommaire latéral) | Fiche détaillée pour les seules positions boursières, sans onglets ni édition structurée |
| **Objectifs** | Frise 2026 → 2076. Objectifs typés (*Indépendance financière*, *Épargne de précaution*) avec valeur cible, trajectoire projetée en deux courbes (valeur cible / valeur des versements), **statut en langage naturel** (« En bonne voie — votre objectif progresse comme prévu »), rendement requis, contribution cible €/mois, taux de progression, contributeurs, et **actifs liés** | Le simulateur calcule une projection et un FIRE, mais rien n'est *persisté* comme objectif suivi dans le temps |
| **Analyse** | Sept modules : *Scanner de frais* (€/an), *Revenus passifs* (rendement % + projeté 12 mois), *Scanner de diversification sectorielle* (note /10), *Scanner de diversification géographique* (note /10), *Scanner d'abonnements*, *Simulateur de patrimoine*, *Investissements populaires*, plus *Classement* (percentile vs utilisateurs Finary et population française) et *Profil de l'investisseur* (profil de risque, matelas de sécurité, ratio d'endettement) | Coût de gestion consolidé et qualité des données présents ; scores de diversification, revenus passifs projetés, profil de risque et ratios absents |
| **Budget** | Période (1M/3M/1A/personnalisé), *Entrées / Sorties / Disponible / Dépenses récurrentes*, filtres par catégorie et par compte, distribution des sorties, création de catégories et de règles | Hors périmètre à ce jour (§ 2.N rouvre la décision) |
| **Partage** | Lien **anonyme, révocable**, par profil, avec sélection des catégories partagées et quatre interrupteurs : partager le budget, partager les objectifs, *masquer les valeurs et les quantités*, *exiger un code de sécurité* | Absent |
| **Déclaration de patrimoine** | PDF par profil, avec **sélection fine des actifs** à inclure (« Immobilier 2/2 », « Emprunts 3/3 »), alimentée par le *Profil investisseur* (salaire net, dépenses mensuelles, taux d'imposition) | Relevé PDF existant, mais monolithique : ni sélection, ni profil, ni détenteur |
| **Taxonomie d'ajout** | 18 catégories : Immobilier, Actions & Fonds, PEA, Assurance Vie, Exchange Crypto, Crypto, Wallets Crypto, SCPI, Comptes courants, Comptes titres, Épargne salariale, Comptes d'épargne, Emprunts, Startups & PME, Crowdlending, Montres, Métaux précieux, Autres actifs | 9 environ, dont une catégorie « autre actif » fourre-tout |
| **Réglages** | Mon compte (langue, **devise**, thème), Sécurité, Profil investisseur, Famille et entreprises, Comptes synchronisés, *Nettoyer graphique* (correction des accidents de série historique) | Préférences de calcul, seuil d'alerte, rafraîchissement, exports. Ni devise, ni profil, ni outil de correction d'historique |

### 1.2 Ce que Finary fait mal — et qui devient notre terrain

L'observation directe est plus instructive que les avis en ligne. Six défauts sont **structurels**,
pas conjoncturels, et chacun est une occasion :

1. **Le chiffre-clé par défaut est le patrimoine *brut*.** L'écran d'accueil annonce
   **251 552 €** ; les passifs totalisent **208 328 €**. Le patrimoine réellement détenu est de
   l'ordre de **43 000 €**, soit six fois moins. Il faut ouvrir un menu déroulant discret pour le
   voir. Un outil de suivi patrimonial dont l'indicateur principal flatte de 500 % est un problème
   de conception, pas un réglage.
2. **Le mur payant abîme l'écran d'analyse.** La moitié de la page *Analyse* est floutée. Les deux
   scores de diversification s'affichent « Insuffisante 1/10 » avec l'explication masquée : le
   diagnostic anxiogène est offert, le remède est vendu. Nous affichons déjà ces scores
   gratuitement — c'est un argument, à condition de livrer aussi l'explication.
3. **États vides non traités.** La carte *Performance* de la Synthèse est un grand rectangle blanc :
   le graphique ne se dessine pas faute de données éligibles, et rien ne le dit. Le *Scanner de
   frais* affiche « PAS DE DONNÉES / 0.00 % / — €/an ».
4. **Libellés tronqués** dans la barre latérale (« Déclaration… », « Calculateur de… ») : le menu
   n'a pas été conçu pour la longueur réelle des intitulés français.
5. **Vocabulaire incohérent** : l'entrée de menu dit « Patrimoine », le titre de l'onglet dit
   « Portefeuille », l'URL dit `/portfolio`. Trois mots pour un même écran.
6. **Bruit commercial permanent** : une bannière d'incitation, deux boutons d'achat dans l'en-tête,
   un encart dans la barre latérale, des badges `PLUS` sur chaque carte. Sur les 1 568 pixels de
   large de l'écran d'analyse, une part notable ne parle pas du patrimoine de l'utilisateur.

### 1.3 Positionnement retenu

| Axe | Finary | Cible Application Patrimoine |
|---|---|---|
| Modèle économique | 0 € limité à 2-3 synchronisations, Lite ≈ 55 €/an, Plus ≈ 150 €/an, Pro ≈ 350 €/an | Gratuit, open source, auto-hébergé |
| Donnée | Cloud, agrégation via prestataire régulé | 100 % local, hors requêtes de cotation |
| Automatisation | Synchronisation de 20 000+ établissements | Import de fichiers + saisie ; agrégation à instruire (§ 2.E.2) |
| Transparence du calcul | Boîte noire, scores sans explication en gratuit | Qualité des données affichée, méthode documentée, tout gratuit |
| Profondeur d'analyse | Pas de TWR, ni volatilité, ni Sharpe, ni bêta ([outilsinvestisseur.fr](https://outilsinvestisseur.fr/finary-avis/)) | Terrain libre — § 2.P |
| Fiabilité | Bugs de synchronisation récurrents, Trade Republic cité nommément ([dealfluence.fr](https://www.dealfluence.fr/tech/finary), Trustpilot ≈ 3,9/5) | Pas de synchronisation ⇒ pas cette classe de panne |
| Ergonomie | Barre latérale claire, fiches structurées, chiffre-clé lisible — mais brut par défaut et écran d'analyse mité | À rattraper (§ 2.K), c'est aujourd'hui notre principal retard |

Sources : observation directe de `app.finary.com/v2` le 21/08/2026 ;
[Avis Finary — outilsinvestisseur.fr](https://outilsinvestisseur.fr/finary-avis/) ;
[Retour d'expérience 2 ans — dealfluence.fr](https://www.dealfluence.fr/tech/finary) ;
[Analyse 2026 — epargnoo.com](https://epargnoo.com/epargnews/articles/avis-finary).

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

#### I.4 — `mineur` · `S` · `P2` · `traité` — Migration de schéma limitée à l'ajout de colonnes

`database.run_startup_migrations` ajoutait des colonnes nullable de façon idempotente
(`ALTER TABLE ... ADD COLUMN`), mais ne savait ni renommer une colonne, ni changer un type, ni
exécuter une migration de données complexe — ce qui avait déjà nécessité des scripts one-off manuels
par le passé (ex. `migrate_rename_categorie_autres`). Ce point notait que ce serait « un vrai
risque » si le multi-utilisateur (§ 2.I.1) imposait un jour une migration de données par utilisateur
existant — c'est exactement ce qui s'est produit au Milestone 2a : `migrate_isolation_utilisateur`
a dû reconstruire `allocation_targets` à la main (renommer/recréer/recopier/supprimer) et un bug de
détection a fait planter le démarrage sur la vraie base avant d'être corrigé. Le risque prédit ici
s'est donc concrètement matérialisé, pas juste en théorie.

**Traité le 20/08/2026** : adoption d'Alembic, sur décision explicite de l'utilisateur (suppression
immédiate des 5 fonctions de migration maison plutôt que de les garder en filet de sécurité — elles
étaient déjà toutes appliquées, no-op, sur l'unique vraie base de l'application). Une seule révision
« baseline » (`backend/alembic/versions/fe74a8877ec0_baseline_milestone_2b.py`) capture fidèlement le
schéma actuel de `models.py` (vérifié : appliquée seule sur une base vide, elle correspond exactement
à `Base.metadata.create_all()`, sans diff résiduel — verrou de `tests/test_alembic_migrations.py`) ;
toute installation future en repart et remonte l'historique via `alembic upgrade head`. Mode batch
(`render_as_batch=True`, `alembic/env.py`) : automatise pour SQLite la danse renommer/recréer/
recopier/supprimer qu'il avait fallu écrire à la main pour `allocation_targets` — plus jamais de code
one-off pour ce genre de changement.

**Découverte pendant la bascule** : comparer la baseline à la VRAIE base (`alembic check`, sur une
copie, avant de la stamper) a révélé que `run_startup_migrations` n'avait jamais posé les index
simples (`index=True`, hors `UniqueConstraint`) sur les colonnes `user_id` ajoutées au Milestone 2a
(`holdings`/`loans`/`transactions`) ni sur `allocation_targets.annee` — un vrai manque de performance
sur des requêtes filtrées par utilisateur (littéralement le cœur du Milestone 2a), resté invisible
jusqu'ici. `ALTER TABLE ADD COLUMN` ne posant non plus jamais `NOT NULL` ni de vraie contrainte
`FOREIGN KEY` sous SQLite, ces colonnes restaient aussi plus permissives que ce que `models.py`
déclare (sans risque réel : toutes les lignes existantes étaient déjà rétro-remplies). Réparé par une
opération ponctuelle (mode batch, hors historique Alembic rejouable — n'a de sens que pour cette base
précise, jamais pour une installation neuve qui part directement d'un schéma déjà correct) : les 5
index manquants créés, les colonnes concernées passées `NOT NULL` avec une vraie contrainte `FOREIGN
KEY`, et la contrainte d'unicité de `fund_top_holdings` (posée après coup via `CREATE UNIQUE INDEX`,
même mécanisme qui avait piégé `allocation_targets`) normalisée en contrainte de table. Vérifié
avant/après sur une copie de sauvegarde : `alembic check` ne détecte plus aucun écart, 49
positions/4059 transactions/17 objectifs/4 préférences toujours tous là. Sauvegarde prise
(`scripts/sauvegarde.py`) avant d'appliquer sur la vraie base ; 435 tests backend au vert (16 tests
des anciennes fonctions retirés avec elles, 3 nouveaux verrouillant Alembic).

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

### J. Fiabilité du calcul de rentabilité

#### J.1 — `majeur` · `M` · `P1` · `traité` — Coût de revient « orphelin » sur une position fermée sans vente (env. 76 € actuellement)

Découvert le 20/08/2026 en corrigeant l'écart entre le graphique d'évolution du tableau de bord et
la carte Rentabilité globale (cf. increment 13) : `gain_perte_total`
(`services/performance_service.compute_performance`) est aujourd'hui **surestimé d'environ 76 €** sur
le vrai portefeuille, à cause de deux angles morts de `services/portfolio_reconstruction._apply_transaction` :

1. **Vente horodatée avant son achat, même instant** (`transaction_id` réels : vente Tesla à
   `2023-12-08`, cf. docstring déjà existante de `_apply_transaction` qui anticipait ce cas — « vente
   d'un titre offert horodatée avant la ligne d'acquisition correspondante ») : quand deux transactions
   partagent exactement le même `datetime_utc`, l'ordre de traitement (`ORDER BY datetime_utc ASC`,
   sans tri secondaire déterministe) peut placer la VENTE avant l'ACHAT du même lot. La vente ne trouve
   alors aucun coût à retirer (`cost_basis` encore à 0), et l'achat qui arrive juste après reste
   « orphelin » : son coût est ajouté à `cost_basis` mais la position vient d'être vendue (quantité
   déjà retombée à ~0) — ce coût n'est donc plus jamais recyclé nulle part (ni dans `gains_realises`,
   déjà figé au moment de la vente, ni dans `gains_latents`, qui exclut les positions à `shares <=
   EPSILON`). Cas réel identifié : ~25 € (Tesla, `STOCKPERK` + `BUY` + `SELL` au même instant).
2. **Opération sur titres qui ferme une position sans vente** (`CORPORATE_ACTION MERGER`/`WORTHLESS`
   avec `shares` négatif) : la branche « opérations sur titres » de `_apply_transaction` ajuste
   uniquement `state.shares`, jamais `cost_basis` ni `realized_gain` (comportement correct pour un
   split ou une action gratuite REÇUE, où le coût doit rester nul) — mais pour une opération qui
   RETIRE des titres sans contrepartie (fusion sans compensation, titre devenu sans valeur), le coût
   de revient restant devrait être comptabilisé comme une PERTE réalisée à ce moment-là, pas
   silencieusement abandonné. Deux cas réels identifiés : BlackRock (plan d'investissement
   programmé, `MERGER` le 2024-10-02, ~30 € de coût orphelin) et Carmat (`WORTHLESS` le 2026-06-15,
   ~21 € de coût orphelin, titre effectivement tombé à zéro).

Trouvé en comparant algébriquement `cout_total_investi` (somme brute directe de tous les achats,
`performance_service.py`) à `cout_base_ouvert + coût retiré par les ventes` (identité qui devrait tenir
par construction du suivi de coût de revient, mais qui casse exactement du montant du coût orphelin) —
verrouillable par un test dédié reproduisant les deux scénarios ci-dessus une fois corrigé.

**Traité le 20/08/2026**, sur validation explicite de l'utilisateur (changement de `gain_perte_total`
affiché soumis avant d'être appliqué, cf. increment 14) :

- **Point 1** : nouvelle `portfolio_reconstruction._trier_pour_reconstruction()` — trie le grand livre
  par date CALENDAIRE, puis (au sein d'une même journée seulement) les mouvements qui n'ENLÈVENT pas de
  titres avant ceux qui en RETIRENT (ventes et opérations sur titres à quantité négative, unifiées par
  le même test de signe puisqu'une vente stocke déjà `shares` négatif), puis par horodatage exact comme
  départage final. Tri Python stable, jamais entre deux journées différentes : le risque reste confiné
  au cas déjà documenté et testé (vente à 16h12, achat à 16h20 le même jour). Effet de bord nécessaire :
  réordonner le TRAITEMENT sans y prendre garde aurait cassé le tri croissant de `shares_history` (sur
  lequel `historical_performance_service._value_at` compte) — corrigé en consolidant `shares_history`
  par jour calendaire (le dernier point d'une journée reflète toujours son état réellement final, quel
  que soit l'ordre de traitement interne), sans effet pour l'immense majorité des positions (au plus une
  transaction par jour).
- **Point 2** : la branche « opérations sur titres » de `_apply_transaction` distingue désormais une
  ADDITION (coût nul, comportement inchangé) d'un RETRAIT sans contrepartie (perte réalisée égale au
  coût retiré, même mécanique qu'une vente à 0€ — moyenne pondérée ou consommation FIFO réelle des
  lots selon la méthode active). Élimine au passage la limitation FIFO documentée en tête de module
  (lots non consommés par un retrait) : ils le sont désormais correctement aussi dans ce cas.

Verrouillé par 6 nouveaux tests (`test_portfolio_reconstruction.py` : scénario Tesla étendu avec
assertions sur `cost_basis`/`realized_gain`, variante FIFO, opération de retrait totale en coût moyen
pondéré et en FIFO ; `test_historical_performance_service.py` : la réconciliation increment 13 continue
de tenir avec une position fermée sans vente). 442 tests backend au vert.

**Vérifié en conditions réelles** sur la vraie base (`portfolio.db`, sauvegarde prise avant
intervention) : `POST /api/transactions/reconstruct` (49 positions recalculées, 0 anomalie) puis cache
d'historique invalidé. `gain_perte_total` passe de 1595.86 € à **1519.70 €** — et coïncide désormais à
l'euro près avec le dernier point du graphique (`valeur_portefeuille + valeur_realisee_cumulee -
valeur_investie` = 1519.70 € également), sans aucun changement supplémentaire nécessaire côté
increment 13 (confirmé algébriquement avant d'implémenter : les deux termes de perte réalisée
s'annulent exactement entre `gains_realises` et `cout_base_ouvert`, sans jamais toucher à la formule du
graphique). Contrôle visuel dans le navigateur : carte Rentabilité globale affiche +1 520 €.

---

### K. Refonte UX/UI (audit du 21/08/2026)

Constat de départ, formulé par l'utilisateur : *« l'UX n'est pas top »*. L'audit du code frontend
confirme et objective. Ce n'est pas une question de goût : ce sont des mesures.

**Mesures relevées** (`frontend/src`, 8 481 lignes TS/TSX) :

- **24 occurrences de classes responsives** (`sm:` 15, `lg:` 8, `md:` 1) sur l'ensemble de
  l'application. À titre de comparaison, une application de cette taille réellement adaptative en
  compte plusieurs centaines. L'application est donc conçue pour **un seul format d'écran**.
- **Aucun fichier `tailwind.config`** : la palette est celle de Tailwind par défaut (`slate`), sans
  jeton sémantique. Les couleurs sont écrites en clair dans les classes, à chaque endroit, en
  double (clair + `dark:`). Le mode sombre est maintenu à la main, ligne à ligne.
- **Aucun squelette de chargement** (`animate-pulse`, `skeleton`, `Spinner` : zéro occurrence). Le
  repli de `Suspense` est la chaîne `« Chargement... »`, ce qui provoque un saut de mise en page à
  chaque navigation.
- **Navigation à 9 entrées de même rang**, dans un en-tête horizontal `max-w-6xl` : *Tableau de
  bord, Portefeuille, Répartition, Simulateur, Dividendes, Rapport, Import, Réglages, Aide*. Aucun
  menu de repli. En dessous d'environ 1 000 px, les onglets, le sélecteur de thème et l'avatar ne
  tiennent plus.
- **`max-w-6xl` (1 152 px)** sur un écran de 1 920 px : 40 % de la largeur reste vide alors que les
  tableaux de positions à dix colonnes sont comprimés et défilent horizontalement.
- **Émojis en guise d'icônes** (`☀️` `🌙` `🖥️`) : rendu différent sur chaque système, aucune unité
  graphique, aucune bibliothèque d'icônes.

#### K.1 — `majeur` · `L` · `P0` · `traité` (21/08/2026) — Système de design et enveloppe applicative

Poser ce qui manque avant d'ajouter le moindre écran, sinon chaque nouveau lot reproduira les mêmes
défauts.

- **Jetons sémantiques** plutôt que couleurs littérales : `surface`, `surface-elevee`, `bordure`,
  `texte`, `texte-attenue`, `positif`, `negatif`, `accent`, `avertissement`. Une seule définition,
  déclinée clair/sombre en un point unique. Objectif mesurable : plus aucune classe `dark:` de
  couleur en dehors de la définition des jetons.
- **Échelle typographique** à 6 niveaux, et une **échelle de densité** cohérente pour les tableaux
  (hauteur de ligne, alignement des nombres à droite, chiffres tabulaires).
- **Bibliothèque d'icônes** unique (trait, 20/24 px). Suppression des émojis d'interface.
- **Composants de base** manquants : `Skeleton`, `EtatVide` (illustration + phrase + action),
  `EtatErreur` (cause + action de reprise), `Badge`, `Tooltip`, `SegmentedControl`, `Sheet` mobile.
- **Accessibilité** conservée et vérifiée : contrastes AA sur les deux thèmes, focus visible,
  navigation clavier complète (le chantier d'août avait déjà traité ce point, il ne doit pas
  régresser).

**Pilote livré le 21/08/2026, complété le 21/08/2026** : les 9 jetons sémantiques + l'échelle
typographique (`frontend/src/index.css`, mécanisme `@theme` Tailwind v4) sont désormais utilisés
sur les 25 fichiers `.tsx` qui portaient encore des classes `dark:` littérales (652 occurrences
migrées) — plus aucune classe `dark:` de couleur en dehors de la définition des jetons, hors
exceptions assumées et documentées dans le code (palette catégorielle décorative d'`AidePage.tsx`,
bandeaux à fond teinté succès/avertissement de plusieurs écrans, scrim de `Modale.tsx`). Boutons
d'action primaire migrés du bleu littéral vers le jeton `accent` (indigo) — seul changement de
teinte assumé. Trois nouveaux composants construits et câblés partout où ils remplaçaient un motif
répété : `Skeleton`/`SkeletonTexte`/`SkeletonGraphique`, `EtatVide`, `EtatErreur`. Bibliothèque
d'icônes (`frontend/src/components/icons.tsx`) étendue à 17 icônes trait, remplaçant les derniers
émojis d'interface (`BasculeTheme.tsx`) et les symboles Unicode ad hoc (✕ ↗ ← → ✓). **Reste hors
périmètre, explicitement reporté** : `Badge`/`Tooltip`/`SegmentedControl`/`Sheet` (aucun site
d'usage identifié aujourd'hui — reportés plutôt que construits dans le vide, à réévaluer au premier
vrai besoin, ex. `Sheet` pour K.4 mobile).

#### K.2 — `majeur` · `M` · `P0` · `traité` (21/08/2026) — Navigation : barre latérale et hiérarchie

- **Barre latérale verticale repliable**, avec deux rangs : les écrans de consultation
  (*Synthèse, Patrimoine, Analyse, Objectifs, Budget*) et, séparés, les écrans d'administration
  (*Import, Réglages, Aide*) déplacés dans le **menu du compte**.
- **Vocabulaire unique** : un écran, un mot. « Patrimoine » partout, y compris dans l'URL et le
  titre de l'onglet — la triple dénomination de Finary (§ 1.2) est exactement ce qu'il ne faut pas
  reproduire.
- **Fil d'Ariane** sur les pages de détail, et **retour** qui ramène à l'état précédent (filtres et
  défilement compris), pas au haut de la liste.
- **Recherche globale** (`Ctrl/⌘ + K`) : atteindre une position, un bien, un emprunt, un écran.

**Pilote livré le 21/08/2026, complété le 21/08/2026** : barre latérale repliable (persistée),
vocabulaire unifié, titre d'onglet dynamique, menu du compte (K.7) — inchangés. **Fil d'Ariane**
(`FilDAriane.tsx`, dérivé de `ROUTES`) sur tous les écrans hors accueil, avec le ticker réel affiché
sur la fiche détaillée d'une position. **Retour avec restitution d'état** : catégorie/compte du
Portefeuille portés par l'URL (`?categorie=&compte=`, restitués automatiquement par le retour
navigateur), tri de `PositionsTable` et position de défilement persistés en `sessionStorage`,
bouton retour de la fiche détaillée utilisant `navigate(-1)` quand l'origine est connue. **Recherche
globale `Ctrl/⌘+K`** (`PaletteRecherche.tsx`, sans dépendance tierce) : filtre en mémoire sur les
écrans, positions (`listHoldings`) et emprunts (`listLoans`) déjà exposés côté frontend — limitation
assumée : un résultat "emprunt" navigue vers Portefeuille en général, pas une ancre précise vers
`LoansCard`.

#### K.3 — `majeur` · `M` · `P0` · `traité` (21/08/2026) — Contrôles transverses persistants

Trois contrôles vivent dans l'en-tête et s'appliquent à **tous** les écrans, avec mémorisation :

- **Lentille** : `Patrimoine net` (**défaut**, contrairement à Finary), `Patrimoine brut`,
  `Patrimoine financier`. Le net par défaut est un choix de produit, pas un détail : c'est le seul
  chiffre qui répond à la question posée par l'utilisateur — *est-ce que ça monte ?*
- **Période** : `1M 3M 6M YTD 1A 3A TOUT` + plage personnalisée.
- **Détenteur** : `Foyer` (consolidé) / une personne / une société (dépend du lot L).

Un quatrième contrôle est indépendant : **masquer les montants** (bascule + raccourci clavier), qui
remplace chaque valeur par des points sans changer les proportions des graphiques. Utile pour
ouvrir l'application devant quelqu'un.

**Pilote livré le 21/08/2026 (Lentille, Masquer les montants), Détenteur livré le 21/08/2026 avec
L.1, Période complétée le 21/08/2026.** Décision de conception pour la Période : le sélecteur
« année » du Dashboard/Répartition/Objectifs reste un contrôle **spécifique aux Objectifs** (non
remplacé) — `AllocationTarget` est un objectif intrinsèquement annuel, une fenêtre glissante « 3
derniers mois » n'ayant pas de sens pour lui. La Période transverse (`1M/3M/6M/YTD/1A/3A/TOUT` +
personnalisée, `frontend/src/utils/periode.ts`) s'applique donc uniquement au graphique d'évolution
du patrimoine (filtré côté client, comme avant) et au Rapport (pré-remplit son mode Personnalisé au
premier montage, synchronisation à sens unique — modifier les dates dans Rapport n'écrit jamais
dans la préférence transverse). `/performance`, `/performance/dividendes` et `/patrimoine/net`
restent hors périmètre (recalculer leurs métriques cumulées depuis-l'origine sur une fenêtre est un
chantier backend nettement plus lourd) — **aucun fichier backend n'a été modifié pour ce point**.

#### K.4 — `majeur` · `M` · `P1` · `traité` (24/08/2026) — Mobile et responsive

L'application est déjà installable (PWA, § H.1) mais n'est pas utilisable au doigt. Cible :

- **Point de rupture unique et assumé** à 768 px. En dessous : navigation par barre inférieure à
  cinq entrées, tableaux **transformés en cartes** (pas en défilement horizontal), filtres dans une
  feuille glissante, graphiques simplifiés (moins de points, légende sous le graphe).
- Cibles tactiles ≥ 44 px, aucune interaction dépendante du survol.
- Test obligatoire à 390 px (iPhone), 768 px (tablette), 1 440 px et 1 920 px.

**Livré et vérifié le 24/08/2026.** Point de rupture à 768 px (`md:`, valeur par défaut Tailwind v4,
inchangée) : `Sidebar` (`hidden md:flex`) et une nouvelle `BottomNav` (`md:hidden`, 4 entrées de
consultation directes + un bouton **« Plus »** ouvrant une feuille glissante avec le reste des
routes de consultation, l'administration, le thème et la déconnexion) se substituent l'une à
l'autre sans jamais coexister. **Écart assumé avec le texte du backlog** : « cinq entrées » devient
« 4 directes + Plus », pour rester cohérent avec le filtrage par rôle déjà en place (L.2) — un
invité n'a que 2 routes de consultation, un nombre fixe de 5 n'aurait pas eu de sens pour lui.
`Modale.tsx` gagne un `variant="bottom"` (feuille glissante, réutilise tout le mécanisme
d'accessibilité existant — piège au clavier, pile de modales, fermeture Échap/clic extérieur),
utilisé par `MenuPlusSheet` et par le nouveau déclencheur de filtres de `PortefeuillePage`
(bouton « Filtrer » sous 768 px, remplaçant la rangée de filtres inline). **Tableaux transformés en
cartes** : `PositionsTable` et `LoansCard` (les deux tableaux les plus consultés/complexes) rendent
désormais des cartes sous 768 px, via un nouveau hook `useEstMobile()` (`matchMedia`, écoute les
changements) — nécessaire en plus du simple `hidden md:flex` pour tout contenu répété ligne par
ligne (testé en jsdom : le montage CSS-only des deux variantes rend les libellés de chaque ligne
ambigus pour les tests). **Hors périmètre, documenté comme tel** : les 5 tableaux de
`HoldingDetailContent`, ainsi qu'`ImportPage`/`SimulateurPage`/`AllocationChartCard`/
`DividendesPage`, restent inchangés (défilement horizontal existant conservé) — non traités faute
de temps dans cet incrément, à reprendre si l'usage mobile réel le justifie. « Graphiques
simplifiés » : traité comme une simple vérification (les graphiques existants restent lisibles à
390 px, aucun changement de mécanisme) plutôt qu'une nouvelle fonctionnalité de réduction de points/
légende. Cibles tactiles ≥ 44 px partout sur le nouveau code mobile (`h-16` = 64 px pour la barre
inférieure, `min-h-11` = 44 px pour les boutons/cartes) ; zones de sécurité iOS couvertes
(`env(safe-area-inset-bottom)`). **Vérifié aux 4 largeurs exigées** (1920/1440/768/390 px, backend
isolé avec des données réelles de test) : bascule Sidebar/BottomNav exacte à la frontière de 768 px
(jamais les deux en même temps), tableaux → cartes sous 768 px, feuilles « Filtrer » et « Plus »
fonctionnelles, `BarreControles` se replie sans débordement horizontal à 390 px.

#### K.5 — `mineur` · `S` · `P1` · `traité` (21/08/2026) — États de chargement, vides et d'erreur

Un traitement uniforme, appliqué à chaque écran et à chaque carte :

- **Chargement** : squelette de la forme finale, jamais un texte, jamais un saut de mise en page.
- **Vide** : dire *pourquoi* c'est vide et *quoi faire* — « Aucun dividende perçu sur la période.
  Élargir la période ou importer un relevé. » Le rectangle blanc de la carte *Performance* de
  Finary (§ 1.2) est le contre-exemple à garder en tête.
- **Erreur** : cause en français, action de reprise, et jamais la disparition silencieuse d'une
  carte.

**Livré et vérifié le 21/08/2026.** `EtatErreur` gagne une action de reprise optionnelle
(`onReessayer`, bouton « Réessayer ») — le manque le plus structurel relevé par l'audit initial,
maintenant câblée sur une vingtaine de sites d'appel existants (chaque fois qu'une fonction de
chargement nommée existe ou peut en être extraite ; volontairement absente des erreurs de mutation
pures où le bouton d'origine de l'action reste actionnable juste au-dessus). Les fetches dont
l'échec réseau était avalé silencieusement (`.catch(() => set(null))`, confondant chargement/erreur/
absence réelle de données) ont été corrigés : `PatrimoineNetCard` (le cas le plus visible — la carte
`return null` dans les trois cas à la fois avant cet incrément), les 3 sections indépendantes du
tableau de bord (rentabilité, coût de gestion, répartition par compte — chacune avec son propre
squelette/erreur, un échec de l'une n'affecte plus les autres), `HoldingPriceHistoryChart` (erreur
réseau désormais distincte d'une absence légitime de cotation) et les 2 préchargements optionnels de
`SimulateurPage` (dégradation non bloquante conservée, mais l'échec devient visible). Trois derniers
sites en texte brut migrés vers `Skeleton`/`SkeletonTexte`. États vides corrigés : un vrai bug
(`PortefeuillePage`/`PositionsTable` rendait un tableau vide sans aucun message quand un filtre
catégorie/compte ne matchait rien) et plusieurs messages trop génériques enrichis d'un « quoi faire »
(`AllocationChartCard`, `LoansCard`, journal d'accès et comptes du foyer dans Réglages). La bannière
d'erreur ad hoc de `RepartitionPage` (seul vrai bouton Réessayer du code avant cet incrément) est
consolidée dans le composant partagé. **Trouvé en vérifiant K.5** (hors périmètre de son propre
correctif, documenté comme limite assumée) : les 3 sections indépendantes du tableau de bord restent
imbriquées dans le bloc conditionné par `analysis`/`loading` — si `analysis` échoue alors qu'elles
réussissent, leur squelette/erreur reste invisible ; les en sortir changerait l'ordre visuel de la
page, décision de mise en page à trancher séparément.

#### K.6 — `mineur` · `S` · `P1` · `traité` (24/08/2026) — Hiérarchie de lecture du tableau de bord

Aujourd'hui les cartes s'empilent sans ordre de lecture. Cible en trois temps :

1. **Le chiffre** : patrimoine net, très grand, avec la variation sur la période et une phrase en
   langage naturel (« +4,2 % depuis janvier, porté par l'immobilier »).
2. **La courbe** : évolution sur la période choisie, avec les événements marquants annotés (achat,
   vente, gros versement).
3. **Le détail** : répartition, qualité des données, coût de gestion, alertes — sous la ligne de
   flottaison, et repliables.

**Livré le 24/08/2026** : `PatrimoineNetCard` affiche désormais le chiffre principal en très grand
(`text-display`, jeton K.1) avant la répartition actifs/passifs, avec une variation en % et une
phrase en langage naturel sous forme "*{signe}{pct}% {libellé période}*" (ex. « +10,0 % depuis le
début du suivi »). **Écart assumé avec l'exemple du backlog** : la variation porte sur le
**portefeuille financier suivi** (même série que la courbe juste en dessous), explicitement libellée
comme telle, et non sur le patrimoine net lui-même — celui-ci inclut l'immobilier/l'épargne/les
dettes, sans historique daté consolidé disponible pour eux (construire cette consolidation est le
sujet du futur P.1, Lot 7) ; afficher une fausse précision sur le patrimoine net aurait contredit la
philosophie de transparence déjà appliquée ailleurs dans l'app. Idem pour l'« attribution » de
l'exemple (« porté par l'immobilier ») : non implémentée, aurait demandé une décomposition par
classe d'actif hors de portée d'un item `S`. La courbe (`PortfolioHistoryChart`) et le chiffre
partagent désormais un seul appel réseau (`GET /api/performance/history`, coûteux — jusqu'à une
minute), remonté par `DashboardPage` plutôt que chargé en double par les deux composants ; au
passage, corrige la limite documentée par K.5 (la courbe ne dépend plus de `analysis`/`loading`,
elle reste visible même si l'analyse géo/sectorielle échoue). Le détail (StatTiles de risque,
répartitions géo/sectorielles, qualité des données, coût de gestion, répartition par compte,
rééquilibrage) est regroupé dans un nouveau composant repliable `Disclosure.tsx` (natif `<details>`-
like, état persisté dans `localStorage` comme `useSidebarRepliee`), ouvert par défaut. Les deux
bandeaux d'accueil (aucune position/aucun objectif) restent hors du repliable — ce sont des appels à
l'action, pas de la simple information complémentaire. **Événements annotés sur la courbe** (achat,
vente, gros versement) : non livrés — nécessiteraient une nouvelle donnée backend (dates/montants des
mouvements significatifs sur un axe temporel distinct de la grille hebdomadaire du graphique),
documentés comme extension future si le besoin se confirme. 289 tests frontend (+28), `tsc`/
`oxlint`/`vite build` propres, vérifié en conditions réelles (backend isolé) : chiffre/courbe/détail
dans le bon ordre, bandeau d'accueil visible hors du repliable, repli du détail au clic et persistance
après rechargement de page.

#### K.7 — `mineur` · `S` · `P2` · `traité` (21/08/2026) — Déconnexion accidentelle

~~Aujourd'hui, un clic sur l'avatar déconnecte immédiatement, sans menu ni confirmation.~~ Livré
avec le socle K.2 : l'avatar ouvre désormais `MenuCompte` (Import, Réglages, Aide, thème,
déconnexion) — la déconnexion exige d'ouvrir le menu (1er clic) puis de choisir l'action (2e
clic), plus jamais un clic direct sur l'avatar ne déconnecte. Verrouillé par test
(`App.test.tsx`, `MenuCompte.test.tsx`).

---

### L. Foyer, détenteurs et exposition (nouveau, 21/08/2026)

Décision prise le 21/08/2026 : la cible d'usage n'est plus « mono-utilisateur, localhost » mais
**le foyer, avec exposition depuis le serveur personnel**. Cela rouvre l'authentification, qui
cesse d'être hors périmètre (§ 3) pour devenir un **préalable bloquant**, comme annoncé.

#### L.1 — `majeur` · `L` · `P0` · `traité` (21/08/2026) — Personnes, sociétés et quotités

Le modèle actuel ignore la question « à qui appartient quoi ». Or l'immobilier du foyer est détenu
à 50/50, et le patrimoine réellement disponible pour une personne n'est pas le patrimoine affiché.

- **Personnes** (conjoint, enfants) et **sociétés** (SCI, holding) déclarées une fois, réutilisées
  partout — c'est le modèle « Famille et entreprises » de Finary, et il est juste.
- **Quotité par actif et par passif**, en pourcentage, somme contrôlée à 100 %.
- **Part détenue** et **part nette** calculées par actif : part nette = quotité × (valeur − capital
  restant dû des emprunts rattachés × quotité sur l'emprunt).
- **Filtre détenteur global** (§ K.3) : le patrimoine se lit consolidé au niveau du foyer, ou du
  point de vue d'une personne.
- Les emprunts existants doivent être **rattachables à un actif** (§ M.2) pour que la part nette
  ait un sens.

**Livré le 21/08/2026** (avec une version minimale de M.2 dans le même incrément, cf. ci-dessous) :
`Detenteur` (personnes/sociétés), `QuotiteHolding`/`QuotiteLoan` (quotités actif/emprunt, somme
contrôlée à 100 %, delete-puis-insert), part détenue et part nette calculées côté serveur
(`services/detenteurs_service.py`), filtre détenteur global branché sur `compute_patrimoine_net` et
la barre de contrôles K.3 (`BarreControles.tsx`), gestion des détenteurs dans Réglages, éditeur de
quotités sur la fiche détaillée d'une position, sélecteur de rattachement sur `LoansCard`. Corrige
au passage un bug préexistant découvert en marge de cet incrément : la fiche détaillée d'une
position ignorait `valeur_estimee` (immobilier/SCPI/assurance-vie/PER), affichant le coût plutôt
que la valeur estimée. **Reste hors périmètre** : éditeur dédié d'une quotité d'emprunt distincte
de celle de l'actif (le calcul backend la supporte déjà — héritage par défaut depuis l'actif — mais
aucune UI ne permet encore de la saisir explicitement).

#### L.2 — `majeur` · `M` · `P0` · `traité` (socle applicatif, 21/08/2026) — Exposition sécurisée sur le serveur personnel

L'authentification existe (`AuthContext`, `LoginPage`, milestones 1/2a/2b du § I.1) mais elle a été
conçue pour un usage `localhost`. L'exposer change la nature du risque.

**Livré le 21/08/2026** :
- **Rôles** : `proprietaire` (tout), `membre` du foyer (lecture + saisie sur les Holdings/Loans/
  Transactions du foyer, granularité par type de ressource — pas encore par quotité individuelle),
  `invite` (lecture seule, filtrée serveur à un périmètre de détenteurs assignés, limitée à
  Patrimoine net/Portefeuille/Emprunts — les autres écrans lui renvoient 403). Comptes créés
  exclusivement par le propriétaire (`POST /api/auth/household-members`) ; l'auto-inscription
  (`POST /api/auth/register`) se ferme après le tout premier compte.
- **Limitation des tentatives + verrouillage temporaire** : 5 échecs en 15 minutes glissantes →
  verrouillage de 15 minutes, dérivé du journal d'accès (une seule source de vérité).
- **Sessions** : `AuthToken` enrichi (IP, user-agent, dernière activité), listées et révocables
  individuellement depuis Réglages (`GET/DELETE /api/auth/sessions`) — plus seulement "la session
  courante".
- **Journal d'accès** : table `AccessLogEntry`, consultable (paginé) dans Réglages, réservé au
  propriétaire.
- **Sauvegarde chiffrée planifiée** : nouveau service `backup_service.py` (chiffrement Fernet)
  branché sur l'APScheduler existant (job `sauvegarde_chiffree`, quotidien par défaut), sans modifier
  `scripts/sauvegarde.py` (reste utilisable tel quel en CLI, non chiffré). Nécessite la variable
  d'environnement `PATRIMOINE_BACKUP_KEY` (absente : le job échoue proprement, statut visible dans
  Réglages, sans affecter les autres jobs ni planter le scheduler) — cf. `docs/MANUEL_EXPLOITATION.md`.

**Reste hors périmètre, explicitement reporté** :
- **TOTP (second facteur)** et **migration du jeton vers un cookie `Secure`/`SameSite=Strict`** — un
  incrément ultérieur.
- **HTTPS obligatoire, HSTS, reverse proxy** — infrastructure homelab, hors du dépôt : à la charge de
  l'utilisateur (recommandation dans `docs/MANUEL_EXPLOITATION.md` : Caddy/nginx/Traefik + Let's
  Encrypt devant l'application).
- **Granularité fine du rôle membre** (restreindre l'écriture aux seuls actifs où sa quotité est non
  nulle, plutôt qu'à tout le foyer) — nécessiterait un lien `User`↔`Détenteur` explicite.
- **Filtrage serveur généralisé pour l'invité** au-delà de Patrimoine net/Portefeuille/Emprunts
  (Analyse, Rapport, Objectifs, Transactions, Import n'ont pas de filtrage par détenteur fiable côté
  serveur aujourd'hui — un incrément séparé).

#### L.3 — `mineur` · `S` · `P2` · `traité` (24/08/2026) — Connexion SSO Authentik

L'utilisateur expose déjà l'application derrière un proxy provider Authentik (forward-auth) sur son
serveur personnel, et souhaite un bouton « Se connecter avec Authentik » — à condition explicite que
retirer ce proxy un jour n'ouvre aucune brèche.

**Livré le 24/08/2026** : vrai flux OIDC applicatif (Authorization Code + PKCE,
`backend/app/services/oidc_service.py`), qui ne fait confiance à AUCUN en-tête de proxy — l'échange
du code et la récupération de l'identité (`userinfo`) se font en direct, serveur à serveur,
authentifiés par un secret jamais transmis au navigateur. Découverte OIDC standard
(`.well-known/openid-configuration`, pas d'URL Authentik codée en dur). État anti-CSRF auto-porteur
(signé HMAC, sans table ni session serveur). Aucune nouvelle dépendance (`requests`/`hashlib`/`hmac`
déjà présents). `User.password_hash` devient nullable, nouvelle colonne `oidc_subject` (identifiant
stable de liaison). Provisioning automatique au premier login d'une identité Authentik inconnue —
`proprietaire` seulement si aucun compte n'existe encore (bootstrap), `membre` sinon ; un compte local
déjà créé à la main avec le même nom d'utilisateur est lié plutôt que dupliqué, mot de passe existant
conservé. Vérifié bout en bout avec un faux serveur Authentik protocolaire (le vrai n'étant pas
accessible depuis l'environnement de développement) : redirection, échange de code, récupération
d'identité, création de compte, jeton fonctionnel, ré-authentification sans doublon, et les 3 chemins
d'erreur (refus Authentik, `state` invalide, tentative de mot de passe sur un compte 100 % SSO).
**Complété le 24/08/2026** : configuration entièrement administrable depuis `Réglages → Connexion
Authentik` (propriétaire) plutôt qu'en variables d'environnement — 4 champs texte (issuer, client id,
redirect URI, URL du frontend) modifiables à chaud, sans redémarrage. Le `client_secret` est
**saisissable mais jamais relisible** une fois enregistré (chiffré au repos, Fernet, avec une clé —
`PATRIMOINE_SECRET_KEY` — qui, elle seule, reste en variable d'environnement, distincte de
`PATRIMOINE_BACKUP_KEY`) : même pattern que sur le Dockhand de l'utilisateur, principe général repris
sans lire le code source d'un tiers (README explicitement hostile au traitement par un agent IA,
signalé et respecté). Table `Parametre` déjà existante réutilisée telle quelle (aucune migration
Alembic nécessaire). **Bug réel trouvé en vérification bout en bout** (pas par les tests unitaires
seuls) : un compte `membre` auto-provisionné ne recevait jamais de `owner_user_id`, devenant son
propre foyer vide au lieu de rejoindre le patrimoine partagé du propriétaire déjà en place — corrigé
avant toute mise en production, verrouillé par test.

**Complété le 24/08/2026** (retours utilisateur sur la livraison précédente) : (1) coche **Activée**
indépendante de « configuré » — désactiver le SSO masque le bouton et fait renvoyer `404` par
`/oidc/login`/`/oidc/callback` sans effacer la configuration déjà saisie, re-cochable à tout moment ;
(2) **générisation** — la fonctionnalité et son texte produit ne nomment plus Authentik en dur
(« Connexion SSO (OIDC) », messages d'erreur génériques), Authentik ne reste que comme exemple concret
dans la documentation ; un champ **Nom affiché** (`display_name`, défaut « SSO ») laisse le propriétaire
choisir le texte du bouton (ex. « Authentik » s'il le souhaite) ; (3) **mapping des claims** — 3 champs
configurables (nom d'utilisateur/email/nom affiché ← quel claim OIDC), défauts
`preferred_username`/`email`/`name` (claims standard) ; `User` gagne deux vraies colonnes `email`/`nom`
(migration Alembic), resynchronisées à **chaque** connexion SSO — sauf `username`, jamais réécrit après
la création (identifiant de connexion unique, décision volontaire documentée dans le code et le manuel
d'exploitation). Vérifié en conditions réelles (backend isolé + faux serveur Authentik, base séparée de
la vraie base applicative) : flux complet redirection → échange de code → provisioning fonctionnel avec
`display_name` personnalisé ; désactivation/réactivation sans perte de configuration (`secret_configure`
resté `true`) ; reconnexion avec un `preferred_username` différent → `username` local inchangé,
`email`/`nom` resynchronisés ; claim mappé absent de la réponse de l'IdP → valeur déjà connue conservée
(pas d'écrasement par une valeur vide). Suite backend complète (559 tests) et frontend (246 tests,
`tsc -b --noEmit` propre) au vert.

**Reste à faire par l'utilisateur** : créer le Provider/Application OAuth2 dédié côté Authentik
(indépendant du proxy provider existant — cf. `docs/MANUEL_EXPLOITATION.md` § 12.1) et renseigner ces
valeurs depuis Réglages, puis définir `PATRIMOINE_SECRET_KEY` sur son serveur — seules étapes non
simulables ici.

---

### M. Profondeur du modèle d'actifs (nouveau, 21/08/2026)

Nous couvrons environ 9 natures d'actifs, Finary en propose 18. L'écart n'est pas une question de
volume mais de **ce qui manque au foyer réel** : les liquidités, l'épargne réglementée et
l'épargne salariale, qui pèsent lourd et qui sont aujourd'hui invisibles.

#### M.1 — `majeur` · `M` · `P1` · `traité` (natures P1, 24/08/2026) — Compléter la taxonomie

Par ordre d'utilité décroissante pour le foyer :

| Nature | Ce qu'il faut modéliser | Priorité |
|---|---|---|
| Comptes courants | Solde, établissement, détenteur ; exclus du « patrimoine financier » | P1 |
| Comptes d'épargne réglementée | Livret A, LDDS, LEP, PEL, CEL : plafond, taux, intérêts capitalisés annuellement | P1 |
| Épargne salariale | PEE, PERCO, PER entreprise : versements, abondement, blocage, déblocages anticipés | P1 |
| Véhicules | Valeur avec **décote annuelle paramétrable**, emprunt rattachable (besoin exprimé de longue date) | P1 |
| Métaux précieux | Quantité + cours (or, argent) plutôt qu'un montant figé | P2 |
| Crowdlending | Capital prêté, échéancier, défauts | P2 |
| Titres non cotés / startups | Coût de revient, valorisation au dernier tour | P2 |
| Objets de valeur (montres, art) | Déjà couvert par « autre actif », à typer proprement | P3 |

**Livré le 24/08/2026 (les 4 natures P1)** : quatre nouveaux `type_actif` — `CASH_ACCOUNT`
(compte courant), `REGULATED_SAVINGS` (Livret A/LDDS/LEP/PEL/CEL...), `EMPLOYEE_SAVINGS`
(PEE/PERCO/PER entreprise), `VEHICLE` — ajoutés à `TYPES_ACTIF_PATRIMOINE_MANUEL`
(`backend/app/models.py`) : même mécanisme que l'immobilier/SCPI/assurance-vie/PER déjà en place
(valorisation manuelle via `valeur_estimee`, exclusion automatique du portefeuille financier et du
rafraîchissement de cours — aucun code supplémentaire nécessaire dans `analysis_service`/
`market_data_service`, l'architecture existante généralise directement). « Établissement »/
« détenteur » (comptes courants) réutilisent `Holding.compte` (annotation déjà existante) et le
mécanisme de quotités (§ L.1) — aucune nouvelle colonne. « Plafond » (Livret A, LDDS...) documenté
comme simplification volontaire : pas de suivi/alerte de plafond dans cette livraison, aucune
conséquence fonctionnelle sans mécanisme d'alerte associé.

Nouveau champ `Holding.taux_pct` (nullable, migration Alembic) : un pourcentage annuel **purement
informatif**, jamais appliqué automatiquement à `valeur_estimee` — positif pour un taux d'intérêt
attendu (épargne réglementée/salariale), négatif pour une décote annuelle attendue (véhicule). Sert
à calculer, côté client (`frontend/src/utils/holdingCategories.ts::valeurProjeteeUnAn`), une « valeur
projetée dans 1 an » affichée en repère dans le formulaire d'ajout et l'édition en ligne — jamais de
mutation automatique d'une donnée financière, cohérent avec la philosophie déjà appliquée à la
valorisation immobilière datée. Satisfait ainsi « intérêts capitalisés annuellement » (épargne
réglementée) et « décote annuelle paramétrable » (véhicules) sans job planifié ni recalcul silencieux.

**Bug pré-existant trouvé et corrigé en marge de cette livraison** : `GET /api/portfolio/holdings`
(`routers/portfolio.py::list_holdings`) renvoyait `valeur: null` pour toute ligne valorisée
manuellement sans `prix_revient_moyen` renseigné — cas qui ne s'était simplement jamais présenté
avant (l'immobilier/SCPI/assurance-vie/PER ont en pratique presque toujours un prix de revient), mais
qui devient le cas *normal* d'un compte courant ou d'une épargne réglementée (pas de notion de « prix
de revient » pour un solde). `value_holdings` calculait pourtant déjà la bonne valeur ; seul le test
`prix_connu` du routeur l'ignorait. Corrigé (`h.valeur_estimee is not None` ajouté à la condition),
verrouillé par un nouveau test.

**Reste non traité, reporté** : les 4 natures P2/P3 (métaux précieux, crowdlending, titres non cotés,
objets de valeur) — `OTHER_ASSET` reste leur seule case aujourd'hui, suffisante en pratique tant
qu'aucun besoin réel de champs spécifiques (échéancier, cours au gramme...) ne se présente. Suivi de
plafond (Livret A etc.) et blocage/déblocage anticipé (épargne salariale) : non modélisés, sans
conséquence fonctionnelle sans mécanisme d'alerte associé — à instruire si le besoin apparaît.

#### M.2 — `majeur` · `M` · `P0` · `traité` (version minimale, 21/08/2026) — Rattachement emprunt ↔ actif

Prérequis de la part nette (§ L.1) et de la rentabilité immobilière (§ M.3). Un emprunt se
rattache à zéro, un ou plusieurs actifs, avec une clé de répartition. Le tableau des passifs affiche
l'actif financé ; la fiche de l'actif affiche ses emprunts et le capital restant dû.

**Livré le 21/08/2026, en même temps que L.1** : `Loan.holding_id` (rattachement simple, un emprunt
vers au plus un actif), sélecteur dans `LoansCard.tsx`. **Reste hors périmètre** : rattachement
d'un même emprunt à plusieurs actifs avec une clé de répartition (aujourd'hui : un emprunt ne peut
être rattaché qu'à un seul actif à la fois) — à traiter si un besoin réel se présente.

#### M.3 — `majeur` · `M` · `P1` · `traité` (24/08/2026) — Fiche immobilier complète

C'est le domaine où l'écart avec Finary est le plus visible, et c'est aussi le premier poste du
patrimoine du foyer. À ajouter à la valorisation manuelle existante :

- **Bloc location** : type (nue, meublée, Pinel, LMNP…), périodicité, **loyer mensuel**, **charges
  mensuelles**, **frais annuels** (taxe foncière, copropriété, assurance, gestion).
- **Cashflow mensuel** = loyer − charges − frais/12 − mensualité de l'emprunt rattaché.
- **Rentabilité brute** (loyer annuel / prix d'acquisition) et **nette** (après charges et frais),
  affichées côte à côte avec leur formule.
- **Prix au m²** et surface, pour comparer un bien à l'autre.
- **Caractéristiques** : type, surface, pièces, année, DPE.
- **Historique de valorisation** : une valeur estimée est **datée** ; l'ancienne n'est pas écrasée,
  elle alimente la courbe. Corollaire : afficher explicitement *« estimation saisie le … »* —
  Finary présente une plus-value immobilière comme un fait alors qu'elle vient d'un algorithme, on
  ne reproduit pas ça.

> **Hors périmètre confirmé** : la valorisation immobilière automatique (Finary s'appuie sur
> PriceHubble, prestataire payant). L'alternative retenue est la saisie datée, plus honnête qu'une
> estimation dont on ne maîtrise ni la méthode ni la fraîcheur. À réétudier seulement si une source
> gratuite fiable apparaît — les données DVF de la DGFiP sont une piste (prix de mutation réels),
> à instruire, pas à engager.

**Livré le 24/08/2026** : nouvelle table `HoldingImmobilierDetail` (un par `Holding`, plutôt que
des colonnes de plus sur `Holding` — ces champs n'ont de sens que pour `REAL_ESTATE`) portant le
bloc location (type, loyer, charges, frais annuels agrégés) et les caractéristiques (surface,
pièces, année, DPE), administrable via `PUT /api/portfolio/holdings/{ticker}/immobilier`. Cashflow/
rentabilité brute/nette/prix au m² calculés côté serveur (`services/immobilier_service.py`) et
exposés dans `GET /holdings/{ticker}/detail` (`HoldingDetail.immobilier`, `null` tant qu'aucun
détail n'a été saisi) — cashflow retranche la mensualité de l'emprunt rattaché (`Loan.holding_id`,
§ M.2) si un emprunt existe, `0` sinon ; rentabilités et cashflow restent `None` sans loyer saisi
(rien à calculer), le prix au m² reste calculable seul (surface + valeur suffisent). Nouvelle table
générique `HoldingValuationHistory` (pas seulement pour l'immobilier, même mécanisme que
`valeur_estimee` elle-même) : chaque changement réel de `Holding.valeur_estimee` (création ou
modification, jamais un effacement à `None`) ajoute une ligne plutôt que d'écraser la précédente —
`GET /holdings/{ticker}/immobilier-history` expose l'historique complet, affiché sur la fiche en
tableau chronologique. `Holding.valeur_estimee`/`date_valeur_estimee` restent la valeur COURANTE
(comportement inchangé partout ailleurs) ; cette table est l'audit complet, jamais purgée.
Fiche détaillée (`HoldingDetailContent.tsx`) : nouvelle section pour `type_actif === 'REAL_ESTATE'`
uniquement (formulaire caractéristiques/location, cashflow/rentabilités avec formule affichée,
historique daté) — remplace le graphique de cours (sans objet pour un bien non coté). 585 tests
backend (+17), 261 tests frontend (+5) au vert, vérifié en conditions réelles (backend isolé) :
cashflow correct avant/après rattachement d'un emprunt (700 € → -100 € avec une mensualité de
800 €), historique accumule bien 2 points sur 2 changements de valeur sans qu'une modification d'un
autre champ (nom) n'en ajoute un troisième.

#### M.4 — `mineur` · `M` · `P2` · `traité` (24/08/2026) — Fiche d'actif unifiée

Aujourd'hui seules les positions boursières ont une fiche détaillée. Cible : **toute** ligne du
patrimoine ouvre la même structure à trois onglets — *Aperçu* (valeur, courbe, indicateurs propres
à la nature), *Analyse* (exposition, détention, part nette), *Paramètres* (édition sectionnée).
C'est le patron le plus réussi de Finary et il ne coûte rien à reprendre.

**Livré et vérifié le 24/08/2026.** La fiche (`HoldingDetailContent.tsx`, déjà commune à toutes les
natures d'actif côté backend depuis M.1/M.3) gagne trois onglets réels (`role="tablist"`/`tab`/
`tabpanel`, *Aperçu* sélectionné par défaut) : **Aperçu** — indicateurs clés (quantité, prix,
valeur, rendements), puis la courbe de cours (`HoldingPriceHistoryChart`) ou, pour l'immobilier,
le cashflow/rentabilités/historique de valorisation déjà calculés côté serveur (M.3) — et la carte
émetteur/résumé/frais. **Analyse** — exposition géographique/sectorielle (camemberts + détail brut
justETF + composition en actions du fonds) puis détention/part nette (`DetenteursSection`, L.1),
dans cet ordre pour suivre exactement le libellé du backlog. **Paramètres** — édition sectionnée :
le formulaire de caractéristiques immobilières (seul formulaire de réglages existant aujourd'hui)
pour `REAL_ESTATE`, un état vide explicite (« Aucun paramètre modifiable pour cette ligne pour
l'instant. ») pour toute autre nature — honnête plutôt qu'un onglet qui semblerait cassé. Le badge
de catégorie sous le titre utilise désormais la liste complète de la taxonomie (`TYPE_ACTIF_OPTIONS`,
M.1) au lieu d'un sous-ensemble de 5 valeurs codées en dur — corrige au passage un badge manquant
pour toute ligne SCPI/assurance-vie/PER/compte/épargne/véhicule/autre actif. **Écart assumé** : la
fiche immobilier existante combinait formulaire ET résultat calculé dans un seul bloc (M.3) ; l'état
a été extrait en hook (`useImmobilierDetail`) pour scinder son affichage entre les deux onglets sans
dupliquer la logique de sauvegarde/rechargement. La section Détenteurs reste un seul bloc (saisie de
quotité + part détenue/nette affichées ensemble) plutôt que scindée entre Analyse et Paramètres — la
saisie fait partie intégrante de la lecture de la part nette, les séparer aurait cassé cette
interaction sans bénéfice clair, et « détention, part nette » dans le texte du backlog les regroupe
déjà. 314 tests frontend (+5), `tsc`/`oxlint`/`vite build` propres, vérifié en conditions réelles
(backend isolé, 3 natures — action, immobilier, épargne réglementée) : les 3 onglets s'affichent et
basculent correctement pour chaque nature, l'édition immobilière dans Paramètres met à jour le
cashflow visible dans Aperçu sans rechargement de page, le badge de catégorie affiche le libellé
complet pour une nature hors du sous-ensemble boursier historique.

---

### N. Budget et flux (décision prise le 21/08/2026)

Le § F.1 posait la question ; **elle est tranchée : le budget entre dans le périmètre**, en lot
dédié. Motif : c'est le dernier écart fonctionnel majeur avec Finary, et le besoin
« extraits de dépenses » était déjà exprimé au lancement du projet. Le produit reste un outil de
**suivi** : aucun virement, aucun ordre, aucune action sur un compte.

#### N.1 — `majeur` · `L` · `P1` · `traité` (24/08/2026) — Import et catégorisation des mouvements

- **Import** de relevés bancaires : CSV (format par banque, comme pour le courtier) et **OFX/QIF**,
  qui évitent le travail de mise en correspondance des colonnes.
- **Déduplication** sur (date, montant, libellé normalisé) — un relevé réimporté ne doit jamais
  doubler les lignes.
- **Catégorisation par règles** de l'utilisateur (« libellé contient X → catégorie Y »), appliquées
  à l'import et réappliquables en masse. **Pas de catégorisation par IA** : les règles sont
  lisibles, corrigeables et déterministes ; c'est un avantage sur la boîte noire de Finary, pas un
  renoncement.
- **Arbre de catégories** par défaut (logement, transport, alimentation, loisirs, santé, épargne,
  revenus…), entièrement modifiable.

**Livré et vérifié le 24/08/2026.** Nouvelles tables `categories_budget` (un niveau de
sous-catégorie), `mouvements_bancaires`, `regles_categorisation`, `budget_cibles` — isolées par
foyer comme le reste du modèle (backlog 2.I.1). CSV : réutilise intégralement le mécanisme de
mapping manuel existant (`csv_import.py`, aperçu + cache serveur), avec une bascule montant signé /
débit+crédit séparés (les deux conventions existent selon les banques). OFX (SGML, balises non
fermées) et QIF parsés par expression régulière/ligne à ligne, sans nouvelle dépendance — même
philosophie que `justetf_service.py` (`html.parser` plutôt que `lxml`). **Déduplication** : identifiant
fourni par la source quand il existe (OFX `FITID`), sinon hash déterministe de (date, montant,
libellé normalisé) — verrouille exactement la clé demandée par le backlog, y compris son corollaire
assumé : deux mouvements identiques sur deux comptes différents sont vus comme un seul (le backlog
ne mentionne pas le compte dans la clé). **Catégorisation par règles** : premier motif normalisé
(casse/accents ignorés) trouvé dans le libellé, réappliquable en masse sans jamais écraser une
correction manuelle (`categorise_manuellement`, drapeau posé dès qu'un utilisateur choisit une
catégorie à la main). **Bug corrigé en vérifiant** : les catégories par défaut se resemaient à
chaque appel si l'utilisateur les avait toutes supprimées (impossible de distinguer « jamais
utilisé » de « supprimé volontairement ») — corrigé via un drapeau par foyer dans
`UserParametre`/`preferences_service.py` (seul point d'accès à cette table, convention déjà en
place, respectée plutôt que contournée). **Bug corrigé en vérifiant (2)** : le format QIF (origine
Quicken, US) interprétait ses dates en jour/mois plutôt que mois/jour, inversant silencieusement
les dates à deux chiffres ≤ 12 un mois sur deux — corrigé par une priorité de format dédiée au QIF,
distincte de celle du CSV (convention française jour/mois).

#### N.2 — `majeur` · `M` · `P1` · `traité` (24/08/2026) — Écran Budget

Reprendre la structure qui fonctionne chez Finary : période (1M/3M/1A/personnalisée), quatre
indicateurs — **Entrées / Sorties / Disponible / Dépenses récurrentes** — répartition des sorties,
filtres par catégorie et par compte, et **budget cible par catégorie** avec écart en fin de mois.

**Livré et vérifié le 24/08/2026.** Sélecteur de période mensuel/annuel/personnalisé (même patron
que `RapportPage`, délibérément indépendant de la Période transverse de K.3 — même raisonnement que
Rapport/Objectifs). Quatre indicateurs : Entrées, Sorties, Disponible, et **Dépenses récurrentes**
via une heuristique légère et documentée comme telle (couple libellé normalisé/montant arrondi à
l'euro revenant sur au moins 2 des 3 mois précédant la fin de la période) — volontairement plus
simple que la détection complète prévue par N.3 (hausses de prix, abonnements inutilisés), qui
réutilisera la même clé de correspondance. Répartition des sorties regroupée sur la catégorie
racine (une sous-catégorie et sa racine ne comptent jamais deux fois), avec édition inline du
budget cible et écart coloré. **Filtres par catégorie et par compte** sur la liste des mouvements,
appliqués côté client sur la période déjà chargée (volume d'un budget personnel modeste, évite un
aller-retour réseau par changement de filtre — même choix que le filtrage catégorie de
`PortefeuillePage`). Gestion des catégories et règles regroupée dans une section dépliable sur le
même écran plutôt que dans Réglages, pour rester au plus près du flux d'usage réel (catégoriser
juste après avoir importé). Vérifié en conditions réelles (backend isolé) : import QIF de 6
mouvements réels, recatégorisation manuelle et par règle, réapplication en masse après ajout d'une
règle, édition d'un budget cible avec recalcul immédiat de l'écart, filtres catégorie/compte.

#### N.3 — `mineur` · `M` · `P2` · `non traité` — Détection des récurrences et des abonnements

Détecter les mouvements qui reviennent (même bénéficiaire, montant stable, périodicité régulière),
en déduire la charge fixe mensuelle, signaler les hausses de prix et les abonnements inutilisés.
Finary en a fait un module à part (« Scanner d'abonnements ») ; c'est le sous-produit naturel de
N.1, pas un chantier séparé.

#### N.4 — `mineur` · `S` · `P2` · `non traité` — Jonction budget ↔ patrimoine

Le budget n'a d'intérêt ici que s'il rejoint le patrimoine : **taux d'épargne réel** (épargne /
revenus), **reste à vivre**, et **alimentation automatique du versement mensuel du simulateur** par
le taux d'épargne observé plutôt qu'une hypothèse saisie à la main. C'est le lien que Finary ne
fait pas.

---

### O. Objectifs et pilotage (nouveau, 21/08/2026)

Le simulateur (§ B.1, B.2) calcule une projection à la volée, mais rien n'est conservé. Un objectif
suivi dans le temps est une fonctionnalité différente d'une simulation.

#### O.1 — `majeur` · `M` · `P1` · `non traité` — Objectifs suivis

- Objectif = **nom, montant cible, échéance, actifs rattachés, contributeurs**.
- **Trajectoire** : deux courbes, la trajectoire cible et la trajectoire réelle des versements.
- **Diagnostic en langage naturel** : « en bonne voie », « en retard de 14 mois », « atteint »,
  accompagné du **rendement requis** et de la **contribution mensuelle nécessaire** pour tenir
  l'échéance. C'est le meilleur écran de Finary, et il est reproductible sans donnée externe.
- Types prédéfinis utiles : indépendance financière (reprend le calcul FIRE existant), épargne de
  précaution, apport immobilier, remboursement anticipé.

#### O.2 — `mineur` · `S` · `P2` · `non traité` — Indicateurs de situation

Trois ratios, calculables à partir de ce que nous aurons alors, à afficher avec leur formule :

- **Matelas de sécurité** : épargne disponible / dépenses mensuelles, en mois.
- **Taux d'endettement** : mensualités / revenus nets.
- **Part du patrimoine immobilisée** : actifs non liquides / patrimoine brut.

Finary les vend dans le module « Profil de l'investisseur » ; ils tiennent en trois divisions.

---

### P. Analyses avancées — le terrain que Finary laisse libre

Les avis convergent : Finary n'offre ni TWR, ni volatilité, ni Sharpe, ni bêta, ni analyse
fondamentale ([outilsinvestisseur.fr](https://outilsinvestisseur.fr/finary-avis/)). Nous avons déjà
le XIRR et le look-through audité ; l'écart est court et le différenciateur est net.

#### P.1 — `majeur` · `M` · `P2` · `non traité` — Exposition consolidée tous actifs

Le besoin fondateur du projet, jamais complètement servi : **voir la vraie diversification**, en
combinant le look-through géographique et sectoriel des ETF **avec** l'immobilier, les SCPI et les
fonds euros. Un portefeuille « MSCI World + résidence principale en Île-de-France » n'est pas
diversifié, et aucun écran ne le dit aujourd'hui.

- Une seule répartition consolidée, par zone géographique et par classe d'actif, tous supports
  confondus.
- **Concentration** : part du premier émetteur, des cinq premières lignes, du premier pays.
- L'encart de qualité des données existant reste affiché : une exposition estimée n'est jamais
  présentée comme mesurée.

#### P.2 — `mineur` · `M` · `P2` · `non traité` — Métriques de performance de niveau professionnel

- **TWR** (rendement pondéré par le temps) à côté du **MWR/XIRR** déjà calculé, avec l'explication
  de ce que chacun mesure — l'un juge les décisions, l'autre juge le support.
- **Volatilité annualisée**, **perte maximale (max drawdown)** et durée de récupération.
- **Comparaison à un indice de référence** choisi par l'utilisateur (MSCI World, CAC 40…) sur la
  même période et avec la même méthode.
- Tout cela sur données locales, sans abonnement.

#### P.3 — `mineur` · `S` · `P3` · `non traité` — Revenus passifs projetés

Rendement courant du patrimoine (dividendes + coupons + loyers nets + intérêts) et projection à
12 mois. Reprend le point C.2 (projection des dividendes, écarté le 20/08/2026 pour fiabilité
insuffisante des données `yfinance`), mais l'élargit : les loyers et les intérêts de livrets sont,
eux, parfaitement connus. La projection doit **distinguer ce qui est certain de ce qui est estimé**,
au lieu d'être abandonnée entièrement à cause de sa partie la moins fiable.

---

### Q. Partage et restitution (nouveau, 21/08/2026)

#### Q.1 — `mineur` · `M` · `P2` · `non traité` — Lien de partage révocable

Remplace et précise le § G.1, jusqu'ici bloqué faute d'authentification — le lot L la débloque. Le
modèle de Finary est bon, on le reprend tel quel :

- Lien **anonyme et révocable à tout moment**, avec date d'expiration.
- **Sélection des catégories** partagées, et du détenteur concerné.
- Interrupteurs : partager le budget, partager les objectifs, **masquer les valeurs et les
  quantités** (ne montrer que les proportions), **exiger un code**.
- Lecture seule stricte, journalisée.

#### Q.2 — `mineur` · `M` · `P2` · `non traité` — Déclaration de patrimoine

Le relevé PDF existant (§ D.1) est monolithique. Cible : un document **paramétrable**, destiné à un
tiers concret (banque pour un prêt, notaire pour une donation) —

- **sélection actif par actif** de ce qui figure au document ;
- **par détenteur** : la déclaration de Paul ne contient que ses quotités ;
- reprise du **profil** (revenus nets, dépenses mensuelles, taux d'imposition) pour produire aussi
  le taux d'endettement et le reste à vivre attendus par un prêteur ;
- horodatage, pagination, et mention de la méthode de valorisation de chaque poste.

C'est un usage réel et récurrent chez l'utilisateur (donation, succession, prêt) — cf.
`/areas/patrimoine`.

#### Q.3 — `mineur` · `S` · `P3` · `non traité` — Devise et internationalisation légère

Une devise de référence paramétrable (aujourd'hui l'euro est câblé), et la conversion des actifs
libellés dans une autre devise au cours du jour, avec l'effet de change isolé dans la performance.

---
## 3. Hors périmètre (assumé)

Révisé le 21/08/2026 : deux points sortent de cette liste, trois y restent, un s'y ajoute.

**Sortis du hors-périmètre :**

- ~~**Authentification**~~ : devient un **préalable bloquant** du lot L, comme annoncé. La cible
  d'usage retenue le 21/08/2026 est le **foyer, avec exposition depuis le serveur personnel** — ce
  qui change la nature du risque et impose HTTPS, second facteur, limitation des tentatives,
  gestion des sessions et journal d'accès (§ 2.L.2).
- ~~**Budget / catégorisation des dépenses**~~ : **entre dans le périmètre** (§ 2.N), en lot dédié.
  La catégorisation reste **par règles explicites**, jamais par IA : lisible, corrigeable,
  déterministe.

**Restent hors périmètre :**

- **Fiscalité** (PEA, plus-values, IFI, revenus fonciers) : inchangé, l'application suit la
  performance et le patrimoine, elle ne simule aucun impôt. Seule exception admise : le **taux
  d'imposition saisi** par l'utilisateur comme paramètre du profil, utilisé tel quel dans la
  déclaration de patrimoine (§ 2.Q.2) — une donnée reprise, pas un calcul fiscal.
- **Agrégation bancaire automatique commerciale** (Powens/Budget Insight, Plaid) : contrats B2B avec
  coût par compte connecté, incompatibles avec l'objectif « gratuit ». La piste gratuite (Enable
  Banking) reste à instruire, pas engagée (§ 2.E.2). Note : c'est aussi la principale source de
  panne chez Finary — les bugs de synchronisation représentent l'essentiel des avis négatifs.
- **Trading et produits de rendement intégrés** (achat/vente in-app, APY crypto, assurance-vie
  maison) : hors philosophie du produit. Finary a fait le chemin inverse en 2026 avec *Finary
  Crypto* et *Finary Life* ; c'est cohérent pour un modèle commercial, pas pour le nôtre.
- **Fonctionnalités communautaires** (classement des investissements, percentile face à la
  population française, forum) : sans base d'utilisateurs, un classement n'est pas calculable.
  L'équivalent honnête, et suffisant, est la comparaison à un **indice de référence** (§ 2.P.2).

**Nouvel ajout :**

- **Valorisation immobilière automatique** : Finary s'appuie sur PriceHubble, prestataire payant.
  Aucune source gratuite ne donne aujourd'hui une estimation par bien avec un niveau de confiance
  exploitable. La réponse retenue est la **valeur estimée saisie et datée** (§ 2.M.3), plus honnête
  qu'une estimation opaque. Les données DVF de la DGFiP (prix de mutation réels) sont une piste à
  instruire pour un simple *ordre de grandeur au m²*, pas pour une valorisation.

---

## 4. Priorisation d'ensemble

Trois lots sont clos. Cinq restent, dont un ordre est contraint par les dépendances : la refonte de
l'enveloppe (K) précède tout ajout d'écran, sinon chaque nouveau lot reproduit les défauts
mesurés ; le modèle de détention (L) et le rattachement des emprunts (M.2) précèdent la part nette,
la rentabilité immobilière, les objectifs par contributeur et la déclaration de patrimoine.

| Lot | Contenu | Prérequis | Effort | État |
|---|---|---|---|---|
| **Phase 1** | A.1, A.2, A.3 — patrimoine net (immobilier, SCPI/AV/PER, dettes) | — | — | **Livré** 19/08/2026 |
| **Phase 2** | B.1, B.2, A.4 — simulateur, FIRE, catégorie libre | Phase 1 | — | **Livré** 19-20/08/2026 |
| **Phase 3** | C.1, D.1, D.2, E.3, H.1 — dividendes, PDF, rapport, coût consolidé, PWA | Phase 2 | — | **Livré** 20/08/2026 |
| **Lot 4 — Socle** | K.1, K.2, K.3, K.5, K.7 · L.1, L.2 · M.2 | — | `L` | **Livré** 21-24/08/2026 (8/8) |
| **Lot 5 — Profondeur** | M.1, M.3, M.4 · K.4 (mobile) · K.6 | Lot 4 | `L` | **Livré** 24/08/2026 (5/5) |
| **Lot 6 — Flux** | N.1, N.2, N.3, N.4 | Lot 4 | `L` | En cours — N.1, N.2 livrés (2/4) ; N.3, N.4 restants |
| **Lot 7 — Pilotage** | O.1, O.2 · P.1 · Q.1, Q.2 | Lots 4, 5 (Q.2 : + Lot 6 pour le reste à vivre) | `M` | À lancer |
| **Lot 8 — Différenciation** | P.2, P.3 · Q.3 · E.1 · C.2 (absorbé par P.3) | Lot 7 | `M` | À lancer |

**Pourquoi cet ordre.**

1. **Lot 4 avant tout le reste.** Les mesures du § 2.K ne sont pas des remarques de goût : 24
   classes responsives sur 8 481 lignes, aucun jeton de couleur, aucun squelette de chargement. Ce
   sont des dettes qui se paient à chaque écran ajouté. Y greffer le modèle de détention (L.1) et
   le rattachement des emprunts (M.2) dans le même lot est délibéré : ce sont des changements de
   **modèle de données**, et il est moins coûteux de les faire avant les écrans qui s'appuieront
   dessus qu'après. L.2 (exposition sécurisée) est dans ce lot parce que la décision d'exposer sur
   le serveur personnel a été prise : tant qu'elle n'est pas outillée, l'application ne doit pas
   sortir de `localhost`.
2. **Lot 5 ensuite**, parce que la profondeur du modèle d'actifs est ce qui manque le plus au foyer
   réel (comptes courants, épargne réglementée, épargne salariale, véhicule) et parce que la fiche
   immobilier complète est le premier poste du patrimoine — mais elle a besoin du rattachement des
   emprunts livré au lot 4.
3. **Lot 6 en parallèle possible du lot 5** : le budget ne dépend que du socle. Deux personnes ou
   deux itérations peuvent avancer côte à côte sans conflit, les deux lots ne touchant pas les
   mêmes écrans.
4. **Lot 7** consolide : les objectifs ont besoin des actifs (lot 5) et des contributeurs (lot 4) ;
   la déclaration de patrimoine a besoin des quotités ; le partage a besoin de l'authentification.
5. **Lot 8** est la différenciation pure — TWR, volatilité, comparaison à un indice, revenus
   passifs. Rien ne le bloque, mais rien ne le rend urgent tant que les quatre lots précédents ne
   sont pas livrés : c'est ce qui fait la supériorité de l'outil, pas ce qui le rend utilisable.

**Points restés sans lot, et pourquoi.**

- **E.1** (formats de courtier) : bloqué faute d'un fichier d'export réel d'un autre courtier — pas
  une question de priorité. Rattaché au lot 8 par défaut, à remonter dès qu'un fichier est
  disponible.
- **E.2** (agrégation bancaire) : demande une réponse écrite d'Enable Banking sur le statut
  réglementaire d'un usage personnel **avant tout code**. Reste une instruction, pas un lot.
- **C.2** (projection des dividendes) : absorbé par **P.3**, qui traite le même besoin en séparant
  ce qui est certain (loyers, intérêts de livrets) de ce qui est estimé (dividendes d'ETF) —
  plutôt que d'abandonner l'ensemble à cause de sa partie la moins fiable.
- **F.1** et **G.1** : tranchés le 21/08/2026, devenus respectivement **§ N** et **§ Q.1**.

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
