# Manuel utilisateur — Application Patrimoine

## Prise en main

Deux façons de peupler le portefeuille :

1. **Import de l'historique de transactions** (recommandé) : export complet du courtier (achats, ventes, dividendes...), le portefeuille est intégralement recalculé depuis cet historique.
2. **Saisie manuelle ou relevé de positions** : ajout ligne par ligne, ou import d'un fichier CSV/Excel avec mapping des colonnes.

Parcours type conseillé :

1. Importer son historique de transactions (écran **Import**).
2. Rafraîchir les cours (bouton sur l'écran **Portefeuille**, ou automatiquement via **Réglages**).
3. Définir ses objectifs de répartition pour l'année (écran **Objectifs**).
4. Consulter le **Tableau de bord** pour voir l'écart réel/cible, les alertes et les recommandations.

Un bouton en haut à droite de chaque écran bascule l'apparence entre thème clair, thème sombre et suivi automatique du système (un clic fait passer de l'un à l'autre) ; le choix est mémorisé d'une visite à l'autre.

**Installer l'application** : depuis un navigateur compatible (Chrome, Edge, ou Safari via « Ajouter à l'écran d'accueil » sur iPhone/iPad), l'icône d'installation dans la barre d'adresse (ou le menu du navigateur) ajoute l'application comme une icône dédiée, ouverte en plein écran — pas de store, pas d'installation à maintenir, juste le navigateur qui la sert comme une application native.

## Écran Import

### Historique de transactions

Section du haut. Accepte un export CSV au format reconnu automatiquement (format Trade Republic et compatibles). Aucun mapping à faire.

Le résumé affiché après import indique : nombre de transactions importées, doublons déjà présents ignorés (ré-import sans risque), mouvements hors suivi boursier exclus (carte bancaire, virements bancaires), et positions recalculées. Si le grand livre contient des ventes sans achat correspondant, une anomalie est signalée ici (la position concernée n'apparaît alors pas dans le portefeuille). Si une ligne saisie manuellement portait le même identifiant qu'une position reconstruite par cet import, c'est aussi indiqué : le grand livre fait foi, la ligne manuelle a été remplacée.

### Relevé de positions

Section du bas. Pour un simple export de positions (pas un historique de mouvements). Après upload, un aperçu du fichier s'affiche : associer les colonnes du fichier aux champs attendus (Ticker et Quantité obligatoires ; Nom, Prix de revient, Compte, Devise optionnels), puis confirmer. La case « Remplacer les lignes déjà saisies ou importées manuellement » permet de repartir de zéro sur ces lignes-là uniquement ; les positions issues d'un historique de transactions ne sont jamais touchées par cette case.

## Écran Portefeuille

Tableau des positions avec, pour chaque ligne : quantité, prix actuel, valeur, rendement depuis achat, rendement annualisé, secteur, pays. Une ligne saisie manuellement porte une étiquette « saisie manuelle ».

- **Trier** : cliquer sur l'en-tête d'une colonne (ticker, nom, quantité, prix actuel, valeur, rendement depuis achat, rendement annualisé) trie le tableau selon cette colonne ; un second clic inverse le sens. Une valeur inconnue (« — ») se retrouve toujours en fin de liste.
- **Total** : en bas du tableau, le nombre de positions affichées et la somme de leur valeur — recalculés selon les filtres actifs (catégorie, compte).
- **Filtrer** : les onglets au-dessus du tableau filtrent par catégorie (Actions / ETF / Obligations / Private Equity / Crypto / **Immobilier & Épargne** / Autres) ; un sélecteur « Filtrer par compte » (visible dès qu'au moins une ligne porte un compte) filtre en plus par l'annotation de compte.
- **Fraîcheur des cours** : à côté du bouton de rafraîchissement, la date/heure du cours le plus ancien parmi les positions cotées. Affichée en orange si elle date de plus de 48 heures.
- **Cliquer sur une ligne** ouvre la fiche détaillée de la position (en fenêtre superposée).
- **Modifier une ligne** : le bouton « Modifier » ouvre une édition en ligne (quantité, prix de revient, compte, type d'actif, valeur estimée) sans quitter le tableau ; « Enregistrer » valide, « Annuler » abandonne. Une saisie invalide (ex. quantité négative) affiche l'erreur sans perdre le reste de la saisie en cours.
- **Supprimer une ligne** : le bouton « Supprimer » ouvre une confirmation avant suppression définitive.
- **Rafraîchir les cours** relance la récupération des données de marché pour tout le portefeuille. L'opération s'exécute en tâche de fond : le bouton affiche sa progression (« x / y positions ») et le tableau se met à jour tout seul une fois terminé, sans bloquer le reste de l'écran.
- **Ajouter une ligne manuellement** : formulaire au-dessus du tableau (ticker, quantité, prix de revient, compte, type d'actif, valeur estimée) — pour une position hors historique de transactions (ex. actif détenu ailleurs). Pour l'immobilier, une SCPI, une assurance-vie, un PER ou tout autre actif hors marché (objet de valeur, métal précieux physique...) : laisser Quantité à 1 et renseigner **Valeur estimée** plutôt que Prix de revient — elle remplace le calcul prix × quantité et se met à jour à la main, périodiquement ; Prix de revient garde alors son sens habituel (montant investi à l'origine), ce qui permet de voir le gain latent depuis l'achat.

### Dettes et emprunts

Carte sous le tableau des positions, indépendante des filtres ci-dessus. Chaque emprunt porte un libellé, un capital initial, un taux annuel, une mensualité, une date de début et une durée en mois ; le **capital restant dû** est calculé automatiquement (amortissement à taux fixe). Le bouton **Recaler** permet de le corriger à la main d'après un relevé bancaire réel (après un remboursement anticipé, par exemple) — le recalage prime alors sur le calcul théorique jusqu'à un nouveau recalage. **Supprimer** retire définitivement un emprunt, après confirmation.

## Fiche détaillée d'une position

Accessible en cliquant sur une ligne du Portefeuille, sur un camembert du Tableau de bord, ou directement par son adresse (`/portefeuille/TICKER`) — un lien « Ouvrir en pleine page » dans la fenêtre superposée y conduit également. Affiche :

- valorisation (quantité, prix de revient, prix actuel, valeur), rendement depuis achat et rendement annualisé (avec une explication à l'écran quand ce dernier est indisponible : moins de 90 jours de détention, ou pas d'historique exploitable) ;
- émetteur et résumé d'activité — pour une action (Yahoo Finance) comme pour un fonds (description en français de sa fiche justETF, quand disponible) — frais de gestion annuels et frais de transaction cumulés (pour les fonds) ;
- graphique de performance historique du titre (prix, volatilité annualisée, perte maximale/drawdown) ;
- pour un fonds : deux camemberts (répartition géographique et sectorielle interne, par grande zone/catégorie) et le tableau des ~10 plus grosses lignes sous-jacentes (nom et poids, via justETF pour un fonds couvert ou Yahoo Finance sinon), quand cette donnée est disponible ;
- pour un fonds couvert par justETF : une **répartition détaillée** supplémentaire, avec les intitulés exacts publiés par justETF (ex. « Inde » plutôt que « Marchés émergents ») — en complément des deux camemberts par zone/catégorie, pas à leur place.

Une action individuelle ou une crypto n'affiche pas de camembert de composition (pas de décomposition interne pour un titre unique).

## Écran Objectifs

Sélectionner une année dans la liste (alimentée par les années réellement enregistrées), ou en ajouter une nouvelle par le champ dédié, puis ajuster les pourcentages cibles de répartition géographique et sectorielle (pré-remplis avec une répartition de référence à la première utilisation d'une année). Chaque catégorie peut être modifiée, supprimée, ou une nouvelle ajoutée. Le total doit sommer à 100 % (indiqué en vert quand c'est le cas). **Enregistrer** sauvegarde les objectifs de l'année sélectionnée.

## Écran Simulateur

Projette le patrimoine net actuel dans le temps — une **hypothèse**, pas une promesse : les marchés ne progressent jamais de façon aussi régulière dans la réalité.

- **Hypothèses** : rendement annuel moyen (%, peut être négatif pour un scénario pessimiste), épargne mensuelle ajoutée (€), horizon (boutons 5/10/20/30 ans). Le graphique se met à jour automatiquement après un court délai à chaque changement.
- **Indépendance financière (FIRE)** : renseigner une dépense annuelle cible et un taux de retrait (4 % par défaut — la « règle des 4 % », un choix méthodologique parmi d'autres, pas une vérité universelle, librement modifiable) affiche le patrimoine nécessaire pour vivre de ce patrimoine, et le délai estimé pour l'atteindre avec les mêmes hypothèses de rendement/épargne que ci-dessus. Au-delà de 60 ans de projection, le résultat affiche « Non atteinte » plutôt qu'un nombre d'années trop lointain pour être fiable.

## Écran Dividendes

Calendrier des dividendes déjà perçus : un total en tête, un graphique en barres par mois, puis la liste des mois (les plus récents en premier) — cliquer sur un mois déplie le détail des lignes qui l'ont composé (date, titre, montant net). Ne montre que des montants déjà perçus, jamais une projection future.

## Écran Rapport

Rapport récapitulatif d'un mois choisi via le sélecteur en haut à droite (par défaut, le mois en cours) : valeur du portefeuille en fin de mois, évolution sur le mois (en vert si positive, en rouge sinon), dividendes perçus, et les cinq mouvements les plus importants du mois (achats, ventes...). Généré à la demande à chaque changement de mois — rien n'est envoyé par courriel, l'application n'a pas de serveur mail.

## Tableau de bord

- **Patrimoine net** : en tout premier sur l'écran, distinct du reste (indépendant de l'année sélectionnée) — actifs totaux (portefeuille financier + immobilier/SCPI/assurance-vie/PER), passifs (somme des emprunts), patrimoine net, et une répartition par grande classe d'actif. N'apparaît pas tant qu'aucun actif ni passif n'est enregistré.
- **Sélecteur d'année**, en haut à droite : change l'année de comparaison réel/cible sur tout l'écran (répartitions, recommandations, alertes), sans toucher à la rentabilité globale ni à la répartition par compte, indépendantes de l'année. Le bouton **Actualiser** recharge toutes les données de l'écran.
- **Bandeau d'alertes** : apparaît en haut de l'écran dès qu'un écart entre répartition réelle et objectif dépasse le seuil réglé dans les Réglages (5 points par défaut), avec le détail de chaque écart concerné.
- **Évolution du portefeuille** : graphique avec sélecteur d'échelle et un mode étagé qui distingue le capital investi des gains cumulés.
- **Rentabilité globale** : valeur totale, coût total investi, gain/perte total et rendement associé, rendement annualisé (money-weighted), dividendes perçus (net), intérêts perçus (net), autres revenus, frais payés, impôts prélevés, gains réalisés. Frais et impôts sont affichés à titre informatif : ils sont déjà pris en compte dans le calcul du gain/perte, pas resoustraits une seconde fois.
- **Répartition géographique/sectorielle — réel vs cible** : deux graphiques en barres. Cliquer sur une barre ouvre le détail des lignes qui composent cette catégorie.
- **Qualité des données** : encart qui apparaît sous les graphiques de répartition dès qu'une partie du portefeuille n'est pas mesurée avec certitude — répartition géographique estimée à partir de l'indice suivi par un fonds (faute de composition détaillée), donnée totalement manquante, ou position valorisée à son coût de revient faute de cotation. N'apparaît pas si tout le portefeuille est couvert par une donnée réelle et coté.
- **Coût de gestion annuel estimé** : n'apparaît que si au moins un fonds/ETF est détenu. Coût annuel en euros (somme des frais de gestion de chaque fonds pondérés par sa valeur), avec la part du portefeuille en fonds pour laquelle ce frais est réellement connu — ce frais n'est récupéré qu'une fois par fonds, au fil des rafraîchissements, donc la couverture peut rester partielle un moment après l'ajout d'un nouveau fonds ; le message le rappelle explicitement tant qu'elle n'atteint pas 100 %.
- **Répartition par compte** : n'apparaît que si au moins une ligne porte une annotation de compte. Rappelle explicitement qu'aucune rentabilité par compte n'est calculable, seule la valeur actuelle l'est (le grand livre importé ne porte aucune information de compte).
- **Indicateurs de risque** : score de diversification, poids de la plus grosse ligne, concentration géographique.
- **Actions de rééquilibrage recommandées** : liste des écarts significatifs (> 2 points) entre réel et cible, avec le montant à ajuster. Un sous-ensemble de ces écarts, ceux qui dépassent le seuil d'alerte, est repris dans le bandeau d'alertes en haut de l'écran.

## Écran Réglages

### Préférences

- **Méthode de calcul du coût de revient** : coût moyen pondéré (par défaut) ou FIFO (premier entré, premier sorti). Changer de méthode recalcule immédiatement le prix de revient et les gains réalisés de tout le portefeuille ; le nombre de positions recalculées est affiché après le changement.
- **Alertes** : seuil d'écart, en points de pourcentage, au-delà duquel une recommandation de rééquilibrage devient une alerte mise en avant sur le tableau de bord.

### Rafraîchissement automatique des données de marché

Deux tâches planifiées, chacune avec sa propre carte : **Rafraîchissement des données de marché**
(cours de toutes les positions — pour un ETF, désormais via justETF — et composition rapide des
fonds non couverts par justETF, cadence par défaut 24h) et **Composition géographique/sectorielle
(justETF)** (look-through complet et description des ETF — cadence par défaut hebdomadaire, plus
lente par politesse envers justETF qui n'offre aucun support). Pour chacune :

- **Activé** : active/désactive l'exécution planifiée.
- **Toutes les X h** : intervalle entre deux exécutions automatiques.
- **Lancer maintenant** : déclenche immédiatement cette tâche, indépendamment de la planification.
  Pour le rafraîchissement des cours, comme le bouton du Portefeuille, il s'exécute en tâche de
  fond avec une progression affichée, et ne peut pas se lancer si un rafraîchissement est déjà en
  cours (déclenché depuis cet écran ou depuis le Portefeuille). Pour la composition justETF, le
  bouton reste indisponible le temps du traitement (pouvant prendre jusqu'à une minute selon le
  nombre d'ETF détenus) mais sans compteur de progression.
- La dernière exécution (date/heure, succès ou échec, message) est affichée sous chaque carte.

### Exporter

Trois boutons téléchargent chacun un fichier CSV (positions, transactions, synthèse de rentabilité), au format directement utilisable par Excel en français (séparateur point-virgule, décimale virgule). Un quatrième bouton télécharge un **relevé de patrimoine au format PDF** : une photographie mise en forme (patrimoine net, répartition par classe d'actif, rentabilité globale, répartition par compte), prête à imprimer ou archiver.

## Écran Aide

Pense-bête pour un débutant, sans lien avec les données personnelles du portefeuille (rien n'y dépend d'une position en particulier) :

- **Les 6 zones géographiques** : une carte par zone, avec la liste des pays qu'elle contient (ex. l'Inde ou la Chine dans « Marchés émergents ») — la même classification que celle utilisée partout ailleurs dans l'application (objectifs, tableau de bord). « Autres zones » est une catégorie résiduelle sans liste fixe, expliquée comme telle.
- **Les 11 secteurs d'activité** : une carte par secteur avec quelques exemples d'entreprises connues, pour se repérer.
- **Comprendre les chiffres de l'application** : questions/réponses dépliables sur les notions les moins évidentes (look-through des fonds, différence entre « Non catégorisé » et « Autres zones/secteurs », coût moyen pondéré vs FIFO, rendement annualisé (XIRR), score de diversification, répartition géographique parfois « estimée »).
- **D'où viennent les données ?** : explique l'origine des cours et compositions (yfinance, justETF) et rappelle qu'aucune donnée du portefeuille n'est envoyée ailleurs que pour interroger ces deux sources de cotation.
- **Glossaire** : définitions courtes des termes courants (ETF, ISIN, PEA/CTO, TER, drawdown, volatilité, plus-value latente/réalisée, rééquilibrage).
