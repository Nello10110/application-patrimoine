# Backlog — évolutions futures

Fonctionnalités manquantes et évolutions pertinentes, non implémentées à ce jour. Aucun ordre de priorité imposé.

## Fiabilité / qualité

- **Tests automatisés** : aucun test auto aujourd'hui — toute la validation s'est faite manuellement (recoupement des chiffres en base, contrôle visuel dans le navigateur) tout au long du développement. Prioriser les tests sur `portfolio_reconstruction.py` (coût moyen pondéré) et `performance_service.py` (XIRR), les plus sensibles aux régressions silencieuses.
- **Cache de l'historique de prix par ligne** : `historical_performance_service.compute_holding_price_history` retélécharge tout l'historique `yfinance` à chaque ouverture de la fiche détaillée d'une position ; un cache horodaté (façon `MarketDataCache`) éviterait des appels réseau répétés.

## Précision des données

- **Look-through géographique des ETF au-delà du top 10** : actuellement une extrapolation des ~10 plus grosses lignes du fonds à 100 % de sa valeur (cf. `SPECIFICATIONS_FONCTIONNELLES.md` §3.4). Une source de données donnant la composition géographique complète améliorerait la précision, en particulier pour les fonds très diversifiés.
- **Méthode FIFO en option** : le coût de base est calculé en coût moyen pondéré uniquement ; proposer FIFO comme alternative pourrait mieux correspondre à certains cadres fiscaux.

## Fonctionnalités

- **Multi-portefeuille / multi-compte** : l'application ne distingue pas PEA/CTO/autres comptes dans les calculs (le champ `compte` existe sur `Holding` mais n'est pas exploité pour du reporting séparé).
- **Export CSV/PDF** : aucun export des positions, transactions ou rapports de performance à ce jour.
- **Alertes sur écart aux objectifs** : les recommandations de rééquilibrage sont uniquement consultées à la demande (Tableau de bord) ; une notification proactive au-delà d'un seuil pourrait être ajoutée.
- **Spécificités fiscales PEA** : aucune prise en compte de la fiscalité (plus-values, durée de détention, plafond de versement) — l'application est un outil de suivi de performance, pas de simulation fiscale.
- **Sélecteur d'année basé sur les années réellement enregistrées** (Objectifs) : le sélecteur propose actuellement année précédente/courante/suivante ; l'endpoint `GET /api/targets/` (années ayant des objectifs enregistrés) existe côté backend mais n'est pas encore exploité côté frontend.
- **Mode sombre**.

## Sécurité

- **Authentification** : l'application n'a pas de notion d'utilisateur ni de mot de passe, en cohérence avec un usage 100 % local. Nécessaire si l'application devait un jour être exposée au-delà de `localhost`.
