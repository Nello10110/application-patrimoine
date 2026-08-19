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
| Immobilier | Oui, valorisation automatique estimée | Absent | Nouveau (§ 2.A) |
| SCPI, assurance-vie, PER | Oui, synchronisé | Absent | Nouveau (§ 2.A) |
| Métaux précieux | Oui | Partiel (via ETF/ETC or, ex. `IE00B4ND3602`) | Cas générique manquant (§ 2.A) |
| Actifs alternatifs (art, montres, voitures, private equity) | Oui | Private Equity seul (déjà suivi, coût de revient) | Catégorie « autre actif » manuelle manquante (§ 2.A) |
| Dettes / emprunts | Oui | Absent | Nouveau (§ 2.A) |
| Synchronisation bancaire automatique | Oui, 10 000-20 000 établissements (Powens/Budget Insight, Plaid) | Non — import CSV du grand livre de transactions | Écart structurel, coût commercial (§ 2.E, § 3) |
| Répartition géo/sectorielle | Oui, par pays/secteur/segment | Oui — look-through justETF + yfinance, déjà audité (Increment 8/9) | Équivalent, voire plus transparent (qualité des données affichée explicitement) |
| Score de diversification | Oui (plan payant) | Oui, déjà gratuit chez nous | Déjà en avance |
| Calendrier des dividendes | Oui (reçus/confirmés/projetés, plan payant) | Dividendes perçus déjà suivis, pas de vue calendrier/projection | Nouveau (§ 2.C) |
| Projection patrimoniale (« Predict »expr) / indépendance financière | Oui, jusqu'à 30 ans (plan Plus) | Absent | Nouveau (§ 2.B) |
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

#### A.1 — `majeur` · `L` · `P0` · `non traité` — Immobilier

Nouveau `type_actif = "REAL_ESTATE"`. Saisie manuelle (adresse ou libellé, valeur estimée, date de
la dernière estimation, éventuel crédit associé — cf. A.3). Pas de valorisation automatique en v1
(aucune source gratuite fiable identifiée pour de l'estimation immobilière à l'échelle d'un bien
précis — voir § 3 pour ce qui a été écarté). L'utilisateur met à jour la valeur manuellement,
comme il le fait déjà pour le Private Equity.

#### A.2 — `majeur` · `M` · `P0` · `non traité` — SCPI, assurance-vie, PER

Trois nouveaux `type_actif` (`SCPI`, `LIFE_INSURANCE`, `PENSION`). Même traitement que
`PRIVATE_FUND` aujourd'hui : valorisation manuelle périodique (ces supports publient une valeur de
part trimestrielle ou mensuelle, pas de cours quotidien), pas de tentative de cotation automatique.

#### A.3 — `majeur` · `M` · `P0` · `non traité` — Dettes et emprunts

Nouveau modèle `Loan` (libellé, capital initial, taux, mensualité, date de début/fin, capital
restant dû). Le capital restant dû se **soustrait** de la valeur totale du patrimoine (Finary
l'appelle le patrimoine « net » — c'est la vraie mesure d'un patrimoine, pas juste la somme des
actifs). Amortissement calculé (formule standard, pas de saisie manuelle mensuelle) avec possibilité
de recaler manuellement le capital restant dû si l'échéancier théorique dérive du réel.

#### A.4 — `mineur` · `S` · `P1` · `non traité` — Catégorie « autre actif » générique

Pour ce qui ne rentre dans aucune case (objets de valeur, métaux précieux physiques hors ETC, parts
d'entreprise non cotée hors Private Equity déjà suivi). Un `type_actif = "OTHER_ASSET"` avec libellé
libre et valorisation manuelle, sur le même modèle que A.1/A.2 — pas une nouvelle mécanique, juste
une catégorie de plus qui réutilise ce qui vient d'être construit en A.1-A.3.

### B. Projections et indépendance financière

#### B.1 — `majeur` · `M` · `P1` · `non traité` — Simulateur de patrimoine (équivalent « Predict »)

Projection de la valeur du patrimoine à 5/10/20/30 ans, à partir d'hypothèses réglables (rendement
annuel moyen, épargne mensuelle ajoutée). Calcul pur (intérêts composés + apports réguliers), aucune
dépendance externe, aucun nouvel appel réseau — un simple écran de calcul sur les données déjà en
base (valeur actuelle du patrimoine net, une fois A.1-A.3 livrés).

#### B.2 — `majeur` · `S` · `P1` · `non traité` — Indépendance financière (FIRE)

À partir d'une dépense annuelle cible saisie par l'utilisateur et d'un taux de retrait (4 % par
défaut, modifiable — le taux « règle des 4 % » est un choix méthodologique documenté, pas une vérité
universelle, à présenter comme tel), calcule le patrimoine nécessaire et, combiné à B.1, une date
d'atteinte estimée. Réutilise directement le moteur de B.1.

### C. Dividendes et revenus

#### C.1 — `mineur` · `S` · `P2` · `non traité` — Calendrier des dividendes perçus

Vue chronologique des dividendes déjà perçus (donnée déjà en base via les transactions
`CASH/DIVIDEND`), groupée par mois — aucune nouvelle donnée à récupérer, juste une nouvelle vue sur
l'existant.

#### C.2 — `mineur` · `M` · `P2` · `non traité` — Projection des dividendes à 12 mois

Plus délicat : extrapoler les dividendes futurs suppose de connaître la régularité de versement de
chaque ligne (annuel, trimestriel...) et le montant par part, que `yfinance` expose partiellement
(`dividendRate`, historique de dividendes par ticker) mais pas pour les ETF de façon fiable. À
cadrer avant de s'engager : projection **approximative**, affichée comme telle (même philosophie que
la qualité des données géographiques déjà en place), pas une promesse de montant exact.

### D. Rapports et exports

#### D.1 — `mineur` · `M` · `P2` · `non traité` — Relevé de patrimoine PDF

Export d'une photographie du patrimoine à une date donnée (répartition par classe d'actif, par
compte, gains/pertes) en PDF mis en forme — au-delà des trois CSV déjà exportables. Génération
côté backend (`reportlab`, déjà utilisé dans l'écosystème Python, aucune dépendance lourde).

#### D.2 — `mineur` · `S` · `P3` · `non traité` — Rapport périodique consultable

Équivalent du « rapport mensuel » Finary, mais sans envoi (l'application n'a pas de serveur mail) :
une page récapitulative du mois écoulé (évolution, plus gros mouvements, dividendes perçus),
générée à la demande plutôt que poussée automatiquement.

### E. Agrégation, import et frais

#### E.1 — `mineur` · `M` · `P2` · `non traité` — Élargir les formats de courtier reconnus

Le format Trade Republic est reconnu automatiquement ; d'autres courtiers (Boursorama, Degiro,
Interactive Brokers...) devraient passer par le mapping manuel déjà existant pour un relevé de
positions, mais pas par la reconstruction depuis un grand livre de transactions (réservée au format
Trade Republic). Ajouter la détection automatique d'un second ou troisième format d'export courant
élargirait qui peut utiliser l'application sans y toucher.

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

#### E.3 — `mineur` · `S` · `P2` · `non traité` — Coût total annualisé consolidé

Le TER de chaque fonds est déjà récupéré (`fetch_holding_extra_info`, pas mis en cache) ; un
indicateur consolidé (coût de gestion annuel total en euros, pondéré par la valeur de chaque ligne)
donnerait une vue immédiate du "combien ça coûte de détenir ce portefeuille" — sur le modèle du
scanner de frais Finary, mais sans les frais bancaires (que nous n'avons pas).

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
considérer que si l'usage de l'application dépasse un seul foyer/personne.

### H. Qualité de vie et accès mobile

#### H.1 — `mineur` · `M` · `P2` · `non traité` — Application installable (PWA)

Rendre le frontend installable comme une application (icône, plein écran, fonctionne hors ligne
pour les données déjà chargées) via un manifest + service worker — gratuit, pas de store, pas de
build natif à maintenir. Se rapproche de l'usage mobile de Finary sans le coût d'une vraie
application native.

---

## 3. Hors périmètre (assumé)

- **Fiscalité PEA** (ex-§ 5.7 de l'audit archivé) : inchangé, l'application reste un outil de suivi
  de performance, pas un simulateur fiscal.
- **Authentification** (ex-§ 7.7) : reste hors périmètre tant que l'usage est mono-utilisateur et
  local. Redeviendrait un **préalable bloquant** (pas un point de confort) si le multi-utilisateur
  (§ 2.G) est un jour retenu — à rouvrir explicitement à ce moment-là, pas avant.
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
   Rien du reste (projections, rapports) n'a de sens tant que le patrimoine affiché n'inclut pas
   l'essentiel de ce qu'un ménage possède réellement.
2. **P1 — Ce que le patrimoine permet** : B.1 (simulateur), B.2 (FIRE), A.4 (catégorie libre).
   Se construit directement sur P0.
3. **P2 — Confort et transparence** : C.1 (calendrier dividendes), D.1 (PDF), E.1 (formats
   courtier), E.3 (coût consolidé), H.1 (PWA).
4. **P3 — Chantiers plus lourds ou à trancher d'abord** : C.2 (projection dividendes, précision
   incertaine), D.2 (rapport périodique), E.2 (agrégation bancaire, à instruire avant tout code),
   F.1 (budget, décision de scope préalable), G.1 (partage, dépend de l'authentification).

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
