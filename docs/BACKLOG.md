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

**Mise à jour du 31/08/2026.** Les cinq lots planifiés (4 à 8) sont livrés — Lot 8 pour sa seule
partie développable, deux points (Q.3, E.1) restant hors développement faute d'arbitrage/de donnée
externe (§ 4). Une fois l'usage réel commencé sur les lots livrés, une quinzaine de retours directs
de l'utilisateur (sections **R à W** du § 2) ont affiné le produit sans ouvrir de nouveau chantier
planifié — regroupés a posteriori sous un **Lot 9 « Retours terrain »** (§ 4) pour rester traçables
au même titre que les lots précédents plutôt que de s'accumuler en « hors lot » dispersé. Le backlog
issu de l'audit du 21/08/2026 est donc, pour l'essentiel, épuisé.

**Mise à jour du 01/09/2026.** Un dernier retour direct, plus structurant que les précédents (demande
d'une vue façon Actual Budget), ouvre un chantier autonome — section **X** du § 2, regroupé sous un
**Lot 10 « Comptes structurels »** (§ 4).

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

#### C.2 — `mineur` · `M` · `P2` · `traité (absorbé par P.3)` (25/08/2026) — Projection des dividendes à 12 mois

Plus délicat : extrapoler les dividendes futurs suppose de connaître la régularité de versement de
chaque ligne (annuel, trimestriel...) et le montant par part, que `yfinance` expose partiellement
(`dividendRate`, historique de dividendes par ticker) mais pas pour les ETF de façon fiable. À
cadrer avant de s'engager : projection **approximative**, affichée comme telle (même philosophie que
la qualité des données géographiques déjà en place), pas une promesse de montant exact.

**Non traité le 20/08/2026** (volontairement, pas oublié) : en implémentant C.1/D.1/D.2/E.3/H.1 dans
la même session, ce point a été délibérément écarté — la fiabilité insuffisante de `dividendRate`
pour les ETF (déjà signalée ci-dessus) entre en tension directe avec l'exigence de l'application de
ne jamais afficher un chiffre financier dont la fiabilité n'est pas établie.

**Résolu le 25/08/2026 par § 2.P.3** : le blocage (fiabilité de `dividendRate`) est contourné plutôt
que cadré — la projection des dividendes n'utilise plus aucune donnée `yfinance` théorique, elle
extrapole les dividendes RÉELLEMENT perçus sur les 12 derniers mois glissants (grand livre de CE
portefeuille), toujours étiquetée « estimé », jamais confondue avec la part certaine (loyers,
intérêts de livrets) — cf. § 2.P.3 pour le détail livré.

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

#### F.1 — `majeur` · `L` · `P3` · `traité (tranché et absorbé par § 2.N)` — Suivi des dépenses du quotidien (optionnel)

L'application exclut aujourd'hui **volontairement** les mouvements hors bourse (increment 5 :
virements bancaires, carte) — décision prise pour recentrer l'app sur le suivi boursier pur. Un
module Budget à la Finary réintroduirait ces données. **À trancher avec l'utilisateur avant tout
développement** : soit un écran strictement séparé et optionnel (import distinct, jamais mélangé
aux calculs de performance boursière existants), soit un non-objectif assumé (comme la fiscalité
PEA) si le suivi boursier doit rester le seul périmètre.

**Tranché le 21/08/2026** : le budget entre dans le périmètre, exactement dans la lecture « écran
strictement séparé et optionnel » envisagée ci-dessus — jamais mélangé aux calculs de performance
boursière. Livré en lot dédié, cf. § 2.N (« Budget et flux »), qui référence explicitement ce point
en introduction. Cette entrée n'a été mise à jour que le 25/08/2026 (en marge de R.1) — le statut
`non traité` était resté affiché par erreur après la livraison réelle de N.1-N.4.

### G. Multi-utilisateur et partage

#### G.1 — `mineur` · `L` · `P3` · `traité (absorbé par L.1/L.2 + Q.1)` (25/08/2026) — Partage en lecture seule (conjoint, famille)

Tranché le 21/08/2026 en même temps que F.1 (§ 4, note originale), mais jamais mis à jour ici — le
besoin décrit (« un conjoint/la famille peut consulter en lecture seule ») est couvert par deux lots
livrés depuis : le multi-utilisateur du foyer (§ 2.L.1/L.2, quotités + rôles propriétaire/membre/
invité) pour un accès de l'intérieur du foyer, et surtout le **lien de partage révocable** (§ 2.Q.1,
livré 25/08/2026) pour un tiers hors foyer — plus simple que ce qu'envisageait G.1 à l'origine
(pas besoin de créer un compte au destinataire). Rien à développer de plus sous ce point.

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

**Complété le 04/09/2026** (demande directe de l'utilisateur : un écran d'administration des comptes) :
la carte « Comptes du foyer » (`GestionFoyerCard.tsx`) affiche désormais, par compte, ce qu'un
propriétaire ne pouvait jusque-là voir nulle part — origine locale ou provisionnée/liée via SSO (avec
le nom du fournisseur, `oidc_display_name`, jamais juste un booléen), dernière connexion réussie,
nombre de sessions actives, et un éventuel verrouillage en cours (mêmes calculs que le journal d'accès
et les sessions, jamais dupliqués). Le rôle (`membre`/`invite`) devient éditable directement depuis la
liste (`PATCH /api/auth/household-members/{id}`, nouveau, réservé au propriétaire, IDOR-safe comme le
`DELETE` existant) — jusque-là seule la suppression + recréation permettait de changer un rôle. Calculs
groupés côté serveur (`auth_service.dernieres_connexions_reussies`/`nombre_sessions_actives`, une seule
requête pour tout le foyer) plutôt qu'un aller-retour par membre. Vérifié en conditions réelles
(Playwright, backend isolé) : création → badge « Connexion locale » → changement de rôle persisté après
rechargement → suppression.

**Complété le 05/09/2026** (retours utilisateur sur la livraison précédente) : (1) le propriétaire
connecté apparaît désormais dans sa propre liste (en premier, lecture seule, badge « (vous) ») — avec un
seul compte, la liste ne montrait jusque-là rien, ce qui a été signalé comme un bug ; (2) le nom
d'utilisateur (login, celui du journal d'accès) est maintenant TOUJOURS affiché — il n'était plus visible
dès qu'un nom d'affichage SSO était renseigné, rendant impossible le recoupement avec le journal en
dessous ; (3) le nom d'utilisateur des autres comptes (membre/invité, jamais le sien) devient éditable
depuis cet écran (`PATCH .../household-members/{id}`, schéma renommé `HouseholdMemberUpdate`, `role` et
`username` désormais tous deux facultatifs et combinables en une requête), même patron d'édition en place
que le renommage d'un établissement (`EtablissementsCard.tsx`).

Écarté après investigation, à la demande initiale de l'utilisateur — **transfert de propriété** (choisir
un nouveau propriétaire depuis le sélecteur de rôle de sa propre ligne) : rôle et `owner_user_id` ne sont
pas les seules choses à basculer. **16 tables** portent un `user_id` qui ancre les données au foyer
(`Holding`, `Compte`, `Detenteur`, `Objectif`, `Salaire`, `Etablissement`, `LienPartage`,
`CategorieBudget`, `BudgetCible`, `MouvementBancaire`, `RegleCategorisation`...) — toutes pointent
directement vers l'id du propriétaire d'ORIGINE, jamais recalculées dynamiquement. Un simple échange de
rôles casserait le foyer : les nouvelles données du nouveau "propriétaire" partiraient sous un autre id
que les 51+ positions déjà existantes. Un vrai transfert exigerait de ré-ancrer ces 16 tables en une
seule transaction atomique — un projet à part entière, pas un effet de bord d'un sélecteur de rôle.
Reporté, à cadrer séparément si le besoin se confirme.

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

**Revu le 04/09/2026** : retour aux variables d'environnement plutôt qu'à l'administration depuis
Réglages. Le bouton de connexion avait disparu de l'écran de connexion — en creusant, la configuration
n'avait en réalité jamais été réellement posée sur la vraie base de production (`parametres` ne contenait
aucune ligne `oidc_*`), malgré le texte de la livraison précédente qui la présentait comme utilisée.
Plutôt que de remplir ce formulaire, préférence explicite de l'utilisateur pour l'approche compose/`.env`
initialement proposée (et écartée à l'époque) : `PATRIMOINE_OIDC_ENABLED` devient l'interrupteur
principal, avec 5 variables `PATRIMOINE_OIDC_*` obligatoires si activée (issuer, client id, client
secret, redirect URI, URL du frontend) et 4 facultatives (nom affiché, mapping des 3 claims). Supprimé
entièrement : les endpoints `GET/PUT/DELETE /oidc/config`, `SsoCard.tsx` et l'onglet « SSO / OIDC » de
Réglages, ainsi que `PATRIMOINE_SECRET_KEY` et le chiffrement Fernet dédié du `client_secret` — un
secret qui ne vit plus qu'en variable d'environnement n'a plus besoin d'être chiffré au repos en base.
La clé HMAC signant le `state` anti-CSRF, qui provenait de `PATRIMOINE_SECRET_KEY`, est désormais dérivée
du `client_secret` OIDC lui-même (déjà un secret fort, jamais transmis au navigateur). Aucune migration
de données nécessaire (base réellement vierge de toute config OIDC). Suite backend et frontend mises à
jour en conséquence, au vert.

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

#### N.3 — `mineur` · `M` · `P2` · `traité` (24/08/2026) — Détection des récurrences et des abonnements

Détecter les mouvements qui reviennent (même bénéficiaire, montant stable, périodicité régulière),
en déduire la charge fixe mensuelle, signaler les hausses de prix et les abonnements inutilisés.
Finary en a fait un module à part (« Scanner d'abonnements ») ; c'est le sous-produit naturel de
N.1, pas un chantier séparé.

**Livré et vérifié le 24/08/2026.** Nouveau `services/budget_recurrences_service.py`, regroupe les
mouvements par **libellé normalisé seul** (contrairement à l'heuristique de N.2 qui inclut le
montant dans la clé) — nécessaire pour qu'une hausse de prix reste détectable : deux montants
différents doivent pouvoir appartenir au même groupe. Fenêtre d'observation de 12 mois, fenêtre de
récence de 45 jours (un mouvement non revu depuis plus longtemps est considéré résilié, pas listé
comme charge encore due), seuil de hausse de prix à 5 % entre les deux dernières occurrences,
périodicité classée « mensuelle » si l'intervalle moyen entre occurrences est de 20 à 40 jours,
« irrégulière » sinon (affiché quand même, pas masqué). Nouvelle section « Charges récurrentes et
abonnements » sur l'écran Budget, indépendante de la période sélectionnée (une fenêtre glissante
propre) — reste visible même si le mois affiché n'a aucun mouvement. **« Abonnements inutilisés » du
texte du backlog, non livré tel quel** : aucune donnée de la banque ne permet de savoir si un
abonnement encore facturé est réellement utilisé — la liste complète des charges récurrentes,
présentée pour revue par l'utilisateur, en est l'équivalent honnête (pas de faux signal d'usage
inventé). Vérifié en conditions réelles (backend isolé, 3 mois de mouvements réels) : Netflix détecté
avec une hausse de prix (12,99 € → 14,99 €, +15 %) correctement signalée, Loyer et Livret A détectés
sans hausse, périodicité mensuelle correcte pour les trois.

#### N.4 — `mineur` · `S` · `P2` · `traité` (24/08/2026) — Jonction budget ↔ patrimoine

Le budget n'a d'intérêt ici que s'il rejoint le patrimoine : **taux d'épargne réel** (épargne /
revenus), **reste à vivre**, et **alimentation automatique du versement mensuel du simulateur** par
le taux d'épargne observé plutôt qu'une hypothèse saisie à la main. C'est le lien que Finary ne
fait pas.

**Livré et vérifié le 24/08/2026.** `taux_epargne_reel_pct` = sorties de la catégorie racine
« Épargne » / entrées, `reste_a_vivre` = entrées − sorties « Logement » − somme des charges
récurrentes mensuelles (N.3) sur la période. Repérage des catégories « Épargne »/« Logement » **par
nom** (comparaison normalisée, insensible casse/accents — pas un nouveau champ sur
`CategorieBudget`) : limite assumée et documentée, un renommage de ces deux catégories par défaut
rend le rapprochement indisponible (message explicite affiché à l'écran plutôt qu'un chiffre
silencieusement faux). **Bug corrigé en vérifiant** : la comparaison passait initialement par un
`ILIKE` SQL, dont le `LOWER()` de SQLite ne minuscule que l'ASCII (aucune extension ICU chargée) —
« Épargne » ne matchait jamais « épargne » à cause du É accentué non reconnu ; corrigé en comparaison
Python via `budget_categories_service.normaliser` (déjà utilisée pour les règles de catégorisation).
Simulateur (`SimulateurPage.tsx`) : « Versement mensuel » préempli avec le versement moyen observé
sur le budget des 3 derniers mois (`disponible` moyen mensuel, même fenêtre que l'indicateur
« dépenses récurrentes » de N.2), avec un bouton « Revenir au versement observé » si modifié —
même patron que le préremplissage déjà en place pour le capital de départ et les intérêts déjà
obtenus, dégradation non bloquante en cas d'échec (le champ reste modifiable à la main). Vérifié en
conditions réelles : taux d'épargne et reste à vivre affichés et cohérents avec les mouvements
importés, versement mensuel du Simulateur préempli avec la valeur observée.

---

### O. Objectifs et pilotage (nouveau, 21/08/2026)

Le simulateur (§ B.1, B.2) calcule une projection à la volée, mais rien n'est conservé. Un objectif
suivi dans le temps est une fonctionnalité différente d'une simulation.

#### O.1 — `majeur` · `M` · `P1` · `traité` (24/08/2026) — Objectifs suivis

- Objectif = **nom, montant cible, échéance, actifs rattachés, contributeurs**.
- **Trajectoire** : deux courbes, la trajectoire cible et la trajectoire réelle des versements.
- **Diagnostic en langage naturel** : « en bonne voie », « en retard de 14 mois », « atteint »,
  accompagné du **rendement requis** et de la **contribution mensuelle nécessaire** pour tenir
  l'échéance. C'est le meilleur écran de Finary, et il est reproductible sans donnée externe.
- Types prédéfinis utiles : indépendance financière (reprend le calcul FIRE existant), épargne de
  précaution, apport immobilier, remboursement anticipé.

**Livré et vérifié le 24/08/2026.** Nouvelles tables `objectifs`, `objectif_actifs`,
`objectif_contributeurs` (`holding_id`/`detenteur_id` en vraies FK, même choix que
`QuotiteHolding` — hérite de la même limite déjà connue : un rattachement sur un actif reconstruit
depuis le grand livre boursier ne survit pas à un ré-import qui recrée les lignes avec de nouveaux
`id`). **Progression réelle = valeur actuelle des actifs rattachés** (pas un registre de versements
séparé, réutilise la valorisation déjà en place) ; **trajectoire réelle ancrée sur deux mesures**
seulement (`valeur_a_la_creation` figée en base + valeur actuelle recalculée à la lecture) — écart
assumé avec un historique continu, documenté en toutes lettres à l'écran plutôt que présenté comme
plus fin qu'il ne l'est. Rendement requis et contribution mensuelle nécessaire résolus par formule
fermée (pas de bissection nécessaire, contrairement au XIRR). Nouveau composant
`ObjectifsSuivisSection.tsx`, monté en tête de l'écran `/objectifs` (existant, jusqu'ici occupé par
le seul Simulateur — cohabitent maintenant sur le même écran, l'objectif persisté au-dessus, la
projection à la volée en dessous, dans cet ordre car c'est l'écran que le backlog désigne comme le
plus important). Vérifié en conditions réelles : création avec actif rattaché, diagnostic « en
bonne voie » cohérent avec la progression, suppression.

#### O.2 — `mineur` · `S` · `P2` · `traité` (24/08/2026) — Indicateurs de situation

Trois ratios, calculables à partir de ce que nous aurons alors, à afficher avec leur formule :

- **Matelas de sécurité** : épargne disponible / dépenses mensuelles, en mois.
- **Taux d'endettement** : mensualités / revenus nets.
- **Part du patrimoine immobilisée** : actifs non liquides / patrimoine brut.

Finary les vend dans le module « Profil de l'investisseur » ; ils tiennent en trois divisions.

**Livré et vérifié le 24/08/2026.** « Épargne disponible » = holdings `CASH_ACCOUNT`/
`REGULATED_SAVINGS` (les deux seuls types immédiatement disponibles sans délai ni pénalité parmi
`TYPES_ACTIF_PATRIMOINE_MANUEL`, backlog § 2.M.1) ; « dépenses mensuelles »/« revenus nets » moyennés
sur les 3 derniers mois de mouvements bancaires (même fenêtre que N.2/N.4) ; « actifs non liquides »
= le reste de `TYPES_ACTIF_PATRIMOINE_MANUEL` ; « patrimoine brut » = `actifs_totaux` déjà calculé
par `patrimoine_service`. Chaque ratio affiche « — » plutôt qu'un chiffre trompeur quand une donnée
manque (aucun mouvement bancaire importé, aucun emprunt). Carte affichée juste sous les objectifs
suivis, sur le même écran `/objectifs`. Vérifié en conditions réelles : les trois ratios calculés
correctement sur des données réelles (épargne, emprunt, mouvements bancaires).

---

### P. Analyses avancées — le terrain que Finary laisse libre

Les avis convergent : Finary n'offre ni TWR, ni volatilité, ni Sharpe, ni bêta, ni analyse
fondamentale ([outilsinvestisseur.fr](https://outilsinvestisseur.fr/finary-avis/)). Nous avons déjà
le XIRR et le look-through audité ; l'écart est court et le différenciateur est net.

#### P.1 — `majeur` · `M` · `P2` · `traité` (24/08/2026) — Exposition consolidée tous actifs

Le besoin fondateur du projet, jamais complètement servi : **voir la vraie diversification**, en
combinant le look-through géographique et sectoriel des ETF **avec** l'immobilier, les SCPI et les
fonds euros. Un portefeuille « MSCI World + résidence principale en Île-de-France » n'est pas
diversifié, et aucun écran ne le dit aujourd'hui.

- Une seule répartition consolidée, par zone géographique et par classe d'actif, tous supports
  confondus.
- **Concentration** : part du premier émetteur, des cinq premières lignes, du premier pays.
- L'encart de qualité des données existant reste affiché : une exposition estimée n'est jamais
  présentée comme mesurée.

**Livré et vérifié le 24/08/2026.** Nouveau champ `Holding.zone_geo` (nullable, une des 6 zones déjà
utilisées partout ailleurs dans l'app — jamais une granularité par pays) pour déclarer la zone d'un
actif valorisé manuellement (immobilier/SCPI/assurance-vie/PER/épargne...) ; `None` retombe sur
`ZONE_EUROPE` (hypothèse la plus probable pour ce type d'actif français) plutôt que sur "Non
catégorisé", pour que la fonctionnalité soit utilisable immédiatement sur les lignes déjà saisies
avant son ajout — champ éditable dès la création via le formulaire d'ajout manuel du Portefeuille
(pas encore d'édition a posteriori d'une ligne existante, seulement à la création). Nouvelle fonction
`patrimoine_service.compute_exposition_consolidee` : géo réutilise
`analysis_service.breakdown_with_lookthrough` (déjà éclaté sur la composition interne des fonds), les
actifs manuels y contribuent via `zone_geo` ; classe réutilise le dictionnaire de labels déjà étendu
par M.1. « Premier émetteur » interprété comme la plus grosse LIGNE du portefeuille (pas un vrai
agrégat multi-fonds par émetteur réel, qui demanderait de recouper le look-through de chaque fonds
avec les positions détenues en direct — hors de portée pour un item `M`, documenté comme limite
assumée). `part_estimee_manuelle_pct` (part du patrimoine dont la géo est déclarée plutôt que
mesurée) sert de rappel honnête sans dupliquer tout l'encart de qualité des données existant, qui
reste affiché tel quel sur l'écran Répartition pour le seul financier — conforme au dernier point du
besoin initial. Nouvel écran `ExpositionConsolideeCard` monté en tête de `/analyse` (avant la
comparaison objectifs vs réel, qui reste financière uniquement). Nouvel endpoint
`GET /api/patrimoine/exposition-consolidee`, ouvert propriétaire+membre, explicitement hors du
périmètre invité (seuls Patrimoine net/Portefeuille/Emprunts le sont, cf. L.2). Vérifié en
conditions réelles : actif financier sans cotation → "Non catégorisé" (comportement inchangé, la
bascule `zone_geo` ne s'applique qu'aux actifs valorisés manuellement) ; actif manuel sans zone
déclarée → Europe par défaut ; actif manuel avec zone déclarée → zone respectée ; concentration et
`part_estimee_manuelle_pct` recoupés à la main sur un jeu de données de test.

#### P.2 — `mineur` · `M` · `P2` · `traité` (25/08/2026) — Métriques de performance de niveau professionnel

- **TWR** (rendement pondéré par le temps) à côté du **MWR/XIRR** déjà calculé, avec l'explication
  de ce que chacun mesure — l'un juge les décisions, l'autre juge le support.
- **Volatilité annualisée**, **perte maximale (max drawdown)** et durée de récupération.
- **Comparaison à un indice de référence** choisi par l'utilisateur (MSCI World, CAC 40…) sur la
  même période et avec la même méthode.
- Tout cela sur données locales, sans abonnement.

**Livré et vérifié le 25/08/2026.** Toutes les métriques (TWR, volatilité, max drawdown, récupération)
sont calculées à partir de la série hebdomadaire DÉJÀ produite par
`historical_performance_service.compute_portfolio_history` (celle du graphique d'évolution du tableau
de bord, déjà mise en cache) — nouveau `services/metriques_performance_service.py`, aucun nouvel appel
`yfinance` pour ces métriques elles-mêmes. Approximation assumée et documentée : chaque semaine de la
grille est traitée comme une sous-période TWR (le flux net investi pendant cette semaine est retranché
de la valeur de fin avant de calculer son rendement) — un versement en milieu de semaine n'est isolé
qu'à la semaine près, la même limite de précision que le graphique d'évolution lui-même. Max drawdown :
recherche du pic précédant le creux le plus profond, durée de récupération mesurée depuis CE creux
(pas depuis le pic d'origine) jusqu'au premier retour à son niveau — `null`/« non récupéré à ce jour »
si le portefeuille reste sous ce niveau.

**Comparaison à un indice de référence** : liste fermée de 4 indices (MSCI World via `URTH`, S&P 500,
CAC 40, STOXX Europe 600 — jamais un ticker arbitraire saisi par l'utilisateur, pour éviter toute
résolution/validation d'un identifiant quelconque). Historique complet de l'indice mis en cache
globalement (`historique_cache.cle_historique_benchmark`, comme l'historique d'une ligne : une donnée
de marché publique, partagée entre tous les foyers, jamais recalculée par utilisateur). Les deux
séries (portefeuille et indice) sont normalisées en pourcentage depuis leur valeur au premier point
commun, pour rester comparables malgré des échelles différentes (euros vs points d'indice).

Frontend : nouvelle `MetriquesAvanceesCard`, sous la carte Rentabilité globale du tableau de bord (le
TWR apparaît ainsi directement à côté du MWR déjà affiché, comme demandé) — texte explicatif
MWR vs TWR, sélecteur d'indice avec graphique de comparaison en pourcentage. 14 tests backend
(métriques pures + comparaison benchmark + routeur) + 6 tests frontend, `tsc`/`oxlint` propres.

#### P.3 — `mineur` · `S` · `P3` · `traité` (25/08/2026) — Revenus passifs projetés

Rendement courant du patrimoine (dividendes + coupons + loyers nets + intérêts) et projection à
12 mois. Reprend le point C.2 (projection des dividendes, écarté le 20/08/2026 pour fiabilité
insuffisante des données `yfinance`), mais l'élargit : les loyers et les intérêts de livrets sont,
eux, parfaitement connus. La projection doit **distinguer ce qui est certain de ce qui est estimé**,
au lieu d'être abandonnée entièrement à cause de sa partie la moins fiable.

**Livré et vérifié le 25/08/2026, absorbe C.2.** Nouveau `services/revenus_passifs_service.py`,
`GET /api/performance/revenus-passifs` — aucun appel `yfinance`, contrairement à ce qu'exigeait C.2
(justement ce qui l'avait fait écarter). **Certain** : loyers nets annuels (`HoldingImmobilierDetail.loyer_mensuel`
− charges − frais, sans retrancher la mensualité d'emprunt — un revenu locatif, pas un cashflow après
emprunt) + intérêts de livrets (taux déclaré § 2.M.1 × `valeur_estimee`). **Estimé** : dividendes et
intérêts de courtage réellement perçus sur les 12 DERNIERS mois glissants (`Transaction`), extrapolés
tels quels sur les 12 prochains — jamais un `dividendRate` théorique par titre (le problème de
fiabilité originel de C.2), toujours une observation directe du grand livre de CE portefeuille.
Nouvelle `RevenusPassifsCard` sur le tableau de bord, indépendante de l'historique de transactions
(un foyer sans aucun achat boursier peut avoir des loyers/une épargne à taux). 8 tests backend + 3
tests frontend, `tsc`/`oxlint` propres.

---

### Q. Partage et restitution (nouveau, 21/08/2026)

#### Q.1 — `mineur` · `M` · `P2` · `traité` (25/08/2026) — Lien de partage révocable

Remplace et précise le § G.1, jusqu'ici bloqué faute d'authentification — le lot L la débloque. Le
modèle de Finary est bon, on le reprend tel quel :

- Lien **anonyme et révocable à tout moment**, avec date d'expiration.
- **Sélection des catégories** partagées, et du détenteur concerné.
- Interrupteurs : partager le budget, partager les objectifs, **masquer les valeurs et les
  quantités** (ne montrer que les proportions), **exiger un code**.
- Lecture seule stricte, journalisée.

**Livré et vérifié le 25/08/2026.** Premier point d'accès **public** (sans authentification) de
toute l'application — traité avec la même discipline que L.2 (rôles/verrouillage), dont il réutilise
directement les briques : hachage `pbkdf2_sha256` du code (`auth_service.hash_password`,
`LienPartage.code_hash`) et verrouillage temporaire par lien après 5 échecs en 15 minutes (nouvelle
table `partage_acces`, même mécanique que `AccessLogEntry`/`verrouillage_actif` mais scopée par lien
plutôt que par compte). Deux routeurs délibérément séparés : `routers/partage.py` (gestion,
réservée `ROLE_PROPRIETAIRE` — un membre garde un accès large en lecture/écriture sur les données du
foyer mais ne peut pas les exposer publiquement) et `routers/partage_public.py` (consultation, aucune
dépendance d'authentification), pour qu'aucun garde-fou ne puisse s'y glisser par erreur au fil des
évolutions futures.

**Surface volontairement restreinte à des sections agrégées** — patrimoine net, exposition
consolidée (2.P.1), rentabilité, budget (mois en cours), objectifs — jamais le détail position par
position, les transactions, ni les libellés de compte : même un lien deviné/fuité n'expose donc
jamais autant qu'un compte `invite` authentifié. `masquer_valeurs` convertit chaque montant en
pourcentage plutôt que de l'omettre silencieusement (la forme de la répartition reste visible,
jamais son échelle) ; les ratios/pourcentages déjà relatifs (rendement, concentration) ne sont
jamais masqués, ce ne sont ni des valeurs ni des quantités. `detenteur_id` ne filtre que la section
patrimoine net (seul calcul qui le supporte aujourd'hui) — budget/objectifs/exposition consolidée
restent vue foyer complète si activés à côté d'un détenteur, limite assumée et signalée dans
l'interface de création plutôt que silencieuse.

Frontend : nouvelle route publique `/partage/:token`, montée en dehors d'`AuthProvider`/
`PreferencesAffichageProvider` dans `App.tsx` (aucun composant de cette page ne dépend de ces
contextes) — un visiteur sans jeton y accède normalement. `api/client.ts` : les échecs `401` sur
`/partage-public/*` (mauvais code) n'invalident plus la session d'un propriétaire déjà connecté qui
testerait son propre lien dans un nouvel onglet (même exemption déjà en place pour `/auth/*`).
Gestion des liens depuis un nouvel onglet « Partage » de Réglages.

Vérifié en conditions réelles et par les tests (33 tests service/routeur + tests de rôles) : création/
liste/révocation par le propriétaire, 403 pour un membre, consultation publique sans aucun jeton
(vrai flux HTTP, pas seulement l'override de test), verrouillage après 5 codes incorrects, aucune
fuite de ticker individuel dans la charge publique.

#### Q.2 — `mineur` · `M` · `P2` · `traité` (25/08/2026) — Déclaration de patrimoine

Le relevé PDF existant (§ D.1) est monolithique. Cible : un document **paramétrable**, destiné à un
tiers concret (banque pour un prêt, notaire pour une donation) —

- **sélection actif par actif** de ce qui figure au document ;
- **par détenteur** : la déclaration de Paul ne contient que ses quotités ;
- reprise du **profil** (revenus nets, dépenses mensuelles, taux d'imposition) pour produire aussi
  le taux d'endettement et le reste à vivre attendus par un prêteur ;
- horodatage, pagination, et mention de la méthode de valorisation de chaque poste.

C'est un usage réel et récurrent chez l'utilisateur (donation, succession, prêt) — cf.
`/areas/patrimoine`.

**Livré et vérifié le 25/08/2026.** Nouveau `services/declaration_patrimoine_service.py`, séparé du
relevé PDF existant (§ D.1, resté inchangé) — ne calcule rien lui-même, réutilise telles quelles
`analysis_service.value_holdings`, `detenteurs_service.compute_parts`, `loan_service.compute_capital_restant_du`,
`objectifs_service.compute_indicateurs_situation` (revenus/dépenses/taux d'endettement, moyenne
glissante 3 mois — même fenêtre que O.2) et `budget_service.compute_jonction_patrimoine` (reste à
vivre, mois en cours — même fenêtre que N.4) ; les totaux de la synthèse sont la somme EXACTE des
lignes affichées (jamais un chiffre d'ensemble qui pourrait diverger silencieusement de la sélection).
Filtrage par détenteur : `part_dette` d'un emprunt dérivée de `compute_parts` (`part_detenue −
part_nette`) — un emprunt non rattaché à un actif (limite déjà connue de M.2) n'apparaît alors que
dans la déclaration foyer entier. Méthode de valorisation par ligne : « Valeur estimée déclarée le
JJ/MM/AAAA » (actif manuel), « Cours de marché au JJ/MM/AAAA » (cotation disponible), ou « Prix de
revient (non coté) » (repli sans cotation) — jamais un chiffre sans dire d'où il vient. Pagination
ajoutée (numéro de page en bas, absent du relevé § D.1 qui n'en avait pas besoin sur une page). Nouveau
réglage `taux_imposition_pct` (Réglages, saisi par l'utilisateur, jamais un calcul fiscal — seule
exception admise au hors-périmètre fiscalité, cf. § 3), stocké comme les autres préférences par
utilisateur, `None` par défaut. Nouvel endpoint `POST /api/export/declaration-patrimoine.pdf` (POST,
pas GET : la sélection peut porter sur de nombreux identifiants). Frontend : nouvelle
`DeclarationPatrimoineModal` (sélection actif par actif/emprunt par emprunt via cases à cocher, toutes
cochées par défaut, détenteur/destinataire/profil optionnels), déclenchée depuis Réglages → Général ;
téléchargement via blob + `<a download>` généré côté client (`requestBlob`, nouvelle fonction
factorisée avec `request` dans `api/client.ts` — même gestion d'erreur/jeton, seule la lecture du
corps de réponse diffère). 27 tests backend (service + routeur + préférences étendues) + 7 tests
frontend, `tsc`/`oxlint` propres.

#### Q.3 — `mineur` · `S` · `P3` · `en attente d'arbitrage` (25/08/2026) — Devise et internationalisation légère

Une devise de référence paramétrable (aujourd'hui l'euro est câblé), et la conversion des actifs
libellés dans une autre devise au cours du jour, avec l'effet de change isolé dans la performance.

**Mis de côté le 25/08/2026** (décision à prendre avec l'utilisateur, pas un blocage technique) :
un écart significatif est apparu entre l'effort affiché (`S`) et la portée d'une lecture littérale
de l'énoncé. Aujourd'hui, l'euro est câblé en dur dans des dizaines de fichiers (`formatEuro` seul,
sans paramètre de devise), et le portefeuille réel de l'utilisateur ne contient aujourd'hui AUCUN
actif réellement libellé hors euro (l'export Trade Republic est déjà entièrement converti en EUR à
la source, cf. § 2 increment 1). Une « devise de référence paramétrable pour tout le patrimoine »
au sens plein toucherait donc quasiment tous les écrans de l'application pour un besoin non observé
dans les données réelles à ce jour — un chantier bien au-delà d'un effort `S`. Deux lectures bien
plus contenues existent (permettre d'ajouter UN actif dans une devise étrangère, converti en EUR à
la cotation — l'euro restant la seule devise d'affichage — ou une vraie bascule de devise de
référence pour tout le patrimoine). Arbitrage à demander à l'utilisateur avant tout développement.

### R. Revenu du foyer et taux d'épargne (Lot 9, 25/08/2026)

#### R.1 — `mineur` · `M` · `P2` · `traité` (25/08/2026) — Calculateur brut/net + taux d'épargne

Demande directe de l'utilisateur (25/08/2026) : un écran pour saisir son salaire (brut ou net,
mensuel ou annuel, cadre ou non-cadre, avec le nombre de versements dans l'année — 12/13/14…) et en
déduire le reste façon calculatrice brut-net grand public. Deuxième besoin, lié mais distinct : une
vue du **taux d'épargne réel** — quelle part du revenu part effectivement à l'investissement chaque
année — clairement séparée du `rendement` déjà affiché ailleurs (carte Performance, § 2.P.2), qui
mesure la performance de MARCHÉ sur ce qui est déjà investi, pas le comportement d'épargne.

**Livré le 25/08/2026, révisé le même jour suite au retour de l'utilisateur.** Nouvel écran
`/salaire` (propriétaire seul, même sensibilité que les Objectifs). Conversion brut/net
**approximative et assumée comme telle** (coefficients forfaitaires cadre 0,75 / non-cadre 0,78, pas
un moteur de paie certifié — aucune API gratuite fiable pour ça).

**v1** (première livraison) : une ligne de salaire par année, foyer entier, net après impôt réutilisant
`Preferences.taux_imposition_pct` (§ 2.Q.2). **v2** (même jour, sur retour utilisateur) : l'utilisateur
a demandé de pouvoir saisir **plusieurs salaires** par année (un par revenu du foyer) **avec des taux
d'imposition différents**, directement éditables dans l'onglet Salaire plutôt que dépendants d'un
réglage global. Contrainte d'unicité `(user_id, annee)` retirée de la table `salaires`, ajout de
`nom` (distingue les entrées à l'affichage) et `taux_imposition_pct` propre à chaque entrée. Le taux
d'épargne, qui ne peut plus se calculer entrée par entrée sans fausser le ratio, est désormais un
agrégat par année (`compute_synthese_annee` : somme des revenus nets de toutes les entrées — après
impôt quand connu, avant impôt en repli sinon — rapportée à l'unique montant investi de l'année,
calculé une seule fois). Nouvelle migration Alembic (`38389a473a71`, additive + drop de contrainte en
mode batch), `GET /api/salaire/` renvoie désormais `{entrees, syntheses}`, CRUD par `id` d'entrée
(`POST`/`PUT /{id}`/`DELETE /{id}`) plutôt que par année.

**Incident et correctif (25/08/2026)** : entre la livraison et le retour de l'utilisateur, celui-ci a
signalé un `404 Not Found` sur `/salaire`. Cause : son backend réel tournait depuis avant l'ajout du
routeur — Python n'exécute `app.include_router(...)` (et les migrations) qu'au démarrage du process,
un `uvicorn` déjà lancé ne les recharge jamais tout seul. Corrigé par un redémarrage propre (sauvegarde
préalable de la vraie base, données vérifiées intactes après). Deux mesures prises pour ne pas répéter
ce type d'erreur : nouveau test de non-régression générique `backend/tests/test_main.py` (verrouille
qu'un futur routeur écrit dans `app/routers/` mais jamais enregistré dans `main.py` ferait échouer la
suite plutôt qu'échouer silencieusement en production — vérifié en le cassant exprès puis en confirmant
qu'il échoue) et une entrée dans `docs/MANUEL_EXPLOITATION.md` § 10 sur la nécessité de toujours
redémarrer (jamais `--reload`) après un changement touchant `main.py`/`database.py`/un nouveau routeur.
Aucun test automatisé ne peut en revanche détecter « le process n'a pas été redémarré » — c'est un fait
d'exploitation, pas un défaut de code.

Vérifié en conditions réelles (backend isolé, compte de test, puis vrai backend redémarré) : saisie
3000 €/mois brut cadre × 13 versements → 39 000 € brut annuel, 29 250 € net avant impôt (coefficient
0,75) ; deux entrées de la même année avec des taux d'imposition différents → synthèse correctement
agrégée (revenu net total = somme des deux, montant investi non dupliqué). 46+ tests backend (service +
routeur + garde-fou de câblage des routeurs, dont isolation inter-comptes et restriction au rôle
propriétaire) + 10 tests frontend (arithmétique pure + page : état vide, erreur+retry, ajout/
modification/suppression d'entrée, aperçu live avec/sans taux d'imposition, agrégation multi-entrées,
historique).

#### R.2 — `mineur` · `M` · `P2` · `traité` (25/08/2026) — Déploiement Docker (homelab, non exposé)

Demande directe de l'utilisateur, en marge d'un passage d'onboard sur le projet : pouvoir faire
tourner l'application sur son homelab en Docker, avec un `compose-exemple.yaml` fonctionnel, et
explicitement **pas ouvert au public pour l'instant**.

**Livré et vérifié le 25/08/2026.** `backend/Dockerfile` (Python 3.14-slim, `uvicorn --host
0.0.0.0`), `frontend/Dockerfile` (build multi-étapes Node → nginx), `frontend/docker/nginx.conf`,
`compose-exemple.yaml` à la racine. Architecture retenue : **nginx sert le frontend ET reverse-
proxy `/api/` vers le service backend** (résolution par nom Docker Compose, `http://backend:8000`)
— le navigateur ne parle donc qu'à une seule origine, aucune requête cross-origin réelle dans ce
déploiement, `api/client.ts` inchangé (appelle déjà des chemins relatifs). CORS rendu configurable
par `PATRIMOINE_CORS_ORIGINS` (`backend/app/main.py`, repli sur les deux origines de dev si absent —
comportement local inchangé) plutôt que codé en dur, pour un usage futur hors de ce schéma de
référence.

**Deux volumes nommés distincts**, pas un seul : `patrimoine_data` (`/app/data`, la base) et
`patrimoine_sauvegardes` (`/app/sauvegardes`) — nécessaire car `scripts/sauvegarde.py` dépose
toujours les sauvegardes à la racine du code backend (`DOSSIER_SAUVEGARDES_PAR_DEFAUT`), jamais sous
le chemin de `PATRIMOINE_DB` ; sans ce second volume, le job planifié `sauvegarde_chiffree` (§ 2.L.2)
écrirait dans une couche de conteneur perdue à la prochaine reconstruction de l'image.

**Pas exposé au public** : les deux ports publiés sont liés à `127.0.0.1` sur l'hôte
(`"127.0.0.1:8000:8000"`, `"127.0.0.1:8080:80"`), jamais `0.0.0.0` — confirmé par inspection directe
des mappages de ports des conteneurs lancés (`docker ps`), pas seulement lu dans le fichier.

Vérifié en conditions réelles (Docker Desktop, build + exécution réels, pas seulement une relecture
de syntaxe) : les deux images se construisent sans erreur ; `docker compose up` démarre les deux
conteneurs ; `GET /api/health` répond `{"status":"ok"}` en direct sur le port backend ET à travers le
proxy nginx du frontend (confirme le reverse-proxy) ; page d'accueil et route client
(`/patrimoine`, rechargement direct) répondent `200` (confirme `try_files ... index.html`) ;
inscription + connexion complètes via l'origine frontend (aucune erreur CORS) ; **persistance des
données confirmée** après un cycle `docker compose down && up` complet (compte créé avant l'arrêt,
connexion réussie après redémarrage sur les mêmes volumes). 786 tests backend toujours au vert après
le changement CORS (aucune régression sur le comportement de dev par défaut).

**Hors périmètre de cet incrément, assumé** : reverse proxy/HTTPS et exposition publique
(explicitement refusés par l'utilisateur pour l'instant — cf. § 2.L.2 pour la connexion SSO déjà
prête pour ce jour-là), pas de `.env`/`env_file` séparé (un seul fichier auto-porteur avec
placeholders commentés, conforme à la demande d'un exemple simple). Le point « pas de CI/registry
d'images » a depuis été rouvert et livré, cf. ci-dessous.

**Extension le même jour (25/08/2026) — CI GitHub Actions + déploiement homelab distant.** Demande
directe de suivi : déployer sur un homelab **distant** sans y construire les images. Deux décisions
actées avec l'utilisateur avant implémentation : (1) le homelab expose les ports sur son réseau
local (`0.0.0.0`, pas `127.0.0.1`) pour un usage quotidien réel — l'exposition à internet reste
entièrement décidée par son routeur, jamais par Docker ; (2) les images restent **privées** sur
GHCR, cohérent avec le dépôt GitHub déjà privé (confirmé par `gh repo view`), au prix d'une
authentification unique (`docker login ghcr.io`, jeton personnel `read:packages`) sur le homelab.

Livré : `.github/workflows/docker-publish.yml` (construit et pousse les deux images sur
`ghcr.io/nello10110/application-patrimoine-{backend,frontend}` à chaque push sur `main`, tags
`latest` + SHA du commit pour un rollback manuel possible ; conversion du nom du propriétaire en
minuscules, exigée par GHCR) ; `compose-homelab.yaml` (même structure que `compose-exemple.yaml`,
`image:` au lieu de `build:`, ports sans IP hôte précisée donc `0.0.0.0`). Syntaxe validée
(`docker compose -f compose-homelab.yaml config`) ; l'exécution réelle de la CI et le
`docker login`/`pull` depuis le vrai homelab restent à confirmer par l'utilisateur (machine hors de
portée de cet environnement de développement).

#### R.3 — `mineur` · `S` · `P2` · `traité` (25/08/2026) — Décomposition investi/généré du Rapport

Demande directe de l'utilisateur : sur l'écran Rapport, l'« évolution sur la période » (ex. +65 %)
mélange deux choses très différentes — l'argent que l'utilisateur a lui-même ajouté (achats) et ce
que le portefeuille a produit tout seul (plus-value, dividendes, intérêts). Voulait voir les deux
séparément.

**Livré et vérifié le 25/08/2026.** Nouvelle carte « D'où vient l'évolution ? » sur `/rapport` :
`montant_investi_periode` (réutilise `performance_service.montant_investi_periode`, déjà écrite pour
le taux d'épargne § 2.R.1) et `gain_genere_periode`, calculé avec la même identité algébrique que la
réconciliation du graphique d'accueil (§ 2.J.1) — `valeur_portefeuille + valeur_realisee_cumulee -
valeur_investie` — appliquée en delta sur la période plutôt qu'en cumulé depuis l'origine.

**Bug trouvé et corrigé en vérification réelle, avant toute mise en production** : la fonction
existante `_valeur_a_ou_avant` (qui sert à afficher `evolution_pct`) retombe délibérément sur le
premier point connu quand la période demandée commence avant tout historique — comportement voulu
pour CET usage (afficher 0 % plutôt qu'une case vide). Réutiliser cette même fonction pour la
décomposition investi/généré produisait un résultat faux : un achat de 1000 € le même jour que le
tout premier point d'historique, demandé sur une période commençant plus tôt (ex. rapport annuel,
achat en juin), donnait -986,5 € de « généré » au lieu des 13,5 € de dividende réellement produits —
l'achat de 1000 € était compté une seconde fois en négatif, parce que la valeur de départ reprenait à
tort la valeur DÉJÀ investie du premier point. Corrigé par une nouvelle fonction dédiée
(`_champ_strict_a_ou_avant`, `rapport_service.py`) qui retombe sur `0`, jamais sur le premier point,
pour cette décomposition spécifiquement — `evolution_pct` reste inchangé, aucune régression sur son
comportement déjà en production. Verrouillé par un test dédié reproduisant exactement ce scénario.

12 tests backend (dont le test de régression ci-dessus) + 10 tests frontend au vert.

### S. Épargne et actifs valorisés manuellement (Lot 9, 25/08/2026)

#### S.1 — `majeur` · `M` · `P2` · `traité` (25/08/2026) — Écran Épargne + historique de valorisation daté par l'utilisateur

Demande directe de l'utilisateur : les actifs boursiers/immobilier/crypto/obligations sont jugés
bien traités, mais tout ce qui est valorisé manuellement — assurance-vie, PER, épargne retraite,
épargne salariale, compte courant, véhicule — reste « pas top top ». Besoin reformulé : pouvoir
indiquer, à la fréquence de son choix (pas une périodicité imposée), « à telle date, cet actif
valait X € », construire ainsi un historique daté plutôt qu'une simple valeur courante écrasée, en
tirer un petit graphique d'évolution par actif, pouvoir indiquer un versement mensuel récurrent
(ex. assurance-vie alimentée chaque mois), et faire entrer tout ça dans les projections
(Simulateur/FIRE). Éventuellement un écran séparé — l'utilisateur n'est pas sûr de la forme, demande
explicitement à construire le besoin ensemble plutôt qu'une exécution silencieuse.

**Audit du code existant avant toute proposition** (pour ne pas redemander ce qui existe déjà) :
- Le modèle sait déjà presque tout faire côté base : 9 types valorisés manuellement
  (`models.TYPES_ACTIF_PATRIMOINE_MANUEL` — `REAL_ESTATE`/`SCPI`/`LIFE_INSURANCE`/`PENSION`/
  `OTHER_ASSET`/`CASH_ACCOUNT`/`REGULATED_SAVINGS`/`EMPLOYEE_SAVINGS`/`VEHICLE`), une vraie table
  d'historique daté (`HoldingValuationHistory`, backlog § 2.M.3, jamais purgée), un taux annuel
  informatif (`Holding.taux_pct` — intérêt épargne ou décote véhicule, jamais appliqué
  automatiquement).
- **Deux limites concrètes identifiées, précises** :
  1. **La date de chaque point d'historique est toujours "maintenant"**, jamais choisie. Le service
     (`immobilier_service.enregistrer_point_historique`) accepte pourtant bien une date arbitraire
     en paramètre — c'est le routeur (`routers/portfolio.py`, `create_holding`/`update_holding`) qui
     la câble en dur sur `datetime.now()`, sans jamais la faire remonter depuis le client. Impossible
     aujourd'hui de saisir après coup « au 1er janvier, ça valait X ».
  2. **Le graphique d'historique (et son chargement réseau) sont réservés à l'immobilier** —
     `frontend/src/components/HoldingDetailContent.tsx`, `estImmobilier = detail.type_actif ===
     'REAL_ESTATE'` conditionne tout (`useImmobilierDetail`, carte « Historique de valorisation »).
     Assurance-vie/PER/compte courant/épargne/véhicule n'en bénéficient jamais alors que le backend
     le permettrait déjà (`GET /holdings/{ticker}/immobilier-history` n'est pas réservé à
     l'immobilier malgré son nom, cf. sa propre docstring).
  3. **Aucun champ « versement mensuel récurrent »** n'existe nulle part sur ces lignes — à créer.

**Décisions actées avec l'utilisateur le 25/08/2026** (les deux questions ouvertes ci-dessus) :
1. **Le Véhicule reste hors de l'écran Épargne** — rapproché plus tard d'une future catégorie
   « biens » aux côtés de l'immobilier (une valeur qui décote, pas qui épargne). L'écran Épargne se
   limite à Compte courant / Épargne réglementée / Épargne salariale / Assurance-vie / PER.
2. **Le « versement mensuel » par actif entre dans le calcul du Simulateur/FIRE**, en s'ADDITIONNANT
   au `versement_mensuel_suggere` déjà prérempli depuis le Budget (§ 2.N.4) — jamais en le
   remplaçant. Vérifié par lecture directe de `budget_service.compute_summary`/
   `compute_jonction_patrimoine` avant de trancher : `disponible = entrées − TOUTES les sorties`
   (chaque mouvement négatif, quelle que soit sa catégorie) — un virement réel vers une assurance-vie
   déjà suivi dans le Budget est donc déjà soustrait de `disponible`, jamais compté une seconde fois
   si on ajoute par-dessus la somme des `versement_mensuel` déclarés sur les actifs Épargne. Les deux
   sources restent non chevauchantes par construction : l'une mesure l'argent qui part déjà
   régulièrement vers l'épargne (déclaré), l'autre ce qu'il reste de disponible, non encore alloué.

**Plan d'implémentation** :
- Nouvel écran **Épargne** (Compte courant, Épargne réglementée, Épargne salariale, Assurance-vie,
  PER — PAS immobilier/SCPI qui gardent leur fiche dédiée déjà livrée, ni Véhicule/Autre) : liste de
  « comptes » plutôt qu'un tableau façon portefeuille boursier — valeur courante, date de dernière
  mise à jour, point d'entrée rapide « ajouter une valorisation » (montant + date choisie), petit
  graphique d'évolution par ligne.
- Généraliser la fiche détaillée existante (aujourd'hui réservée à l'immobilier,
  `HoldingDetailContent.tsx`) à ces cinq types plutôt que de reconstruire un mécanisme séparé — même
  infrastructure, débridée (le backend le permet déjà).
- Corriger le bug de date figée à « maintenant » : la route (`routers/portfolio.py`) doit transmettre
  une date choisie par le client à `immobilier_service.enregistrer_point_historique` (qui l'accepte
  déjà), au lieu de `datetime.now()` codé en dur.
- Nouveau champ `versement_mensuel` par ligne (montant déclaré par l'utilisateur, même philosophie
  que `taux_pct` — jamais déduit automatiquement).
- `budget_service.compute_jonction_patrimoine` (ou son appelant côté Simulateur) additionne la somme
  des `versement_mensuel` des actifs Épargne du foyer à `versement_mensuel_suggere` avant préremplissage.

**Livré et vérifié le 25/08/2026.** Nouvel écran `/epargne` (liste de « comptes » avec valeur
courante, versement mensuel, mini-historique et ajout rapide d'une valorisation datée), généralisation
de la fiche détaillée (`HoldingDetailContent.tsx`) aux 5 types Épargne via un nouveau composant
`EpargneApercu` partageant `ValorisationHistoriqueCard`/`AjoutValorisationForm` avec l'immobilier.
Nouvelle route `PUT /holdings/{ticker}/valorisation` (schéma `ValorisationInput`) qui répare le bug de
date figée à `datetime.now()` : elle enregistre le point d'historique à la date choisie par
l'utilisateur, mais ne met à jour la « valeur courante » (`valeur_estimee`/`date_valeur_estimee`) que
si ce point est le **plus récent connu** — un rattrapage antidaté (saisie tardive d'un mois passé)
n'écrase jamais une valeur plus récente déjà enregistrée. Règle verrouillée par un test dédié ET
vérifiée en conditions réelles (backend isolé, navigateur) : après un point à 10 000 € daté
d'aujourd'hui puis un point antidaté à 9 500 €, la valeur courante affichée reste 10 000 €, tandis que
le point antidaté apparaît bien dans l'historique complet.

Nouveau champ `Holding.versement_mensuel` (déclaré, jamais déduit) ; `budget_service.
compute_jonction_patrimoine` renvoie `versement_mensuel_epargne_declare` (somme des comptes Épargne),
additionné côté Simulateur à `versement_mensuel_suggere` — jamais fusionné côté backend, la légende
sous le champ détaille les deux sources séparément. Vérifié en réel : un versement mensuel de 200 €
déclaré sur un compte Épargne se retrouve bien dans le préremplissage du Simulateur avec la légende
« 0 € observés sur le budget + 200 € déclarés sur l'Épargne ».

Le Véhicule reste exclu de l'écran Épargne (décision actée plus haut) ; les 5 types restent aussi
visibles dans Portefeuille (onglet « Immobilier & Épargne »), cet écran est un complément.

**Bug latent corrigé en marge** : `formatDate` (frontend) ne gérait pas un horodatage complet
(`"2026-01-01T00:00:00"`, le format réel de `Holding.date_valeur_estimee`) — le `"T..."` final se
retrouvait concaténé au jour (`"01T00:00:00/01/2026"`). Affectait déjà silencieusement la carte
« Historique de valorisation » de l'immobilier (aucun test n'avait jamais assertion sur le texte de
date affiché), corrigé pour tous les appelants + régression verrouillée.

12 tests backend nouveaux (dont l'antidatage et les sommes `versement_mensuel_epargne_declare`,
suites complètes : 803 passés) + 17 tests frontend nouveaux (`EpargnePage.test.tsx`, généralisation de
`HoldingDetailContent.test.tsx`, `PortefeuillePage.test.tsx`, `SimulateurPage.test.tsx`,
`format.test.ts` ; suite complète : 426 passés), `tsc -b`/`oxlint`/`npm run build` propres.

**Retour utilisateur après premier usage réel (25/08/2026), trois manques corrigés le jour même** :
aucun moyen de supprimer un compte Épargne créé par erreur ni de corriger un versement mensuel mal
saisi (les deux réutilisent les routes `PATCH`/`DELETE /portfolio/holdings/{id}` déjà existantes pour
toute ligne du portefeuille, jamais la route `valorisation` qui reste strictement réservée à
`valeur_estimee`/`date_valeur_estimee`) ; et aucun graphique visuel de l'évolution — seul un tableau
existait, ce qui donnait l'impression qu'un point antidaté n'était « pas pris en compte » alors qu'il
l'était bien (vérifié dès la première livraison), juste invisible faute de graphique. Un `LineChart`
partagé (`ValorisationHistoriqueCard`) s'affiche désormais dès 2 points d'historique, aussi bien sur
l'écran Épargne que sur la fiche détaillée. +3 tests frontend nouveaux, suite complète toujours au vert
(430 passés), `tsc -b`/`oxlint`/`npm run build` propres. Aucun changement backend nécessaire (routes
déjà existantes).

#### S.2 — `majeur` · `L` · `P2` · `traité` (26/08/2026) — Lentille Net/Brut/Financier sur toute la page Synthèse

Demande directe de l'utilisateur : le sélecteur Net/Brut/Financier (`BarreControles.tsx`) ne pilotait
jusqu'ici que le gros chiffre de `PatrimoineNetCard` — la courbe d'évolution, le camembert/liste et la
variation restaient tous scopés « portefeuille financier » ou « tous actifs » sans jamais suivre le
toggle. Souhait exprimé : que toute la page réagisse, « notamment les graphiques », pour que
l'immobilier et les autres actifs valorisés manuellement soient bien pris en compte.

**Lève le manque documenté en K.6/§P.1** : ces deux entrées notaient qu'aucun historique daté
consolidé (tous actifs) n'existait, renvoyant au « futur P.1, Lot 7 » — mais P.1 (livré 24/08/2026,
`compute_exposition_consolidee`) n'a livré qu'une vue **instantanée** (géo/classe), jamais la série
**historique** que K.6 attendait. Ce manque restait donc réellement ouvert jusqu'à cette entrée.

**Plan d'implémentation** : nouveau service `services/patrimoine_history_service.py`
(`compute_patrimoine_history`) qui fusionne, sur une grille hebdomadaire commune (réutilise
`historical_performance_service._weekly_grid`/`._value_at`) : la série financière déjà existante
(`compute_portfolio_history`, inchangée) ; un historique daté par ligne valorisée manuellement
(`HoldingValuationHistory`, dernier point connu reporté — LOCF — dégradant vers une ligne plate à
`valeur_estimee` depuis `created_at` si aucun point n'existe) ; et un amortissement théorique par date
pour chaque emprunt (`loan_service.compute_capital_restant_du_theorique`, nouvelle fonction extraite de
`compute_capital_restant_du` pour ignorer volontairement un recalage manuel avant sa date). Nouvel
endpoint `GET /api/patrimoine/historique`. Nouveau champ `repartition_par_classe_financiere` sur
`compute_patrimoine_net` pour que le camembert/liste filtre proprement en lentille « financier ».
Côté frontend : `DashboardPage` charge cette série en plus de l'historique financier existant et les
transmet toutes les deux à `PatrimoineNetCard` (variation + camembert/liste) et
`PortfolioHistoryChart` (courbe), qui choisissent la bonne source selon la lentille active.

**Deux limites assumées et documentées** (docstring de `patrimoine_history_service.py`, légendes
utilisateur) :
1. **Données manuelles clairsemées** : un bien avec un seul point d'historique donne une ligne plate
   tant qu'un second point n'est pas saisi — assumé plutôt que d'inventer une interpolation, cohérent
   avec la philosophie de transparence déjà appliquée ailleurs (repli `None` du TWR, § 2.P.2).
2. **Scoping par détenteur de la poche financière** : les quotités ne sont pas historisées, seule la
   répartition d'aujourd'hui existe. Les lignes manuelles et les emprunts qui leur sont rattachés sont
   scindés de façon exacte (pourcentage d'aujourd'hui appliqué à la série propre de chaque ligne) ; la
   poche financière, elle, n'a pas de série par ligne exposée par `compute_portfolio_history` (agrégée)
   et est donc scindée par un simple ratio d'aujourd'hui appliqué à toute la série — suppose que cette
   répartition n'a pas changé dans le temps.

Restent volontairement scopées au seul portefeuille financier (aucun changement) : `MetriquesAvanceesCard`
(le TWR retranche des flux investis semaine par semaine, sans équivalent pour l'immobilier/l'épargne),
la répartition géo/sectorielle, la qualité des données, le coût de gestion et la répartition par compte
(look-through financier sans objet pour un bien immobilier), et le mode étagé Investi/Gains de la
courbe (désactivé hors lentille « financier », pas de grand livre de versements pour l'immobilier).

9 tests backend nouveaux (`test_patrimoine_history_service.py` : LOCF, dégradation gracieuse, emprunt
avant sa date de début, recalage manuel théorique puis gelé, scoping détenteur exact et emprunt non
rattaché, cache) + tests étendus (`test_loan_service.py`, `test_patrimoine_service.py`,
`test_patrimoine_router.py`) ; côté frontend, tests étendus de `PatrimoineNetCard.test.tsx` et nouveau
`PortfolioHistoryChart.test.tsx`, `tsc -b`/`vitest`/`oxlint` propres.

**Retour utilisateur après premier usage réel (26/08/2026), un manque corrigé le jour même** : le
camembert/liste ne changeait pas entre les lentilles Brut et Net — comportement voulu à la livraison
initiale (`repartition_par_classe` n'a jamais été autre chose qu'une répartition BRUTE par type
d'actif, la dette n'y était retranchée qu'au niveau du grand total, jamais ligne par ligne), mais
jugé contre-intuitif par l'utilisateur : « l'actif net de l'appartement, c'est sa valeur à la vente
prévue moins le reste à rembourser à la banque ». Nouveau champ `repartition_par_classe_nette` sur
`compute_patrimoine_net` : chaque ligne est nettée de SON emprunt rattaché (`Loan.holding_id`), pas
seulement le total — réutilise `part_nette` déjà calculée par `detenteurs_service.compute_parts` pour
la vue par détenteur, exactement la même notion. Un emprunt non rattaché à un actif tombe dans un
bucket dédié « Dettes non rattachées » pour que la somme de ce champ corresponde toujours exactement à
`patrimoine_net`. Une ligne peut afficher une valeur nette négative (équité négative, emprunt >
valeur du bien) — jamais masquée ni clampée à 0, même philosophie de transparence que le reste du
projet ; côté frontend, le camembert (qui ne peut pas représenter une part négative) filtre ces
catégories, la liste juste en dessous les affiche telles quelles en rouge. Lentille Brut confirmée
inchangée par l'utilisateur (valeur brute, sans nettage par ligne). 4 tests backend nouveaux
(`test_patrimoine_service.py`), 3 tests frontend nouveaux (`PatrimoineNetCard.test.tsx`), suites
complètes toujours au vert, `tsc -b`/`vitest`/`oxlint` propres.

**Étendu le même jour à `ExpositionConsolideeCard`** (« Exposition consolidée — tous actifs », détail
repliable du Tableau de bord) — même correction demandée par l'utilisateur, repérée par lui sur cette
seconde carte : `compute_exposition_consolidee` n'avait jusqu'ici AUCUNE notion d'emprunt (elle
sommait `Holding.valeur_estimee` brute, sans jamais toucher `Loan`), donc « Plus grosse ligne » pouvait
pointer un bien très endetté comme si sa valeur brute constituait du vrai patrimoine. Nouvelle fonction
partagée `_crd_par_ligne` (factorisée depuis `compute_patrimoine_net`, réutilisée par les deux) ;
`valeur_totale`/`repartition_geo`/`repartition_classe`/`plus_grosse_ligne_*`/`top5_lignes_pct` sont
désormais calculés sur des lignes nettées de leur emprunt rattaché (`dataclasses.replace` sur
`ValuedHolding`) — `valeur_totale` correspond ainsi exactement à `patrimoine_net`, plus à
`actifs_totaux`. Contrairement à `repartition_par_classe_nette`, pas de bucket "Dettes non rattachées"
ni de valeurs négatives conservées ici : la carte n'affiche que des camemberts en pourcentage (pas de
liste en euros pour servir de repli), donc `repartition_triee` garde son filtre `> 0` existant — un
emprunt non rattaché réduit `valeur_totale` sans être imputable à une catégorie géo/classe précise.

**Audit demandé par l'utilisateur des autres sections potentiellement oubliées** : recherche de tout
consommateur de `compute_patrimoine_net`/`compute_exposition_consolidee`/`repartition_par_classe` côté
backend ET frontend. Trois autres endroits identifiés, examinés et volontairement **non modifiés**,
chacun pour une raison différente :
- `services/partage_service.py` (liens de partage, § 2.Q.1) : sa section "exposition" transmet
  directement `compute_exposition_consolidee`, donc hérite automatiquement du nettage sans code
  supplémentaire ; sa section "patrimoine_net" expose en revanche toujours l'ancien
  `repartition_par_classe` (brut), jamais le nouveau `repartition_par_classe_nette` — écart non corrigé
  ici faute de demande explicite sur cette surface, à traiter dans un futur incrément si besoin.
- `services/pdf_export_service.py` (export PDF, écran Rapport) : affiche `repartition_par_classe`
  (brut) à côté des totaux actifs/passifs/patrimoine net déjà présents séparément — cohérent avec la
  lentille Brut, non modifié.
- `services/declaration_patrimoine_service.py` (Déclaration de patrimoine, § 2.Q.2, document
  administratif) : liste volontairement actifs et emprunts SÉPARÉMENT (format attendu d'une
  déclaration officielle, ex. IFI) — un nettage par ligne y serait un contresens, non modifié
  délibérément.

2 tests backend nouveaux (`TestExpositionConsolidee`), 2 tests frontend nouveaux (nouveau fichier
`ExpositionConsolideeCard.test.tsx`, qui n'existait pas encore), suites complètes toujours au vert,
`tsc -b`/`vitest`/`oxlint` propres.

**Corrigé le jour même : le nettage ci-dessus était inconditionnel, pas piloté par la lentille.**
L'utilisateur a repéré que « Répartition géographique consolidée » affichait exactement 62 % Europe
en lentille Net ET en lentille Brut — `ExpositionConsolideeCard` ne lisait même pas `lentille`, donc
rien n'y variait avec le sélecteur, contrairement au reste de la page. `compute_exposition_consolidee`
calcule désormais DEUX jeux de champs sur la même requête (factorisés via un nouveau helper
`_calculer_expo`, appelé une fois sur les lignes brutes et une fois sur les lignes nettées) : les
champs sans suffixe redeviennent la valeur BRUTE (comportement confirmé correct par l'utilisateur pour
la lentille Brut), un nouveau jeu suffixé `_nette` porte le nettage par ligne pour la lentille Net —
même principe que `repartition_par_classe`/`repartition_par_classe_nette` du patrimoine net.
`ExpositionConsolideeCard` lit maintenant `lentille` et choisit le bon jeu de champs. En lentille
**Financier**, la carte est **masquée** plutôt que de montrer une pseudo-exposition « tous actifs »
restreinte au financier — contradictoire avec son titre et redondant avec les cartes Répartition
géographique/sectorielle déjà financières juste au-dessus (décision prise sans revalidation explicite
de l'utilisateur, à ajuster s'il préfère un autre comportement). 2 tests backend étendus (vérifient
maintenant les deux jeux de champs + non-régression du bug initial), 3 tests frontend nouveaux
(Brut/Net donnent des valeurs différentes, Financier masque la carte), suites complètes au vert,
`tsc -b`/`vitest`/`oxlint` propres, vérifié en conditions réelles (62 % en Net, 96 % en Brut, carte
absente en Financier).

#### S.3 — `mineur` · `S` · `P2` · `traité` (26/08/2026) — Date d'acquisition d'un bien

Demande directe de l'utilisateur : pouvoir renseigner/modifier la date d'acquisition d'un bien
(immobilier notamment), éditable sur l'écran Patrimoine.

**Audit avant implémentation** : aucun champ existant ne portait déjà cette notion —
`Holding.created_at` est la date de SAISIE de la ligne dans l'application (souvent bien après
l'achat réel), `date_valeur_estimee` celle de la dernière estimation, et `prix_revient_moyen` un
montant sans date attachée. Nouveau champ `Holding.date_acquisition` (nullable, `None` par défaut —
aucune valeur inventée pour les lignes déjà saisies), migration Alembic chaînée sur la tête
(`dbfb7fd6fbff` → `8643bfb5b753`).

**Scope** : affiché/éditable uniquement pour les 9 types valorisés manuellement
(`TYPES_ACTIF_PATRIMOINE_MANUEL`) — même gating que `zone_geo`, sans objet pour une ligne financière
reconstruite qui a déjà ses propres dates de transaction. Éditable à la fois à l'ajout manuel
(formulaire du haut) et sur une ligne existante (édition en ligne du tableau, `PositionsTable.tsx`,
desktop et mobile) — même flux générique `PATCH /api/portfolio/holdings/{id}` que les autres champs
(`taux_pct`, `zone_geo`...), pas de nouvel endpoint. Piège de type rencontré et corrigé : le champ
d'entrée (`HoldingBase.date_acquisition`, chaîne AAAA-MM-JJ validée, même contrat que
`ValorisationInput.date`) est redéclaré en `datetime` dans `HoldingOut` pour la réponse — sans
redéclarer aussi le validateur Pydantic associé (qui attendait toujours une chaîne), la réponse
plantait avec `TypeError: strptime() argument 1 must be str, not datetime.datetime`, repéré en
testant l'API réelle avant de conclure au succès.

Affichée dans le tableau sous le nom de la ligne (« Acquis le JJ/MM/AAAA ») dès qu'elle est
renseignée — desktop et mobile. 6 tests backend nouveaux
(`test_holding_date_acquisition.py` : création, valeur par défaut `None`, format invalide rejeté,
modification, effacement, non-effet sur les autres champs), 5 tests frontend nouveaux
(`PortefeuillePage.test.tsx` : gating par type à l'ajout et à l'édition, soumission, affichage dans
le tableau), suite complète au vert, `tsc -b`/`vitest`/`oxlint` propres, vérifié en conditions
réelles (backend isolé, création/modification/rejet de format).

**Étendu le jour même aux calculs de rentabilité et aux graphiques** : la première livraison ne
faisait que stocker/afficher la date, sans qu'elle influence quoi que ce soit ailleurs — l'utilisateur
a demandé qu'elle soit réellement prise en compte.

- **Rendement annualisé** (`performance_service._rendement_pour_ligne`) : jusqu'ici toujours `None`
  pour un actif valorisé manuellement (« Annualisé : — » dans le tableau et sur la fiche détaillée),
  faute de tout flux de trésorerie daté (`state.cash_flows` ne vient que du grand livre de
  transactions, vide pour ces types). Avec `date_acquisition` renseignée, un flux à un seul mouvement
  (`[(date_acquisition, -prix_revient_moyen), (maintenant, valeur_estimee)]`) suffit à `xirr()`, qui
  se réduit alors exactement à un CAGR classique — mêmes garde-fous que le portefeuille financier
  (durée minimale 90 jours, plafond 1000 %). `HoldingDetail` expose désormais aussi
  `date_acquisition` (absente jusqu'ici de la fiche détaillée, seulement du `Holding` de la liste).
- **Courbe combinée du Tableau de bord** (`patrimoine_history_service._serie_holding_manuel`) : si
  `date_acquisition` est antérieure au premier point d'historique connu (cas courant — un bien est
  souvent saisi dans l'appli bien après son achat réel), un point de départ à `prix_revient_moyen`
  (coût d'acquisition) est inséré à cette date plutôt que de démarrer artificiellement tard
  (`created_at`) ou de laisser croire que la valeur actuelle était déjà celle du jour de l'achat.
- **Graphique « Historique de valorisation » de la fiche détaillée** (`ValorisationHistoriqueCard`,
  frontend) : même principe, mais appliqué SEULEMENT au graphique — jamais au tableau juste en dessous,
  qui reste le reflet exact des points réellement saisis par l'utilisateur (aucune ligne fabriquée).
  Permet désormais d'afficher un graphique même avec un seul point d'historique réel, dès lors qu'une
  date d'acquisition antérieure existe.

5 tests backend nouveaux (`test_performance_service.py` : CAGR à un flux, absence sans date
d'acquisition, détention trop courte ; `test_patrimoine_history_service.py` : ancrage avant/après le
premier point connu, cas sans aucun historique ni valeur), 2 tests frontend nouveaux
(`HoldingDetailContent.test.tsx` : graphique affiché malgré un seul point réel grâce à l'ancrage,
absence d'effet si la date d'acquisition est postérieure), suite complète au vert,
`tsc -b`/`vitest`/`oxlint`/`build` propres.

**Correctif le jour même : cache d'historique jamais invalidé pour ce champ.** L'utilisateur a
signalé que le graphique du Tableau de bord « n'avait pas bougé » après cette extension. Cause :
`historique_patrimoine:*` (`historique_cache.py`) est un cache PERSISTÉ EN BASE (24h de validité,
survit aux redémarrages du process), et `routers/portfolio.py` ne l'invalidait que sur un changement
RÉEL de `valeur_estimee` — un changement de `date_acquisition` ou `prix_revient_moyen` seul (le cas
exact de cette fonctionnalité) laissait donc l'ancienne série servie jusqu'à expiration naturelle du
cache. `create_holding`/`update_holding` invalident désormais aussi ce cache quand l'un de ces deux
champs est posé/modifié. 4 tests nouveaux dans `test_holding_date_acquisition.py` (invalidation sur
date_acquisition seule, sur prix_revient_moyen seul, à la création, et garde-fou : un champ sans
rapport comme `nom` n'invalide toujours pas). Vérifié en conditions réelles : ré-enregistrement de
la ligne réelle « APPARTEMENT », requête `GET /api/patrimoine/historique` confirmée recalculée avec
un premier point au 15/06/2021 (coût d'acquisition) au lieu de la série figée précédente.

### T. Corrections et quickwins signalés en usage réel (Lot 9, 30/08/2026)

#### T.1 — `mineur` · `S` · `P2` · `traité` (30/08/2026) — Édition complète d'un emprunt

Demande directe de l'utilisateur : sur l'écran Patrimoine, un emprunt existant ne peut être corrigé
QUE via « Recaler » — qui ne touche que le capital restant dû (`capital_restant_du_manuel`, un relevé
bancaire réel qui prime sur le calcul théorique). Aucun moyen de corriger une erreur de saisie ou un
changement réel sur les autres caractéristiques du prêt (libellé, capital initial, taux, mensualité,
date de début, durée) une fois l'emprunt créé.

**Audit avant écriture de cette entrée** : le blocage est PUREMENT FRONTEND. `LoanUpdate`
(`backend/app/schemas.py:978`) accepte déjà `libelle`, `capital_initial`, `taux_annuel_pct`,
`mensualite`, `date_debut`, `duree_mois` (en plus de `capital_restant_du_manuel` et `holding_id`), et
`PATCH /api/loans/{id}` (`routers/loans.py`) les applique déjà génériquement (même mécanisme que la
mise à jour d'un `Holding`) — `backend/tests/test_loans_router.py::test_modifier_un_autre_champ_ne_touche_pas_la_date_de_recalage`
verrouille déjà qu'un changement de `libelle` fonctionne et ne perturbe pas l'état de recalage.
`LoansCard.tsx` (frontend), lui, n'expose que deux actions ciblées : le recalage (patch sur
`capital_restant_du_manuel` seul) et le rattachement à un actif (patch sur `holding_id` seul) — aucun
formulaire n'appelle `api.updateLoan` avec les autres champs. Aucun travail backend nécessaire : d'où
le classement en lot quickwin (effort `S`, la totalité du travail restant est un formulaire
d'édition en ligne côté frontend).

**Spécification de ce qui est attendu :**

- Un bouton **« Modifier »** par emprunt, à côté de « Recaler » et « Supprimer » (desktop : dernière
  colonne du tableau ; mobile : `LoanCardMobile`, à côté des boutons existants) — même position
  relative que le couple Modifier/Supprimer déjà utilisé pour les lignes du portefeuille
  (`PositionsTable.tsx`), pour rester cohérent avec le reste de l'écran Patrimoine.
- Au clic, la ligne (ou la carte mobile) bascule en mode édition : les champs `libelle`,
  `capital_initial`, `taux_annuel_pct`, `mensualite`, `date_debut`, `duree_mois` deviennent des
  champs de saisie pré-remplis avec les valeurs actuelles — même pattern d'état local que
  `recalageId`/`recalageValeur` déjà présent dans `LoansCard.tsx` (un `editionId`/`editForm` en plus,
  pas une refonte du composant), et même paire de boutons Enregistrer/Annuler.
- **`capital_restant_du_manuel` reste EXCLU de ce formulaire** — cette édition ne doit jamais toucher
  au recalage : les deux actions gardent leur sémantique distincte (recalage = relevé bancaire réel
  qui prime sur le théorique ; édition = correction des caractéristiques déclarées du prêt). Si les
  deux actions sont ouvertes en même temps sur des emprunts différents, pas de contrainte particulière
  attendue (cas déjà couvert par le `id` distinct de chaque état local).
- Validation : réutiliser les mêmes contraintes déjà appliquées à la création (`LoanCreate`, même
  schéma que `LoanBase`) — pas de nouvelle règle à inventer côté backend. Une erreur serveur (400)
  s'affiche via le pattern déjà en place (`setError`/`EtatErreur`) dans `LoansCard.tsx`.
- Aucune invalidation de cache à ajouter : `routers/loans.py` appelle déjà
  `historique_cache.invalider_historiques_patrimoine(db)` sur `update_loan` — la courbe combinée du
  Tableau de bord (lentille Net/Brut) reste donc à jour après une édition, comme après un recalage.
- Tests : nouveaux cas dans `LoansCard.test.tsx` (ouverture du formulaire pré-rempli, sauvegarde avec
  `api.updateLoan` appelé avec les seuls champs modifiés, annulation sans appel réseau, un champ requis
  vide bloque la sauvegarde côté client comme au formulaire de création). Côté backend, envisager
  d'individualiser `test_modifier_un_autre_champ_ne_touche_pas_la_date_de_recalage` en un test par champ
  (`capital_initial`, `taux_annuel_pct`, `mensualite`, `date_debut`, `duree_mois`) si l'implémentation
  révèle un doute sur l'un d'eux — non bloquant, la couverture générique existante suffit a priori.

**Livré tel que spécifié** : bouton « Modifier » desktop (ligne appended, `colSpan`) et mobile
(`LoanCardMobile`, formulaire en pleine carte), `capital_restant_du_manuel` exclu, `startEdition`/
`startRecalage` s'excluent mutuellement sur une même ligne. 5 tests nouveaux dans `LoansCard.test.tsx`
(pré-remplissage, sauvegarde avec les 6 champs, annulation sans appel réseau, libellé vide bloqué côté
client, fonctionne aussi en vue carte mobile). Aucun test backend individualisé par champ : la
couverture générique existante s'est révélée suffisante, comme anticipé.

#### T.2 — `majeur` · `S` · `P0` · `traité` (30/08/2026) — Bug : « Rafraîchir les cours » échoue par intermittence

Signalé par l'utilisateur : le bouton « Rafraîchir les cours » (écran Patrimoine) échoue avec
« Une erreur interne est survenue côté serveur. Réessayez plus tard. ».

**Reproduit et diagnostiqué en conditions réelles** (backend isolé, déclenchement du rafraîchissement
depuis le navigateur, lecture des logs serveur) : `GET /api/market-data/refresh/status` — le point de
sondage que le frontend interroge en boucle pendant tout le rafraîchissement — répond parfois `500`,
avec en cause :

```
sqlite3.OperationalError: database is locked
[SQL: UPDATE auth_tokens SET derniere_utilisation=? WHERE auth_tokens.token = ?]
```

**Cause racine** : `market_data_service.refresh_tickers` (`backend/app/services/market_data_service.py:311-449`)
boucle sur CHAQUE position (jusqu'à ~50 sur le foyer réel), avec une temporisation de 0,25 s entre
deux appels réseau (yfinance/justETF) — le commentaire du module l'assume déjà lui-même : « dépasse
largement la minute ». Or un SEUL `db.commit()` clôture toute la boucle, ligne 448 : SQLAlchemy ouvre
une transaction d'écriture implicite dès le premier `db.add`/attribut modifié, et SQLite (mode
journal par défaut, pas de `busy_timeout` configuré — `backend/app/database.py:92`,
`connect_args={"check_same_thread": False}` seulement) verrouille alors TOUT LE FICHIER en écriture
pour toute la durée du rafraîchissement. Or `auth.get_current_token` (`backend/app/auth.py`) écrit
`derniere_utilisation` sur CHAQUE requête authentifiée — y compris les propres sondages
`GET /api/market-data/refresh/status` du frontend pendant que le rafraîchissement tourne. Résultat :
une bonne partie des sondages pendant la fenêtre (potentiellement plusieurs dizaines de secondes à
plus d'une minute sur le foyer réel) échoue en 500 sans retry ni attente, faute de `busy_timeout`.

**Correctif attendu** (standard SQLite face à ce type de contention, pas une réécriture du job) :

- Activer le mode WAL (`PRAGMA journal_mode=WAL`) sur la connexion (`backend/app/database.py`) —
  autorise les lecteurs concurrents pendant un écrivain, réduit drastiquement la fenêtre de blocage.
- Configurer un `busy_timeout` (`connect_args={"check_same_thread": False, "timeout": 30}` côté
  `create_engine`, ou `PRAGMA busy_timeout` explicite) — un écrivain concurrent ATTEND puis réessaie
  au lieu d'échouer immédiatement ; élimine la classe d'erreur pour CE cas ET tout autre cas similaire
  futur (pas un correctif ponctuel à ce seul endpoint).
- À évaluer en complément (pas strictement nécessaire si WAL + busy_timeout suffisent) : committer par
  lot dans la boucle de `refresh_tickers` (ex. tous les N tickers) plutôt qu'un unique commit final,
  pour réduire la durée de toute façon.
- Tests : un test d'intégration simulant une écriture concurrente pendant un rafraîchissement
  (`test_market_data_background.py`, déjà le fichier qui couvre ce job) — actuellement aucun test ne
  couvre la contention SQLite. Vérifier aussi qu'aucune régression n'apparaît sur les tests
  d'isolation entre utilisateurs (`test_isolation_utilisateurs.py`), le mode WAL changeant le fichier
  physique créé à côté de la base (`-wal`, `-shm`).

**Livré tel que spécifié, plus un correctif complémentaire** : WAL + `busy_timeout=30s` sur la
connexion (`database.py`, via un `event.listens_for(engine, "connect")` — une PRAGMA par connexion,
pas globale au fichier), ET commit par ticker dans `refresh_tickers` (pas seulement « à évaluer » comme
envisagé — borne la durée du verrou à un seul ticker plutôt qu'à tout le job, correctif le plus direct
pour CE bug précis). Test déterministe plutôt qu'une course contre la montre entre deux fils : vérifie
la configuration réellement appliquée (`PRAGMA journal_mode`/`PRAGMA busy_timeout`) — un test chronométré
avec le timeout par défaut de `sqlite3` (5 s) aurait masqué une régression sur une contention de
quelques centaines de millisecondes seulement. Confirmé qu'il échoue bien sans le correctif
(`git stash` temporaire sur `database.py` pendant la vérification) avant de le committer.

#### T.3 — `mineur` · `S` · `P2` · `traité` (30/08/2026) — Corriger/supprimer un point de l'historique de valorisation

Demande directe de l'utilisateur, avec capture d'écran à l'appui : sur l'écran Épargne (et la fiche
immobilier), l'historique de valorisation d'un bien n'est manipulable que dans un seul sens —
`immobilier_service.enregistrer_point_historique` **ajoute** un point, mais rien ne permet de corriger
ou supprimer un point déjà saisi (ex. une valeur tapée par erreur, comme le point à 0,00 € visible sur
la capture — qui casse le graphique en tirant la courbe vers zéro, de façon permanente).

**Audit avant écriture de cette entrée** : la table `HoldingValuationHistory` (`models.py:238`) porte
déjà un `id` auto-incrémenté — la clé technique existe, elle n'est simplement exposée nulle part.
`immobilier_service.py` n'a que trois fonctions : `enregistrer_point_historique` (insertion pure,
docstring explicite « n'écrase jamais un point existant »), `historique_valorisation` (liste triée),
`upsert_detail_immobilier` (sans rapport, fiche locative). Aucune fonction de modification/suppression
d'UN point précis n'existe. Côté API, `GET /holdings/{ticker}/immobilier-history`
(`routers/portfolio.py:239`) renvoie `ValuationHistoryPoint` (`schemas.py:590`), qui expose seulement
`date_valeur`/`valeur` — **pas `id`** : même en ajoutant les routes, le frontend ne pourrait pas encore
cibler un point précis sans étendre aussi ce schéma. Côté frontend, `ValorisationHistoriqueCard`
(`HoldingDetailContent.tsx:396-403`) affiche chaque ligne sans aucun bouton d'action, `key={` `${p.date_valeur}-${i}` `}`
— un simple index, cohérent avec l'absence d'identifiant côté API.

**Spécification de ce qui est attendu :**

- `schemas.ValuationHistoryPoint` : ajouter le champ `id: int`.
- `immobilier_service.py` : deux nouvelles fonctions, même style que les fonctions existantes du
  module — `modifier_point_historique(db, point_id, valeur, date_valeur) -> HoldingValuationHistory | None`
  (`None` si l'id n'appartient pas à ce holding, pour un contrôle d'accès propre côté routeur) et
  `supprimer_point_historique(db, point_id) -> bool`.
- `routers/portfolio.py` : `PATCH`/`DELETE /holdings/{ticker}/immobilier-history/{point_id}` — même
  garde d'appartenance que les autres routes de ce fichier (le point doit appartenir à un `Holding` du
  foyer courant, 404 sinon). **Point d'attention spécifique à cette fonctionnalité** : si le point
  modifié/supprimé est le PLUS RÉCENT de l'historique, `Holding.valeur_estimee`/`date_valeur_estimee`
  (la valeur « courante », dupliquée pour un accès rapide ailleurs dans l'application — cf. docstring
  de `HoldingValuationHistory`) doivent être resynchronisés sur le nouveau point le plus récent restant
  (ou sur `None` si l'historique devient vide) — sans quoi la valeur courante affichée partout
  (Patrimoine, Tableau de bord...) divergerait silencieusement de l'historique qu'on vient de corriger.
  Invalider aussi `historique_cache.invalider_historiques_patrimoine(db)` (même raison que le
  correctif § S.3 : ce point alimente la courbe combinée du Tableau de bord).
- Frontend (`ValorisationHistoriqueCard`) : bouton **Modifier**/**Supprimer** par ligne du tableau
  (jamais sur le point de coût d'acquisition synthétique ajouté par § S.3 au graphique — celui-ci n'a
  pas d'`id`, n'existe pas en base, et n'apparaît déjà pas dans ce tableau, seulement dans le
  graphique) — même pattern d'édition en ligne que `PositionsTable.tsx`/`LoansCard.tsx` (ligne qui
  bascule en formulaire Valeur/Date + Enregistrer/Annuler), confirmation avant suppression comme pour
  une position ou un emprunt (`Modale` déjà utilisée ailleurs pour ce cas).
- Tests : backend (`test_immobilier_service.py` ou équivalent existant) — modification, suppression,
  resynchronisation de `valeur_estimee` quand le point le plus récent est touché, 404 sur un point
  d'un autre foyer ; frontend (`HoldingDetailContent.test.tsx`) — édition et suppression d'une ligne,
  rafraîchissement du graphique après coup.

**Livré tel que spécifié** : la resynchronisation recalcule TOUJOURS le point le plus récent restant
après une modification/suppression (contrairement à `PUT .../valorisation`, qui ne resynchronise que
si le nouveau point est déjà le plus récent — modifier la DATE d'un point existant peut changer lequel
est le plus récent dans n'importe quel sens, un simple ajout ne le peut pas). Confirmation de
suppression via `Modale`, cohérent avec le reste de l'application. Nouveau fichier de tests dédié
(`test_holding_valuation_history_edit.py`, 10 tests : modification/suppression d'un point non récent
vs. le plus récent, avancer une date rend un point le plus récent, dernier point supprimé vide la
valeur courante, 404 point inexistant/autre foyer, valeur négative rejetée, invalidation du cache), 2
tests frontend nouveaux (`HoldingDetailContent.test.tsx`). `ValorisationHistoriqueCard` reçoit
désormais `ticker`/`onChanged` — câblé aux 3 lieux d'utilisation (`EpargneApercu`, `ImmobilierApercu`,
`EpargnePage.tsx`), les deux premiers en réutilisant leur callback de rafraîchissement déjà existant.

### U. Décomposition investi/gain pour l'épargne (Lot 9, 30/08/2026)

#### U.1 — `majeur` · `M` · `P2` · `traité` (30/08/2026) — Métriques d'épargne sur l'écran Rapport

Demande directe de l'utilisateur : l'écran Rapport (`rapport_service.py`) est aujourd'hui **100 %
financier** — valeur du portefeuille, évolution investi/généré, dividendes, plus gros mouvements —
tous dérivés du grand livre de transactions boursières. Aucune de ces tuiles ne reflète l'épargne
(livrets, PEE/PERCO, assurance-vie, PER, comptes courants — `TYPES_EPARGNE`, `models.py:88`), pourtant
déjà valorisée manuellement et suivie dans le temps (écran Épargne, § S.1) depuis le 25/08/2026.

**Audit avant écriture de cette entrée — ce qui existe déjà et est réutilisable, ce qui manque :**

- `patrimoine_history_service._serie_holding_manuel` : construit déjà, PAR LIGNE, une série datée
  (historique réel + ancrage sur le coût d'acquisition, § S.3) pour tout type de
  `TYPES_ACTIF_PATRIMOINE_MANUEL` — c'est le bloc de construction pour évaluer la valeur de l'épargne
  À UNE DATE DONNÉE (début/fin de période), pas seulement la série complète qu'expose aujourd'hui
  `compute_patrimoine_history`.
- `revenus_passifs_service._interets_livrets_annuels` : calcule déjà `valeur_estimee * taux_pct / 100`
  par ligne `REGULATED_SAVINGS`/`EMPLOYEE_SAVINGS` — mais UNIQUEMENT comme projection à 12 mois
  glissants, jamais proratisé sur une période arbitraire (mensuel/annuel/personnalisé).
  `Holding.taux_pct` (`models.py`) n'est aujourd'hui JAMAIS utilisé pour calculer un intérêt
  RÉELLEMENT perçu sur une période passée — seulement projectif.
  - **Limite assumée à documenter, pas à résoudre ici** : contrairement au portefeuille financier (un
    vrai grand livre de transactions permet une décomposition investi/généré exacte), l'épargne n'a
    aucun journal des versements — toute distinction « argent ajouté » vs « intérêts produits » sur la
    période sera nécessairement une ESTIMATION (intérêts = `taux_pct` proratisé ; versements = résidu
    de l'évolution totale moins cette estimation), à étiqueter explicitement comme telle dans l'UI —
    même philosophie que le repli `None` du TWR ou la légende de `PatrimoineNetCard`.
- `salaire_service.compute_synthese_annee` (R.1) : calcule déjà un `taux_epargne_pct`, mais UNIQUEMENT
  pour une année calendaire entière (paramètre `annee: int`), pas pour une période arbitraire — à
  généraliser (même changement de signature que `rapport_service.compute_rapport_periode`,
  `date_debut`/`date_fin`) si cette tuile est retenue ; sinon, ne l'afficher que quand le mode Rapport
  est « Annuel » et coïncide avec une année de `Salaire` renseignée.
- `objectifs_service.compute_indicateurs_situation` (O.2) calcule déjà `matelas_securite_mois`
  (épargne liquide ÷ dépenses mensuelles moyennes) — mais c'est un INSTANTANÉ (aujourd'hui), pas une
  métrique de période : hors périmètre de cette entrée (resterait un doublon décontextualisé sur un
  écran organisé autour d'une période), déjà consultable sur l'écran Objectifs.

**Tuiles proposées (par ordre décroissant de simplicité d'implémentation) :**

1. **Évolution de l'épargne sur la période** (miroir de la tuile « Évolution sur la période » déjà
   existante pour le portefeuille) : valeur totale `TYPES_EPARGNE` en début et fin de période (via
   `_serie_holding_manuel` évaluée aux deux dates), écart en € et en %.
2. **Répartition de l'épargne par type, en fin de période** : Livret A/LDDS, PEE/PERCO, assurance-vie,
   PER, comptes courants — même construction que la répartition par type déjà affichée sur le Tableau
   de bord, simplement restreinte à `TYPES_EPARGNE` et évaluée à `date_fin` plutôt qu'à aujourd'hui.
3. **Intérêts perçus (estimés) sur les livrets pendant la période** : `_interets_livrets_annuels`
   proratisé par `(nombre de jours de la période / 365)` plutôt que fixé à 12 mois — extension directe
   de la fonction existante, pas une réécriture.
4. **Décomposition « versements estimés / intérêts estimés »** de la tuile 1, sur le modèle de la carte
   « D'où vient l'évolution ? » déjà existante côté financier — mais explicitement étiquetée comme
   estimation (résidu, cf. limite assumée ci-dessus), jamais présentée comme un fait mesuré.
5. *(Optionnel, effort plus élevé — à trancher séparément)* **Taux d'épargne sur la période**, si
   `salaire_service.compute_synthese_annee` est généralisé à `date_debut`/`date_fin`.

**Hors périmètre explicite de cette entrée** : le coussin de sécurité en mois de dépenses (déjà sur
Objectifs, § O.2, nature instantanée incompatible avec un écran organisé par période) ; toute
véritable distinction versement/intérêt basée sur un journal réel (nécessiterait de tracer chaque
changement de `valeur_estimee` avec un motif saisi par l'utilisateur — hors scope, non demandé).

Tests à prévoir : nouveaux tests `rapport_service.py`/`test_rapport_service.py` par tuile (utiliser le
même style de fixtures LOCF déjà en place dans `test_patrimoine_history_service.py`), tests frontend
`RapportPage.test.tsx` pour l'affichage conditionnel (masquer les tuiles épargne si aucun actif
`TYPES_EPARGNE` sur la période, même pattern que `EtatVide` déjà utilisé ailleurs sur cet écran).

**Livré, tuiles 1 à 4 (tuile 5 — taux d'épargne généralisé — restée hors scope, cf. « à trancher
séparément » ci-dessus)** : `compute_rapport_epargne_periode` (nouvelle fonction dans
`rapport_service.py`, embarquée dans le champ `epargne` de `compute_rapport_periode`, réutilisée sans
dupliquer `patrimoine_history_service._serie_holding_manuel` pour évaluer chaque ligne aux deux bornes
de la période) : évolution de l'épargne (valeur, %), répartition par type en fin de période
(`PieChartCard`, déjà existant, réutilisé tel quel via une conversion euros → poids), intérêts estimés
sur les livrets proratisés sur la durée exacte de la période, versements estimés (résidu). Bloc entier
masqué (`a_des_donnees=false`) si le foyer n'a aucune ligne `TYPES_EPARGNE`. 8 nouveaux tests backend
(`test_rapport_service_epargne.py` — nouveau fichier, dont un verrouillant explicitement que
l'immobilier n'entre jamais dans ce calcul), 2 tests frontend nouveaux (`RapportPage.test.tsx`).
Vérifié via un backend isolé (base de test dédiée, deux lignes d'épargne datées) : les valeurs
calculées par l'API correspondent exactement au calcul attendu à la main. Vérification visuelle en
navigateur non réalisée (session utilisateur expirée pendant la vérification, auto-inscription
désactivée par sécurité — n'a pas semblé justifier de contourner cette protection ni de deviner les
identifiants réels de l'utilisateur) ; suite de tests complète au vert (838 backend, 453 frontend) en
compensation.

#### U.2 — `majeur` · `M` · `P2` · `traité` (30/08/2026) — Versement déclaré + lissage du graphique combiné pour l'épargne

Demande directe de l'utilisateur, en suite de § U.1 : pour un PER, une assurance-vie... pouvoir
préciser la part investie (versement) de la part en gain sur chaque point de valorisation, ET que ce
soit pris en compte dans les graphiques — plus un lissage de la courbe combinée entre deux
actualisations plutôt qu'un saut brutal.

**Décisions arbitrées avec l'utilisateur avant implémentation** (deux questions posées, les deux
options recommandées retenues) :
- Le versement se déclare via un champ optionnel **à chaque valorisation** (« dont versement »), pas
  un total cumulé modifiable séparément — cohérent avec le mécanisme déjà existant (« Ajouter une
  valorisation », § 2.S.1), rétrocompatible (`None` par défaut, rien à ressaisir sur l'historique
  existant).
- Le lissage s'applique **partout où l'historique épargne apparaît**.

**Versement déclaré** (`HoldingValuationHistory.versement`, nouvelle colonne nullable, migration
`db31d671e2e4`) : part de la hausse (ou baisse — valeur négative pour un retrait) depuis le point
précédent qui vient d'un versement plutôt que d'une performance du contrat. Nouveau champ optionnel
sur `ValorisationInput` (`PUT .../valorisation` ET `PATCH .../immobilier-history/{id}`, § T.3, donc
corrigeable après coup) et exposé par `ValuationHistoryPoint`. `rapport_service.
compute_rapport_epargne_periode` (§ U.1) préfère désormais les versements RÉELLEMENT déclarés quand au
moins un point de la période en porte un — nouveau champ `decomposition_estimee` sur
`RapportEpargnePeriode` (`interets_estimes_periode`/`versements_estimes_periode` renommés
`interets_periode`/`versements_periode`, valables dans les deux régimes) :
- `True` (par défaut, aucun versement déclaré sur la période) : régime estimé inchangé (`taux_pct`
  proratisé, résidu).
- `False` (au moins un point déclaré) : `versements_periode` = somme des montants déclarés,
  `interets_periode` = résidu de l'évolution — une donnée réelle, pas une estimation. **Limite
  assumée, documentée dans le docstring du schéma** : un versement non déclaré sur un AUTRE point de
  la même période serait alors compté à tort comme du gain (pas de solution parfaite sans exiger une
  déclaration exhaustive, jugée trop contraignante).

**Lissage du graphique combiné** (`patrimoine_history_service._valeur_interpolee`) : contrairement à
l'immobilier/SCPI/autre actif/véhicule, qui restent en escalier (LOCF, choix assumé documenté depuis §
S.2 — « mieux vaut une ligne plate honnête qu'une fausse précision »), les lignes `TYPES_EPARGNE` sont
désormais INTERPOLÉES linéairement entre deux points connus. Bascule ligne par ligne selon
`type_actif` (`_valeur_ligne_a_date`), jamais globale. Toujours aucune extrapolation dans le futur
(plaqué au dernier point connu) ni avant le premier point (rien à représenter). Le graphique par
compte (`ValorisationHistoriqueCard`) n'a pas eu besoin de changement : Recharts relie déjà chaque
point réel par une ligne droite, sans palier — seule la courbe combinée du Tableau de bord/Synthèse
(grille hebdomadaire, § S.2) souffrait de l'effet d'escalier que l'utilisateur décrit.

**UI** : « Ajouter une valorisation » et l'édition en ligne d'un point (§ T.3) gagnent un champ
optionnel « Dont versement (€) », avec une légende expliquant l'effet du champ vide (repli sur
l'estimation). Chaque ligne de l'historique affiche « dont X € versés » quand renseigné. L'écran
Rapport bascule ses libellés (« Versements estimés » → « Versements déclarés », etc.) et son texte
explicatif selon `decomposition_estimee`.

Tests : 6 nouveaux côté `rapport_service` (versement déclaré prime sur l'estimation, plusieurs
versements sommés, un versement hors période ne compte pas), 2 nouveaux côté
`patrimoine_history_service` (interpolation vs escalier ligne par ligne), 4 nouveaux sur les routes
`PUT`/`PATCH` (conservation/effacement du versement). Frontend : 3 nouveaux tests
(`HoldingDetailContent.test.tsx` — ajout avec versement, pré-remplissage et sauvegarde à l'édition ;
`RapportPage.test.tsx` — libellés du régime déclaré).

#### U.3 — `mineur` · `S` · `P2` · `traité` (30/08/2026) — Choisir de saisir le versement OU la plus-value

Demande directe de l'utilisateur, en suite de § U.2 : le champ « Dont versement » n'imposait qu'une
seule façon de décomposer l'évolution d'un point — versement connu, plus-value déduite. Or c'est
souvent l'inverse que l'utilisateur lit sur son contrat (le relevé annonce une plus-value, pas un
montant de versement précis).

**Aucun changement de schéma** : `versement` reste l'unique donnée stockée
(`HoldingValuationHistory.versement`, § U.2) — versement et plus-value ne sont que les deux faces de
la même somme (`valeur − valeurPrécédente = versement + plus_value`), connaître l'une donne l'autre
par simple soustraction. Le changement est entièrement frontend : une bascule « Versement / Plus-value »
(nouveau composant interne `ChampDecomposition`, partagé entre le formulaire d'ajout et l'édition en
ligne d'un point) précède le champ ; l'utilisateur choisit lequel des deux il connaît, l'autre est
calculé côté client avant l'appel API et c'est toujours `versement` qui part sur le réseau — le
backend ne voit aucune différence. Un indice sous le champ affiche en direct l'autre montant déduit
(« → plus-value déduite : 800,00 € »).

La bascule « Plus-value » est désactivée sans point antérieur connu (rien dont déduire une plus-value :
première valorisation d'un compte, ou point le plus ancien de son historique) — le versement reste
alors la seule saisie possible, comme avant cette fonctionnalité. Basculer de mode efface le montant
déjà tapé plutôt que de le réinterpréter silencieusement sous une autre signification.

**Vérifié en conditions réelles** (30/08/2026) : compte de test avec un point antérieur à 10 000 €,
nouvelle valorisation à 12 000 € avec la bascule sur « Plus-value » et 1 200 € saisis → indice affiché
« versement déduit : 800,00 € » (2 000 € d'évolution − 1 200 € de plus-value), confirmé identique côté
édition d'un point existant. 3 nouveaux tests (`HoldingDetailContent.test.tsx` : bascule désactivée
sans historique, ajout en mode plus-value, édition en mode plus-value), suite complète au vert (463
tests frontend), `tsc -b`/`oxlint`/`vite build` propres.
#### U.4 — `majeur` · `M` · `P2` · `traité` (30/08/2026) — Mode étagé Investi/Gains hors lentille Financier

Demande directe de l'utilisateur : le mode étagé (investi + gains) de la courbe d'évolution du Tableau
de bord n'était disponible qu'en lentille Financier — case décochable désactivée, avec l'explication
« pas de suivi investi/gains pour l'immobilier et l'épargne » (§ 2.K.6/S.2). Le versement déclaré tout
juste livré (§ U.2) fournit désormais exactement la donnée qui manquait pour lever cette limite.

**Audit avant implémentation** : `PortfolioHistoryChart.tsx` calcule déjà, en Financier,
`Gains = valeur_portefeuille + valeur_realisee_cumulee − valeur_investie` à partir de trois champs du
point (`PortfolioHistoryPoint`, alimentés par le grand livre de transactions dans
`historical_performance_service.compute_portfolio_history`). Hors Financier, ces trois champs
n'existaient tout simplement pas sur `PatrimoineHistoryPoint` — la case n'était pas juste grisée par
prudence, elle n'avait littéralement rien à tracer.

**Implémenté** : `PatrimoineHistoryPoint` gagne `valeur_investie`/`valeur_realisee_cumulee` (mêmes noms
que côté Financier, pour que le composant frontend applique la MÊME formule sans distinguo).
`patrimoine_history_service._serie_investie_manuel` (nouvelle fonction, même ancrage sur le coût
d'acquisition que `_serie_holding_manuel`) construit, PAR LIGNE manuelle, une série d'investi cumulé :
au premier point connu (l'ancrage à `prix_revient_moyen` s'il s'applique, sinon le premier point réel),
l'investi est supposé égal à la valeur affichée à ce moment — ensuite, il ne progresse QU'aux points où
`HoldingValuationHistory.versement` (§ U.2) est explicitement déclaré ; tout écart non déclaré reste un
gain, jamais un ajout d'investi (même convention que le résidu du bloc épargne du Rapport, § U.1/U.2).
**Bug trouvé et corrigé pendant les tests** : la première version initialisait le cumul sur la valeur
du premier point RÉEL même quand un ancrage s'appliquait, faisant compter à tort toute la performance
entre l'achat et la première estimation comme de l'investi plutôt que du gain — corrigé pour que
l'ancrage (`prix_revient_moyen`), quand il s'applique, serve toujours de base, y compris pour le tout
premier point réel (qui peut alors lui-même déclarer un versement depuis l'achat). `valeur_investie`
d'une ligne manuelle reste TOUJOURS en escalier (jamais interpolée comme la valeur brute d'une ligne
`TYPES_EPARGNE`, § U.2) : un versement est un événement ponctuel, jamais une progression continue à
lisser. `valeur_realisee_cumulee` reste exclusivement financière (aucun équivalent « réalisé » pour un
bien qui ne se cède pas par petites parts).

Frontend : la case « Mode étagé » n'est plus jamais désactivée ; le texte d'accompagnement s'adapte
selon la lentille (rappel du calcul du Gain/Perte total en Financier ; rappel que seul un versement
déclaré compte comme investi hors Financier, sinon la hausse est traitée comme un gain).

7 tests backend nouveaux (`test_patrimoine_history_service.py` : investi borné aux versements
déclarés, escalier même pour une ligne épargne interpolée, ancrage sur le coût d'acquisition, poche
financière + manuelle combinées, réalisé exclusivement financier, scoping détenteur), 3 tests frontend
mis à jour/nouveaux (`PortfolioHistoryChart.test.tsx`).

**Correctif post-livraison (31/08/2026)** : retour utilisateur — le mode étagé en lentille Net
n'affichait plus rien de cohérent (jusqu'à 360 000 € de "gains" pour un patrimoine net réel de
~73 000 €). Cause : `valeur_investie` reste toujours BRUTE (jamais réduite d'un emprunt), alors que
`patrimoine_net` utilisé comme "Portefeuille" en lentille Net l'est déjà — la dette d'un bien financé
à crédit était donc soustraite deux fois. Nouveau champ `valeur_investie_nette` (`valeur_investie −
passifs_totaux`, même netting global que `patrimoine_net`) : le frontend l'utilise désormais comme
"Investi" en lentille Net, jamais `valeur_investie`. Invariant verrouillé par un test dédié : Gains
(portefeuille + réalisé − investi) doit valoir EXACTEMENT le même montant en Brut et en Net, la dette
ne déplaçant jamais une performance d'investissement, seulement le capital investi affiché. Vérifié en
direct sur le vrai backend (redémarré avec le correctif) : échelle et courbe redeviennent cohérentes
en Net comme en Brut.

### V. Cohérence de la navigation (Lot 9, 30/08/2026)

#### V.1 — `mineur` · `S` · `P1` · `traité` (30/08/2026) — Audit de la navigation : plus une seule liste à maintenir

Demande directe de l'utilisateur : « la partie Menus est un peu en bordel, certaines pages ne sont
pas dans les menus » — avec la consigne explicite d'en revoir la structure pour que ça ne se
reproduise plus, et d'ajouter un fil d'Ariane au passage.

**Constat.** Au moment de l'audit, aucune page n'était réellement absente d'un menu : les 12 écrans
et leurs 4 menus (barre latérale, barre inférieure mobile, feuille « Plus », menu du compte)
partageaient déjà `ROUTES` (`layout/routes.ts`, backlog 2.K.2) comme source unique pour le chemin, le
libellé et le titre d'onglet — et un fil d'Ariane (`FilDAriane.tsx`) dérivé de ce même tableau
existait déjà depuis le même lot. Le risque réel n'était donc pas déjà matérialisé, mais bien présent
à deux endroits :

1. **`App.tsx` maintenait sa propre liste de `<Route>` en parallèle de `ROUTES`**, recopiée à la
   main : rien n'empêchait d'ajouter un écran dans l'une sans penser à l'autre — silencieusement
   absent des menus s'il manquait dans `ROUTES`, ou accessible par aucune URL s'il manquait dans
   `App.tsx`.
2. **Chaque menu dupliquait sa propre correspondance libellé → icône** (`Sidebar`, `BottomNav`,
   `MenuPlusSheet`, `MenuCompte` : jusqu'à 4 tableaux `ICONES` à tenir à jour pour un seul nouvel
   écran). La preuve que ce risque n'était pas que théorique : une entrée « Analyse » orpheline
   survivait identiquement dans 3 de ces 4 fichiers, cinq jours après le retrait réel de cette route
   (25/08/2026) — aucun des trois ne le signalait, ni au build ni aux tests.

**Correctif : les deux tableaux fusionnés en un seul, et la génération des routes inversée.**
`RouteMeta` (`layout/routes.ts`) gagne un champ `icone` (composant, plus une chaîne à faire
correspondre à la main) — un écran s'édite désormais à un seul endroit pour son chemin, son libellé,
son icône, son rang de menu et ses rôles autorisés. Les 4 tableaux `ICONES` dupliqués sont supprimés,
chaque composant de menu lit `r.icone` directement. L'entrée orpheline « Analyse » disparaît avec eux
(et `IconAnalyse`, devenue inutilisée nulle part dans le code, est retirée d'`icons.tsx`).

Le vrai verrou est ailleurs : la constante `PAGE_COMPONENTS` (association chemin → composant
paresseux, déplacée dans un nouveau fichier `layout/pageComponents.ts` — la garder dans `App.tsx`
cassait le fast-refresh de Vite, `oxlint` le signalait) n'est plus référencée à la main dans une
liste de `<Route>` séparée : `App.tsx` génère désormais son `<Routes>` en itérant `ROUTES` et en
résolvant chaque chemin dans `PAGE_COMPONENTS`. Un chemin ajouté à `ROUTES` sans entrée dans
`PAGE_COMPONENTS` (ou l'inverse) ne fonctionne tout simplement pas — l'oubli devient un bug visible
au premier clic, pas une absence silencieuse. Nouveau `layout/routes.test.ts` : chemins uniques,
`navLabel`/`rang`/`icone` toujours posés ensemble ou jamais, titre jamais vide, et `ROUTES`/
`PAGE_COMPONENTS` couvrant exactement les mêmes chemins (aucune divergence possible sans faire
échouer la suite).

Fil d'Ariane : déjà livré au lot 4 (`FilDAriane.tsx`, K.2), inchangé — revérifié à cette occasion
qu'il s'affiche correctement sur les 12 écrans, y compris ceux du menu du compte (Import/Réglages/
Aide), dérivés de la même source unique.

**Vérifié en conditions réelles** (30/08/2026) : backend + frontend lancés ensemble, connexion réelle
par formulaire, capture d'écran de chacun des 12 écrans depuis chacun des 4 menus (barre latérale
1440 px, barre inférieure + feuille « Plus » 390 px, menu du compte) — icônes et libellés cohérents
partout, fil d'Ariane correct sur un écran de consultation (`Synthèse › Salaire`) et un écran
d'administration (`Synthèse › Import`). Suite complète au vert (460 tests frontend, dont 4 nouveaux
sur `routes.test.ts`), `tsc -b`/`oxlint`/`vite build` propres, découpage par route toujours effectif
(un fichier JS séparé par page dans le build).

### W. Exposition consolidée — interactions (Lot 9, 31/08/2026)

#### W.1 — `mineur` · `S` · `P2` · `traité` (31/08/2026) — Détail des lignes au clic sur les camemberts de l'exposition consolidée

Demande directe de l'utilisateur, en montrant le camembert « Répartition par classe d'actif » de
`ExpositionConsolideeCard` : « J'aimerais bien sur ce graphique comme ceux du dessus avoir le détail
des lignes quand on clique dessus » — en référence au comportement déjà existant des camemberts
Répartition géographique/sectorielle du Tableau de bord (`AllocationChartCard`/`CompositionModal`,
scopés au seul portefeuille financier).

**Implémenté** : nouveau service `patrimoine_service.compute_composition_categorie_consolidee`
et endpoint `GET /api/patrimoine/exposition-consolidee/composition?dimension=geo|classe&categorie=
…&net=…`. Dimension `geo` réutilise telle quelle `analysis_service.holdings_in_category` (déjà
générique, le look-through des fonds s'applique de la même façon, les lignes manuelles y contribuent
via leur `zone_geo` déclarée) — seul `GET /api/analysis/composition` la restreignait au financier par
choix de l'appelant, pas la fonction elle-même. Dimension `classe` n'a pas de notion de look-through
(un bien immobilier n'est jamais réparti sur plusieurs classes) : correspondance directe par
`LABEL_TYPE_ACTIF`. `net` sélectionne la même valeur nette de l'emprunt rattaché à chaque ligne que la
lentille Net de la carte (jamais la valeur brute par erreur).

Frontend : `CompositionModal` généralisée (accepte désormais `fetchComposition`/`sousTitre` plutôt
qu'un `type: 'geo'|'sector'` figé sur `api.getCategoryComposition`) pour servir sans duplication le
Tableau de bord (géo/secteur financier, inchangé) ET `ExpositionConsolideeCard` (géo/classe tous
actifs). `PieChartCard` gagne un `onCategoryClick` optionnel (même câblage Recharts que
`AllocationPieChart`).

9 tests backend nouveaux (`test_patrimoine_service.py` : dimension classe/geo, nettage Net, ligne à
équité négative reste visible, catégorie inconnue ; `test_patrimoine_router.py`/`test_roles.py` :
endpoint + rôle invité refusé), 2 tests frontend nouveaux (`ExpositionConsolideeCard.test.tsx`, clic
simulé via un bouchon de `PieChartCard` — Recharts ne rend aucun secteur SVG cliquable en jsdom, même
limite déjà documentée pour `AllocationChartCard.test.tsx`). Vérifié en direct sur le vrai backend :
clic sur la part Immobilier du camembert Brut → modale avec le détail de la ligne concernée.

### X. Comptes structurels, établissements et quotités par compte (Lot 10, 01/09/2026)

#### X.1 — `majeur` · `L` · `P1` · `traité` (01/09/2026) — Écran Comptes façon Actual Budget, établissements, quotités par compte

Demande directe de l'utilisateur : une vue façon **Actual Budget** — la liste de tous les comptes du
foyer (compte courant, PEA, compte-titres, assurances-vie, immobilier...) avec le solde de chacun,
« pour savoir exactement combien il y a sur un compte donné, en comptant potentiellement
l'immobilier sur un compte ». Deuxième volet de la même demande : pouvoir définir un pourcentage de
propriété par détenteur du foyer **au niveau du compte** (pas ligne par ligne) — l'utilisateur cite
explicitement être à 50/50 avec son conjoint sur de nombreux actifs — y compris sur les **dettes et
emprunts**.

**Trois décisions de cadrage arbitrées avec l'utilisateur avant implémentation** (questionnaire, les
trois options recommandées retenues) :
1. **Modèle structurel** : une vraie table `Compte`, pas d'évolution du champ texte libre existant
   (`Holding.compte`).
2. **Établissement en liste gérée** (CRUD, comme les détenteurs), pas un texte libre — un même
   établissement (ex. « Caisse d'Épargne ») peut regrouper plusieurs comptes de nature différente
   (un compte courant ET une assurance-vie).
3. **Nouvel écran dédié** `/comptes` dans la navigation, plutôt qu'une intégration dans un écran
   existant (Patrimoine).

**Décision de scoping délibérée, prise en cours d'implémentation** : ne **pas** migrer le mécanisme
de calcul des quotités par détenteur (`QuotiteHolding`, `detenteurs_service.compute_parts`,
utilisé par `patrimoine_service`/`patrimoine_history_service`/`declaration_patrimoine_service`/
`holding_detail_service`/le filtrage périmètre invité — zone financière déjà testée, entremêlée dans
7+ fichiers). Il fonctionnait déjà, sans exclusion de type, pour tout `Holding` financier ou manuel
— ce qui manquait réellement était de pouvoir le définir une seule fois pour tout un compte plutôt
que ligne par ligne, et de l'exposer pour les emprunts. La nouvelle fonction
`comptes_service.set_quotites_compte` boucle simplement sur `detenteurs_service.set_quotites_holding`
pour chaque ligne du compte — même résultat pour l'utilisateur, risque minimal, pas de nouvelle
table de quotités.

**Modèle de données** : deux nouvelles tables `etablissements` (`user_id`, `nom`, unique par foyer)
et `comptes` (`user_id`, `nom`, `etablissement_id` nullable) ; `Holding.compte` (texte libre) devient
`Holding.compte_id`, clé étrangère nullable vers `comptes.id` (bucket « Sans compte » permanent, pas
une phase transitoire). Suppression jamais en cascade : un établissement supprimé laisse ses comptes
retomber à `etablissement_id = NULL`, un compte supprimé laisse ses lignes retomber à
`compte_id = NULL`. Migration Alembic (`f50410e8aa4e`) avec backfill : chaque paire distincte
`(user_id, compte)` non nulle devient une ligne `comptes`, chaque `Holding` reçoit le `compte_id`
correspondant, puis la colonne texte est supprimée — **vérifiée en base isolée avant toute
application** (backfill + `PRAGMA foreign_key_check` + `downgrade()`, données hétérogènes
volontairement construites : compte homonyme entre deux foyers, valeur vide, valeur `NULL`).

**Backend** : `comptes_service.py` (CRUD établissements/comptes, `get_or_create_compte` pour la
création à la volée depuis un nom saisi, `set_quotites_compte`, `solde_par_compte` — agrégation
**toutes natures d'actif confondues**, contrairement à `analysis_service.repartition_par_compte`
conservée telle quelle mais désormais réservée au seul export PDF, financier uniquement). Nouveau
routeur `routers/comptes.py` (`/api/comptes`, filtrage périmètre invité sur `/solde` comme sur les
autres endpoints financiers). `routers/loans.py` gagne `PUT /{id}/quotites`, déjà écrit côté service
(`set_quotites_loan`) mais jamais exposé jusqu'ici. `portfolio_reconstruction.py` adapté pour
reporter `compte_id` (pas juste `compte`) à travers un nouvel import de transactions — sans cette
adaptation, tout import aurait silencieusement effacé le rattachement de compte des lignes
reconstruites ; couvert par un test de non-régression dédié. Endpoint `GET /api/analysis/comptes`
retiré (le nouvel écran Comptes couvre entièrement ce besoin, et au-delà — tous types d'actifs, pas
seulement le portefeuille financier).

**Frontend** : nouvel écran `/comptes` (liste groupée par établissement, solde de chacun, total du
foyer) et `/comptes/:id` (détail : nom/établissement éditables, lignes du compte, répartition entre
détenteurs pour tout le compte — formulaire **volontairement vierge par défaut**, pas de
pré-remplissage intelligent depuis les lignes existantes, avec avertissement explicite que la
validation remplace la répartition actuellement enregistrée de chaque ligne). Nouvelle carte
`EtablissementsCard` (Réglages, onglet Détenteurs). Écrans existants adaptés au champ structurel :
`AjoutHoldingForm`/`PositionsTable` (sélection d'un compte existant ou création à la volée par son
nom, ergonomie de saisie libre préservée), `PortefeuillePage` (filtre par compte), `EpargnePage`
(chaque ligne d'épargne crée désormais automatiquement son propre compte 1:1 — sans ce changement,
tout le patrimoine manuel existant serait resté dans le bucket « Sans compte » du nouvel écran,
contrairement à la demande explicite de l'utilisateur de « compter potentiellement l'immobilier sur
un compte »), `LoansCard` (nouvelle section « Détenteurs » par emprunt). Carte « Répartition par
compte » du Tableau de bord retirée (remplacée par le nouvel écran, qui couvre plus que le seul
portefeuille financier).

29 tests backend nouveaux (`test_comptes_service.py`, `test_comptes_router.py` — CRUD, IDOR,
périmètre invité, quotités par compte, non-régression migration ; extension de
`test_loans_router.py` — quotités par emprunt) et adaptation de tous les tests existants référençant
l'ancien champ `compte` texte libre (`test_portfolio_reconstruction.py`,
`test_repartition_comptes.py`, `test_pdf_export_service.py`), suite complète au vert (902 backend).
Frontend : nouveaux tests (`ComptesPage`, `EtablissementsCard`), adaptation de toutes les fixtures
`Holding.compte` existantes vers le nouveau type objet, suite complète au vert (486 frontend),
`oxlint`/`tsc -b`/`vite build` propres.

#### X.2 — `mineur` · `S` · `P1` · `traité` (01/09/2026) — Vérification manuelle demandée par l'utilisateur : renommage d'un établissement manquant à l'IHM

Demande directe de l'utilisateur en suite de X.1 : « vérifie que la création, modification,
suppression de tous les champs sont bien réalisables par l'IHM ». Vérification faite en conditions
réelles (backend + frontend de développement démarrés sur la vraie base de l'utilisateur, en lecture
seule d'abord — migration `f50410e8aa4e` appliquée proprement, écran `/comptes` correct sur le
patrimoine réel), puis un cycle complet création/modification/suppression rejoué via l'IHM (compte de
test créé, renommé, rattaché à un établissement, ses quotités modifiées, puis tout supprimé).

**Trouvé en vérifiant** : le nom d'un établissement se crée et se supprime depuis `EtablissementsCard`
(onglet Détenteurs, Réglages), mais ne pouvait pas être **renommé** — aucun bouton « Modifier », alors
que le backend l'exposait déjà (`PATCH /api/comptes/etablissements/{id}`, `update_etablissement`,
jamais câblé côté frontend). Cohérent avec `DetenteursCard.tsx` (même limite, pas une régression
propre à ce chantier), mais ne couvrait pas la demande explicite de vérification.

**Corrigé** : édition inline (même patron que `CompteInfosForm`, sans modale) — bouton « Modifier »
bascule la ligne en formulaire (`Enregistrer`/`Annuler`), appelle `api.updateEtablissement`. 6 tests
Vitest nouveaux (`EtablissementsCard.test.tsx`, fichier qui n'existait pas non plus malgré la mention
prévue en X.1 — corrigé dans le même geste), 6 tests nouveaux (`ComptesPage.test.tsx`, même
constat pour la page principale). Deux tests E2E Playwright nouveaux, en conditions de navigateur
réelles (pas de mock) : cycle établissement complet (Réglages) et cycle compte complet — création,
renommage + rattachement d'établissement, modification de la répartition entre détenteurs,
suppression — dans `comptes.spec.ts`/`reglages.spec.ts` (52 E2E au vert désormais, 498 frontend, 902
backend inchangé).

#### X.3 — `mineur` · `S` · `P1` · `traité` (01/09/2026) — Étape « Comptes » dans l'assistant de bienvenue

Demande directe de l'utilisateur, en suite de X.1/X.2 : « dans le welcome wizard on a une jolie
interface invitant l'utilisateur à renseigner ses établissements et ses comptes ? ». Réponse honnête :
non, l'étape n'existait pas — décision de scoping délibérée prise en X.1 (« pas de nouvelle étape...
un compte/établissement se crée de toute façon à la volée depuis le formulaire d'ajout de position »).
La consigne de tête de `steps.ts` (« toute nouvelle fonctionnalité de configuration mérite d'être
envisagée ici », demande explicite du 01/09/2026) avait donc été envisagée puis écartée — l'utilisateur
tranche ici dans l'autre sens.

**Implémenté**, même doctrine que les étapes existantes (réutiliser tel quel un composant déjà
autonome, refléter l'état réellement enregistré au rejeu, jamais un parcours figé) : nouvelle étape
« Comptes », insérée entre « Détenteurs du foyer » et « Démarrer le portefeuille » (un compte déjà
déclaré profite ensuite du sélecteur de compte du formulaire d'ajout de position). `EtablissementsCard`
réutilisée telle quelle ; `AjoutCompteForm` extrait de `ComptesPage.tsx` (composant partagé, aucune
duplication) pour être également embarqué ici, avec une liste des comptes déjà créés au-dessus (sans
solde — à ce stade du parcours, généralement avant toute saisie de position, un solde serait toujours à
zéro).

15 tests `WelcomeWizard.test.tsx` (dont un nouveau dédié à cette étape, quatre adaptés — un clic
"Suivant" de plus pour atteindre "Démarrer le portefeuille"/"Terminé"), `ReglagesPage.test.tsx` adapté
(nombre d'étapes lu dynamiquement depuis `ETAPES_ONBOARDING`, pour ne plus se désynchroniser d'un futur
ajout/retrait d'étape), test E2E `reglages.spec.ts` étendu (rejeu jusqu'à cette étape, établissement
seedé bien reconnu). Suite complète au vert (902 backend, 499 frontend, 52 E2E).

#### X.4 — `majeur` · `M` · `P1` · `traité` (01/09/2026) — Audit complet post-chantier, avant démo utilisateur

Demande directe de l'utilisateur : « une fois terminé, je te laisse vérifier toutes les modifications
et tous les écrans... refactorise le code si nécessaire... teste toute l'appli proprement » — la veille
d'une démonstration à des tiers, avec l'exigence explicite « je veux un truc irréprochable ».

**Trouvé en auditant l'ensemble de l'application** (grep systématique de tout `.compte`/`HoldingDetail`
restant, écran par écran) :

1. **La fiche détaillée d'une position (`HoldingDetailContent.tsx`) n'affichait le compte rattaché
   nulle part**, alors que le backend l'exposait déjà (`HoldingDetail.compte`, posé lors de X.1) — le
   type frontend `HoldingDetail` ne déclarait tout simplement pas ce champ, jamais rendu à l'écran.
   **Corrigé** : badge à côté du type d'actif, lien vers la fiche du compte quand il y en a un.
2. **`set_quotites_compte` ne touchait jamais les emprunts**, alors que la demande d'origine (X.1)
   était explicite : « pareil pour un compte courant, un compte titre, un immobilier, une dette ». Un
   emprunt rattaché (`Loan.holding_id`) à une ligne du compte suivait donc une répartition
   potentiellement divergente de celle du bien lui-même, sans que rien ne le signale. **Corrigé** :
   `set_quotites_compte` applique désormais la même répartition à chaque emprunt rattaché à une ligne
   du compte (`detenteurs_service.set_quotites_loan`, même mécanisme que pour les lignes) ; nouvelle
   carte « Emprunts rattachés » sur la fiche du compte, purement informative, avant le formulaire de
   répartition (qui mentionne désormais aussi le nombre d'emprunts concernés).

**Refactor délibérément écarté** : une factorisation des trois éditeurs de quotités quasi-identiques
(`DetenteursSection`, `QuotitesEmprunt`, `QuotitesCompte` — déjà signalée en X.1 comme compromis assumé)
n'a pas été reprise ici — risque de régression sur trois flux déjà testés et fonctionnels, pour un
bénéfice cosmétique, la veille d'une démonstration. Reste un refactor identifié, pas oublié.

**Aucune autre modification de schéma de base de données jugée nécessaire** : `Etablissement`/`Compte`/
`Holding.compte_id` couvrent le besoin ; un `compte_id` direct sur `Loan` aurait dupliqué une relation
déjà déductible via `holding_id`, sans bénéfice.

Nouveaux tests : `test_la_fiche_detaillee_dune_ligne_expose_son_compte` (backend, `test_comptes_router.py`),
`test_set_quotites_compte_applique_aussi_aux_emprunts_rattaches` (backend, `test_comptes_service.py`),
14 tests `CompteDetailContent.test.tsx` (fichier qui n'existait pas — le composant le plus riche de tout
le chantier X.1 n'avait aucune couverture Vitest dédiée), 2 tests `HoldingDetailContent.test.tsx`
(badge de compte), E2E étendus (`comptes.spec.ts` : emprunt rattaché visible + décompte dans le texte ;
`holding-detail.spec.ts` : badge de compte, lien vérifié). Suite complète au vert (902 backend, 515
frontend, E2E complet).

#### X.5 — `majeur` · `L` · `P0` · `traité` (02/09/2026) — Recette complète : saisies incohérentes, suppressions référencées, guidage utilisateur

Demande directe de l'utilisateur, la veille de présentations à des tiers : « teste absolument toute
l'application de fond en comble », avec des données cohérentes ET incohérentes, en simulant « tous les
comportements utilisateurs possibles avec leurs besoins, leurs envies, leurs incompréhensions », et en
profitant de ces tests pour ajouter du guidage ergonomique.

**Méthode** : plutôt que de rejouer les parcours nominaux (déjà couverts par une spec E2E par écran),
deux campagnes ciblées sur ce qu'aucun parcours nominal n'exerce — les entrées dégradées et les
suppressions d'entités encore référencées — puis un balayage de tous les écrans. Les tests ont été
écrits comme des ATTENTES de bon comportement, sans regarder le code d'abord : leurs échecs sont donc
les anomalies réelles, pas une description de l'existant.

**11 anomalies trouvées et corrigées** :

| # | Anomalie | Gravité |
|---|---|---|
| 1-3 | Créer un compte, un établissement, ou renommer un compte vers un nom déjà pris → `IntegrityError` SQLAlchemy non interceptée, donc **HTTP 500 avec trace brute** | Bloquante en démo |
| 4 | Deux détenteurs homonymes acceptés silencieusement — indiscernables ensuite dans TOUS les sélecteurs de quotités et dans le filtre par détenteur | Majeure |
| 5 | Date d'acquisition dans le futur acceptée → rendement annualisé sur durée négative, graphiques ancrés après « aujourd'hui » | Majeure |
| 6 | Valorisation datée du futur acceptée → devient la « valeur courante » (le point le plus récent gagne) et fausse tout le patrimoine net | Majeure |
| 7-8 | Échéance d'objectif illisible ou déjà passée acceptée → contribution mensuelle nécessaire divisée par un nombre de mois nul ou négatif | Majeure |
| 9 | Supprimer un actif laissait son emprunt rattaché pointer vers une ligne inexistante (`Loan.holding_id` pendant) | Majeure |
| 10 | Supprimer un actif laissait ses **quotités, historique de valorisation, fiche immobilier et rattachements d'objectif** orphelins — aucune des 5 relations vers `holdings.id` n'avait de `cascade` déclaré | Majeure |
| 11 | Supprimer un compte se faisait **sans confirmation**, depuis un bouton posé sur une ligne elle-même cliquable — seul écran destructeur de l'application à ne pas confirmer | Majeure en démo |

Le nettoyage des références (§10) distingue deux traitements selon ce que la donnée fille REPRÉSENTE :
ce qui n'a de sens que par l'actif disparaît avec lui (quotités, historique, fiche immobilier,
rattachement d'objectif) ; un `Loan` SURVIT (un emprunt reste dû même si le bien sort du patrimoine)
et n'est que détaché — même doctrine que `comptes_service.delete_compte`.

**Guidage ergonomique ajouté** (demande explicite), ciblé sur les incompréhensions réellement
identifiables plutôt que saupoudré :
- Les trois vues **Net / Brut / Financier** portent chacune leur explication (c'est la différence
  entre elles qui est obscure, pas la notion de « vue » — d'où une infobulle par option).
- **« Part détenue » vs « Part nette »** expliquées sur la fiche d'un actif : deux notions proches,
  systématiquement confondues, qui ne diffèrent que si un emprunt est rattaché.
- Le bucket **« Sans compte »** explique qu'il n'est pas un compte (l'utilisateur cherchait à le
  renommer ou le supprimer).
- La confusion **Comptes / Épargne** levée directement sur l'écran, plus seulement dans le manuel.
- Champs **Nom / Établissement** du formulaire de compte documentés (`InfoBulle`).
- Filtre **Détenteur** et bascule **masquer les montants** expliqués.
- Bouton **« Ajouter »** du formulaire de position désactivé tant que ticker et quantité manquent,
  avec un `title` disant quoi remplir — auparavant le clic ne produisait *aucun* retour (`handleAdd`
  retournait silencieusement), l'utilisateur ne savait pas ce qu'on attendait de lui.

**TNR ajoutées** : `test_robustesse_saisies.py` (48 tests — une entrée dégradée par entité
saisissable), `test_robustesse_suppressions.py` (10 tests, dont un qui couvre les 5 tables
référençant `holdings.id` d'un coup : une 6ᵉ table ajoutée sans nettoyage le fera échouer),
`e2e/parcours-utilisateur.spec.ts` (10 tests : messages d'erreur compréhensibles, saisies
incohérentes, et vérification que le guidage promis est réellement à l'écran),
`e2e/sweep-ecrans.spec.ts` (15 tests : chaque écran s'affiche, **zéro erreur console**, aucune trace
technique visible, aucune URL inconnue ne produit d'écran blanc).

**Vérifié aussi, sans anomalie** : import de fichier vide ou binaire (PDF envoyé au lieu du CSV),
foyer entièrement vide (premier lancement), suppression du dernier actif, IDOR sur compte/emprunt/
objectif/quotités d'un autre foyer, quotités négatives ou >100 %, montants et durées d'emprunt
aberrants, année de salaire aberrante, préférences invalides.

### Y. Sauvegarde et portabilité des données (Lot 11, 02/09/2026)

#### Y.1 — `majeur` · `M` · `P2` · `traité` (02/09/2026) — Export et import de toutes les données du foyer

Demande directe de l'utilisateur, fonctionnalité « mise un peu sur le côté » jusque-là : pouvoir
exporter et réimporter l'intégralité de ses données. Ni les extraits CSV/PDF existants (documents à
lire, partiels, non ré-importables) ni la sauvegarde chiffrée du fichier SQLite (côté serveur, opaque,
tous foyers confondus) ne couvraient ce besoin : se faire une sauvegarde avant manipulation, ou
déménager vers une autre installation.

**Trois décisions arbitrées avec l'utilisateur avant implémentation** (questionnaire, les trois
options recommandées retenues) :
1. **Import = remplacement total**, pas fusion — un « PEA » déjà présent poserait une question
   d'identité (doublon ? fusion ? écrasement ?) sans réponse évidente. Le remplacement est
   prévisible et idempotent.
2. **JSON en clair**, pas de chiffrement — même logique que les exports CSV existants : c'est
   l'utilisateur qui télécharge et stocke le fichier. Le manuel rappelle qu'il est confidentiel.
3. **Tout le patrimoine du foyer**, budget compris.

**Implémenté** : `services/donnees_service.py` (déclaratif — 19 tables décrites par une liste ordonnée
`TABLES`, plutôt que 19 blocs écrits à la main : ajouter une table = ajouter une ligne) et
`routers/donnees.py` (`GET /export`, `POST /import/apercu`, `POST /import`), réservés au propriétaire.
Points structurants documentés en § 3.8.1 des spécifications : exclusion des caches reconstructibles et
de tout ce qui est sensible, `user_id` jamais exporté (ce qui rend le fichier importable sous n'importe
quelle identité — c'est ce qui permet la migration d'instance), réécriture systématique des
identifiants à l'import, deux passes pour l'auto-référence `categories_budget.parent_id`, atomicité
(`rollback` sur la moindre erreur) et validation du fichier **avant** toute écriture.

Interface : `SauvegardeDonneesCard.tsx` (Réglages, onglet Général), avec un parcours d'import en deux
temps délibéré — le fichier est d'abord analysé côté serveur (endpoint d'aperçu, qui ne modifie rien)
pour afficher son contenu en clair, et l'import ne s'exécute qu'après confirmation explicite. Laisser
une action irréversible se déclencher au simple choix d'un fichier aurait été une faute d'ergonomie sur
une opération de cette portée.

**Anomalie préexistante trouvée au passage** (en construisant le jeu de données de test) :
`rebuild_holdings` reportait bien le `compte_id` d'une ligne reconstruite, mais **pas ses quotités**.
Une ligne supprimée puis recréée par un import de transactions — ou par un simple changement de méthode
de calcul du coût de revient, qui déclenche une reconstruction — recevait un nouvel id, et les
`QuotiteHolding` restaient accrochées à l'ancien : la répartition entre détenteurs disparaissait de
l'écran (fiche de l'actif, part détenue/nette, filtre par détenteur, déclaration de patrimoine) tout en
laissant des lignes orphelines en base. D'autant plus sournois que le compte, lui, était bien reporté —
rien ne signalait que la propriété ne l'était pas. Corrigé sur le même modèle que le compte (report par
ticker), avec nettoyage des quotités d'un ticker qui sort du portefeuille.

**Tests** : `test_donnees_export_import.py` (23 tests — aller-retour complet, préservation des
relations après réécriture des identifiants, remplacement effectif, idempotence, isolation entre
foyers, import d'un export d'un AUTRE foyer, survie des dates, fichiers invalides et endpoints HTTP),
2 tests de non-régression sur `test_portfolio_reconstruction.py` (report des quotités, absence
d'orphelines), 9 tests `SauvegardeDonneesCard.test.tsx`, 3 tests E2E `sauvegarde-donnees.spec.ts`
(téléchargement réel, refus d'un fichier étranger, aller-retour complet en navigateur).

**Complété le 05/09/2026** (demande directe de l'utilisateur : « gérer le foyer dans sa globalité »,
le nommer/éditer/supprimer, la suppression revenant à effacer toutes les données comptables) :
- **Nom du foyer** : réglage libre et partagé (`preferences_service.lire_nom_foyer`/`enregistrer_nom_foyer`,
  clé `foyer_nom` dans `UserParametre`, sous `id_foyer` — pas de migration Alembic nécessaire), éditable
  par le propriétaire (`PATCH /api/auth/foyer`), visible par tout le foyer (`UserOut.foyer_nom`, comme
  `onboarding_termine`). Carte dédiée `FoyerCard.tsx` (Réglages, onglet Général).
- **Remise à zéro complète des données** (`POST /api/donnees/effacer`) : nouvelle fonction
  `donnees_service.reinitialiser_foyer`, qui réutilise `_supprimer_donnees_du_foyer` (déjà au cœur de
  l'import-remplacement de Y.1, donc déjà verrouillée par ses 23 tests) et y ajoute explicitement
  `LienPartage`/`PerimetreInvite` — deux tables volontairement exclues de `TABLES` (sensibles/propres à
  l'instance) mais qui restent des données du foyer à effacer pour une remise à zéro réelle. Sans ce
  nettoyage, un id de détenteur/compte réutilisé par SQLite après une suppression totale aurait pu faire
  pointer un vieux lien de partage ou périmètre d'invité vers une donnée totalement différente créée
  ensuite — cas limite identifié à l'exploration, verrouillé par un test dédié
  (`test_reinitialiser_foyer_efface_les_perimetres_invites_et_resiste_a_la_reutilisation_dun_id`).
  Décisions arbitrées avec l'utilisateur : **périmètre = données comptables uniquement**, aucun compte
  utilisateur (propriétaire/membre/invité) supprimé ; **pas de sauvegarde forcée**, une confirmation
  forte suffit — la phrase à taper exactement est le nom du foyer s'il est défini, sinon `"SUPPRIMER"`
  (vérifiée côté serveur, jamais confiance à la seule confirmation IHM), même principe que la
  confirmation par nom avant suppression d'un dépôt GitHub. Effet de bord assumé (pas contourné) :
  `UserParametre` fait partie de `TABLES`, donc la remise à zéro efface aussi `budget_categories_initialisees`
  (les catégories par défaut seront re-semées au prochain besoin, correct) et `onboarding_termine` **du
  propriétaire** (l'assistant de bienvenue réapparaîtra à sa prochaine connexion — cohérent avec
  « repartir à zéro »).

  **Écarté après investigation**, à la demande initiale de l'utilisateur — transfert de propriété
  (désigner un nouveau propriétaire depuis le sélecteur de rôle de sa propre ligne, cf. § 2.L.2) : rôle
  et `owner_user_id` ne sont pas les seules choses à basculer, 16 tables ancrent les données au foyer via
  un `user_id` qui pointe en dur vers l'id du propriétaire d'origine, jamais recalculé. Un vrai transfert
  exigerait de ré-ancrer ces 16 tables en une transaction atomique — projet à part entière, pas un effet
  de bord d'un sélecteur de rôle. Reporté, à cadrer séparément si le besoin se confirme.

  **Tests** : `test_preferences_service.py` (nom du foyer), `test_auth_router.py` (endpoint de
  renommage, visibilité partagée, réservé au propriétaire), 12 nouveaux tests dans
  `test_donnees_export_import.py` (remise à zéro, isolation entre foyers, préservation des comptes
  utilisateurs, liens de partage et périmètres d'invités effacés, cas limite de réutilisation d'id),
  `FoyerCard.test.tsx` (nouveau) et 7 tests ajoutés à `SauvegardeDonneesCard.test.tsx` (phrase de
  confirmation affichée dynamiquement, bouton verrouillé tant que la saisie ne correspond pas, annulation
  sans effet). E2E (`reglages.spec.ts`) : renommage persistant après rechargement, et mécanique de
  confirmation vérifiée en conditions réelles **sans jamais déclencher le wipe** (base E2E partagée par
  toute la suite).

#### Y.2 — `majeur` · `S` · `P0` · `traité` (02/09/2026) — Bug : la sauvegarde planifiée ciblait la mauvaise base

Question de l'utilisateur en suite de Y.1 : « au niveau des sauvegardes régulières, comment ça se passe
actuellement ? est-ce que tu as testé la fonctionnalité de façon automatisée ? ». L'audit de l'état réel
(plutôt qu'une réponse de mémoire) a révélé un bug silencieux.

**Constat.** `app/database.py` applique un repli historique documenté : si `patrimoine.db` est vide ou
absent alors que `portfolio.db` (nom d'avant le renommage du projet) contient de vraies données,
l'application ouvre ce dernier — règle née d'un incident réel du 19/08/2026. `scripts/sauvegarde.py`,
lui, codait `backend/patrimoine.db` **en dur**. Les deux divergeaient donc sur toute installation où le
repli s'applique, ce qui était précisément le cas de l'installation de l'utilisateur : l'application
travaillait sur `portfolio.db` (3,3 Mo, 51 positions) pendant que la sauvegarde ciblait un
`patrimoine.db` de 0 octet.

**Effet.** Le contrôle d'intégrité rejetait à chaque exécution une base sans table `holdings` — donc
aucune sauvegarde produite, plutôt qu'une sauvegarde vide silencieuse (le garde-fou a joué son rôle).
Mais l'échec ne se voyait que dans un statut « erreur » de l'écran Réglages → Automatisations, peu
consulté : le dossier `sauvegardes/` ne contenait **aucun fichier `.enc`**, et ses 10 fichiers `.db`
étaient tous des sauvegardes manuelles CLI datant du 20 au 25/08.

**Corrigé** en supprimant la divergence à la racine plutôt qu'en dupliquant le critère (qui aurait
rediivergé à la première évolution) : le job planifié sauvegarde désormais `database.DB_PATH` — la base
que l'application ouvre réellement — et `sauvegarde.chemin_base_source()` délègue à
`app.database._chemin_base_par_defaut()` via un import local protégé, préservant l'autonomie CLI
revendiquée du script si le paquet applicatif n'est pas importable.

**Réponse à la seconde question** (la couverture automatisée existante) : elle était bonne sur les
briques — 30 tests couvrant l'intégrité de la copie, la rétention, la restauration, le chiffrement, le
statut du job, l'absence de clé — mais aucun ne vérifiait l'invariant le plus élémentaire : *sauvegarde-t-on
la bonne base ?* Chaque test fournissait lui-même son chemin source, ce qui masquait exactement le
défaut. 3 tests ajoutés pour le verrouiller (`test_sauvegarde.py` : résolution identique à celle de
l'application, respect de `PATRIMOINE_DB` ; `test_scheduler_service.py` : le job passe bien
`database.DB_PATH`), et une procédure de vérification en 3 commandes ajoutée au manuel d'exploitation
(§ 8.1) — dont le contrôle « y a-t-il des `.enc` récents ? », seul indicateur fiable que la sauvegarde
automatique tourne vraiment.

**Reste à faire côté exploitation, hors code** : `PATRIMOINE_BACKUP_KEY` n'est pas définie sur le poste
de développement, le job planifié y échouerait donc encore (proprement) après ce correctif. En
déploiement Docker, la variable est présente dans les fichiers `compose-*.yaml` sous forme de
placeholder à remplacer.

#### Y.3 — `mineur` · `S` · `P2` · `traité` (02/09/2026) — Accepter une phrase secrète usuelle comme clé de chiffrement

Demande directe de l'utilisateur, après avoir proposé une chaîne de 64 caractères alphanumériques
refusée par Fernet : « je préférerais avec un générateur classique de ce type de variable, c'est plus
simple de générer des clés 64 caractères ». Friction réelle : les générateurs de secrets usuels
(gestionnaires de mots de passe, `openssl rand`, interfaces de secrets des plateformes d'hébergement)
ne produisent jamais le format exact qu'exige Fernet — 32 octets en base64 url-safe, soit 44 caractères
terminés par `=`, obtenus seulement via `Fernet.generate_key()`.

**Implémenté** : nouveau module partagé `services/cles_chiffrement.py`, utilisé par les deux
consommateurs de Fernet (`backup_service` pour les sauvegardes chiffrées, `oidc_service` pour le
`client_secret` SSO — la duplication aurait garanti leur divergence). Deux formes acceptées :

- une **vraie clé Fernet** est utilisée **telle quelle** — condition non négociable de
  rétrocompatibilité : la dériver à nouveau produirait une clé différente et rendrait illisibles
  toutes les sauvegardes et tous les secrets déjà chiffrés ;
- **toute autre phrase d'au moins 32 caractères** est dérivée par PBKDF2-HMAC-SHA256 (600 000
  itérations, recommandation OWASP 2023).

**Deux arbitrages explicités dans le code** plutôt que subis :

- *Sel fixe.* Un sel aléatoire imposerait de le stocker à côté des données chiffrées — donc un fichier
  annexe à ne jamais perdre sous peine de rendre toutes les sauvegardes illisibles : un mode de panne
  pire que celui qu'on évite, pour un outil auto-hébergé. Un sel fixe n'affaiblit la dérivation que
  face à un précalcul sur des phrases FAIBLES et répandues.
- *Longueur minimale de 32 caractères.* C'est elle qui rend le sel fixe acceptable, et qui empêche de
  protéger un patrimoine entier par « motdepasse ». Refus explicite en dessous, avec un message
  nommant la variable et disant quoi faire — ce texte étant affiché tel quel comme statut de job dans
  Réglages, souvent seul indice dont dispose l'exploitant.

Corrigé au passage (même session) : une clé invalide ne produisait qu'un `ValueError` anglais et
technique de la bibliothèque (`Fernet key must be 32 url-safe base64-encoded bytes.`), désormais
remplacé par un message actionnable via `CleChiffrementInvalideError`.

**Tests** : `test_cles_chiffrement.py` (12 tests), dont les deux propriétés vitales — la
rétrocompatibilité (vérifiée aussi par un vrai chiffrement/déchiffrement, pas seulement par égalité
d'octets) et le **déterminisme**, verrouillé jusqu'à la valeur exacte produite par une phrase de
référence : toute modification du sel, de l'algorithme ou du nombre d'itérations rendrait illisibles
les données déjà chiffrées et doit échouer ici, jamais passer inaperçue jusqu'à la prochaine
restauration. `test_backup_service.py` mis à jour (les phrases usuelles sont désormais acceptées).

#### Z.0 — `majeur` · `L` · `P1` · `traité` (03/09/2026) — Revue complète : qualité, base de données, sécurité, documentation

Demande : « une revue complète de toute l'application niveau qualité de code et
optimisation », avec une base « optimisée pour avoir le moins possible de champs et la
plus maintenable possible », l'anticipation des problèmes de sécurité et la validation
des documentations. Plan en cinq phases validé avant démarrage.

**Méthode.** Sauvegarde vérifiée de la base réelle avant toute chose (51 positions,
4 059 transactions), puis cinq audits en lecture seule — trois délégués à des agents,
la sécurité et la base de données traitées en propre. **Chaque constat d'agent
revérifié à la main avant d'être retenu** : le premier balayage IDOR remontait un cas
suspect (`portfolio.py:321`) qui s'est avéré être un faux positif, la garde étant
transitive.

**Trois hypothèses de mon propre plan invalidées par les données réelles**, et c'est
le résultat le plus utile de l'exercice :

- `transactions.date` annoncée « strictement redondante » avec `datetime_utc` :
  **62 lignes divergent** réellement, dont 50 d'exactement −1 jour sur des titres US.
  L'import préserve la date du courtier (`_clean(row.get("date")) or ...`). La
  supprimer aurait faussé 62 transactions.
- `holdings.valeur_estimee` annoncée « dénormalisée » : 74 usages, et 8 points
  d'historique pour 2 lignes valorisées — c'est le champ PRIMAIRE, pas un cache.
- Les 4 clés étrangères sans index, présentées comme un gain : leurs tables
  contiennent 0 à 7 lignes. Aucun gain mesurable.

**Sur la demande « le moins de champs possible »** : balayage exhaustif des 240
colonnes des 33 tables, backend et frontend. **Une seule colonne morte**
(`ticker_resolution.resolue_le`). Le schéma était déjà sobre ; il n'y avait pas de
gras à retirer, et le critère appliqué mécaniquement aurait dégradé l'application.

**Livré en quatre vagues** (une par thème, suite complète au vert entre chaque) :

| Vague | Contenu | Gain mesuré |
|---|---|---|
| Base de données | Index composite, expiration du cache tickers, 12 références pendantes réparées, validation des énumérations à l'import | 0,491 → 0,009 ms, index couvrant |
| Backend | N+1 du patrimoine par détenteur, doublon de ticker, atomicité des quotités, 3 constantes mortes | **207 → 8 requêtes SQL** pour 51 lignes |
| Frontend | Accessibilité clavier, erreurs annoncées, formatteurs mis en cache, 3 éditeurs de quotités factorisés, `catch` silencieux, cibles budget | ~2 000 constructions d'`Intl` par rendu supprimées |
| Découpages | `schemas.py` (1 876 l. → 17 modules), `types.ts` (1 085 l. → 12 modules) | 0 changement de comportement |

**Sécurité : aucun correctif.** IDOR conforme sur les 22 récupérations par id,
partage public solide (`pbkdf2_sha256`, verrouillage 429, surface limitée aux
agrégats), périmètre invité appliqué par les 4 routeurs concernés, escalade par
import impossible (`users` non importable, `user_id` forcé), aucun SQL concaténé.

**Deux défauts trouvés en corrigeant, pas en auditant** — les deux par un test qui
échoue :

- `role="button"` sur un `<tr>` lui RETIRE son rôle `row` et détruit la sémantique du
  tableau. Remède pire que le mal, remplacé par un bouton sur le ticker.
- Le découpage de `schemas.py` perdait `MESSAGE_TICKER_VIDE` (avalée par le calcul de
  fin d'en-tête), rattrapée par une comparaison d'inventaire AST 133 → 132. Une
  relecture humaine de 1 876 lignes ne l'aurait pas vue — d'où l'automatisation des
  deux découpages, avec contrôle d'inventaire et refus d'écrire en cas de cycle.

**Documentation** : route `/patrimoine` (et non `/portefeuille`), trois tâches
planifiées et non deux (3 documents), `PATRIMOINE_CORS_ORIGINS` ajoutée au tableau des
variables, renvois `§ X.6` → `Y.1` (y compris dans `ReglagesPage.tsx`), « dix lots » →
onze, repli historique de la base documenté au § 8.1 du manuel d'exploitation.

**Non traité, consigné** : Z.1 (appels réseau redondants).

#### Z.2 — `majeur` · `XS` · `P1` · `traité` (03/09/2026) — Import refusé en Docker : nginx plafonnait à 1 Mo

Signalé par l'utilisateur : « l'appli m'indique que le fichier est trop volumineux »
sur un export de transactions de **1,23 Mo**, alors que la limite applicative est de
25 Mo. Question posée : « pourquoi il y a eu cette régression ? »

**Ce n'en était pas une.** `frontend/docker/nginx.conf` n'a jamais été modifié depuis
sa création (`26215d8`), et la revue de qualité n'y a pas touché. Le défaut était
latent depuis l'ajout du déploiement Docker ; il ne s'est manifesté que le jour où
l'export de l'utilisateur a franchi 1 Mo.

**Cause.** Aucune directive `client_max_body_size` : nginx appliquait son défaut de
1 Mo et rejetait la requête avec un 413 **avant que l'application ne la voie**. Le
frontend traduisait fidèlement ce 413 en « fichier trop volumineux » — message exact
sur le plan HTTP, trompeur sur le plan métier, et **aucun journal applicatif n'en
portait la trace** puisque le rejet avait lieu côté proxy.

**Pourquoi ça n'a jamais été vu** : le proxy Vite (développement, et toute la suite
E2E) n'impose aucune limite de corps. Le défaut n'existait que sur le chemin nginx,
qu'aucun test n'empruntait.

**Corrigé** : `client_max_body_size 25m;` aligné sur
`upload_limits.TAILLE_MAX_IMPORT_OCTETS`, avec un commentaire qui explicite le lien.
`tests/test_upload_limits.py` (4 tests) verrouille l'égalité des deux valeurs — la
divergence, pas seulement l'absence de directive. Vérifié en retirant la directive :
2 tests sur 4 échouent, puis repassent une fois rétablie.

Les quatre chemins d'upload (positions, transactions, deux imports budget) partagent
déjà la même limite applicative : le correctif les couvre tous.

#### Z.3 — `majeur` · `M` · `P1` · `traité` (03/09/2026) — Audit de design : contrastes, cibles, focus, thème

Audit conduit sur l'application **exécutée** (backend jetable, données de
démonstration), pas sur son code : contrastes calculés par la formule WCAG sur les
couleurs réellement rendues, cibles et débordements mesurés au `getBoundingClientRect`.

**Corrigés :**

| Constat | Mesure avant | Après |
|---|---|---|
| `--positif` (gains) illisible | 3,77:1 sur blanc | **5,48:1** (emerald-700) |
| `--avertissement` (estimations) illisible | 3,19:1 | **5,02:1** (amber-700) |
| Fond de page en mode sombre trop clair | slate-700, 3 teintes sous le seuil | **slate-900**, 0 sous le seuil |
| « Supprimer » (Comptes) | 55 × 16 px, 3 boutons identiques | **44 px** + `aria-label` nommant le compte |
| Boutons d'emprunt hors écran | 52 px hors cadre sur iPhone SE | `flex-wrap`, **0 débordement** |
| Aucune règle `:focus-visible` | anneau navigateur par défaut | règle projet, 2 px `--accent` |
| `Chargement...` en texte brut | 3 occurrences dans `App.tsx` | `SkeletonTexte` (avec `role="status"`) |

**Deux découvertes faites en corrigeant, pas en auditant :**

- **La préférence de thème n'était jamais appliquée au chargement.** `useTheme`
  ne vivait que dans `BasculeTheme`, monté à l'intérieur du menu Compte — lui-même
  rendu conditionnellement (`MenuCompte.tsx:68`, `{ouvert && ...}`). Un utilisateur
  ayant choisi le thème sombre retrouvait l'application en clair à chaque
  rechargement, jusqu'à rouvrir ce menu. Bug préexistant (fichiers jamais touchés
  par les vagues précédentes), découvert parce que le mode sombre refusait de
  s'appliquer pendant la vérification. Corrigé par `useAppliquerTheme()` appelé à
  la racine d'`App`.
- **`Skeleton` utilisait `bg-surface-elevee`**, c'est-à-dire le fond de PAGE : un
  squelette posé directement sur la page y aurait été invisible — cas exact du
  fallback de route qu'on venait d'y placer. Basculé sur `--bordure`, qui se
  détache à la fois de la page et des cartes, dans les deux thèmes.

**Écarté après vérification** : le signalement « gain/perte par la couleur seule ».
`formatPct` émet déjà un `+` et les statuts affichent « Succès »/« Échec » en toutes
lettres — le second signal existe partout où il a été cherché. Ajouter des flèches
aurait été du bruit redondant.

**Non retenu** : les rangées `flex` de `PositionsTable` et `SalairePage` portent deux
boutons et tiennent à 375 px — seule celle des emprunts (cinq boutons) débordait.

#### Z.1 — `mineur` · `S` · `P3` · `traité` (03/09/2026) — Appels réseau redondants au chargement

Identifié pendant la revue du 03/09/2026, **délibérément non traité** dans les vagues
de correctifs : le remède demande de remonter l'état dans deux gros composants, un
diff moyen pour un gain modeste, et mal fait il introduit une liste de comptes périmée.
Consigné plutôt que bâclé.

Quatre doublons vérifiés, tous des composants montés simultanément qui chargent
chacun le même endpoint :

| Endpoint | Appelé par |
|---|---|
| `GET /portfolio/holdings` | `PortefeuillePage.tsx:169` **et** `LoansCard.tsx:333` |
| `GET /comptes` | `AjoutHoldingForm.tsx:55` **et** `PositionsTable.tsx:403` |
| `GET /etablissements` | `onboarding/EtapeComptes.tsx:30` **et** `EtablissementsCard.tsx:26` |

S'y ajoute un N+1 côté client : `EpargnePage.tsx:431` monte un `CompteEpargneCard`
par compte, et chaque carte charge son propre historique (`:116`) — 1 requête par
compte d'épargne au montage.

**Traité** en remontant l'état au parent, jamais par un cache de module : les
composants rechargent la liste après création d'un compte à la volée, et un cache mal
invalidé les ferait diverger — c'est précisément le risque qui avait fait écarter ce
chantier.

Les props sont **optionnelles**, avec repli sur le chargement propre : `AjoutHoldingForm`
sert aussi dans l'assistant de bienvenue et `EtablissementsCard` dans Réglages, où aucun
parent ne porte la liste. Un composant reste donc utilisable seul.

**Mesuré sur le build de production** (le développement double tout via StrictMode, ce
qui rend la mesure inexploitable en `vite dev`) :

| Écran | Avant | Après |
|---|---|---|
| Portefeuille | 7 requêtes (`comptes` ×2, `holdings` ×2) | **5** |
| Épargne | 3 + 1 par compte d'épargne | **3** |

Le N+1 de l'écran Épargne est traité sans toucher au backend : l'historique n'est
utilisé que dans le bloc déplié d'une carte, et les cartes sont repliées par défaut. Il
est donc chargé à la première ouverture, puis conservé — vérifié en navigateur : 0
requête au chargement, 1 à l'ouverture, 0 de plus après fermeture/réouverture.

**Trois tests ajoutés, chacun vérifié en réintroduisant la régression** — la première
version en passait deux qui ne prouvaient rien : `LoansCard` est mocké dans
`PortefeuillePage.test.tsx` (son appel ne pouvait pas être observé là), et avec une
liste de positions vide la page affiche un état vide À LA PLACE du tableau, donc le
doublon ne pouvait pas se produire. Corrigé en fournissant une vraie ligne et en
couvrant `LoansCard` dans son propre fichier, dans ses deux modes.

---
#### Z.4 — `majeur` · `S` · `P1` · `traité` (03/09/2026) — Composition d'un ETF neuf : justETF n'était consulté qu'une fois par semaine

Signalé par l'utilisateur sur son homelab après ajout de **FR0011550185** (BNP Paribas
Easy S&P 500) : « certaines infos remontent mais pas la répartition géographique, bien
présente sur justETF ». Décrit comme une régression — **ce n'en était pas une** :
`justetf_service.py` n'a pas été modifié depuis le 30/08/2026, et l'extraction elle-même
fonctionne (vérifiée en direct sur cet ISIN : 3 zones, 5 secteurs, description, top 10).

**Cause.** L'ordre « justETF d'abord, yfinance en repli » que documente
`market_data_service` n'était appliqué qu'au **prix**. La composition, elle, partait
toujours sur yfinance ; la donnée justETF n'arrivait que par `justetf_refresh`, job
**hebdomadaire**. Or yfinance fournit bien la répartition sectorielle mais **aucune
répartition géographique** pour beaucoup d'ETF européens.

Reproduit sur base isolée avec le vrai ISIN :

| | Après ajout + rafraîchissement des cours | Après le job hebdomadaire |
|---|---|---|
| `sector` | 11 lignes (yfinance) | 5 lignes (justETF) |
| `geo` | **0 ligne** | **3 lignes** |
| description | absente | présente |

L'écran restait donc incomplet **jusqu'à sept jours**, sans que rien n'indique qu'il
suffisait d'attendre.

**Corrigé** par `_composition_justetf_ou_yfinance` : justETF est consulté en premier,
yfinance ne sert que si justETF ne couvre pas l'ETF (listes vides) ou est injoignable
(`None`). Le coût est borné — l'appel n'a lieu que sous la garde
`a_deja_composition_justetf`, donc **une fois par ETF neuf**, jamais à chaque
rafraîchissement de prix.

**Un défaut du correctif lui-même, révélé par son propre test** : la garde exigeait un
ticker Yahoo (`ticker_resolu is not None`) AVANT d'essayer justETF, qui ne travaille
pourtant qu'à partir de l'ISIN. Un ETF couvert par justETF mais non résolu par la
recherche Yahoo serait resté sans aucune composition. La garde a été déplacée sur le
seul repli.

**Vérifié que le repli tient toujours** sur deux ETF réels que justETF ne couvre pas
(FR0011869312, FR0013412012) : 11 lignes sectorielles chacun, `source='composition'`.

**Tests** : 3 dans `test_market_data_service.py` — ETF couvert (géo présente dès le
premier rafraîchissement), ETF non couvert (repli yfinance), justETF injoignable (le
repli joue aussi). Vérifiés en réintroduisant l'ancien comportement.

**Reste à faire côté utilisateur** : les ETF déjà en base avec une composition yfinance
ne basculent pas d'eux-mêmes, la garde `a_deja_composition_justetf` ne s'applique qu'à
l'absence de ligne justETF. Un « Rafraîchir maintenant » du job justETF depuis Réglages
les met à niveau en une fois.

---
#### Z.5 — `majeur` · `S` · `P1` · `traité` (03/09/2026) — Un fonds sans nom ne bénéficiait plus jamais du repli géographique par indice ; et un ETF non couvert par justETF était sur-sollicité

Deux défauts trouvés en vérifiant **Z.4** (livré plus tôt le même jour), signalés par
l'utilisateur sur **FR0011871078** : « toujours cet actif noté comme non catégorisé »,
alors que la répartition sectorielle, elle, s'affichait correctement.

**1. Le repli géographique par nom d'indice était mort pour tout fonds.**
`fetch_fund_composition` sait depuis longtemps déduire une géographie approximative
du nom de l'indice suivi (`reference_indices.repartition_geo_depuis_le_nom`, ex.
« MSCI China » → 100 % marchés émergents) quand Yahoo ne fournit pas `top_holdings`.
Mais le nom transmis, `data.get("nom")`, vaut **systématiquement `None`** pour un
FUND depuis l'Increment 9 (2.4) : le prix d'un ETF vient de `justetf_service.fetch_price`,
qui ne renvoie qu'un prix, jamais un nom — seule `fetch_one` (voie yfinance,
actions/crypto) en renvoie un. Ce repli était donc silencieusement mort pour tout
fonds depuis ce changement de prix, bien avant Z.4 — Z.4 l'a seulement rendu visible
en le sollicitant sur un cas où plus aucun autre repli n'existait
(`FR0011871078`, ETF Chine à réplication **synthétique** — swap — donc **sans
onglet Holdings sur justETF**, confirmé en inspectant la page réelle : aucun
`data-testid` de composition, aucun onglet « Holdings » dans la liste des onglets).

Corrigé par `_nom_pour_repli_geo` : à défaut de `data.get("nom")`, retombe sur
`Holding.nom` (saisi à la création ou importé), seul champ fiable pour un fonds sur
ce chemin. Résultat vérifié en direct sur l'ISIN signalé : `Marchés émergents 100 %,
source=indice`.

**2. Corollaire trouvé en vérifiant le correctif, avant tout signalement utilisateur** :
la garde censée limiter l'appel justETF introduit par Z.4 à « une fois par ETF neuf »
(`a_deja_composition_justetf`) ne devient **jamais** vraie pour un ETF que justETF ne
couvre pas (fonds synthétique, matières premières...), puisqu'il n'obtient jamais de
ligne `source=justetf`. Un tel ETF se serait donc fait interroger sur justETF à
**chaque** rafraîchissement de prix — quotidien par défaut, plus souvent via le
bouton manuel — au lieu d'une fois, contrairement à ce que Z.4 affirmait et au mépris
de la politesse due à une ressource « sans SLA ni support » (cf. docstring de
`justetf_service`). Avant Z.4, cette voie n'appelait jamais justETF : seul le job
hebdomadaire `refresh_all` le faisait.

Corrigé par un paramètre `tenter_justetf`, vrai seulement quand **aucune**
composition (d'aucune source) n'existe encore pour le ticker — capturé avant la
suppression des lignes existantes. Le job hebdomadaire reste seul responsable de
revérifier périodiquement les ETF non couverts.

**Vérifié en direct, réseau réel** : un premier rafraîchissement de FR0011871078
contacte justETF une fois (obtient une fiche sans composition, retombe sur
yfinance + repli par nom) ; un second rafraîchissement, dans le même process, ne
recontacte PAS justETF, et la composition reste présente. Le cas pleinement couvert
(FR0011550185) reste inchangé : justETF une fois, puis plus jamais (bloqué par la
garde existante, pas par la nouvelle).

**Tests** : 2 ajoutés dans `test_market_data_service.py`, dont un qui espionne les
appels à `justetf_service.fetch_composition` sur deux rafraîchissements successifs.
Les deux vérifiés en réintroduisant le défaut correspondant.

**Autres ETF du foyer concernés par le repli par nom**, une fois rafraîchis :
`FR0013412012` (MSCI Emerging Asia → marchés émergents),
`FR0011869312` (MSCI AC Asia Pacific Ex Japan → Asie-Pacifique hors Japon).
`IE00B4ND3602` (or physique) et `LU1681048630` (S&P Global Luxury) resteront
« Non catégorisés » en géographie — aucun repli n'a de sens pour l'un (matière
première, pas un pays), et l'autre ne correspond à aucun indice reconnu.

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

**Mise à jour du 03/09/2026** : douze lots sont désormais clos (Phases 1-3 + Lots 4-12). Il ne reste
que **trois points isolés, hors lot** — aucun n'est bloqué par manque de temps ou de priorité, tous
les trois attendent quelque chose qui n'est pas du développement (§ « Ce qui reste, et pourquoi »
ci-dessous). Le backlog fonctionnel issu de l'audit du 21/08/2026 est donc, pour l'essentiel,
**épuisé** — ce document continue de servir de trace pour tout nouveau retour utilisateur, comme il
l'a fait pour les Lots 9 et 10.

Un ordre est resté contraint par les dépendances pour les lots 4 à 7 : la refonte de l'enveloppe (K)
précède tout ajout d'écran, sinon chaque nouveau lot reproduit les défauts mesurés ; le modèle de
détention (L) et le rattachement des emprunts (M.2) précèdent la part nette, la rentabilité
immobilière, les objectifs par contributeur et la déclaration de patrimoine. Le Lot 9, lui, n'a pas
été planifié à l'avance : c'est la trace, groupée après coup, de tout ce que l'usage réel de
l'application (une fois les lots 4-7 livrés) a fait remonter — bugs, quickwins, demandes directes.

| Lot | Contenu | Prérequis | Effort | État |
|---|---|---|---|---|
| **Phase 1** | A.1, A.2, A.3 — patrimoine net (immobilier, SCPI/AV/PER, dettes) | — | — | **Livré** 19/08/2026 |
| **Phase 2** | B.1, B.2, A.4 — simulateur, FIRE, catégorie libre | Phase 1 | — | **Livré** 19-20/08/2026 |
| **Phase 3** | C.1, D.1, D.2, E.3, H.1 — dividendes, PDF, rapport, coût consolidé, PWA | Phase 2 | — | **Livré** 20/08/2026 |
| **Lot 4 — Socle** | K.1, K.2, K.3, K.5, K.7 · L.1, L.2 · M.2 | — | `L` | **Livré** 21-24/08/2026 (8/8) |
| **Lot 5 — Profondeur** | M.1, M.3, M.4 · K.4 (mobile) · K.6 | Lot 4 | `L` | **Livré** 24/08/2026 (5/5) |
| **Lot 6 — Flux** | N.1, N.2, N.3, N.4 | Lot 4 | `L` | **Livré** 24/08/2026 (4/4) |
| **Lot 7 — Pilotage** | O.1, O.2 · P.1 · Q.1, Q.2 · G.1 (absorbé par Q.1) | Lots 4, 5 (Q.2 : + Lot 6 pour le reste à vivre) | `M` | **Livré** 21-25/08/2026 (5/5) |
| **Lot 8 — Différenciation** | P.2, P.3 · C.2 (absorbé par P.3) | Lot 7 | `M` | **Livré** 25/08/2026 pour la partie développable (2/2) — Q.3 et E.1 restent hors lot, § ci-dessous |
| **Lot 9 — Retours terrain** | R.1, R.2, R.3 · S.1, S.2, S.3 · T.1, T.2, T.3 · U.1, U.2, U.3, U.4 · V.1 · W.1 | Lots 4-7 (usage réel) | `L` | **Livré** 25-31/08/2026 (15/15) |
| **Lot 10 — Comptes structurels** | X.1, X.2, X.3, X.4, X.5 | Lot 4 (modèle de détention) | `L` | **Livré** 01-02/09/2026 (5/5) |
| **Lot 11 — Sauvegarde et portabilité** | Y.1, Y.2, Y.3 | — | `M` | **Livré** 02/09/2026 (3/3) |
| **Lot 12 — Revue de qualité** | Z.0, Z.1, Z.2, Z.3, Z.4, Z.5 | — | `L` | **Livré** 03/09/2026 (6/6) |

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
   passifs. Rien ne le bloque, mais rien ne le rend urgent tant que les lots précédents ne sont pas
   livrés : c'est ce qui fait la supériorité de l'outil, pas ce qui le rend utilisable. Sa seule
   partie non développable (Q.3 : décision d'arbitrage utilisateur ; E.1 : fichier externe manquant)
   reste ouverte, mais tout ce qui pouvait être codé l'a été.
6. **Lot 9 n'a jamais été planifié comme les précédents** : c'est la trace, groupée après coup pour
   ne pas laisser une quinzaine de demandes éparpillées en « hors lot » sans structure, de ce que
   l'usage réel de l'application — une fois les fondations (lots 4-7) posées, une fois l'immobilier
   et l'épargne réellement saisis, une fois le premier relevé de cours vraiment rafraîchi — a fait
   remonter : deux bugs (T.2, verrou SQLite ; le correctif Net du 31/08 documenté en § U.4), trois
   quickwins (T.1, T.3), et dix demandes directes affinant des lots déjà livrés plutôt qu'ouvrant un
   nouveau chantier (R, S, U, V, W). Aucune dépendance interne autre que U.2 → U.3/U.4 (le versement
   déclaré doit exister avant qu'on puisse le décomposer ou l'utiliser dans le mode étagé).
7. **Lot 10, comme le Lot 9, n'a pas été planifié à l'avance** : un unique retour direct, mais plus
   structurant que ceux du Lot 9 (un vrai changement de modèle de données, `compte` texte libre →
   table `Compte`/`Etablissement`), d'où un lot séparé plutôt qu'un ajout à la trace du Lot 9. Dépend
   du modèle de détention (L.1, Lot 4) : les quotités par compte s'appuient sur le mécanisme de
   quotités par détenteur déjà en place, sans le modifier.

**Ce qui reste, et pourquoi.**

Trois points, et trois seulement. Aucun n'est un chantier de développement en attente de priorité :
chacun attend une décision ou une donnée que ce document ne peut pas produire lui-même. **Z.1**, le
dernier reste de développement, a été traité le 03/09/2026.

| Point | Bloqué par | Action pour débloquer |
|---|---|---|
| **E.1** — élargir les formats de courtier reconnus | Aucun fichier d'export réel d'un autre courtier (Boursorama, Degiro, IBKR…) disponible pour écrire le parseur sans deviner | Fournir un export réel (anonymisé si besoin) d'un autre courtier |
| **E.2** — explorer une agrégation bancaire gratuite | Aucune réponse écrite d'Enable Banking sur le statut réglementaire d'un usage personnel | Réponse d'Enable Banking, **avant tout code** |
| **Q.3** — devise et internationalisation légère | Décision produit non tranchée par l'utilisateur (l'app n'a aujourd'hui qu'un seul foyer, en euros — utile seulement si un actif en devise étrangère apparaît) | Arbitrage explicite de l'utilisateur : le besoin existe-t-il réellement aujourd'hui ? |

Deux points historiquement « hors lot » sont désormais résolus par renvoi plutôt que par
développement propre : **C.2** (projection des dividendes) absorbé par **P.3**, qui traite le même
besoin en séparant ce qui est certain (loyers, intérêts de livrets) de ce qui est estimé (dividendes
d'ETF) ; **F.1** et **G.1** tranchés le 21/08/2026, devenus respectivement **§ N** (budget) et
**§ Q.1** (partage révocable, plus simple que ce qu'envisageait G.1 à l'origine).

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
