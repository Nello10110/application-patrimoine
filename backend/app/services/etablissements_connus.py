"""Domaine officiel de chaque établissement du catalogue (retour utilisateur du
05/09/2026 : « avoir les logos à jour »), utilisé par `logo_service` pour aller
chercher le logo réel sur le site de l'établissement lui-même.

Pourquoi le site officiel plutôt qu'une banque d'icônes tierce : la piste
initialement proposée (dashboardicons.com) a été vérifiée avant d'être écartée —
sur les 14 établissements envisagés, seuls Revolut et N26 y existent, et le set
entier ne contient aucune entrée « bank/banque/bourse/broker/agricole/paribas… ».
C'est un catalogue pensé pour les applications auto-hébergées, pas pour les
banques européennes. Le favicon/apple-touch-icon du site officiel, lui, existe
pour tous, ne dépend d'aucun tiers et ne signale à personne quelles banques le
foyer utilise.

Les CLÉS doivent rester identiques à celles de `frontend/src/utils/etablissementsConnus.ts`
(qui porte, lui, le nom affiché, la couleur et les initiales du badge de repli).
Une clé présente côté frontend mais absente ici ne casse rien : elle n'a
simplement pas de récupération automatique, et garde son badge généré.
"""

# Domaines vérifiés un par un en conditions réelles le 05/09/2026 : 11 des 12
# rendent bien une icône exploitable. Seul BNP Paribas répond 403 à tout (protection
# anti-robot, y compris sur `/favicon.ico`) — sans conséquence, il garde simplement
# son badge généré tant que l'utilisateur ne lui fournit pas une image lui-même.
# `societe_generale` pointe vers le sous-domaine particuliers : le domaine racine ne
# répond pas, et `www.` non plus.
DOMAINES: dict[str, str] = {
    "trade_republic": "traderepublic.com",
    "boursorama": "boursobank.com",
    "bourse_direct": "boursedirect.fr",
    "degiro": "degiro.fr",
    "interactive_brokers": "interactivebrokers.com",
    "saxo": "home.saxo",
    "fortuneo": "fortuneo.fr",
    "bforbank": "bforbank.com",
    "credit_agricole": "credit-agricole.fr",
    "societe_generale": "particuliers.societegenerale.fr",
    "bnp_paribas": "mabanque.bnpparibas",
    "caisse_epargne": "caisse-epargne.fr",
}


def domaine_pour(logo_key: str | None) -> str | None:
    if not logo_key:
        return None
    return DOMAINES.get(logo_key)
