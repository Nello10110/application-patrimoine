# Spécifications fonctionnelles — Outil Bourse

## 1. Périmètre

Application web locale et mono-utilisateur de suivi de portefeuille boursier. Elle permet de :

1. reconstruire automatiquement le portefeuille réel à partir d'un export d'historique de transactions (courtier Trade Republic et compatibles) ;
2. enrichir chaque position avec des données de marché (cours, secteur, pays, composition des ETF) via Yahoo Finance (`yfinance`) ;
3. définir des objectifs de répartition géographique et sectorielle par année, et visualiser les écarts avec le portefeuille réel ;
4. calculer la rentabilité globale et par ligne (gain/perte, rendement annualisé money-weighted) ;
5. proposer des actions de rééquilibrage mécaniques (aucun conseil sur des titres précis) ;
6. planifier le rafraîchissement automatique des données de marché.

L'application ne fournit **aucun conseil en investissement personnalisé** : les objectifs de répartition sont définis par l'utilisateur lui-même, les recommandations ne portent que sur des catégories (zone géographique, secteur), jamais sur un titre à acheter ou vendre.

## 2. Écrans

| Écran | Route | Rôle |
|---|---|---|
| Tableau de bord | `/` | Vue d'ensemble : évolution du portefeuille, rentabilité globale, répartition réel vs cible, indicateurs de risque, recommandations |
| Portefeuille | `/portefeuille` | Liste des positions, filtrage par catégorie d'actif, ajout manuel, accès à la fiche détaillée |
| Fiche détaillée | `/portefeuille/:ticker` | Détail d'une position : valorisation, rendement, émetteur/résumé, look-through géo/secteur, historique de prix |
| Objectifs | `/objectifs` | Définition des cibles de répartition géo/sectorielle par année |
| Import | `/import` | Import de l'historique de transactions ou d'un relevé de positions |
| Réglages | `/reglages` | Configuration des tâches planifiées (rafraîchissement automatique) |

## 3. Règles métier

### 3.1 Reconstruction du portefeuille (coût moyen pondéré)

Le portefeuille n'est pas saisi manuellement : il est **entièrement recalculé** à partir du grand livre de transactions importé (`services/portfolio_reconstruction.py`), traité chronologiquement par symbole :

- **Achat** (`TRADING/BUY`) : quantité et coût de base augmentent (coût = montant + frais + taxes).
- **Vente** (`TRADING/SELL`) : la quantité vendue est retirée au coût moyen pondéré du moment ; le gain réalisé (`produit net − coût retiré`) est cumulé séparément.
- **Investissement en fonds non coté** (`CASH/PRIVATE_MARKET_BUY`, Private Equity) : traité comme 1 part = 1 € investi, faute de cotation.
- **Opérations sur titres** (splits, actions gratuites, migrations, fusions, `WORTHLESS`...) : ajustent uniquement la quantité, à coût nul (ces mouvements s'équilibrent historiquement à ~0 par titre chez ce type de courtier).
- **Dividendes** (`CASH/DIVIDEND`) : le champ quantité de ces lignes est une information de référence (nombre de titres détenus à la date de détachement), jamais additionné à la position.

Une position dont la quantité retombe à ~0 disparaît du portefeuille (pas de ligne à quantité nulle affichée).

### 3.2 Exclusion des mouvements hors bourse

Seule l'activité **boursière** est suivie. Sont exclus dès le parsing de l'import (jamais stockés en base) :

- les mouvements de carte bancaire (`CARD_TRANSACTION`, `CARD_TRANSACTION_INTERNATIONAL`, `CARD_ORDERING_FEE`, ou toute ligne portant un `mcc_code`) ;
- les virements avec la banque : dépôts/retraits sur le compte courant (`TRANSFER_IN/OUT`, `TRANSFER_INBOUND`, `TRANSFER_INSTANT_INBOUND`, `CUSTOMER_INBOUND`, `CUSTOMER_INPAYMENT`, `CUSTOMER_OUTBOUND_REQUEST`).

Conséquence : l'application ne calcule ni « solde de cash », ni « net investi » au sens bancaire — uniquement un « coût total investi » basé sur les achats de titres.

### 3.3 Taxonomie des catégories d'actifs

Chaque position a un `type_actif` (issu de `asset_class` dans le grand livre) : `STOCK` (action), `FUND` (ETF/fonds), `CRYPTO`, `BOND` (obligation), `PRIVATE_FUND` (private equity), ou `null` (saisie manuelle). L'écran Portefeuille filtre sur : Tous / Actions / ETF / Crypto / Autres (regroupe obligations, private equity et non renseigné).

### 3.4 Look-through géographique et sectoriel des ETF

Un ETF n'a pas de pays/secteur unique. Sa contribution à la répartition du portefeuille est éclatée selon sa composition interne (`FundComposition`, recalculée à chaque rafraîchissement — jamais figée) :

- **Secteur** : couverture quasi complète, directement fournie par Yahoo Finance (`funds_data.sector_weightings`).
- **Géographie** : **approximation** — le pays de chacune des ~10 plus grosses lignes du fonds (`funds_data.top_holdings`) est résolu individuellement, puis ces poids sont extrapolés à 100 % du fonds. C'est une limite connue (cf. `BACKLOG.md`), signalée dans l'interface.

Une position sans composition disponible (fonds non couvert, ex. ETC matières premières, action individuelle) reste classée sur son propre pays/secteur, ou « Non catégorisé » si l'un ou l'autre est inconnu.

### 3.5 Rentabilité

- **Rendement depuis achat** (par ligne) : `prix actuel / prix de revient moyen − 1`, disponible dès qu'un prix de revient et un prix actuel existent (y compris les lignes saisies manuellement).
- **Rendement annualisé** (par ligne et pour le portefeuille) : XIRR (money-weighted), calculé par bissection sur les flux de trésorerie réels (achats en négatif, ventes en positif, valeur actuelle en positif à la date du jour). Non disponible pour une ligne sans historique de transactions (pas de date d'achat connue), ni quand la ligne n'a pas de prix de marché réel (évite un XIRR trompeur basé sur une valorisation au coût).
- **Gain/perte total** (portefeuille) = gains latents + gains réalisés + dividendes perçus + intérêts perçus − frais payés.

### 3.6 Recommandations de rééquilibrage

Pour chaque catégorie (géo ou secteur) dont l'écart entre poids réel et poids cible dépasse 2 points, une action est proposée : réduire ou augmenter la catégorie du montant en euros nécessaire pour revenir à la cible. Aucun titre précis n'est recommandé — l'utilisateur reste seul décideur des instruments.

### 3.7 Rafraîchissement automatique

Une tâche planifiée (`market_data_refresh`, APScheduler) rafraîchit prix, composition ETF et principales lignes sous-jacentes de toutes les positions, à intervalle configurable (1h à 48h) depuis l'écran Réglages. Déclenchement manuel possible à tout moment.

## 4. Modèle de données (tables principales)

| Table | Rôle |
|---|---|
| `transactions` | Grand livre importé (source de vérité), dédoublonné par `transaction_id` |
| `holdings` | Portefeuille reconstruit (ou saisi manuellement) |
| `market_data_cache` | Cache des cours/secteur/pays par position, horodaté |
| `fund_composition` | Look-through géo/secteur des ETF (recalculé à chaque rafraîchissement) |
| `fund_top_holdings` | Détail nominatif des ~10 plus grosses lignes de chaque ETF |
| `ticker_resolution` | Cache ISIN/symbole → ticker Yahoo Finance |
| `allocation_targets` | Objectifs de répartition géo/sectorielle par année |
| `scheduled_job_config` | Configuration des tâches planifiées |

Aucune vraie clé étrangère : les relations se font par correspondance de `ticker` (identifiant ISIN/symbole), car `holdings` est entièrement reconstructible depuis `transactions`.

## 5. Limites connues

Voir `BACKLOG.md` pour la liste complète des évolutions envisagées. Limites structurelles actuelles :

- Look-through géographique des ETF basé sur une approximation top-10 (pas la composition complète).
- Aucun test automatisé (validation manuelle systématique tout au long du développement).
- Historique de prix par ligne recalculé à chaque ouverture de la fiche détaillée (pas de cache).
- Application 100 % locale, sans authentification (non prévue pour être exposée hors `localhost`).
