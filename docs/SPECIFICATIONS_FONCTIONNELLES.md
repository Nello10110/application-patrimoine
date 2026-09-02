# Spécifications fonctionnelles — Application Patrimoine

## 1. Périmètre

Application web locale, multi-utilisateur par foyer (propriétaire/membre/invité, backlog § 2.L.1/L.2),
de suivi de patrimoine et de portefeuille boursier. Elle permet de :

1. reconstruire automatiquement le portefeuille réel à partir d'un export d'historique de transactions (courtier Trade Republic et compatibles), avec un choix de méthode de calcul du coût de revient (coût moyen pondéré ou FIFO) ;
2. enrichir chaque position avec des données de marché (cours, secteur, pays, composition des ETF) via Yahoo Finance (`yfinance`), avec mise en cache pour limiter la fréquence des appels ;
3. visualiser la répartition géographique et sectorielle réelle du portefeuille financier ;
4. calculer la rentabilité globale et par ligne (gain/perte, rendement annualisé money-weighted), à partir d'une convention de données algébrique et sans double comptage des frais ;
5. annoter chaque ligne d'un compte (PEA, CTO...) à titre purement indicatif, pour lire la répartition de la valeur actuelle par enveloppe ;
6. exporter positions, transactions et synthèse de rentabilité en CSV compatible Excel français ;
7. planifier le rafraîchissement automatique des données de marché, ou le déclencher manuellement, sans bloquer l'interface ;
8. suivre le **patrimoine net global** (roadmap Phase 1, `docs/ROADMAP.md`) : au-delà du seul portefeuille financier, immobilier/SCPI/assurance-vie/PER/autres actifs valorisés manuellement et emprunts (passifs), avec une répartition par grande classe d'actif ;
9. **projeter** ce patrimoine net à horizon réglable et estimer une **indépendance financière** (roadmap Phase 2) à partir d'hypothèses de rendement, d'épargne et de dépense cible — présenté explicitement comme une hypothèse, jamais une promesse ;
10. consulter un **calendrier des dividendes perçus**, mois par mois, avec le détail des lignes (roadmap Phase 3) ;
11. exporter un **relevé de patrimoine en PDF** mis en forme, au-delà des exports CSV (roadmap Phase 3) ;
12. voir le **coût de gestion annuel consolidé** des fonds/ETF détenus, avec un indicateur honnête de la part du portefeuille pour laquelle ce coût est réellement connu (roadmap Phase 3) ;
13. consulter, à la demande, un **rapport récapitulatif** (évolution, plus gros mouvements, dividendes perçus) sur un mois, une année, ou une période personnalisée (roadmap Phase 4) ;
14. **installer l'application** comme une application (icône, plein écran) depuis un navigateur compatible (roadmap Phase 3).

L'application ne fournit **aucun conseil en investissement personnalisé** : elle ne recommande jamais l'achat ou la vente d'un titre précis. Elle ne simule aucune fiscalité (cf. § 5, non-objectif assumé).

## 2. Écrans

| Écran | Route | Rôle |
|---|---|---|
| Tableau de bord | `/` | Vue d'ensemble en trois temps (backlog § 2.K.6) : **le chiffre** (patrimoine net très grand + variation/phrase), **la courbe** (évolution du portefeuille), **le détail** repliable (rentabilité globale + métriques avancées TWR/volatilité/drawdown/comparaison à un indice — § 2.P.2, revenus passifs projetés certain/estimé — § 2.P.3, répartition géo/sectorielle réelle, qualité des données, exposition consolidée tous actifs — § 2.P.1, coût de gestion, indicateurs de risque) |
| Portefeuille | `/portefeuille` | Liste des positions : tri par colonne, ligne de total, filtrage par catégorie d'actif (dont « Immobilier & Épargne ») et par compte, édition en ligne, fraîcheur des cours, ajout manuel (avec valeur estimée pour l'immobilier/SCPI/assurance-vie/PER), accès à la fiche détaillée ; carte « Dettes et emprunts » (CRUD, capital restant dû calculé ou recalé manuellement) |
| Fiche détaillée | `/patrimoine/:ticker` (page pleine page) ou modale ouverte depuis le Portefeuille/le Tableau de bord | **Fiche unifiée à trois onglets** (backlog § 2.M.4), commune à toute nature d'actif : **Aperçu** (valorisation, rendements, courbe de cours ou cashflow/historique immobilier/épargne, émetteur/résumé) ; **Analyse** (look-through géo/secteur, détention et part nette) ; **Paramètres** (édition sectionnée — caractéristiques immobilières aujourd'hui, état vide explicite pour les autres natures) |
| Épargne | `/epargne` | (backlog § 2.S.1) Comptes courants/épargne réglementée/épargne salariale/assurance-vie/PER : liste de comptes avec valeur actuelle datée, versement mensuel déclaré (additionné au préremplissage du Simulateur), historique de valorisation à date choisie par l'utilisateur (jamais figée à « maintenant »), petit graphique d'évolution, modification/suppression d'un compte |
| Comptes | `/comptes`, `/comptes/:id` (backlog § X.1) | Vue façon Actual Budget : tous les comptes du foyer (financier, épargne, immobilier, assurance-vie...), groupés par établissement, avec le solde de chacun — **toutes natures d'actif confondues** (remplace l'ancienne carte « Répartition par compte » du Tableau de bord, restreinte au seul portefeuille financier). Fiche détail par compte (modale ou page pleine page) : renommage, rattachement à un établissement, lignes du compte, et **répartition entre détenteurs pour tout le compte en une fois** (cf. § 3.7) |
| Objectifs | `/objectifs` (`/simulateur` redirige) | Deux blocs sur un même écran (backlog § 2.O.1) : **Objectifs suivis**, persistés — nom, montant cible, échéance, actifs rattachés dont la valeur cumulée mesure la progression réelle, trajectoire cible/réelle, diagnostic en langage naturel, rendement requis et contribution mensuelle nécessaire — et **indicateurs de situation** (§ 2.O.2, matelas de sécurité, taux d'endettement, part immobilisée) ; puis le **Simulateur**, calcul à la volée sans rien conserver, préempli avec le patrimoine net actuel et le versement mensuel observé sur le budget (§ 2.N.4) additionné aux versements Épargne déclarés (§ 2.S.1), horizon réglable (5/10/20/30 ans), tableau de détail annuel/mensuel, indépendance financière (FIRE). Tout le Simulateur est calculé côté client hormis les préremplissages |
| Dividendes | `/dividendes` | Calendrier des dividendes perçus, groupés par mois, détail dépliable par mois (date, ligne, montant net) |
| Budget | `/budget` | (backlog § 2.N) Suivi des mouvements bancaires, indépendant du portefeuille boursier : période mensuelle/annuelle/personnalisée, quatre indicateurs (entrées, sorties, disponible, dépenses récurrentes), taux d'épargne réel et reste à vivre quand les catégories Épargne/Logement existent, répartition des sorties par catégorie avec budget cible et écart, filtres catégorie/compte sur la liste des mouvements, charges récurrentes et abonnements détectés (hausse de prix signalée), gestion des catégories et des règles de catégorisation automatique |
| Rapport | `/rapport` | Rapport récapitulatif généré à la demande sur un mois, une année, ou une période personnalisée (sélecteur de mode) : évolution de la valeur du portefeuille, **décomposition « investi » (argent ajouté) vs « généré » (plus-value, dividendes, intérêts)**, dividendes perçus, cinq plus gros mouvements de la période |
| Salaire | `/salaire` (propriétaire seul) | (backlog § 2.R.1) Calculateur brut/net — **plusieurs entrées par année** (un revenu par conjoint, chacune nommée et avec son propre taux d'imposition), montant brut ou net, mensuel ou annuel, cadre ou non-cadre, nombre de versements dans l'année, aperçu instantané côté client avant enregistrement. Chaque entrée affiche son détail brut/net avant-après impôt. **Taux d'épargne du foyer** : agrégat de toutes les entrées d'une année (revenu net total rapporté au montant réellement investi en achats de titres) — historique par année et moyenne, volontairement distinct du rendement de marché (carte Performance) |
| Import | `/import` | Import de l'historique de transactions, d'un relevé de positions, ou de mouvements bancaires (CSV mappé, OFX, QIF — backlog § 2.N.1) pour l'écran Budget |
| Réglages | `/reglages` | Préférences (méthode de calcul du coût de revient, taux d'imposition déclaré), configuration du rafraîchissement automatique des cours (avec suivi de progression), exports CSV, relevé de patrimoine PDF et déclaration de patrimoine paramétrable (backlog § 2.Q.2), gestion des liens de partage (onglet Partage, backlog § 2.Q.1) |
| Partage public | `/partage/:token` | Consultation PUBLIQUE (aucune authentification, backlog § 2.Q.1) d'un lien de partage — sections agrégées choisies par le propriétaire, code optionnel |

Un bouton dans l'en-tête bascule le thème clair/sombre (ou suit le système), sur tous les écrans.

## 3. Règles métier

### 3.1 Reconstruction du portefeuille

Le portefeuille n'est pas saisi manuellement par défaut : il est **entièrement recalculé** à partir du grand livre de transactions importé (`services/portfolio_reconstruction.py`), traité chronologiquement par symbole.

**Convention de données.** Établie par analyse de l'export réel : `amount` est le montant **brut** de l'opération ; `fee` (courtage) et `tax` (impôts/taxes) sont des montants **séparés et algébriques** — négatifs quand ce sont des charges, positifs dans le cas, réel et observé, d'un remboursement (ex. une ligne de régularisation fiscale `TAX_OPTIMIZATION` avec `tax` positif). Tous les flux nets se calculent donc par une simple somme `amount + fee + tax`, jamais par une valeur absolue qui transformerait un remboursement en charge. Cette normalisation est faite une seule fois, au parsing (`services/transaction_import.py`) ; tous les services qui consomment `Transaction` travaillent ensuite sur cette convention garantie.

**Deux méthodes de calcul du coût de revient**, réglables depuis l'écran Réglages (défaut : coût moyen pondéré, comportement historique inchangé) :

- **Coût moyen pondéré** : chaque achat augmente quantité et coût de base (coût = `montant + frais + taxes`, algébrique) ; chaque vente retire, du coût de base, la moyenne pondérée de **toute** la position au moment de la vente (`coût moyen × quantité vendue`), et le gain réalisé (`produit net − coût retiré`) est cumulé séparément.
- **FIFO (premier entré, premier sorti)** : chaque achat empile un lot (quantité, coût unitaire) ; une vente consomme ces lots du plus ancien au plus récent, et c'est le coût réel de ces lots-là — pas une moyenne — qui est retiré. Dans les deux cas, le prix de revient moyen affiché d'une position ouverte reste `coût de base restant / quantité restante`.

Changer de méthode depuis les Réglages déclenche une reconstruction immédiate de tout le portefeuille (nouveaux prix de revient, nouveaux gains réalisés) : ce n'est pas un simple filtre d'affichage.

**Investissement en fonds non coté** (`CASH/PRIVATE_MARKET_BUY`, Private Equity) : traité comme 1 part = 1 € **brut** investi, faute de cotation, mais les frais et taxes de l'opération alourdissent malgré tout le coût de base — exactement comme pour un achat en bourse — sans faire varier le nombre de parts. C'est le seul flux qui, avant correction, n'était comptabilisé nulle part dans le coût de revient.

**Opérations sur titres** (splits, actions gratuites, migrations, fusions, `WORTHLESS`...) : ajustent uniquement la quantité, à coût nul (ces mouvements s'équilibrent historiquement à ~0 par titre chez ce type de courtier). En FIFO, une quantité ajoutée par ce type d'opération crée un lot à coût unitaire nul, pour qu'une vente ultérieure de ces titres n'y retire aucun coût.

**Dividendes** (`CASH/DIVIDEND`) : le champ quantité de ces lignes est une information de référence (nombre de titres détenus à la date de détachement), jamais additionné à la position.

**Garde-fou de reconstruction — vente sans achat correspondant.** Le coût de base n'est jamais retiré au-delà de ce qu'il contient (une vente portant sur plus de titres que détenu ne peut pas le faire passer en négatif). La **quantité**, en revanche, n'est volontairement **pas** bornée à zéro en cours de traitement : chez ce type de courtier, la vente d'un titre offert est parfois horodatée avant la ligne d'acquisition correspondante (cas réel constaté : titre offert, vendu le même jour avant que l'achat ne soit enregistré quelques minutes plus tard). Borner la quantité dès la vente ferait alors apparaître une anomalie fantôme sur une position parfaitement cohérente une fois le grand livre rejoué en entier. L'anomalie n'est donc jugée qu'**en fin de traitement** : si la quantité reste négative une fois tout le grand livre rejoué, c'est le signe d'un grand livre réellement incomplet (vente sans achat, jamais compensée) — la position correspondante n'est pas affichée dans le portefeuille reconstruit, et l'anomalie est journalisée et comptée dans le résultat de l'import.

Une position dont la quantité retombe à ~0 (ou reste négative en fin de traitement) disparaît du portefeuille reconstruit — pas de ligne à quantité nulle ou négative affichée.

**Arbitrage saisie manuelle / reconstruction (origine d'une ligne).** Chaque ligne du portefeuille porte une origine, `manuel` ou `reconstruit` (`Holding.origine`). Une ligne saisie à la main (formulaire, ou relevé de positions importé) survit à un nouvel import de transactions, **sauf** si le grand livre reconstruit une position sur le même ticker : dans ce cas le grand livre fait foi, la ligne manuelle est supprimée (elle ferait doublon dans tous les calculs) et l'événement est compté et affiché à l'utilisateur. Symétriquement, un import de transactions ne touche jamais aux lignes manuelles d'un autre ticker, et « Remplacer le portefeuille existant » à l'import d'un relevé de positions ne vide que les lignes gérées manuellement, jamais celles issues du grand livre.

### 3.2 Exclusion des mouvements hors bourse

Seule l'activité **boursière** est suivie. Sont exclus dès le parsing de l'import (jamais stockés en base) :

- les mouvements de carte bancaire (`CARD_TRANSACTION`, `CARD_TRANSACTION_INTERNATIONAL`, `CARD_ORDERING_FEE`, ou toute ligne portant un `mcc_code`) ;
- les virements avec la banque : dépôts/retraits sur le compte courant (`TRANSFER_IN/OUT`, `TRANSFER_INBOUND`, `TRANSFER_INSTANT_INBOUND`, `CUSTOMER_INBOUND`, `CUSTOMER_INPAYMENT`, `CUSTOMER_OUTBOUND_REQUEST`).

Conséquence : l'application ne calcule ni « solde de cash », ni « net investi » au sens bancaire — uniquement un « coût total investi » basé sur les achats de titres et les investissements en fonds non cotés.

### 3.3 Taxonomie des catégories d'actifs

Chaque position a un `type_actif` (issu de `asset_class` dans le grand livre, ou saisi explicitement pour une ligne manuelle) : `STOCK` (action), `FUND` (ETF/fonds), `CRYPTO`, `BOND` (obligation), `PRIVATE_FUND` (private equity), ou `null` (saisie manuelle sans type précisé). L'écran Portefeuille filtre sur : Tous / Actions / ETF / Crypto / Autres (regroupe obligations, private equity et non renseigné).

### 3.4 Look-through géographique et sectoriel des fonds

Un ETF n'a pas de pays/secteur unique. Sa contribution à la répartition du portefeuille est éclatée selon sa composition interne (`FundComposition`, recalculée à chaque rafraîchissement — jamais figée), avec une hiérarchie de quatre sources de donnée, de la plus fiable à la moins disponible :

1. **Composition réelle via justETF** (`source = justetf`, cf. 2.4) : répartition pays et secteurs réelle, publiée sur la fiche ETF de justETF.com (~4-5 plus grosses lignes + un résiduel « Other »), récupérée par un job planifié dédié (`justetf_refresh`, hebdomadaire par défaut). Prioritaire sur les deux sources suivantes quand disponible — le rafraîchissement des cours ne la recalcule ni ne l'écrase, cadences différentes obligent (cf. § 7 Manuel d'exploitation). Fonctionne pour la majorité des ETF à réplication physique ; échoue pour les ETF à réplication synthétique (swap, sans composition physique à publier) et les ETC (or, matières premières) — vérifié sur les 26 ETF du portefeuille réel : 21 couverts, 5 non couverts, tous légitimement (absence d'onglet composition sur leur fiche justETF, pas un défaut d'extraction).
2. **Composition réelle via Yahoo Finance** (`source = composition`) : n'entre en jeu que pour un fonds non couvert par justETF. Secteur, couverture quasi complète (`funds_data.sector_weightings`) ; géographie, résolue individuellement pour chacune des ~10 plus grosses lignes du fonds (`funds_data.top_holdings`), puis extrapolée à 100 % du fonds — une approximation, mais fondée sur la composition réelle.
3. **Repli par indice** (`source = indice`, géographique uniquement) : quand ni justETF ni Yahoo Finance ne fournissent de composition — la répartition géographique est déduite du **nom de l'indice suivi par le fonds** (ex. « MSCI World », « S&P 500 », « Emerging Markets », « Euro Stoxx »...), via une table de correspondance nom → répartition de référence (`services/reference_indices.py`). Ce sont des ordres de grandeur approximatifs, arrondis, à revoir périodiquement — la pondération pays des indices larges dérive lentement dans le temps.
4. **Non catégorisé** : aucune des trois sources ci-dessus n'a abouti.

**Un fonds n'est jamais classé sur son pays de domiciliation.** Le pays renvoyé par le fournisseur de données pour un ETF est celui de sa domiciliation légale (Irlande, Luxembourg pour la quasi-totalité des ETF européens), pas celui de ses actifs sous-jacents : le retenir classerait par exemple un ETF S&P 500 domicilié en Irlande en « Europe », une erreur bien pire qu'une absence de donnée. Faute de composition réelle et de repli par indice, un fonds reste donc explicitement **« Non catégorisé »** géographiquement — jamais rattaché à son propre pays.

**Deux fourre-tout distincts.** « Non catégorisé » (donnée manquante : pays/secteur inconnu, ou fonds sans composition ni indice reconnu) est distinct d'« Autres zones »/« Autres secteurs » (une zone ou un secteur réel, connu, mais résiduel — hors des catégories habituelles). Confondre les deux masquerait la différence entre « je ne sais pas » et « je sais, et c'est une catégorie mineure ».

**Qualité des données exposée.** L'API (`GET /api/analysis`, champ `qualite_donnees`) et l'interface (encart « Qualité des données » du Tableau de bord) qualifient, en euros et en pourcentage de la valeur totale du portefeuille, l'origine de la répartition géographique affichée : part en composition réelle, part estimée par indice, part non catégorisée, part valorisée à son coût de revient faute de cotation. Sans cette information, la répartition géographique affichée sur le tableau de bord laisserait croire à une précision qu'elle n'a pas.

**Poids sectoriels normalisés.** Les poids géo et sectoriels d'un fonds sont renormalisés pour sommer exactement à 1,0 (Yahoo Finance renvoie parfois une somme légèrement différente, ex. 1,0001) — cohérence nécessaire pour que la somme des catégories affichées corresponde toujours à 100 % de la ligne.

**Répartition détaillée (brute), en complément du zonage.** Les 6 zones géographiques et catégories
sectorielles ci-dessus restent la seule base des graphiques et des objectifs du portefeuille — un
zonage volontairement large (ex. l'Inde et la Chine sont toutes deux « Marchés émergents »). Sur la
fiche détaillée d'une position couverte par justETF, une section supplémentaire (« Répartition
géographique/sectorielle détaillée ») affiche les intitulés **tels que justETF les publie** (ex.
« India » plutôt que « Marchés émergents », « Non-Energy Materials » plutôt que « Matériaux »),
stockés séparément dans `FundCompositionBrute` — une table d'affichage seul, jamais utilisée dans un
calcul agrégé. Absente pour toute position non couverte par justETF.

**Deux taxonomies sectorielles justETF cohabitent.** Le libellé d'un secteur diffère selon les fonds
(ex. « Consumer Cyclicals » vs « Consumer Discretionary » pour la même réalité) — `JUSTETF_SECTOR_LABELS`
(`services/reference_indices.py`) reconnaît les deux variantes observées sur le portefeuille réel et
les fait converger vers le même libellé français. Un libellé non reconnu (rare, ex. « Business
Services », vu une fois à un poids négligeable) bascule sur « Autres secteurs » plutôt que de faire
échouer l'extraction.

**Résumé descriptif d'un fonds.** Pour une action, le résumé de la fiche détaillée vient de Yahoo
Finance (`longBusinessSummary`, récupéré à la demande). Pour un fonds, il vient de la description
publiée sur sa fiche justETF (`MarketDataCache.description`, alimentée par `justetf_refresh`) —
disponible même pour un fonds sans composition couverte (réplication synthétique, ETC) : la
description est extraite indépendamment de la composition, les deux axes n'ayant aucune raison
technique d'échouer ensemble sur la même fiche justETF. **Récupérée depuis la page justETF en
français** (`/fr/etf-profile.html`, cf. 2.5), pour correspondre au texte que l'utilisateur voit
réellement sur le site — la géo/secteur zone-mappée ci-dessus continue, elle, de venir de la page
anglaise (`/en/...`), dont la taxonomie de libellés (`JUSTETF_SECTOR_LABELS`, correspondance
pays → zone) a été auditée sur le portefeuille réel et ne doit pas changer de langue source.

**Composition nominative d'un fonds (« 10 plus grosses lignes »).** Affichée sur la fiche détaillée
(graphique + tableau), alimentée soit par justETF (`fund_top_holdings`, pour un fonds couvert par
2.4 — nom et poids exacts publiés par justETF, sans pays/secteur par ligne : cette information n'est
disponible qu'agrégée via `fund_composition`/`fund_composition_brute`), soit en repli par Yahoo
Finance (`funds_data.top_holdings`, pour un fonds non couvert par justETF — ticker, nom, poids,
pays et secteur par ligne). Les poids ne sont **jamais renormalisés** : la somme du top 10 est
légitimement inférieure à 100 % du fonds.

### 3.5 Rentabilité

**Rendement depuis achat** (par ligne) : `prix actuel / prix de revient moyen − 1`, disponible dès qu'un prix de revient et un prix actuel existent (y compris pour les lignes saisies manuellement).

**Rendement annualisé** (par ligne et pour le portefeuille) : XIRR (money-weighted), calculé par bissection sur les flux de trésorerie réels (achats en négatif, ventes en positif, valeur actuelle en positif à la date du jour). `None` (affiché « — ») dans plusieurs cas, choisis pour ne jamais afficher un pourcentage trompeur : pas d'historique de transactions pour la ligne (pas de date d'achat connue) ; ligne sans prix de marché réel (évite un XIRR calculé sur une valorisation au coût, qui afficherait un 0 % artificiel) ; durée de détention inférieure à **90 jours** (annualiser quelques jours de détention produit un pourcentage à quatre chiffres mathématiquement exact mais sans signification) ; bissection qui ne converge pas dans une tolérance relative à la taille des flux (200 itérations) ; taux trouvé dont la valeur absolue dépasse **1 000 %/an** (résultat non fiable ou aberrant, mieux vaut « — » qu'un chiffre extravagant).

**Gain/perte total** (portefeuille) = gains latents + gains réalisés + dividendes perçus (nets) + intérêts perçus (nets) + autres revenus. **Les frais et les impôts ne figurent plus dans cette formule** : ils sont déjà intégrés en amont — frais et taxes d'achat dans le coût de revient (donc déjà déduits des gains latents), frais de vente dans le produit de cession (donc déjà déduits des gains réalisés), impôts sur dividendes et intérêts déjà retirés du montant net crédité par le courtier. Les resoustraire une seconde fois créait un double comptage. `frais_payes` et `impots_preleves` restent calculés et **affichés à titre informatif** sur la carte Rentabilité, mais hors de la formule de résultat.

**Autres revenus.** Le grand livre contient des flux d'espèces boursiers en dehors des dividendes et intérêts (cashback/parrainage du courtier, action offerte, bonus, opération promotionnelle, régularisation fiscale...). Ils sont intégrés au résultat via une **liste explicite et fermée** de types de mouvements reconnus (`BENEFITS_SAVEBACK`, `STOCKPERK`, `BONUS`, `PEA_MARKETING`, `GIFT`, `TAX_OPTIMIZATION`) — jamais un `else` fourre-tout, qui capterait tôt ou tard un mouvement non boursier (dépense carte, virement bancaire) et fausserait le résultat sans qu'on s'en rende compte. Un type de mouvement non reconnu reste invisible du calcul plutôt que d'y entrer silencieusement.

**Dividendes et intérêts nets.** Puisque `amount` est le montant brut et que la taxe est une ligne séparée et algébrique, `dividendes_percus`/`interets_percus` (calculés par `amount + fee + tax`) sont, par construction, des montants **nets** d'impôt — cohérent avec le libellé affiché à l'écran (« Dividendes perçus (net) », « Intérêts perçus (net) »).

#### 3.5.1 Métriques de performance avancées (backlog § 2.P.2)

Calculées à partir de la série hebdomadaire déjà produite par
`historical_performance_service.compute_portfolio_history` (celle du graphique d'évolution) —
`services/metriques_performance_service.py`, aucun nouvel appel `yfinance`.

- **TWR** (time-weighted return, `GET /api/performance/metriques-avancees`) : chaque semaine de la
  grille est traitée comme une sous-période — le flux net investi pendant cette semaine (variation de
  `valeur_investie`, cumulative) est retranché de la valeur de fin avant de calculer le rendement de
  cette sous-période, neutralisant l'effet du TIMING des versements. Cumulé (produit géométrique des
  sous-périodes) et annualisé (`(1+cumulé)^(52/n) − 1`) — **`None` si `1+cumulé <= 0`** (cumul à -100 %
  ou pire) : élever une base négative à une puissance fractionnaire renvoie un nombre complexe en
  Python plutôt qu'une erreur, et annualiser une perte totale n'a de toute façon aucun sens dans les
  réels ; le cumulé lui-même reste affiché normalement dans ce cas (bug réel corrigé le 26/08/2026,
  déclenché par un dépôt ponctuel très grand face à la valeur de sa semaine). Approximation assumée :
  un versement en milieu de semaine n'est isolé qu'à la semaine près, même limite de précision que le
  graphique d'évolution. Distinct du MWR déjà exposé (`performance_service`, XIRR) : le MWR juge la
  décision de versement, le TWR juge le support.
- **Volatilité annualisée** : écart-type des rendements hebdomadaires TWR, annualisé par `√52`.
- **Max drawdown et récupération** : plus forte baisse entre un pic et un creux ultérieur sur la
  série de `valeur_portefeuille` ; `semaines_recuperation` mesurée depuis CE creux (pas depuis le pic
  d'origine) jusqu'au premier retour à son niveau — `None`/non récupéré si toujours en dessous.
- **Comparaison à un indice de référence** (`GET /api/performance/benchmarks`,
  `GET /api/performance/comparaison-benchmark?benchmark=...`) : liste fermée de 4 indices (MSCI World
  via le ticker `URTH`, S&P 500, CAC 40, STOXX Europe 600) — jamais un ticker arbitraire saisi par
  l'utilisateur. Historique complet de l'indice mis en cache globalement
  (`historique_cache.cle_historique_benchmark`, comme l'historique d'une ligne — une donnée de marché
  publique, partagée entre tous les foyers). Les deux séries sont normalisées en pourcentage depuis
  leur valeur au premier point commun.

#### 3.5.2 Revenus passifs projetés (backlog § 2.P.3, absorbe § 2.C.2)

`GET /api/performance/revenus-passifs` (`services/revenus_passifs_service.py`) — rendement courant
du patrimoine et projection à 12 mois, **distinguant ce qui est certain de ce qui est estimé** plutôt
que d'abandonner la projection à cause de sa partie la moins fiable (le blocage originel de C.2 :
`dividendRate` de `yfinance`, peu fiable pour les ETF). Aucun appel `yfinance`.

- **Certain** : loyers nets annuels (`HoldingImmobilierDetail.loyer_mensuel × 12 − charges annuelles
  − frais annuels` — sans retrancher la mensualité d'un emprunt rattaché : un revenu locatif, pas un
  cashflow après emprunt, contrairement à `cashflow_mensuel` de la fiche immobilier, § 3.11) et
  intérêts de livrets (`Holding.taux_pct × valeur_estimee` pour `REGULATED_SAVINGS`/`EMPLOYEE_SAVINGS`
  — même champ informatif que § 3.11/M.1).
- **Estimé** : dividendes et intérêts de courtage RÉELLEMENT perçus sur les 12 derniers mois glissants
  (requête directe sur `Transaction`), extrapolés tels quels sur les 12 prochains — jamais un taux
  théorique par titre, toujours une observation directe du grand livre de ce portefeuille.
- Réponse : détail des 4 composantes, `revenu_certain_annuel`, `revenu_estime_annuel`,
  `revenu_total_projete_annuel`/`_mensuel`.

### 3.7 Comptes, établissements et quotités par compte (backlog § X.1)

**Modèle structurel.** Contrairement à l'ancienne annotation en texte libre, le compte est désormais une vraie table (`Compte`), tout comme l'établissement qui le contient (`Etablissement`, ex. « Caisse d'Épargne », « Boursorama »). Chaque ligne du portefeuille (`Holding`, toute nature d'actif — financier, immobilier, assurance-vie, épargne...) peut être rattachée à un compte via `Holding.compte_id`, nullable (bucket « Sans compte », permanent, pas une phase transitoire). Un compte peut exister sans établissement (« Sans établissement » à l'écran Comptes). La suppression d'un établissement ou d'un compte ne supprime jamais en cascade ce qu'il contenait : les comptes orphelins retombent à `etablissement_id = NULL`, les lignes orphelines à `compte_id = NULL`.

Le compte se saisit toujours aussi librement qu'avant (sélection d'un compte existant, ou création à la volée par son nom) depuis le formulaire d'ajout, l'édition en ligne, ou l'import CSV — la création à la volée résout ou crée le compte correspondant (`comptes_service.get_or_create_compte`), sans étape manuelle supplémentaire côté écran Comptes.

**Écran Comptes** (`/comptes`, `/comptes/:id`) : vue façon Actual Budget, tous les comptes du foyer groupés par établissement, avec le solde de chacun — **toutes natures d'actif confondues** (`comptes_service.solde_par_compte`), contrairement à l'ancienne répartition par compte du Tableau de bord (retirée), restreinte au seul portefeuille financier.

**Répartition entre détenteurs au niveau du compte.** Les quotités par détenteur (`QuotiteHolding`, cf. § 3.11 pour le patrimoine net par détenteur) existaient déjà ligne par ligne, y compris pour un actif manuel. Le nouvel écran Comptes permet de les définir **une seule fois pour tout un compte** plutôt que ligne par ligne (utile en particulier pour un compte multi-lignes, ex. un CTO avec plusieurs titres) : `comptes_service.set_quotites_compte` applique la même répartition à chaque ligne actuellement rattachée au compte, en rappelant simplement `detenteurs_service.set_quotites_holding` pour chacune — même mécanisme de calcul qu'avant, pas de nouvelle table de quotités. Le formulaire est **volontairement vierge par défaut** (pas de pré-remplissage intelligent à partir des lignes existantes) et prévient explicitement que la validation **remplace** la répartition actuellement enregistrée de chaque ligne du compte. La même logique de répartition par détenteur est désormais aussi exposée pour un **emprunt** (`PUT /api/loans/{id}/quotites`, carte Dettes et emprunts), fonctionnalité déjà écrite côté service mais jamais exposée jusqu'ici — et surtout, **la répartition définie pour un compte s'applique aussi à tout emprunt rattaché** à l'une de ses lignes (`Loan.holding_id`, backlog § X.4) : demande explicite de l'utilisateur (« pareil pour un compte courant, un compte titre, un immobilier, une dette »), la fiche du compte liste ces emprunts dans une carte « Emprunts rattachés » avant le formulaire de répartition, pour que le remplacement ne surprenne jamais.

La fiche détaillée d'une position (§ 3.M.4 implicite) affiche désormais le compte rattaché en badge, à côté du type d'actif — lien direct vers la fiche du compte quand elle existe, rien si la ligne n'est rattachée à aucun compte.

**Rentabilité par compte non calculable.** Le grand livre de transactions importé (format Trade Republic) ne porte **aucune information de compte** : rien ne permet de savoir quelles transactions appartiennent à quel compte. Le rattachement à un compte reste donc une annotation portée par la ligne du portefeuille, jamais déduite des transactions elles-mêmes — seule la valeur actuelle par compte est calculable, jamais une rentabilité (XIRR, gains réalisés) par compte. Ce n'est pas un chantier reporté, c'est une absence structurelle de la donnée source.

Le rattachement à un compte est préservé à travers un nouvel import de transactions : `rebuild_holdings` reporte le `compte_id` déjà affecté à une ligne existante vers la ligne recalculée du même ticker, pour ne pas perdre l'information entre deux imports.

### 3.8 Export

Trois exports CSV indépendants, disponibles depuis l'écran Réglages, au format compatible Excel en locale française (séparateur `;`, décimale `,`, encodage UTF-8 avec BOM) :

- **Positions** : une ligne par position du portefeuille (ticker, nom, type, compte, origine, quantité, prix de revient, prix actuel, valeur, rendements, secteur, pays, fraîcheur du cours) ;
- **Transactions** : une ligne par écriture du grand livre ;
- **Rentabilité** : la synthèse de la carte Rentabilité, un indicateur par ligne.

Trois granularités différentes plutôt qu'un fichier unique : les mélanger obligerait à aplatir artificiellement des données qui n'ont pas le même niveau de détail.

**Relevé de patrimoine PDF** (`GET /api/export/patrimoine.pdf`, roadmap Phase 3) : photographie mise en forme (reportlab), au format A4 — patrimoine net (actifs/passifs/net), répartition par classe d'actif, rentabilité globale (si des transactions existent), répartition par compte (si au moins une ligne est annotée). Ne recalcule rien : réutilise telles quelles `patrimoine_service.compute_patrimoine_net`, `performance_service.compute_performance` et `analysis_service.{holdings_financiers, value_holdings, repartition_par_compte}` — c'est une couche de mise en forme, pas une nouvelle source de vérité.

### 3.9 Rafraîchissement des données de marché

Deux tâches planifiées indépendantes (APScheduler), chacune configurable (activation, intervalle) depuis l'écran Réglages :

- **`market_data_refresh`** : prix de toutes les positions, composition rapide et lignes sous-jacentes des fonds non couverts par justETF. **Depuis le 19/08/2026 (2.4), le cours de référence d'un ETF vient de l'API JSON de justETF** (`justetf_service.fetch_price`), pas de Yahoo Finance — décision explicite pour fiabiliser le prix des ETF ; en cas d'échec justETF, la position affiche « Cotation indisponible (justETF) », **sans repli sur Yahoo Finance** (choix délibéré, pour ne jamais mélanger deux sources de prix sur une même ligne). Les actions/crypto restent intégralement sur Yahoo Finance, sans changement. Intervalle par défaut 24h. Déclenchement manuel possible à tout moment, depuis le Portefeuille ou les Réglages ; s'exécute **en tâche de fond**, sans bloquer l'interface — sa progression (« x / y positions ») est consultable pendant qu'il tourne, et l'écran se recharge automatiquement une fois terminé. Deux garde-fous de débit indépendants (un par ressource externe sollicitée) limitent la fréquence des appels : une temporisation entre deux positions traitées au sein d'un même rafraîchissement (Yahoo Finance et, séparément, justETF), et un délai minimal entre deux déclenchements manuels.
- **`justetf_refresh`** (2.4) : look-through géo/secteur complet via justETF, cadence bien plus lente par défaut (une semaine) — la composition d'un fonds évolue lentement, et justETF n'offre aucun support en cas de blocage. Ne recalcule jamais la composition d'un ticker déjà couvert par `market_data_refresh` pour un même ticker sans raison : c'est l'inverse — une fois qu'un ticker a une composition justETF en base, `market_data_refresh` cesse de la recalculer pour lui (cadences différentes, la donnée la plus riche ne doit pas être écrasée par la moins riche). Déclenchement manuel synchrone (la requête HTTP attend la fin, contrairement à `market_data_refresh`) : le nombre de fonds à traiter reste faible et déjà throttlé, ce qui garde ce choix simple.

Les historiques de prix (série d'une ligne pour la fiche détaillée, historique de valeur du portefeuille pour le Tableau de bord), coûteux à recalculer, sont mis en cache **24 heures** — cohérent avec la fréquence hebdomadaire des séries elles-mêmes. Le cache est invalidé automatiquement après un rafraîchissement des cours ou une reconstruction du portefeuille, pour ne jamais afficher un historique devenu incohérent avec les valeurs affichées à côté.

**Frais de gestion (TER) des fonds** (`MarketDataCache.frais_gestion_pct`, roadmap Phase 3, § E.3) : contrairement au prix, mis en cache **une seule fois par ticker**, jamais recalculé ensuite — `market_data_refresh` n'appelle `fetch_frais_gestion` (Yahoo Finance) que tant que cette colonne vaut `None` pour le ticker concerné. Ce choix évite de ralentir chaque rafraîchissement de prix par un appel réseau supplémentaire par fonds ; la contrepartie assumée est que la couverture (part de la valeur des fonds pour laquelle un TER est connu, affichée sur le Tableau de bord) démarre à 0 % et augmente progressivement au fil des rafraîchissements, jamais instantanément.

### 3.10 Validation des saisies et robustesse des imports

Les créations/modifications de position et la configuration des tâches planifiées sont validées (quantité strictement positive, prix non négatif, pourcentages entre 0 et 100, intervalle de planification borné...) ; toute violation renvoie une erreur **400** avec un message en français, plutôt qu'une erreur générique ou un plantage silencieux.

L'import d'un relevé de positions est **transactionnel** : une erreur en cours d'import déclenche un rollback explicite, le portefeuille n'est jamais laissé dans un état partiellement vidé. Les colonnes choisies lors du mapping sont vérifiées comme existant réellement dans le fichier avant l'import, pour ne pas produire un import silencieusement vide en cas d'erreur de mapping. Les fichiers importés sont plafonnés en taille (25 Mo) pour éviter d'épuiser la mémoire du process sur un fichier anormalement volumineux.

### 3.11 Patrimoine net global (roadmap Phase 1)

Neuf `type_actif` valorisés **manuellement** (`REAL_ESTATE`, `SCPI`, `LIFE_INSURANCE`, `PENSION`, `CASH_ACCOUNT` (compte courant), `REGULATED_SAVINGS` (Livret A, LDDS, LEP, PEL, CEL...), `EMPLOYEE_SAVINGS` (PEE, PERCO, PER entreprise), `VEHICLE`, et `OTHER_ASSET` pour tout ce qui ne rentre dans aucune autre case — objets de valeur, métaux précieux physiques, parts d'entreprise non cotée hors Private Equity déjà suivi — cf. backlog § 2.M.1) : aucune tentative de cotation automatique n'a de sens pour eux (un bien immobilier n'a pas de ticker coté). Leur valeur vient de `Holding.valeur_estimee` (montant absolu en euros, saisi et mis à jour manuellement — `quantite` reste conventionnellement à 1), distincte de `prix_revient_moyen` qui garde son sens habituel de coût d'acquisition : le rendement depuis achat de ces lignes se calcule donc normalement (`valeur_estimee / prix_revient_moyen − 1`), sans XIRR possible faute d'historique de transactions.

**`Holding.date_acquisition`** (backlog § 2.S.3, retour utilisateur 26/08/2026) : date d'acquisition
du bien (achat de l'appartement, souscription du contrat...) déclarée par l'utilisateur — distincte
de `created_at` (date de saisie de la ligne dans l'application, souvent bien après l'achat réel) et
de `date_valeur_estimee` (date de la dernière estimation). `None` par défaut, jamais déduite ni
calculée. Éditable sur l'écran Patrimoine (`/patrimoine`, formulaire d'ajout et édition en ligne du
tableau), affichée uniquement pour les 9 types valorisés manuellement ci-dessus (même gating que
`zone_geo`, `TYPES_PATRIMOINE` côté frontend) — sans objet pour une ligne financière reconstruite,
qui a déjà ses propres dates de transaction.

**Utilisée dans les calculs de rentabilité et les graphiques** (même jour, retour utilisateur) :
- `performance_service._rendement_pour_ligne` : sans aucun grand livre de transactions pour ces
  lignes, `rendement_annualise_pct` restait toujours `None`. Avec `date_acquisition` renseignée, un
  flux à un seul mouvement (`[(date_acquisition, -prix_revient_moyen), (maintenant, valeur_estimee)]`)
  passé à `xirr()` se réduit exactement à un CAGR — mêmes garde-fous que le portefeuille financier
  (durée minimale 90 jours, plafond 1000 %, § 3.5).
- `patrimoine_history_service._serie_holding_manuel` (§ 3.11 courbe combinée, § 2.S.2) : si
  `date_acquisition` est antérieure au premier point d'historique connu, un point de départ à
  `prix_revient_moyen` y est inséré, plutôt que de démarrer artificiellement tard (`created_at`).
- `ValorisationHistoriqueCard` (fiche détaillée, frontend) : même principe, appliqué SEULEMENT au
  graphique — jamais au tableau juste en dessous, qui reste le reflet exact des points réellement
  saisis.

**`Holding.taux_pct`** (backlog § 2.M.1, épargne réglementée/salariale et véhicule) : un pourcentage annuel purement **informatif**, jamais appliqué automatiquement à `valeur_estimee` — positif pour un taux d'intérêt attendu, négatif pour une décote annuelle attendue. Sert uniquement à calculer, côté client, une « valeur projetée dans 1 an » affichée en repère ; l'utilisateur reporte lui-même ce montant dans `valeur_estimee` s'il souhaite l'adopter — même philosophie que la valorisation immobilière datée (jamais de mutation silencieuse d'une donnée financière).

**Premier passif de l'application** : un emprunt (`Loan`) porte un capital initial, un taux annuel, une mensualité, une date de début et une durée. Le capital restant dû est calculé par amortissement standard à taux fixe (`services/loan_service.py`), sauf recalage manuel explicite (`capital_restant_du_manuel`, prioritaire — utile après un remboursement anticipé ou pour recaler sur un relevé bancaire réel, le calcul théorique pouvant dériver du réel avec le temps). Les six autres caractéristiques du prêt restent librement modifiables après création (backlog quickwin § T.1, `PATCH /api/loans/{id}`, déjà supporté par `LoanUpdate`) — en cas d'erreur de saisie ou de renégociation, sans jamais toucher `capital_restant_du_manuel`, qui garde sa sémantique propre de recalage.

**Deux périmètres volontairement distincts.** Le portefeuille FINANCIER (actions, ETF, crypto, obligations, private equity — `analysis_service.holdings_financiers`) reste seul concerné par le look-through géo/sectoriel et la carte Rentabilité boursière (§ 3.2, § 3.4, § 3.5) : y mélanger un bien immobilier n'aurait pas de sens (pas de géographie/secteur boursier, pas de coût de base dans le grand livre de transactions). Le **patrimoine net global** (`GET /api/patrimoine/net`, `services/patrimoine_service.py`) est une vue **additive** : actifs totaux (portefeuille financier + immobilier/SCPI/assurance-vie/PER/autre actif, valorisés par la même règle que `value_holdings`) moins passifs totaux (somme des capitaux restants dus), avec une répartition par grande classe d'actif. Il n'écrase ni ne remplace les écrans existants.

**Fiche immobilier complète** (backlog § 2.M.3) : `HoldingImmobilierDetail` (un par `Holding`, table
séparée — ces champs n'ont de sens que pour `REAL_ESTATE`) porte le bloc location (type, loyer
mensuel, charges mensuelles, frais annuels agrégés — taxe foncière + copropriété + assurance +
gestion, un seul total) et les caractéristiques (surface, pièces, année de construction, DPE),
administré via `PUT /api/portfolio/holdings/{ticker}/immobilier`. `services/immobilier_service.py`
calcule, côté serveur uniquement (jamais recalculé côté client), `cashflow_mensuel = loyer −
charges − frais/12 − mensualité de l'emprunt rattaché` (`Loan.holding_id`, 0 si aucun emprunt
rattaché), `rentabilite_brute_pct = loyer_annuel / prix_revient_moyen × 100`,
`rentabilite_nette_pct = (loyer_annuel − charges_annuelles − frais_annuels) / prix_revient_moyen ×
100`, et `prix_m2 = valeur / surface_m2` — ces trois derniers `None` sans `loyer_mensuel` renseigné
(rien à calculer), `prix_m2` restant calculable seul dès que la surface est connue. Exposés dans
`GET /holdings/{ticker}/detail` (`HoldingDetail.immobilier`, `null` tant qu'aucun détail n'a été
saisi).

**Historique de valorisation** (`HoldingValuationHistory`, table générique — pas réservée à
l'immobilier, même mécanisme que `valeur_estimee` elle-même) : chaque changement RÉEL de
`Holding.valeur_estimee` (création, ou modification qui la change effectivement — jamais un
effacement à `None`, ni une modification d'un autre champ seul) ajoute une ligne datée, sans jamais
écraser la précédente — corrige le défaut relevé chez Finary (§ 1.2) qui présente une plus-value
immobilière comme un fait alors qu'elle vient d'un algorithme non maîtrisé.
`Holding.valeur_estimee`/`date_valeur_estimee` restent la valeur COURANTE (accès rapide, comportement
inchangé partout ailleurs dans l'application) ; `GET /holdings/{ticker}/immobilier-history` expose
l'historique complet, affiché en tableau chronologique sur la fiche détaillée.

**Correction/suppression d'un point** (backlog quickwin § T.3) : `PATCH`/`DELETE
/holdings/{ticker}/immobilier-history/{point_id}` permettent de corriger ou retirer un point déjà
saisi (ex. une valeur tapée par erreur), jusqu'ici impossible — `enregistrer_point_historique`
n'ajoutait qu'en aveugle. Si le point touché est (ou devient) le plus récent de l'historique,
`valeur_estimee`/`date_valeur_estimee` sont resynchronisés sur le nouveau point le plus récent restant
(`None` si l'historique devient vide) — recalculé À CHAQUE fois, contrairement à `PUT .../valorisation`
qui ne resynchronise que si le nouveau point est déjà le plus récent (un rattrapage antidaté ne devant
jamais écraser une valeur plus récente déjà connue).

**Versement déclaré** (backlog § U.2, demande directe 30/08/2026, colonne
`HoldingValuationHistory.versement`, nullable, migration `db31d671e2e4`) : part de la hausse (ou
baisse — valeur négative pour un retrait) depuis le point précédent que le foyer déclare venir d'un
versement plutôt que d'une performance du contrat. Champ optionnel sur `ValorisationInput`, disponible
aussi bien à l'ajout (`PUT .../valorisation`) qu'à la correction d'un point existant (`PATCH
.../immobilier-history/{id}`, § T.3) — jamais rétro-rempli sur l'historique existant, `None` par
défaut. Consommé par le bloc épargne du rapport (§ 3.14) pour remplacer l'estimation via `taux_pct`
par une donnée réelle dès qu'au moins un point de la période le porte.

### 3.12 Simulateur : projection, tableau de détail et indépendance financière

Écran unique (`/simulateur`) fusionnant l'ancien Simulateur (projeté depuis le patrimoine net réel) et l'ancienne page Outils (calculateur générique à capital libre) — les deux ne différaient que par la source du capital de départ, jamais par le calcul lui-même. Le capital de départ est **préempli** avec le patrimoine net actuel (`GET /api/patrimoine/net`, § 3.11 — seul appel réseau de la page) mais reste **librement modifiable**, pour couvrir aussi bien « où en sera mon patrimoine réel » que « et si je plaçais 10 000 € à 6 % ».

Toute la suite (projection, tableau de détail, FIRE) est calculée **entièrement côté client** (`frontend/src/utils/interetsComposes.ts`), intérêts composés **mensuels** + versement mensuel constant — mise à jour instantanée à chaque changement d'hypothèse, sans aller-retour réseau. Ce module a remplacé l'ancien `services/simulation_service.py` (roadmap Phase 2), qui n'acceptait pas de capital de départ personnalisé et ne calculait qu'une trajectoire annuelle sans détail mensuel ; ses formules et scénarios de test ont été repris à l'identique côté client (`interetsComposes.test.ts`) pour garantir un comportement inchangé.

- **Projection** : trajectoire annuelle à horizon réglable (1 à 60 ans, préréglages 5/10/20/30 ans à l'écran) — `rendement_annuel_pct` peut être négatif (scénario pessimiste). Présentée explicitement comme une **hypothèse, pas une promesse** : un rendement moyen constant est une simplification, les marchés ne progressent jamais aussi régulièrement dans la réalité.
- **Intérêts déjà obtenus** (facultatif) : part du capital de départ déjà constituée de gains plutôt que de versements — préempli avec `gain_perte_total` de `GET /api/performance` (plafonné à 0 si négatif, une moins-value n'ayant pas de sens ici), librement modifiable. Ne change rien à la capitalisation elle-même (les intérêts futurs se calculent toujours sur le capital total) : décale seulement la répartition initiale entre `verseCumule` et `interetsCumules` (`capitalInitial − interetsDejaObtenus` / `interetsDejaObtenus`, bornés à `[0, capitalInitial]`), pour que le tableau de détail distingue les intérêts vraiment déjà acquis des futurs plutôt que de repartir arbitrairement de zéro.
- **Tableau de détail** (bascule Annuelle/Mensuelle) : pour chaque période, versements, intérêts gagnés, capital, versé cumulé et intérêts cumulés à date. Convention de capitalisation : l'intérêt d'un mois se calcule sur le capital **avant** le versement de ce mois — un versement ne produit son premier intérêt qu'au mois suivant. La vue annuelle est agrégée depuis la même trajectoire mensuelle que le graphique, jamais recalculée séparément. Chaque période est libellée par sa **date calendaire réelle** (ex. « 2028 » en vue annuelle, « 2027 Mars » — année d'abord — en vue mensuelle, aujourd'hui + le nombre d'années/mois écoulés), pas par un compteur abstrait (« An 3 ») : la ligne de départ (aujourd'hui) reste « Départ ».
- **Indépendance financière / FIRE** : à partir d'une dépense annuelle cible et d'un taux de retrait (4 % par défaut — la « règle des 4 % », un choix méthodologique documenté et non une vérité universelle, présenté comme tel à l'écran), calcule le patrimoine nécessaire (`dépense / taux`) et le délai estimé pour l'atteindre avec les mêmes hypothèses de capital/rendement/versement que la projection ci-dessus (les intérêts déjà obtenus n'y changent rien : seul le capital total compte pour ce calcul). `null` (affiché « non atteinte ») si l'horizon de recherche (60 ans) est dépassé — jamais un nombre d'années au-delà, qui laisserait croire à une précision que le calcul n'a pas sur un horizon aussi lointain.

### 3.13 Calendrier des dividendes perçus (roadmap Phase 3, § C.1)

`GET /api/performance/dividendes` (`performance_service.compute_dividend_calendar`) regroupe les transactions `CASH/DIVIDEND` par mois calendaire (`Transaction.date[:7]`), avec le même flux net algébrique que la carte Rentabilité (`amount + fee + tax`, jamais un `abs()`). Aucune nouvelle donnée récupérée : c'est une vue sur des transactions déjà en base. Ne projette rien vers l'avenir (cf. § 5, C.2 non traité) — uniquement des dividendes déjà perçus.

### 3.14 Rapport récapitulatif (roadmap Phase 4, § D.2 — étendu à l'annuel et aux périodes personnalisées)

`GET /api/performance/rapport?date_debut=AAAA-MM-JJ&date_fin=AAAA-MM-JJ` (`services/rapport_service.compute_rapport_periode`), généré **à la demande** — l'application n'a pas de serveur mail, ce n'est donc jamais poussé automatiquement. Un seul endpoint générique sur une période arbitraire (bornes inclusives), pas une fonction par granularité : l'écran propose trois modes qui ne sont que des raccourcis calculant ces bornes côté client avant d'appeler ce même endpoint — **Mensuel** (1er au dernier jour du mois choisi), **Annuel** (1er janvier au 31 décembre de l'année choisie), **Personnalisé** (deux sélecteurs de date libres, avec validation que la fin ne précède pas le début — **400** sinon, côté serveur comme côté écran avant même d'émettre la requête). Trois éléments pour la période demandée :

- **évolution de la valeur du portefeuille** : dernière valeur connue à/avant le début et la fin de la période, lues dans la série déjà calculée par `historical_performance_service.compute_portfolio_history` (§ 3.9) — si le portefeuille n'existait pas encore au début de la période demandée, repli sur le tout premier point disponible plutôt qu'une case vide ;
- **décomposition investi/généré** (demande directe, 25/08/2026) : `montant_investi_periode` (achats réels sur la période, même fonction `performance_service.montant_investi_periode` que le taux d'épargne § 3.23) et `gain_genere_periode` (plus-value + dividendes + intérêts + produits de vente — jamais confondus avec l'argent ajouté). Même identité algébrique que la réconciliation du graphique d'accueil (§ 3.9, `valeur_portefeuille + valeur_realisee_cumulee - valeur_investie`), appliquée en delta sur la période. **Repli à zéro, pas au premier point** pour cette décomposition uniquement (contrairement au point précédent) : si la période demandée commence avant tout historique connu, la valeur de départ utilisée ici est `0`, jamais la valeur du premier point (qui peut déjà refléter un achat survenu ce jour-là) — sinon cet achat serait compté une seconde fois, en négatif, dans le généré. `gain_genere_periode` est `None` seulement quand `compute_portfolio_history` ne renvoie strictement aucun point (jamais aucune position) ;
- **dividendes perçus** sur la période seule (même calcul que § 3.13, restreint à l'intervalle) ;
- **cinq plus gros mouvements** de la période, triés par montant absolu (achats, ventes, dividendes, tout type de transaction confondu).

Aucun nouveau calcul de fond : uniquement une agrégation par mois de données déjà exposées ailleurs.

**Bloc épargne** (backlog § U.1, demande directe 30/08/2026, champ `epargne` de la même réponse) :
contrairement aux points ci-dessus, entièrement dérivé des lignes `TYPES_EPARGNE` (livrets, PEE/PERCO,
assurance-vie, PER, comptes courants), jamais du grand livre de transactions boursières —
`rapport_service.compute_rapport_epargne_periode`. Réutilise `patrimoine_history_service.
_serie_holding_manuel` (même bloc de construction que la courbe combinée du Tableau de bord, § 3.16)
pour évaluer chaque ligne aux deux bornes de la période plutôt qu'en série complète : valeur/évolution
de l'épargne, répartition par type en fin de période. `interets_periode`/`versements_periode` (backlog
§ U.2) suivent deux régimes possibles, signalés par `decomposition_estimee` :
- **`True` (par défaut)** : ESTIMATION — étend `revenus_passifs_service._interets_livrets_annuels`
  (`valeur_estimee * taux_pct / 100`, jusqu'ici fixée à 12 mois glissants) en la proratisant sur le
  nombre de jours exact de la période ; `versements_periode` est alors le résidu (évolution totale
  moins ces intérêts estimés).
- **`False`** : dès qu'au moins un point de `HoldingValuationHistory` de la période porte un
  `versement` RÉELLEMENT DÉCLARÉ par le foyer (§ 3.11), `versements_periode` devient la somme de ces
  montants (une donnée réelle, pas une estimation) et `interets_periode` le résidu de l'évolution.
  Limite assumée : un versement non déclaré sur un AUTRE point de la même période serait alors compté
  à tort comme du gain.

Les deux régimes sont explicitement étiquetés côté écran (« estimés » vs « déclarés »). `a_des_donnees
=false` (bloc masqué côté écran) si le foyer n'a aucune ligne `TYPES_EPARGNE`.

### 3.15 Application installable (PWA, roadmap Phase 3, § H.1)

Le frontend est installable comme une application (icône, plein écran) via un manifeste web et un service worker générés par `vite-plugin-pwa` (Workbox) au moment du build — jamais écrits à la main, pour éviter le piège classique d'un service worker maison qui sert indéfiniment une version périmée. L'API (`/api/*`) est explicitement exclue du cache du service worker (`navigateFallbackDenylist`) : les données financières affichées viennent toujours du backend en direct, jamais d'une réponse mise en cache hors-ligne — seuls les fichiers statiques du build (JS, CSS, icônes) bénéficient du cache.

Au-delà du graphique, un **tableau de détail** (bascule Annuelle/Mensuelle) liste, pour chaque période, les versements de la période, les intérêts gagnés sur la période, le capital de fin de période, le versé cumulé et les intérêts cumulés à date. La vue annuelle et la vue mensuelle partagent la même trajectoire mensuelle sous-jacente (`calculerTrajectoireMensuelle`, agrégée par année via `agregerParAnnee` pour la vue annuelle) : les deux vues, ainsi que le graphique et `calculerTrajectoire` lui-même, ne peuvent donc jamais diverger entre elles. Convention de capitalisation : l'intérêt d'un mois se calcule sur le capital **avant** le versement de ce mois — un versement ne produit son premier intérêt qu'au mois suivant.

### 3.16 Hiérarchie de lecture du tableau de bord (backlog § 2.K.6)

Trois temps : **le chiffre** (`PatrimoineNetCard`, patrimoine net en très grand — jeton `text-display`
du système de design, § 2.K.1 — avec la répartition actifs/passifs juste en dessous, puis un camembert
« Par type d'investissement » ET la liste détaillée des montants exacts, l'un n'ayant jamais remplacé
l'autre (retour utilisateur), sur la répartition par classe pertinente pour la lentille active (§ ci-
dessous) dès qu'elle n'est pas vide — pourcentages du camembert toujours affichés, contrairement aux
montants en euros qui respectent le masquage), **la
courbe** (`PortfolioHistoryChart`, évolution du portefeuille financier), **le détail** (tout le reste :
indicateurs de risque, répartitions géo/sectorielles réelles, qualité des données, exposition
consolidée tous actifs — § 3.20, coût de gestion) regroupé dans un composant
repliable générique (`Disclosure.tsx`, natif `<details>`-like, état persisté dans `localStorage`),
ouvert par défaut. Le bandeau d'accueil (aucune position) reste hors du repliable : c'est un appel à
l'action, pas de la simple information complémentaire.

**Variation, phrase en langage naturel et courbe pilotées par la lentille Net/Brut/Financier**
(backlog § 2.S.2) : la courbe (`PortfolioHistoryChart`), le camembert/liste et la variation
(`{signe}{pct}% {libellé période}`, ex. « +10,0 % depuis le début du suivi ») suivent désormais le
sélecteur Net/Brut/Financier (§ 2.K.3), et non plus systématiquement le seul portefeuille financier.
En lentille **Financier**, comportement historique inchangé : série `GET /api/performance/history`
(`compute_portfolio_history`), légende « portefeuille suivi, hors immobilier/épargne/dettes ». En
lentille **Brut**/**Net**, la source devient `GET /api/patrimoine/historique`
(`patrimoine_history_service.compute_patrimoine_history`) — une série combinée qui fusionne, sur une
grille hebdomadaire commune : la série financière déjà existante, un historique daté par ligne
valorisée manuellement (`HoldingValuationHistory`), et l'amortissement théorique de chaque emprunt par
date. Entre deux points connus d'une ligne manuelle, deux régimes coexistent selon `type_actif`
(`_valeur_ligne_a_date`) : immobilier/SCPI/autre actif/véhicule restent en ESCALIER (dernier point
connu reporté — choix assumé, une fausse continuité serait moins honnête qu'un palier) ; les lignes
`TYPES_EPARGNE` sont INTERPOLÉES LINÉAIREMENT (`_valeur_interpolee`, backlog § U.2, demande directe
30/08/2026) entre les deux points qui encadrent chaque date de la grille — toujours plaquées au
dernier point connu au-delà (aucune extrapolation dans le futur), toujours `None` avant le premier
point. Le camembert/liste suit lui aussi la lentille, mais sur trois
répartitions distinctes calculées par `compute_patrimoine_net` : `repartition_par_classe` (valeur
BRUTE par ligne, inchangée) en lentille Brut ; `repartition_par_classe_financiere` (restreinte aux
catégories financières) en lentille Financier ; `repartition_par_classe_nette` en lentille Net —
retour utilisateur (26/08/2026) : chaque ligne y est nettée de SON emprunt rattaché (`Loan.holding_id`,
réutilise `part_nette` de `detenteurs_service.compute_parts`), pas seulement le grand total, avec un
bucket « Dettes non rattachées » pour un emprunt sans actif associé — la somme correspond toujours
exactement à `patrimoine_net`. Une ligne peut y être négative (équité négative) : jamais masquée dans
la liste (affichée en rouge), mais exclue du camembert, qui ne peut pas représenter une part négative.
Le mode étagé Investi/Gains de la courbe, initialement réservé à la lentille Financier faute de
décomposition possible pour l'immobilier/l'épargne, est désormais disponible aussi en Net/Brut
(backlog § U.4, retour utilisateur 30/08/2026) : `PatrimoineHistoryPoint` expose `valeur_investie`
(part financière du grand livre de transactions + part manuelle bornée aux versements EXPLICITEMENT
déclarés, § U.2) et `valeur_realisee_cumulee` (exclusivement financière, aucun équivalent « réalisé »
pour un bien qui ne se cède pas par petites parts). `PortfolioHistoryChart` applique alors la MÊME
formule de décomposition (`Gains = valeur_portefeuille + valeur_realisee_cumulee − valeur_investie`)
qu'en Financier — avec une légende adaptée hors Financier précisant qu'une hausse non déclarée reste
comptée en gain.

**Correctif du 31/08/2026** : en lentille Net, `Portefeuille` vaut `patrimoine_net` (déjà netté des
emprunts) mais `valeur_investie` restait BRUTE — la dette était donc soustraite deux fois, sous-comptant
massivement les gains d'un bien financé à crédit. `PatrimoineHistoryPoint` expose désormais aussi
`valeur_investie_nette` (`valeur_investie − passifs_totaux`, même netting global que `patrimoine_net`,
sans rattachement par ligne — cohérent avec le reste de ce point, agrégé) : `PortfolioHistoryChart`
l'utilise comme « Investi » en lentille Net, jamais `valeur_investie` (réservée à Brut). Invariant
verrouillé par test : `Gains` doit valoir EXACTEMENT le même montant en Brut et en Net, la dette ne
déplaçant jamais une performance d'investissement, seulement le capital investi affiché.

**Deux limites assumées et affichées** (même philosophie de transparence que la qualité des données de
répartition, § 3.4, ou la valorisation immobilière datée, § 3.11 — jamais de fausse précision) :
données de valorisation manuelle clairsemées (une ligne plate tant qu'un second point n'est pas
saisi) et scoping par détenteur de la poche financière approximé par un ratio d'aujourd'hui (les
quotités ne sont pas historisées). `PatrimoineNetCard` et `PortfolioHistoryChart` partagent les deux
appels réseau (financier et combiné, tous deux coûteux — jusqu'à une minute pour le premier), remontés
par `DashboardPage` plutôt que chargés en double ; la courbe ne dépend plus de l'analyse
géo/sectorielle (`analysis`/`loading`), elle reste visible même si celle-ci échoue à charger.

### 3.17 Mobile et responsive (backlog § 2.K.4)

**Point de rupture unique** à 768 px (`md:`, valeur par défaut Tailwind v4). Au-dessus : barre
latérale (`Sidebar`) et tableaux classiques. En dessous : barre de navigation inférieure fixe
(`BottomNav`, 4 routes de consultation directes + un bouton **« Plus »** ouvrant une feuille
glissante avec le reste de la navigation, l'administration, le thème et la déconnexion — écart
assumé avec une lecture littérale de « cinq entrées » : le nombre de routes directes dépend du rôle
via le filtrage déjà en place, § 2.L.2, un invité n'en ayant que deux), et deux tableaux transformés
en cartes (`PositionsTable`, `LoansCard` — les plus consultés/complexes ; les 5 tableaux de la fiche
détaillée d'une position et les tableaux d'Import/Simulateur/Répartition/Dividendes restent en
défilement horizontal classique, hors périmètre de cet incrément). Les filtres de `PortefeuillePage`
(catégorie, compte) passent dans une feuille glissante sous 768 px au lieu d'une rangée inline.
Cibles tactiles ≥ 44 px sur tout le nouveau code mobile, zones de sécurité iOS couvertes
(`env(safe-area-inset-bottom)`).

### 3.18 Budget : import, catégorisation, indicateurs, récurrences, jonction patrimoine (backlog § 2.N)

Suivi des mouvements bancaires, **totalement indépendant** du grand livre de transactions du
courtier (§ 3.1) — deux domaines de données séparés (`mouvements_bancaires` vs `transactions`).

- **Import** : CSV avec mapping manuel de colonnes (réutilise le mécanisme d'aperçu/cache du
  relevé de positions), montant exprimé en une colonne signée ou en deux colonnes débit/crédit
  séparées selon la banque. OFX et QIF n'ont pas besoin de mapping (structure fixe, parsée sans
  dépendance tierce).
- **Déduplication** sur (date, montant, libellé normalisé) — identifiant fourni par la source
  quand il existe (OFX `FITID`), sinon un hash déterministe en tient lieu. Ne tient pas compte du
  compte annoté : deux mouvements identiques sur deux comptes différents sont vus comme un seul.
- **Catégorisation** : arbre de catégories par foyer (un niveau de sous-catégorie), semé une seule
  fois avec 8 catégories par défaut puis entièrement modifiable — jamais resemé après une
  suppression volontaire. Règles « le libellé contient un motif → catégorie », appliquées à
  l'import et réappliquables en masse sans jamais écraser une catégorisation manuelle.
- **Indicateurs de période** (mensuelle/annuelle/personnalisée) : entrées, sorties, disponible, et
  dépenses récurrentes — un couple (libellé normalisé, montant arrondi à l'euro) revenant sur au
  moins 2 des 3 mois précédant la fin de la période compte comme récurrent.
- **Budget cible** par catégorie racine, comparé aux sorties réelles de la période (écart affiché).
- **Charges récurrentes et abonnements** (§ 2.N.3) : regroupement par libellé normalisé seul (pas le
  montant, contrairement à l'indicateur ci-dessus — pour permettre à un même abonnement de
  regrouper deux montants différents et révéler une hausse de prix), sur une fenêtre glissante de 12
  mois, indépendante de la période affichée à l'écran. Un mouvement non revu depuis plus de 45 jours
  est considéré résilié et n'apparaît plus. Périodicité classée mensuelle (intervalle moyen 20-40
  jours) ou irrégulière (affichée quand même). Hausse de prix signalée au-delà de 5 % entre les deux
  dernières occurrences. Pas de détection d'abonnement « inutilisé » (aucun signal d'usage
  disponible depuis un relevé bancaire) — la liste complète, présentée pour revue, en est
  l'équivalent honnête.
- **Jonction budget ↔ patrimoine** (§ 2.N.4) : taux d'épargne réel (sorties de la catégorie racine
  « Épargne » / entrées de la période), reste à vivre (entrées − sorties « Logement » − charges
  récurrentes mensuelles détectées ci-dessus). Les deux catégories sont repérées **par leur nom**
  (comparaison normalisée insensible à la casse/aux accents, pas un champ dédié sur
  `CategorieBudget`) : un renommage de l'une d'elles rend le rapprochement correspondant
  indisponible, signalé explicitement plutôt que de produire un chiffre faux. Le Simulateur (§ 3.12)
  préremplit son « Versement mensuel » avec le disponible moyen observé sur les 3 derniers mois de
  budget, librement modifiable ensuite.

### 3.19 Objectifs suivis et indicateurs de situation (backlog § 2.O.1/2.O.2)

Distinct du Simulateur (§ 3.12, calcul à la volée sans rien conserver) : un objectif est persisté.

- **Progression réelle** = valeur actuelle des actifs rattachés (pas de registre de versements
  séparé — réutilise la valorisation déjà en place). **Trajectoire réelle** ancrée sur deux mesures
  seulement : `valeur_a_la_creation` (instantané figé au moment de la création) et la valeur
  actuelle recalculée à la lecture — pas un historique continu.
- **Diagnostic** : `atteint` (valeur actuelle ≥ cible), `echeance_depassee`, `en_bonne_voie`
  (valeur actuelle ≥ trajectoire cible linéaire à ce jour), `en_retard` (retard exprimé en mois, au
  rythme constaté depuis la création), `aucune_progression` (rythme nul ou négatif).
- **Rendement annuel requis** (sans versement supplémentaire) et **contribution mensuelle
  nécessaire** (au taux hypothèse renseigné par ligne, 0 % par défaut) : formules fermées, pas de
  bissection nécessaire (contrairement au XIRR de § 3.5).
- **Indicateurs de situation** : matelas de sécurité (épargne `CASH_ACCOUNT`/`REGULATED_SAVINGS` /
  dépenses mensuelles moyennes sur 3 mois de budget), taux d'endettement (mensualités des emprunts /
  revenus nets mensuels moyens), part du patrimoine immobilisée (le reste de
  `TYPES_ACTIF_PATRIMOINE_MANUEL` / patrimoine brut). `null` plutôt qu'un chiffre trompeur si une
  donnée manque (aucun mouvement bancaire importé, aucun emprunt).

### 3.20 Exposition consolidée tous actifs (backlog § 2.P.1)

Distinct du § 3.4 (portefeuille FINANCIER seul) et du § 3.11 (patrimoine net, additif mais sans
géographie ni concentration) : une seule répartition géo/classe, **financier ET immobilier/épargne
confondus** (`GET /api/patrimoine/exposition-consolidee`,
`services/patrimoine_service.compute_exposition_consolidee`) — affichée dans le détail repliable du
Tableau de bord (relocalisée depuis l'ancien écran Répartition, retiré le 25/08/2026 avec la feature
d'objectifs de répartition annuelle, cf. § 3.6 devenue vacante).

- **Géographie** : réutilise le look-through des fonds (§ 3.4) pour le financier ; un actif valorisé
  manuellement y contribue via un nouveau champ `Holding.zone_geo` (une des 6 zones de
  `reference_indices`, jamais une granularité par pays), `None` retombant sur `ZONE_EUROPE`
  (hypothèse la plus probable pour ce type d'actif français) plutôt que sur « Non catégorisé » — le
  champ est éditable à la création via le formulaire d'ajout manuel du Portefeuille.
- **Classe d'actif** : réutilise le dictionnaire de labels déjà étendu par § 3.11 (M.1).
- **Concentration** : plus grosse ligne (ticker + %), part des 5 plus grosses lignes, première zone
  géographique — « premier émetteur » interprété comme la plus grosse LIGNE (pas un vrai agrégat
  multi-fonds par émetteur réel, limite assumée).
- **Pilotée par la lentille Net/Brut/Financier** (backlog § 2.S.2, retour utilisateur 26/08/2026) :
  `compute_exposition_consolidee` renvoie DEUX jeux de champs sur la même requête — sans suffixe pour
  la valeur BRUTE, suffixés `_nette` pour la valeur nette de SON emprunt rattaché par ligne
  (`Loan.holding_id`, même principe que `repartition_par_classe`/`repartition_par_classe_nette` du
  patrimoine net § 3.11). `ExpositionConsolideeCard` choisit le jeu selon la lentille : Brut → champs
  bruts (`valeur_totale` = `actifs_totaux`), Net → champs `_nette` (`valeur_totale_nette` =
  `patrimoine_net`). Une première version nettait la carte de façon inconditionnelle (bug repéré par
  l'utilisateur : mêmes pourcentages affichés en Net et en Brut), corrigé le jour même. En lentille
  **Financier**, la carte est masquée (pas de pseudo-exposition « tous actifs » restreinte au
  financier — contradictoire avec son titre, redondant avec la répartition géo/sectorielle déjà
  financière juste au-dessus). Contrairement à `repartition_par_classe_nette`, pas de bucket "Dettes
  non rattachées" ni de valeur négative conservée dans les variantes `_nette` ici (uniquement des
  camemberts en pourcentage, pas de liste en euros pour servir de repli) : un emprunt non rattaché
  réduit `valeur_totale_nette` sans catégorie géo/classe associée.
- **`part_estimee_manuelle_pct`** : part du patrimoine dont la géo est déclarée (via `zone_geo`)
  plutôt que mesurée (look-through) — rappel honnête sans dupliquer l'encart de qualité des données
  existant (§ 3.4), qui reste affiché tel quel sur l'écran Répartition pour le seul financier.
- Ouvert propriétaire+membre ; hors du périmètre invité (§ 3.11, seuls Patrimoine net/Portefeuille/
  Emprunts le sont).
- **Détail des lignes au clic** (backlog § 2.W.1, retour utilisateur 31/08/2026) : cliquer une part
  d'un des deux camemberts ouvre `CompositionModal` (composant généralisé, partagé avec les camemberts
  géo/sectoriel financier du Tableau de bord) sur `GET /api/patrimoine/exposition-consolidee/composition
  ?dimension=geo|classe&categorie=…&net=…`. Dimension `geo` réutilise le look-through déjà décrit
  ci-dessus (`analysis_service.holdings_in_category`, générique — pas de restriction au financier dans
  son implémentation, seul l'appelant `/api/analysis/composition` s'y limite). Dimension `classe`
  correspond directement par `LABEL_TYPE_ACTIF` (aucun look-through pour une classe d'actif). `net`
  suit la même lentille que la carte.

### 3.21 Lien de partage révocable (backlog § 2.Q.1)

Premier point d'accès **public** de toute l'application (aucune authentification) : un lien anonyme,
révocable à tout moment, donnant à un tiers (banque, notaire, famille) une vue en lecture seule d'un
sous-ensemble du patrimoine. Gestion (création/liste/révocation) réservée à `ROLE_PROPRIETAIRE`
(`POST`/`GET`/`DELETE /api/partage`, `services/partage_service.py`) — un membre garde un accès large
en lecture/écriture sur les données du foyer mais ne peut pas les exposer publiquement.

- **Sections activables indépendamment** : patrimoine net (§ 3.11), exposition consolidée (§ 3.20),
  rentabilité (§ 3.5), budget (mois en cours, § 3.18), objectifs (§ 3.19). Réutilisent telles quelles
  les fonctions de calcul déjà servies aux écrans authentifiés — jamais de duplication de logique
  métier, seulement une conversion vers des schémas dédiés au partage.
- **Surface volontairement restreinte** : jamais le détail position par position, les transactions, ni
  les libellés de compte — même un lien deviné/fuité n'expose donc jamais autant qu'un compte
  `invite` authentifié.
- **`masquer_valeurs`** convertit chaque montant en pourcentage plutôt que de l'omettre
  silencieusement (la forme de la répartition reste visible, jamais son échelle) ; les ratios déjà
  relatifs (rendement, concentration) ne sont jamais masqués.
- **`detenteur_id`** ne filtre que la section patrimoine net (seul calcul qui le supporte
  aujourd'hui, § 3.11) — budget/objectifs/exposition consolidée restent vue foyer complète si activés
  à côté d'un détenteur, limite assumée et signalée à la création du lien.
- **Code d'accès optionnel** : même hachage `pbkdf2_sha256` que les mots de passe
  (`auth_service.hash_password`). Verrouillage temporaire par LIEN (pas par compte, un lien public
  n'en a pas) après 5 échecs en 15 minutes glissantes — même mécanique que le verrouillage de
  connexion (§ 3.11/2.L.2), nouvelle table `partage_acces` plutôt que `access_log_entries`.
- **`GET /api/partage-public/{token}/meta`** (code requis ou non, nom du lien) et
  **`POST /api/partage-public/{token}`** (`{code}` → charge utile complète) : routeur séparé
  (`routers/partage_public.py`), enregistré sans aucune dépendance d'authentification dans `main.py`
  — jamais via `_protegee`/`_proprietaire_seul`, pour qu'aucun garde-fou ne puisse s'y glisser par
  erreur au fil des évolutions futures. Réponse identique (404) pour un jeton absent, expiré, ou
  révoqué — jamais de distinction qui laisserait deviner lequel des trois s'applique.
- Frontend : route publique `/partage/:token`, montée en dehors d'`AuthProvider`/
  `PreferencesAffichageProvider` (`App.tsx`) — aucun composant de cette page ne dépend de ces
  contextes, un visiteur sans jeton y accède normalement. Un `401` sur `/api/partage-public/*`
  (mauvais code) n'invalide jamais la session d'un propriétaire déjà connecté qui testerait son
  propre lien dans un nouvel onglet (même exemption que `/api/auth/*` dans `api/client.ts`).

### 3.22 Déclaration de patrimoine paramétrable (backlog § 2.Q.2)

Distincte du relevé PDF existant (§ 3.11, D.1, resté inchangé) : un document **paramétrable**,
destiné à un tiers concret (banque, notaire) — `POST /api/export/declaration-patrimoine.pdf`
(`services/declaration_patrimoine_service.py`, `POST` plutôt que `GET` : la sélection peut porter
sur un grand nombre d'identifiants).

- **Sélection actif par actif et emprunt par emprunt** (`holding_ids`/`loan_ids`, `None` = tout le
  foyer, une liste — même vide — restreint explicitement).
- **Filtrage par détenteur** (`detenteur_id`) : réutilise `detenteurs_service.compute_parts`, chaque
  actif valorisé à sa quotité ; un emprunt affiché à sa `part_dette` (`part_detenue − part_nette`) si
  rattaché à un actif sélectionné — sinon absent de la vue individuelle (même limite que M.2). Les
  totaux de la synthèse sont la somme EXACTE des lignes affichées, jamais un chiffre d'ensemble
  susceptible de diverger de la sélection.
- **Méthode de valorisation par ligne**, toujours explicitée : « Valeur estimée déclarée le
  JJ/MM/AAAA » (`Holding.valeur_estimee` renseignée), « Cours de marché au JJ/MM/AAAA » (cotation
  disponible), ou « Prix de revient (non coté) » (repli sans cotation).
- **Profil emprunteur optionnel** (`inclure_profil`) : revenus nets/dépenses mensuels moyens et taux
  d'endettement (`objectifs_service.compute_indicateurs_situation`, moyenne glissante 3 mois — même
  fenêtre que § 3.19/O.2), reste à vivre (`budget_service.compute_jonction_patrimoine`, mois en cours
  — même fenêtre que § 3.18/N.4), et **taux d'imposition** — un réglage SAISI par l'utilisateur
  (`Preferences.taux_imposition_pct`, `None` par défaut), repris tel quel, jamais un calcul fiscal
  (seule exception admise au hors-périmètre fiscalité, cf. § 5).
- **Pagination** (numéro de page en bas de chaque page) et horodatage de génération — absents du
  relevé § D.1, qui tient sur une seule page et n'en avait pas besoin.
- Frontend : `DeclarationPatrimoineModal`, déclenchée depuis Réglages → Général. Téléchargement via
  blob (`api.downloadDeclarationPatrimoine`, nouvelle fonction `requestBlob` dans `api/client.ts`,
  factorisée avec `request` — même gestion d'erreur/jeton, seule la lecture du corps de réponse
  diffère) + `<a download>` généré côté client.

### 3.23 Calculateur brut/net et taux d'épargne (backlog § 2.R.1)

Table `salaires` : **plusieurs lignes possibles par année** (`user_id` + `annee`, sans contrainte
d'unicité — un revenu par conjoint, par exemple), à l'échelle du foyer, pas par détenteur.
`services/salaire_service.py` :

- **Conversion brut/net approximative et assumée comme telle** : coefficient net/brut forfaitaire
  selon le statut (cadre 0,75, non-cadre 0,78 — cotisations salariales secteur privé, hors cas
  particuliers), jamais un moteur de paie certifié. Le nombre de versements par an (12/13/14…)
  distingue le montant « par versement » de la moyenne mensuelle sur 12 mois.
- **Taux d'imposition propre à chaque entrée** (`Salaire.taux_imposition_pct`, `None` par défaut) —
  saisi directement sur l'écran Salaire, PAS la préférence globale `Preferences.taux_imposition_pct`
  (§ 3.22, réservée à la déclaration de patrimoine) : deux revenus du même foyer peuvent avoir des
  taux différents, une seule valeur partagée n'aurait pas de sens. `net_apres_impot_*` reste `None`
  pour une entrée tant que son propre taux n'est pas renseigné.
- **Taux d'épargne agrégé par année** (`compute_synthese_annee`, jamais calculé entrée par entrée) :
  somme du revenu net **total** du foyer sur l'année (après impôt entrée par entrée quand connu,
  avant impôt en repli sinon — `toutes_les_entrees_ont_un_taux_imposition` signale une base mixte),
  rapportée au montant réellement investi sur l'année (achats réels, `TRADING/BUY` +
  `CASH/PRIVATE_MARKET_BUY`, `performance_service.montant_investi_periode` — volontairement séparée
  du calcul "vie entière" de `compute_performance`, § 3.5). Le montant investi n'est calculé qu'UNE
  fois par année (jamais répété par entrée de salaire, ce qui fausserait le ratio dès que le foyer a
  plusieurs revenus). **Distinct à dessein du rendement de marché** (§ 3.5, TWR/XIRR) : le premier
  mesure un comportement d'épargne, le second la performance de ce qui est déjà investi — les deux ne
  se recoupent jamais dans ce calcul.

### 3.24 Écran Épargne et valorisation datée par l'utilisateur (backlog § 2.S.1)

`TYPES_EPARGNE` (`models.py`) : sous-ensemble de `TYPES_ACTIF_PATRIMOINE_MANUEL` couvert par l'écran
`/epargne` — `CASH_ACCOUNT` / `REGULATED_SAVINGS` / `EMPLOYEE_SAVINGS` / `LIFE_INSURANCE` / `PENSION`.
Le Véhicule en reste exclu (décote plutôt qu'épargne, futur rapprochement avec une catégorie « biens »
aux côtés de l'immobilier) ; ces 5 types restent aussi visibles dans Portefeuille (onglet « Immobilier
& Épargne ») — l'écran Épargne est un complément adapté à leur usage, pas un remplacement.

- **Valorisation à date choisie** : `PUT /portfolio/holdings/{ticker}/valorisation`
  (`ValorisationInput{valeur, date}`) enregistre un point d'historique à la date indiquée par
  l'utilisateur — contrairement à `create_holding`/`update_holding` (routes existantes, inchangées)
  qui stampent toujours `datetime.now()`. **Règle d'antidatage** : la « valeur courante »
  (`Holding.valeur_estimee`/`date_valeur_estimee`) n'est mise à jour que si le point soumis est le
  **plus récent connu** (`date_dt >= holding.date_valeur_estimee`, ou aucune date connue) — un
  rattrapage antidaté (saisie tardive d'un mois passé) est bien conservé dans l'historique complet
  (`GET .../immobilier-history`, générique malgré son nom) mais n'écrase jamais une valeur plus
  récente déjà affichée.
- **Fiche détaillée généralisée** : `HoldingDetailContent.tsx` étend l'onglet *Aperçu* (jusque-là
  réservé à `REAL_ESTATE`) aux 5 types Épargne via `EpargneApercu`, qui partage
  `ValorisationHistoriqueCard` (tableau daté) et `AjoutValorisationForm` (ajout rapide) avec la fiche
  immobilier — même infrastructure, débridée, pas un mécanisme séparé.
- **Versement mensuel déclaré** (`Holding.versement_mensuel`, `None` par défaut) : jamais déduit
  automatiquement, même philosophie que `taux_pct`. `budget_service.compute_jonction_patrimoine`
  renvoie `versement_mensuel_epargne_declare` (somme des `versement_mensuel` des lignes `TYPES_EPARGNE`
  du foyer) — **additionné**, jamais fusionné côté backend, au `versement_mensuel_suggere` déjà dérivé
  du Budget (§ 3.18) pour le préremplissage du Simulateur (§ 3.12) ; la légende sous le champ détaille
  les deux sources séparément. Les deux ne se recoupent jamais : un virement réel déjà suivi par le
  Budget est déjà soustrait de `disponible` (`compute_summary`), la somme des versements déclarés
  mesure autre chose (l'intention documentée, pas le mouvement déjà compté).
- **Écran `/epargne`** : liste de « comptes » (pas un tableau boursier) — valeur courante, date de
  dernière mise à jour, versement mensuel, mini-historique, action rapide « Ajouter une valorisation » ;
  formulaire « + Ajouter un compte » réutilisant `POST /portfolio/holdings` (quantité fixée à 1, même
  convention que l'immobilier/l'assurance-vie).
- **Modifier/Supprimer un compte** (retour utilisateur du 25/08, après premier usage réel) : chaque
  carte expose « Modifier » (nom + `versement_mensuel` via `PATCH /portfolio/holdings/{id}`, jamais
  `valeur_estimee`/`date_valeur_estimee` — ces deux champs ne passent QUE par la route `valorisation`
  pour ne jamais casser la cohérence de l'historique daté) et « Supprimer » (confirmation obligatoire,
  `DELETE /portfolio/holdings/{id}`, réutilise les routes déjà existantes pour toute ligne du
  portefeuille — aucune route dédiée à créer).
- **Graphique d'évolution** (même retour du 25/08) : `ValorisationHistoriqueCard` (partagée entre la
  fiche détaillée et l'écran Épargne) affiche un `LineChart` au-dessus du tableau dès que l'historique
  compte au moins deux points — `historique` est déjà trié chronologiquement par
  `immobilier_service.historique_valorisation` (`ORDER BY date_valeur`), directement exploitable sans
  retri ; le tableau en dessous garde son propre tri inverse (le plus récent en premier) sans affecter
  l'ordre du graphique.

## 4. Modèle de données (tables principales)

| Table | Rôle |
|---|---|
| `transactions` | Grand livre importé (source de vérité), dédoublonné par `transaction_id` |
| `holdings` | Portefeuille reconstruit ou saisi manuellement. `origine` (`manuel` \| `reconstruit`) arbitre le conflit entre saisie manuelle et reconstruction (cf. § 3.1) ; `compte_id` rattache la ligne à un `Compte` structurel, nullable (cf. § 3.7) ; `valeur_estimee`/`date_valeur_estimee` portent la valorisation manuelle de la taxonomie élargie (immobilier/SCPI/assurance-vie/PER/comptes/épargne/véhicule, cf. § 3.11) ; `taux_pct` porte le taux annuel informatif (épargne/véhicule, cf. § 3.11) ; `zone_geo` porte la zone géographique déclarée d'un actif manuel, `None` repliant sur Europe (cf. § 3.20) |
| `comptes` | Compte structurel (PEA, CTO, livret, compte immobilier...), rattaché à un `Etablissement` optionnel (cf. § 3.7) — écran dédié `/comptes` |
| `etablissements` | Établissement financier (banque, courtier...) regroupant plusieurs `comptes` — liste gérée par l'utilisateur (CRUD), cf. § 3.7 |
| `loans` | Emprunts (patrimoine net, cf. § 3.11) : capital initial, taux, mensualité, date de début, durée, recalage manuel optionnel du capital restant dû |
| `holding_immobilier_details` | Fiche immobilier complète (§ 3.11, backlog § 2.M.3) : bloc location + caractéristiques, un par `Holding` |
| `holding_valuation_history` | Historique daté des valorisations manuelles (§ 3.11, backlog § 2.M.3) — jamais écrasé, générique (pas réservé à l'immobilier) |
| `market_data_cache` | Cache des cours/secteur/pays par position, horodaté. `description` (fonds uniquement, alimentée par `justetf_refresh`, cf. § 3.4) ; `frais_gestion_pct` (fonds uniquement, mis en cache une seule fois par ticker, cf. § 3.9) |
| `fund_composition` | Look-through géo/secteur zone-mappé des fonds (utilisé pour les graphiques de répartition). `source` (`justetf` \| `composition` \| `indice` \| absente) qualifie l'origine de la donnée (cf. § 3.4) — les lignes `justetf` ne sont recalculées que par `justetf_refresh`, les autres à chaque `market_data_refresh` |
| `fund_composition_brute` | Répartition géo/sectorielle **brute** (non zone-mappée) d'un fonds telle que publiée par justETF, affichage seul sur la fiche détaillée (cf. § 3.4) — jamais utilisée dans un calcul agrégé |
| `fund_top_holdings` | Détail nominatif des ~10 plus grosses lignes de chaque fonds — justETF pour un fonds couvert (2.4), Yahoo Finance en repli sinon |
| `ticker_resolution` | Cache ISIN/symbole → ticker Yahoo Finance |
| `salaires` | Calculateur brut/net + taux d'épargne — plusieurs lignes possibles par année à l'échelle du foyer, chacune avec son propre taux d'imposition (§ 3.23) |
| `scheduled_job_config` | Configuration et suivi d'exécution des tâches planifiées |
| `parametres` | Réglages applicatifs génériques clé/valeur (méthode de calcul du coût de revient, taux d'imposition déclaré — § 3.22), exposés par `services/preferences_service.py` ; porte aussi la version des règles de calcul du portefeuille, qui déclenche une reconstruction unique au démarrage après une mise à jour (cf. `services/startup_maintenance.py`) |
| `historique_cache` | Cache persistant (24 h) des séries d'historique de prix coûteuses à recalculer (ligne, portefeuille, et indice de référence — § 3.5.1), cf. § 3.9 |
| `liens_partage` | Liens de partage révocables (§ 3.21, backlog 2.Q.1) : jeton opaque, sections activées, code haché optionnel, expiration, révocation |
| `partage_acces` | Journal des consultations d'un lien de partage public (§ 3.21) — alimente le verrouillage temporaire par lien |

Aucune vraie clé étrangère : les relations se font par correspondance de `ticker` (identifiant ISIN/symbole), car `holdings` (les lignes d'origine `reconstruit`) est entièrement reconstructible depuis `transactions`. Toute évolution de ce modèle est appliquée automatiquement au démarrage par des migrations non destructives (`ALTER TABLE ADD COLUMN`, `CREATE UNIQUE INDEX`) — voir `MANUEL_EXPLOITATION.md`.

## 5. Limites connues

Voir `BACKLOG.md` pour la liste complète des points relevés à l'audit et leur état de traitement. Limites structurelles assumées, non résolues par construction :

- **Look-through géographique encore partiel.** justETF (2.4) donne la composition réelle des ~4-5 plus grosses lignes par fonds + un résiduel « Autres » agrégé, pas la liste complète (la fiche justETF l'offre via un bouton « Show more » nécessitant une session dynamique côté site, volontairement non reproduite — jugée trop fragile hors navigateur, cf. `services/justetf_service.py`). Pour les fonds hors couverture justETF (réplication synthétique/swap, ETC), l'extrapolation Yahoo Finance ou le repli par indice (§ 3.4) restent des estimations à revoir périodiquement.
- **Dépendance à justETF, sans SLA ni support.** Le look-through complet (2.4) **et désormais le cours de référence des ETF** (§ 3.9) reposent sur une autorisation informelle obtenue directement de justETF, révocable et non garantie dans le temps. Deux comportements différents en cas de blocage/changement de mise en page côté justETF : la **composition** échoue proprement (statut « erreur » de `justetf_refresh` visible dans Réglages) sans perdre les données déjà en base, et une position retombe alors sur la source suivante de la hiérarchie (§ 3.4) ; le **prix** d'un ETF, lui, n'a **aucun repli** (décision utilisateur explicite, § 3.9) — un échec affiche « Cotation indisponible (justETF) » plutôt que de retomber sur Yahoo Finance.
- **Rentabilité par compte non calculable.** Cf. § 3.7 : le rattachement à un compte est une annotation portée par la ligne du portefeuille, le grand livre importé ne porte aucune information de compte. Ce n'est pas un chantier reporté, c'est une absence structurelle de la donnée source.
- **Aucune simulation fiscale.** L'application suit la performance d'un portefeuille, elle ne modélise ni le régime PEA (durée de détention, plafond de versement), ni aucune autre fiscalité. Non-objectif produit assumé (point 5.7 du backlog).
- **Authentification multi-utilisateur avec rôles (propriétaire/membre/invité), verrouillage de connexion, sessions révocables et journal d'accès (backlog 2.L.2).** Reste néanmoins à compléter avant une exposition réellement publique hors homelab : pas de second facteur (TOTP), jeton transporté en en-tête `Authorization` (pas encore un cookie `Secure`/`SameSite=Strict`), HTTPS/reverse proxy hors du dépôt (responsabilité de l'exploitant, cf. `docs/MANUEL_EXPLOITATION.md` §12).
- **Dépendance à Yahoo Finance (`yfinance`), sans SLA officiel.** Les garde-fous de fréquence (§ 3.9) réduisent le risque de blocage mais ne l'éliminent pas ; une indisponibilité ou une limitation côté Yahoo Finance dégrade la fraîcheur des données sans faire échouer l'application (chaque position est traitée indépendamment, une erreur reste locale à la ligne concernée).
- **Un seul format de courtier reconnu automatiquement (Trade Republic).** D'autres exports (Boursorama, Degiro, Interactive Brokers...) passent par le mapping manuel de colonnes (relevé de positions), jamais par la reconstruction depuis un grand livre — élargir cette reconnaissance suppose un vrai fichier d'export d'un autre courtier comme référence, indisponible à ce jour (roadmap Phase 3, § E.1, backlog).
- **Pas de projection des dividendes futurs.** Le calendrier (§ 3.13) et le rapport récapitulatif (§ 3.14) ne montrent que des dividendes déjà perçus : `yfinance` n'expose pas de façon fiable la régularité de versement par ligne, en particulier pour les ETF — extrapoler sans cette fiabilité risquerait d'afficher un montant qui n'est pas garanti (roadmap Phase 4, § C.2, backlog).
