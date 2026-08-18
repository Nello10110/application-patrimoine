# Manuel utilisateur — Outil Bourse

## Prise en main

Deux façons de peupler le portefeuille :

1. **Import de l'historique de transactions** (recommandé) : export complet du courtier (achats, ventes, dividendes...), le portefeuille est intégralement recalculé depuis cet historique.
2. **Saisie manuelle ou relevé de positions** : ajout ligne par ligne, ou import d'un fichier CSV/Excel avec mapping des colonnes.

Parcours type conseillé :

1. Importer son historique de transactions (écran **Import**).
2. Rafraîchir les cours (bouton sur l'écran **Portefeuille**, ou automatiquement via **Réglages**).
3. Définir ses objectifs de répartition pour l'année (écran **Objectifs**).
4. Consulter le **Tableau de bord** pour voir l'écart réel/cible et les recommandations.

## Écran Import

### Historique de transactions

Section du haut. Accepte un export CSV au format reconnu automatiquement (colonnes `transaction_id`, `category`, `type`, `asset_class`, etc. — format Trade Republic et compatibles). Aucun mapping à faire.

Le résumé affiché après import indique : nombre de transactions importées, doublons déjà présents ignorés (ré-import sans risque), mouvements hors suivi boursier exclus (carte bancaire, virements bancaires), et positions recalculées.

### Relevé de positions

Section du bas. Pour un simple export de positions (pas un historique de mouvements). Après upload, un aperçu du fichier s'affiche : associer les colonnes du fichier aux champs attendus (Ticker et Quantité obligatoires ; Nom, Prix de revient, Compte, Devise optionnels), puis confirmer. La case « Remplacer le portefeuille existant » permet de repartir de zéro plutôt que d'ajouter à la suite.

## Écran Portefeuille

Tableau des positions avec, pour chaque ligne : quantité, prix actuel, valeur, rendement depuis achat, rendement annualisé, secteur, pays. Les onglets au-dessus du tableau filtrent par catégorie (Actions / ETF / Crypto / Autres).

- **Cliquer sur une ligne** ouvre la fiche détaillée de la position.
- **Rafraîchir les cours** relance manuellement la récupération des données de marché pour tout le portefeuille (peut prendre plusieurs dizaines de secondes selon le nombre de lignes).
- **Ajouter une ligne manuellement** : pour une position hors historique de transactions (ex. actif détenu ailleurs).

## Fiche détaillée d'une position

Accessible en cliquant sur une ligne du Portefeuille, ou depuis un camembert du Tableau de bord. Affiche :

- valorisation (quantité, prix de revient, prix actuel, valeur), rendements ;
- émetteur et résumé d'activité (pour les actions), frais de gestion annuels et frais de transaction cumulés (pour les fonds) ;
- graphique de performance historique du titre (prix, volatilité annualisée, perte maximale/drawdown) ;
- pour un ETF : deux camemberts (répartition géographique et sectorielle interne du fonds) et le tableau des ~10 plus grosses lignes sous-jacentes.

Une action individuelle ou une crypto affiche « Titre unique, pas de décomposition interne » à la place des camemberts.

## Écran Objectifs

Sélectionner une année, puis ajuster les pourcentages cibles de répartition géographique et sectorielle (pré-remplis avec une répartition de référence à la première utilisation). Chaque catégorie peut être modifiée, supprimée, ou une nouvelle ajoutée. Le total doit sommer à 100 % (indiqué en vert quand c'est le cas). **Enregistrer** sauvegarde les objectifs de l'année sélectionnée.

## Tableau de bord

- **Évolution du portefeuille** : graphique avec sélecteur d'échelle (1 an / 5 ans / depuis le début) et un mode étagé (case à cocher) qui distingue le capital investi des gains cumulés.
- **Rentabilité globale** : coût total investi, gain/perte total, rendement annualisé, dividendes/intérêts perçus, frais payés, gains réalisés.
- **Répartition géographique/sectorielle — réel vs cible** : deux graphiques en barres. Cliquer sur une barre ouvre le détail des lignes qui composent cette catégorie.
- **Indicateurs de risque** : score de diversification, poids de la plus grosse ligne, concentration géographique.
- **Actions de rééquilibrage recommandées** : liste des écarts significatifs (> 2 points) entre réel et cible, avec le montant à ajuster.

## Écran Réglages

Configuration du rafraîchissement automatique des données de marché :

- **Activé** : active/désactive l'exécution planifiée.
- **Toutes les X h** : intervalle entre deux exécutions automatiques (1h à 48h).
- **Lancer maintenant** : déclenche immédiatement un rafraîchissement, indépendamment de la planification.
- La dernière exécution (date/heure, succès ou échec, message) est affichée sous le formulaire.
