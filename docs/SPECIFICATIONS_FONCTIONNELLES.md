# Spécifications fonctionnelles — Application Patrimoine

## 1. Périmètre

Application web locale et mono-utilisateur de suivi de portefeuille boursier. Elle permet de :

1. reconstruire automatiquement le portefeuille réel à partir d'un export d'historique de transactions (courtier Trade Republic et compatibles), avec un choix de méthode de calcul du coût de revient (coût moyen pondéré ou FIFO) ;
2. enrichir chaque position avec des données de marché (cours, secteur, pays, composition des ETF) via Yahoo Finance (`yfinance`), avec mise en cache pour limiter la fréquence des appels ;
3. définir des objectifs de répartition géographique et sectorielle par année, visualiser les écarts avec le portefeuille réel et être alerté quand un écart dépasse un seuil réglable ;
4. calculer la rentabilité globale et par ligne (gain/perte, rendement annualisé money-weighted), à partir d'une convention de données algébrique et sans double comptage des frais ;
5. proposer des actions de rééquilibrage mécaniques (aucun conseil sur des titres précis) ;
6. annoter chaque ligne d'un compte (PEA, CTO...) à titre purement indicatif, pour lire la répartition de la valeur actuelle par enveloppe ;
7. exporter positions, transactions et synthèse de rentabilité en CSV compatible Excel français ;
8. planifier le rafraîchissement automatique des données de marché, ou le déclencher manuellement, sans bloquer l'interface ;
9. suivre le **patrimoine net global** (roadmap Phase 1, `docs/ROADMAP.md`) : au-delà du seul portefeuille financier, immobilier/SCPI/assurance-vie/PER/autres actifs valorisés manuellement et emprunts (passifs), avec une répartition par grande classe d'actif ;
10. **projeter** ce patrimoine net à horizon réglable et estimer une **indépendance financière** (roadmap Phase 2) à partir d'hypothèses de rendement, d'épargne et de dépense cible — présenté explicitement comme une hypothèse, jamais une promesse ;
11. consulter un **calendrier des dividendes perçus**, mois par mois, avec le détail des lignes (roadmap Phase 3) ;
12. exporter un **relevé de patrimoine en PDF** mis en forme, au-delà des exports CSV (roadmap Phase 3) ;
13. voir le **coût de gestion annuel consolidé** des fonds/ETF détenus, avec un indicateur honnête de la part du portefeuille pour laquelle ce coût est réellement connu (roadmap Phase 3) ;
14. consulter, à la demande, un **rapport récapitulatif** (évolution, plus gros mouvements, dividendes perçus) sur un mois, une année, ou une période personnalisée (roadmap Phase 4) ;
15. **installer l'application** comme une application (icône, plein écran) depuis un navigateur compatible (roadmap Phase 3).

L'application ne fournit **aucun conseil en investissement personnalisé** : les objectifs de répartition sont définis par l'utilisateur lui-même, les recommandations ne portent que sur des catégories (zone géographique, secteur), jamais sur un titre à acheter ou vendre. Elle ne simule aucune fiscalité (cf. § 5, non-objectif assumé).

## 2. Écrans

| Écran | Route | Rôle |
|---|---|---|
| Tableau de bord | `/` | Vue d'ensemble en trois temps (backlog § 2.K.6) : **le chiffre** (patrimoine net très grand + variation/phrase), **la courbe** (évolution du portefeuille), **le détail** repliable (répartition réel vs cible, qualité des données, coût de gestion, répartition par compte, indicateurs de risque, indicateur de rééquilibrage) |
| Portefeuille | `/portefeuille` | Liste des positions : tri par colonne, ligne de total, filtrage par catégorie d'actif (dont « Immobilier & Épargne ») et par compte, édition en ligne, fraîcheur des cours, ajout manuel (avec valeur estimée pour l'immobilier/SCPI/assurance-vie/PER), accès à la fiche détaillée ; carte « Dettes et emprunts » (CRUD, capital restant dû calculé ou recalé manuellement) |
| Fiche détaillée | `/portefeuille/:ticker` (page pleine page) ou modale ouverte depuis le Portefeuille/le Tableau de bord | Détail d'une position : valorisation, rendements, émetteur/résumé, look-through géo/secteur, historique de prix |
| Répartition | `/repartition` | Objectifs et rééquilibrage réunis (fusion Objectifs/Rééquilibrage) pour une même année sélectionnable : définition des cibles de répartition géo/sectorielle, puis en dessous le détail complet des alertes et des actions de rééquilibrage recommandées qui en découlent — sorti du Tableau de bord pour ne pas y encombrer la vue d'ensemble. Un enregistrement des objectifs recharge automatiquement le rééquilibrage affiché |
| Simulateur | `/simulateur` | Projection d'un capital dans le temps (préempli avec le patrimoine net actuel, librement modifiable) à horizon réglable (5/10/20/30 ans) selon un rendement et un versement mensuel ; tableau de détail annuel/mensuel (versements, intérêts, capital, cumuls) ; calcul d'indépendance financière (FIRE) à partir d'une dépense annuelle cible et d'un taux de retrait. Tout est calculé côté client hormis le patrimoine net initial |
| Dividendes | `/dividendes` | Calendrier des dividendes perçus, groupés par mois, détail dépliable par mois (date, ligne, montant net) |
| Rapport | `/rapport` | Rapport récapitulatif généré à la demande sur un mois, une année, ou une période personnalisée (sélecteur de mode) : évolution de la valeur du portefeuille, dividendes perçus, cinq plus gros mouvements de la période |
| Import | `/import` | Import de l'historique de transactions ou d'un relevé de positions |
| Réglages | `/reglages` | Préférences (méthode de calcul du coût de revient, seuil d'alerte), configuration du rafraîchissement automatique des cours (avec suivi de progression), exports CSV et relevé de patrimoine PDF |

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

**Qualité des données exposée.** L'API (`GET /api/analysis/{annee}`, champ `qualite_donnees`) et l'interface (encart « Qualité des données » du Tableau de bord) qualifient, en euros et en pourcentage de la valeur totale du portefeuille, l'origine de la répartition géographique affichée : part en composition réelle, part estimée par indice, part non catégorisée, part valorisée à son coût de revient faute de cotation. Sans cette information, la comparaison réel vs cible du tableau de bord laisserait croire à une précision qu'elle n'a pas.

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

### 3.6 Recommandations de rééquilibrage et alertes

Pour chaque catégorie (géo ou secteur) dont l'écart entre poids réel et poids cible dépasse **2 points**, une **recommandation** est calculée : réduire ou augmenter la catégorie du montant en euros nécessaire pour revenir à la cible. Aucun titre précis n'est recommandé — l'utilisateur reste seul décideur des instruments.

Une **alerte** est un sous-ensemble des recommandations dont l'écart absolu dépasse un **seuil réglable** (par défaut 5 points, modifiable depuis les Réglages) — jamais un recalcul distinct.

Le détail complet (alertes et recommandations, catégorie par catégorie) vit sur l'écran Répartition (`/repartition`, fusionné avec la définition des objectifs — les deux sont deux vues d'un même concept pour une même année) : le Tableau de bord n'affiche plus qu'un **indicateur** résumé (nombre d'actions recommandées, dont nombre d'alertes) avec un lien vers ce détail, pour ne pas encombrer la vue d'ensemble d'une liste pouvant compter plusieurs dizaines de lignes sur un portefeuille peu diversifié. Un enregistrement des objectifs sur cet écran recharge automatiquement le rééquilibrage affiché en dessous, pour refléter les nouvelles cibles sans rechargement manuel.

### 3.7 Multi-compte

Chaque ligne du portefeuille peut être annotée d'un compte (PEA, CTO, ou tout libellé libre saisi par l'utilisateur, à la création ou en édition). Cette annotation est **purement manuelle** : le grand livre de transactions importé (format Trade Republic) ne porte **aucune information de compte**. En conséquence, seule la répartition de la **valeur actuelle** du portefeuille par compte est calculable (affichée sur le Tableau de bord dès qu'au moins une ligne est annotée) — il est **impossible d'en déduire une rentabilité par compte** (XIRR, gains réalisés) : rien dans les données importées ne permet de savoir quelles transactions appartiennent à quel compte. Ce n'est pas une limite technique contournable, c'est une absence structurelle de la donnée source ; l'interface le rappelle explicitement à côté de la répartition par compte.

L'annotation de compte est préservée à travers un nouvel import de transactions : `rebuild_holdings` reporte le compte déjà saisi sur une ligne existante vers la ligne recalculée du même ticker, pour ne pas perdre l'information entre deux imports.

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

Les créations/modifications de position, les objectifs de répartition et la configuration des tâches planifiées sont validées (quantité strictement positive, prix non négatif, pourcentages entre 0 et 100, catégories non dupliquées, intervalle de planification borné...) ; toute violation renvoie une erreur **400** avec un message en français, plutôt qu'une erreur générique ou un plantage silencieux.

L'import d'un relevé de positions est **transactionnel** : une erreur en cours d'import déclenche un rollback explicite, le portefeuille n'est jamais laissé dans un état partiellement vidé. Les colonnes choisies lors du mapping sont vérifiées comme existant réellement dans le fichier avant l'import, pour ne pas produire un import silencieusement vide en cas d'erreur de mapping. Les fichiers importés sont plafonnés en taille (25 Mo) pour éviter d'épuiser la mémoire du process sur un fichier anormalement volumineux.

### 3.11 Patrimoine net global (roadmap Phase 1)

Neuf `type_actif` valorisés **manuellement** (`REAL_ESTATE`, `SCPI`, `LIFE_INSURANCE`, `PENSION`, `CASH_ACCOUNT` (compte courant), `REGULATED_SAVINGS` (Livret A, LDDS, LEP, PEL, CEL...), `EMPLOYEE_SAVINGS` (PEE, PERCO, PER entreprise), `VEHICLE`, et `OTHER_ASSET` pour tout ce qui ne rentre dans aucune autre case — objets de valeur, métaux précieux physiques, parts d'entreprise non cotée hors Private Equity déjà suivi — cf. backlog § 2.M.1) : aucune tentative de cotation automatique n'a de sens pour eux (un bien immobilier n'a pas de ticker coté). Leur valeur vient de `Holding.valeur_estimee` (montant absolu en euros, saisi et mis à jour manuellement — `quantite` reste conventionnellement à 1), distincte de `prix_revient_moyen` qui garde son sens habituel de coût d'acquisition : le rendement depuis achat de ces lignes se calcule donc normalement (`valeur_estimee / prix_revient_moyen − 1`), sans XIRR possible faute d'historique de transactions.

**`Holding.taux_pct`** (backlog § 2.M.1, épargne réglementée/salariale et véhicule) : un pourcentage annuel purement **informatif**, jamais appliqué automatiquement à `valeur_estimee` — positif pour un taux d'intérêt attendu, négatif pour une décote annuelle attendue. Sert uniquement à calculer, côté client, une « valeur projetée dans 1 an » affichée en repère ; l'utilisateur reporte lui-même ce montant dans `valeur_estimee` s'il souhaite l'adopter — même philosophie que la valorisation immobilière datée (jamais de mutation silencieuse d'une donnée financière).

**Premier passif de l'application** : un emprunt (`Loan`) porte un capital initial, un taux annuel, une mensualité, une date de début et une durée. Le capital restant dû est calculé par amortissement standard à taux fixe (`services/loan_service.py`), sauf recalage manuel explicite (`capital_restant_du_manuel`, prioritaire — utile après un remboursement anticipé ou pour recaler sur un relevé bancaire réel, le calcul théorique pouvant dériver du réel avec le temps).

**Deux périmètres volontairement distincts.** Le portefeuille FINANCIER (actions, ETF, crypto, obligations, private equity — `analysis_service.holdings_financiers`) reste seul concerné par le look-through géo/sectoriel, les objectifs et la carte Rentabilité boursière (§ 3.2, § 3.4, § 3.5) : y mélanger un bien immobilier n'aurait pas de sens (pas de géographie/secteur boursier, pas de coût de base dans le grand livre de transactions). Le **patrimoine net global** (`GET /api/patrimoine/net`, `services/patrimoine_service.py`) est une vue **additive** : actifs totaux (portefeuille financier + immobilier/SCPI/assurance-vie/PER/autre actif, valorisés par la même règle que `value_holdings`) moins passifs totaux (somme des capitaux restants dus), avec une répartition par grande classe d'actif. Il n'écrase ni ne remplace les écrans existants.

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
- **dividendes perçus** sur la période seule (même calcul que § 3.13, restreint à l'intervalle) ;
- **cinq plus gros mouvements** de la période, triés par montant absolu (achats, ventes, dividendes, tout type de transaction confondu).

Aucun nouveau calcul de fond : uniquement une agrégation par mois de données déjà exposées ailleurs.

### 3.15 Application installable (PWA, roadmap Phase 3, § H.1)

Le frontend est installable comme une application (icône, plein écran) via un manifeste web et un service worker générés par `vite-plugin-pwa` (Workbox) au moment du build — jamais écrits à la main, pour éviter le piège classique d'un service worker maison qui sert indéfiniment une version périmée. L'API (`/api/*`) est explicitement exclue du cache du service worker (`navigateFallbackDenylist`) : les données financières affichées viennent toujours du backend en direct, jamais d'une réponse mise en cache hors-ligne — seuls les fichiers statiques du build (JS, CSS, icônes) bénéficient du cache.

Au-delà du graphique, un **tableau de détail** (bascule Annuelle/Mensuelle) liste, pour chaque période, les versements de la période, les intérêts gagnés sur la période, le capital de fin de période, le versé cumulé et les intérêts cumulés à date. La vue annuelle et la vue mensuelle partagent la même trajectoire mensuelle sous-jacente (`calculerTrajectoireMensuelle`, agrégée par année via `agregerParAnnee` pour la vue annuelle) : les deux vues, ainsi que le graphique et `calculerTrajectoire` lui-même, ne peuvent donc jamais diverger entre elles. Convention de capitalisation : l'intérêt d'un mois se calcule sur le capital **avant** le versement de ce mois — un versement ne produit son premier intérêt qu'au mois suivant.

### 3.16 Hiérarchie de lecture du tableau de bord (backlog § 2.K.6)

Trois temps : **le chiffre** (`PatrimoineNetCard`, patrimoine net en très grand — jeton `text-display`
du système de design, § 2.K.1 — avec la répartition actifs/passifs juste en dessous), **la courbe**
(`PortfolioHistoryChart`, évolution du portefeuille financier), **le détail** (tout le reste :
indicateurs de risque, répartitions réel vs cible, qualité des données, coût de gestion, répartition
par compte, indicateur de rééquilibrage) regroupé dans un composant repliable générique
(`Disclosure.tsx`, natif `<details>`-like, état persisté dans `localStorage`), ouvert par défaut. Les
deux bandeaux d'accueil (aucune position/aucun objectif défini) restent hors du repliable : ce sont
des appels à l'action, pas de la simple information complémentaire.

**Variation et phrase en langage naturel** sous le chiffre principal (`{signe}{pct}% {libellé
période}`, ex. « +10,0 % depuis le début du suivi ») : calculée sur le **portefeuille financier
suivi** (même série que la courbe juste en dessous, filtrée par la Période transverse, § 2.K.3), pas
sur le patrimoine net lui-même — celui-ci inclut l'immobilier/l'épargne/les dettes, sans historique
daté consolidé disponible pour eux (le sujet du futur P.1, Lot 7). La phrase le précise explicitement
(« portefeuille suivi, hors immobilier/épargne/dettes ») plutôt que de laisser croire à une précision
que le calcul n'a pas — même philosophie de transparence que la qualité des données de répartition
(§ 3.4) ou la valorisation immobilière datée (§ 3.11). `PatrimoineNetCard` et `PortfolioHistoryChart`
partagent un seul appel réseau (`GET /api/performance/history`, coûteux — jusqu'à une minute),
remonté par `DashboardPage` plutôt que chargé en double par les deux composants ; la courbe ne
dépend plus de l'analyse géo/sectorielle (`analysis`/`loading`), elle reste visible même si celle-ci
échoue à charger.

## 4. Modèle de données (tables principales)

| Table | Rôle |
|---|---|
| `transactions` | Grand livre importé (source de vérité), dédoublonné par `transaction_id` |
| `holdings` | Portefeuille reconstruit ou saisi manuellement. `origine` (`manuel` \| `reconstruit`) arbitre le conflit entre saisie manuelle et reconstruction (cf. § 3.1) ; `compte` est l'annotation manuelle de compte (cf. § 3.7) ; `valeur_estimee`/`date_valeur_estimee` portent la valorisation manuelle de la taxonomie élargie (immobilier/SCPI/assurance-vie/PER/comptes/épargne/véhicule, cf. § 3.11) ; `taux_pct` porte le taux annuel informatif (épargne/véhicule, cf. § 3.11) |
| `loans` | Emprunts (patrimoine net, cf. § 3.11) : capital initial, taux, mensualité, date de début, durée, recalage manuel optionnel du capital restant dû |
| `holding_immobilier_details` | Fiche immobilier complète (§ 3.11, backlog § 2.M.3) : bloc location + caractéristiques, un par `Holding` |
| `holding_valuation_history` | Historique daté des valorisations manuelles (§ 3.11, backlog § 2.M.3) — jamais écrasé, générique (pas réservé à l'immobilier) |
| `market_data_cache` | Cache des cours/secteur/pays par position, horodaté. `description` (fonds uniquement, alimentée par `justetf_refresh`, cf. § 3.4) ; `frais_gestion_pct` (fonds uniquement, mis en cache une seule fois par ticker, cf. § 3.9) |
| `fund_composition` | Look-through géo/secteur zone-mappé des fonds (utilisé pour les graphiques/objectifs). `source` (`justetf` \| `composition` \| `indice` \| absente) qualifie l'origine de la donnée (cf. § 3.4) — les lignes `justetf` ne sont recalculées que par `justetf_refresh`, les autres à chaque `market_data_refresh` |
| `fund_composition_brute` | Répartition géo/sectorielle **brute** (non zone-mappée) d'un fonds telle que publiée par justETF, affichage seul sur la fiche détaillée (cf. § 3.4) — jamais utilisée dans un calcul agrégé |
| `fund_top_holdings` | Détail nominatif des ~10 plus grosses lignes de chaque fonds — justETF pour un fonds couvert (2.4), Yahoo Finance en repli sinon |
| `ticker_resolution` | Cache ISIN/symbole → ticker Yahoo Finance |
| `allocation_targets` | Objectifs de répartition géo/sectorielle par année |
| `scheduled_job_config` | Configuration et suivi d'exécution des tâches planifiées |
| `parametres` | Réglages applicatifs génériques clé/valeur (méthode de calcul du coût de revient, seuil d'alerte), exposés par `services/preferences_service.py` ; porte aussi la version des règles de calcul du portefeuille, qui déclenche une reconstruction unique au démarrage après une mise à jour (cf. `services/startup_maintenance.py`) |
| `historique_cache` | Cache persistant (24 h) des séries d'historique de prix coûteuses à recalculer (ligne et portefeuille), cf. § 3.9 |

Aucune vraie clé étrangère : les relations se font par correspondance de `ticker` (identifiant ISIN/symbole), car `holdings` (les lignes d'origine `reconstruit`) est entièrement reconstructible depuis `transactions`. Toute évolution de ce modèle est appliquée automatiquement au démarrage par des migrations non destructives (`ALTER TABLE ADD COLUMN`, `CREATE UNIQUE INDEX`) — voir `MANUEL_EXPLOITATION.md`.

## 5. Limites connues

Voir `BACKLOG.md` pour la liste complète des points relevés à l'audit et leur état de traitement. Limites structurelles assumées, non résolues par construction :

- **Look-through géographique encore partiel.** justETF (2.4) donne la composition réelle des ~4-5 plus grosses lignes par fonds + un résiduel « Autres » agrégé, pas la liste complète (la fiche justETF l'offre via un bouton « Show more » nécessitant une session dynamique côté site, volontairement non reproduite — jugée trop fragile hors navigateur, cf. `services/justetf_service.py`). Pour les fonds hors couverture justETF (réplication synthétique/swap, ETC), l'extrapolation Yahoo Finance ou le repli par indice (§ 3.4) restent des estimations à revoir périodiquement.
- **Dépendance à justETF, sans SLA ni support.** Le look-through complet (2.4) **et désormais le cours de référence des ETF** (§ 3.9) reposent sur une autorisation informelle obtenue directement de justETF, révocable et non garantie dans le temps. Deux comportements différents en cas de blocage/changement de mise en page côté justETF : la **composition** échoue proprement (statut « erreur » de `justetf_refresh` visible dans Réglages) sans perdre les données déjà en base, et une position retombe alors sur la source suivante de la hiérarchie (§ 3.4) ; le **prix** d'un ETF, lui, n'a **aucun repli** (décision utilisateur explicite, § 3.9) — un échec affiche « Cotation indisponible (justETF) » plutôt que de retomber sur Yahoo Finance.
- **Rentabilité par compte non calculable.** Cf. § 3.7 : le compte est une annotation manuelle, le grand livre importé ne porte aucune information de compte. Ce n'est pas un chantier reporté, c'est une absence structurelle de la donnée source.
- **Aucune simulation fiscale.** L'application suit la performance d'un portefeuille, elle ne modélise ni le régime PEA (durée de détention, plafond de versement), ni aucune autre fiscalité. Non-objectif produit assumé (point 5.7 du backlog).
- **Authentification multi-utilisateur avec rôles (propriétaire/membre/invité), verrouillage de connexion, sessions révocables et journal d'accès (backlog 2.L.2).** Reste néanmoins à compléter avant une exposition réellement publique hors homelab : pas de second facteur (TOTP), jeton transporté en en-tête `Authorization` (pas encore un cookie `Secure`/`SameSite=Strict`), HTTPS/reverse proxy hors du dépôt (responsabilité de l'exploitant, cf. `docs/MANUEL_EXPLOITATION.md` §12).
- **Dépendance à Yahoo Finance (`yfinance`), sans SLA officiel.** Les garde-fous de fréquence (§ 3.9) réduisent le risque de blocage mais ne l'éliminent pas ; une indisponibilité ou une limitation côté Yahoo Finance dégrade la fraîcheur des données sans faire échouer l'application (chaque position est traitée indépendamment, une erreur reste locale à la ligne concernée).
- **Un seul format de courtier reconnu automatiquement (Trade Republic).** D'autres exports (Boursorama, Degiro, Interactive Brokers...) passent par le mapping manuel de colonnes (relevé de positions), jamais par la reconstruction depuis un grand livre — élargir cette reconnaissance suppose un vrai fichier d'export d'un autre courtier comme référence, indisponible à ce jour (roadmap Phase 3, § E.1, backlog).
- **Pas de projection des dividendes futurs.** Le calendrier (§ 3.13) et le rapport récapitulatif (§ 3.14) ne montrent que des dividendes déjà perçus : `yfinance` n'expose pas de façon fiable la régularité de versement par ligne, en particulier pour les ETF — extrapoler sans cette fiabilité risquerait d'afficher un montant qui n'est pas garanti (roadmap Phase 4, § C.2, backlog).
