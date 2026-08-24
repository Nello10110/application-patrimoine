# Manuel utilisateur — Application Patrimoine

## Prise en main

Deux façons de peupler le portefeuille :

1. **Import de l'historique de transactions** (recommandé) : export complet du courtier (achats, ventes, dividendes...), le portefeuille est intégralement recalculé depuis cet historique.
2. **Saisie manuelle ou relevé de positions** : ajout ligne par ligne, ou import d'un fichier CSV/Excel avec mapping des colonnes.

Parcours type conseillé :

1. Importer son historique de transactions (écran **Import**).
2. Rafraîchir les cours (bouton sur l'écran **Portefeuille**, ou automatiquement via **Réglages**).
3. Définir ses objectifs de répartition pour l'année (écran **Répartition**).
4. Consulter le **Tableau de bord** pour voir l'écart réel/cible, les alertes et les recommandations.

Un bouton en haut à droite de chaque écran bascule l'apparence entre thème clair, thème sombre et suivi automatique du système (un clic fait passer de l'un à l'autre) ; le choix est mémorisé d'une visite à l'autre.

**Installer l'application** : depuis un navigateur compatible (Chrome, Edge, ou Safari via « Ajouter à l'écran d'accueil » sur iPhone/iPad), l'icône d'installation dans la barre d'adresse (ou le menu du navigateur) ajoute l'application comme une icône dédiée, ouverte en plein écran — pas de store, pas d'installation à maintenir, juste le navigateur qui la sert comme une application native.

**Sur mobile** (écran étroit, sous 768 px) : la barre latérale est remplacée par une barre de navigation en bas d'écran avec les routes principales et un bouton **« Plus »** (menu, réglages, thème, déconnexion). Les tableaux de positions et d'emprunts s'affichent sous forme de cartes plutôt que de tableaux à défiler horizontalement, et les filtres du Portefeuille s'ouvrent dans une feuille glissante via le bouton « Filtrer ».

## Écran Import

### Historique de transactions

Section du haut. Accepte un export CSV au format reconnu automatiquement (format Trade Republic et compatibles). Aucun mapping à faire.

Le résumé affiché après import indique : nombre de transactions importées, doublons déjà présents ignorés (ré-import sans risque), mouvements hors suivi boursier exclus (carte bancaire, virements bancaires), et positions recalculées. Si le grand livre contient des ventes sans achat correspondant, une anomalie est signalée ici (la position concernée n'apparaît alors pas dans le portefeuille). Si une ligne saisie manuellement portait le même identifiant qu'une position reconstruite par cet import, c'est aussi indiqué : le grand livre fait foi, la ligne manuelle a été remplacée.

### Mouvements bancaires (budget)

Section indépendante du portefeuille boursier ci-dessus — alimente l'écran **Budget**. Deux façons d'importer :

- **OFX ou QIF** : un seul fichier à choisir, aucun mapping à faire (les deux formats ont une structure fixe).
- **CSV** : comme pour le relevé de positions, un aperçu s'affiche après upload pour associer les colonnes du fichier (Date et Libellé obligatoires) — au choix une seule colonne Montant signée (+/-), ou deux colonnes Débit/Crédit séparées selon ce que la banque exporte. Un champ « Compte » optionnel annote toutes les lignes importées (utile si plusieurs comptes sont importés séparément, pour les filtrer ensuite dans Budget).

Le résumé affiché après import indique : mouvements importés, doublons déjà présents ignorés (ré-import sans risque), lignes illisibles ignorées (date ou montant non reconnu — jamais fondues silencieusement dans le total), et combien ont été catégorisés automatiquement par les règles déjà déclarées.

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
- **Ajouter une ligne manuellement** : formulaire au-dessus du tableau (ticker, quantité, prix de revient, compte, type d'actif, valeur estimée) — pour une position hors historique de transactions (ex. actif détenu ailleurs). Pour l'immobilier, une SCPI, une assurance-vie, un PER, un compte courant, une épargne réglementée (Livret A, LDDS, LEP, PEL, CEL...), une épargne salariale (PEE, PERCO, PER entreprise), un véhicule ou tout autre actif hors marché (objet de valeur, métal précieux physique...) : laisser Quantité à 1 et renseigner **Valeur estimée** plutôt que Prix de revient — elle remplace le calcul prix × quantité et se met à jour à la main, périodiquement ; Prix de revient garde alors son sens habituel (montant investi à l'origine), ce qui permet de voir le gain latent depuis l'achat.
- **Taux annuel** (épargne réglementée/salariale, véhicule) : champ apparaissant uniquement pour ces types — un pourcentage positif pour un taux d'intérêt attendu (épargne), négatif pour une décote annuelle attendue (véhicule). Purement indicatif : une fois Valeur estimée et Taux renseignés, une ligne « Valeur projetée dans 1 an » s'affiche à titre de repère, mais n'est **jamais appliquée automatiquement** — reporter soi-même le montant dans Valeur estimée si on souhaite l'adopter.

### Fiche immobilier complète

Sur la fiche détaillée d'un bien immobilier (clic sur la ligne dans le tableau), une section dédiée
remplace le graphique de cours (sans objet, un bien immobilier n'a pas de cotation) :

- **Caractéristiques et location** : type de location (nue, meublée, Pinel, LMNP, saisonnière),
  loyer mensuel, charges mensuelles, frais annuels (taxe foncière, copropriété, assurance, gestion —
  un seul total), surface, nombre de pièces, année de construction, DPE. « Enregistrer » valide.
- **Cashflow et rentabilité** (calculés automatiquement dès qu'un loyer est renseigné) : cashflow
  mensuel (loyer − charges − frais/12 − mensualité de l'emprunt rattaché, s'il y en a un), rentabilité
  brute et nette, prix au m² (dès que la surface est renseignée, même sans loyer) — chaque chiffre est
  affiché avec sa formule.
- **Historique de valorisation** : chaque changement de la Valeur estimée (formulaire d'ajout ou
  édition en ligne du Portefeuille) ajoute une ligne datée à ce tableau — l'ancienne estimation n'est
  **jamais écrasée**, elle reste consultable.

### Dettes et emprunts

Carte sous le tableau des positions, indépendante des filtres ci-dessus. Chaque emprunt porte un libellé, un capital initial, un taux annuel, une mensualité, une date de début et une durée en mois ; le **capital restant dû** est calculé automatiquement (amortissement à taux fixe). Le bouton **Recaler** permet de le corriger à la main d'après un relevé bancaire réel (après un remboursement anticipé, par exemple) — le recalage prime alors sur le calcul théorique jusqu'à un nouveau recalage. **Supprimer** retire définitivement un emprunt, après confirmation.

## Fiche détaillée d'une position

Accessible en cliquant sur une ligne du Portefeuille, sur un camembert du Tableau de bord, ou directement par son adresse (`/patrimoine/TICKER`) — un lien « Ouvrir en pleine page » dans la fenêtre superposée y conduit également. **Même structure à trois onglets pour toute ligne du patrimoine**, quelle que soit sa nature (action, fonds, crypto, immobilier, épargne...) :

- **Aperçu** : valorisation (quantité, prix de revient, prix actuel, valeur), rendement depuis achat et rendement annualisé (avec une explication à l'écran quand ce dernier est indisponible : moins de 90 jours de détention, ou pas d'historique exploitable) ; en dessous, le graphique de performance historique du titre (prix, volatilité annualisée, perte maximale/drawdown) — ou, pour un bien immobilier, le cashflow mensuel, les rentabilités brute/nette et le prix au m² déjà calculés, puis l'historique daté de ses valorisations successives ; enfin l'émetteur et le résumé d'activité (Yahoo Finance pour une action, description justETF pour un fonds couvert) avec frais de gestion annuels et frais de transaction cumulés ;
- **Analyse** : pour un fonds, deux camemberts (répartition géographique et sectorielle interne, par grande zone/catégorie), le tableau des ~10 plus grosses lignes sous-jacentes, et — pour un fonds couvert par justETF — une répartition détaillée avec les intitulés exacts publiés (ex. « Inde » plutôt que « Marchés émergents »). Une action individuelle ou une crypto n'affiche pas de camembert de composition (pas de décomposition interne pour un titre unique). En dessous, la répartition entre détenteurs déclarés (Réglages) et la part nette qui en résulte, si au moins un détenteur a été créé ;
- **Paramètres** : édition des réglages propres à la ligne — aujourd'hui, les caractéristiques et le bloc location d'un bien immobilier (type de location, loyer, charges, surface, DPE...) ; pour toute autre nature, un message indique qu'il n'y a rien à régler pour l'instant.

## Écran Répartition

Objectifs et rééquilibrage réunis pour une même année sélectionnable — deux vues d'un même sujet plutôt que deux écrans séparés.

- **Objectifs** : sélectionner une année dans la liste (alimentée par les années réellement enregistrées), ou en ajouter une nouvelle par le champ dédié, puis ajuster les pourcentages cibles de répartition géographique et sectorielle (pré-remplis avec une répartition de référence à la première utilisation d'une année). Chaque catégorie peut être modifiée, supprimée, ou une nouvelle ajoutée. Le total doit sommer à 100 % (indiqué en vert quand c'est le cas). **Enregistrer** sauvegarde les objectifs de l'année sélectionnée et recharge aussitôt le rééquilibrage ci-dessous.
- **Rééquilibrage** (sous les objectifs) : détail complet des alertes et des actions de rééquilibrage recommandées pour la même année.
  - **Alertes** : sous-ensemble des recommandations dont l'écart dépasse le seuil réglé dans Réglages, mises en avant en haut de la section.
  - **Actions de rééquilibrage recommandées** : liste complète des écarts significatifs (> 2 points) entre réel et cible, avec le montant à ajuster (réduire ou augmenter) pour chaque catégorie.

## Écran Objectifs

Deux blocs sur un même écran : les objectifs suivis dans le temps, en haut ; le simulateur, calcul à la volée, en dessous.

### Objectifs suivis (backlog § 2.O.1)

Un objectif = un nom, un montant cible, une échéance, et éventuellement un ou plusieurs **actifs rattachés** — leur valeur cumulée mesure la progression réelle de l'objectif, pas un registre de versements séparé à tenir à jour soi-même. Le formulaire « Nouvel objectif » propose aussi un type prédéfini (indépendance financière, épargne de précaution, apport immobilier, remboursement anticipé, ou personnalisé) et des contributeurs (parmi les personnes/sociétés déclarées dans Réglages, si tu en as créé).

Chaque objectif affiche :

- **Valeur actuelle**, **montant cible**, **progression** en %.
- **Diagnostic en langage naturel** : « Objectif atteint. », « En bonne voie. », « En retard de X mois au rythme actuel. », « Aucune progression mesurée pour l'instant. », ou « Échéance dépassée... » — comparé à une trajectoire cible qui va linéairement du montant de départ au montant cible entre la création et l'échéance.
- **Rendement annuel requis** pour atteindre la cible sans versement supplémentaire, et **contribution mensuelle nécessaire** au taux hypothèse renseigné (0 % par défaut, modifiable à la création) pour combler l'écart.
- Un graphique à deux courbes (cible en pointillés, réelle en trait plein) — la courbe réelle n'a que deux points (création, aujourd'hui), pas un historique complet, c'est indiqué sous le graphique.

Le bouton « Supprimer » d'un objectif demande confirmation avant suppression définitive.

### Indicateurs de situation (backlog § 2.O.2)

Trois ratios, chacun avec sa formule affichée en dessous :

- **Matelas de sécurité** (en mois) : épargne disponible (comptes courants + épargne réglementée) divisée par les dépenses mensuelles moyennes des 3 derniers mois de budget.
- **Taux d'endettement** : mensualités totales des emprunts divisées par les revenus nets mensuels moyens.
- **Part du patrimoine immobilisée** : le reste des actifs non boursiers (immobilier, SCPI, assurance-vie, PER...) rapporté au patrimoine brut.

Un ratio affiche « — » plutôt qu'un chiffre trompeur s'il manque une donnée (aucun mouvement bancaire importé pour dépenses/revenus, aucun emprunt).

### Simulateur

Projette un capital dans le temps — une **hypothèse**, pas une promesse : les marchés ne progressent jamais de façon aussi régulière dans la réalité. Le **capital de départ** est préempli avec ton patrimoine net actuel, mais librement modifiable : laisse-le tel quel pour voir où en sera ton patrimoine réel, ou change-le pour tester n'importe quel autre scénario ("et si je plaçais 10 000 € à 6 % ?"). Un lien apparaît sous le champ pour revenir en un clic au patrimoine net actuel dès que tu l'as modifié.

- **Hypothèses** : capital de départ (€), rendement annuel moyen (%, peut être négatif pour un scénario pessimiste), versement mensuel (€), **intérêts déjà obtenus (€, facultatif)**, durée (boutons 5/10/20/30 ans). Tout se recalcule instantanément à chaque changement (aucun appel au serveur).
- **Intérêts déjà obtenus** : préempli avec le gain/perte déjà réalisé sur ton portefeuille financier (la carte Rentabilité du Tableau de bord), librement modifiable ou effaçable. Sert à indiquer que le capital de départ contient déjà des gains, pas seulement des versements — le tableau de détail en tient alors compte dès la ligne « Départ » au lieu de repartir de zéro, pour mieux distinguer les vrais intérêts déjà gagnés de ceux à venir.
- **Versement mensuel** (backlog § 2.N.4) : préempli avec le versement moyen réellement observé sur le budget des 3 derniers mois (écran Budget), plutôt qu'une hypothèse saisie à la main — un lien apparaît pour y revenir en un clic si modifié. Nécessite des mouvements bancaires importés pour être calculé ; reste à 0 sinon, librement modifiable dans tous les cas.
- **Graphique et tuiles** : valeur finale, total versé, intérêts gagnés, avec un graphique étagé (capital versé + gains).
- **Tableau de détail** : sous le graphique, bascule **Annuelle** / **Mensuelle** listant, période par période, les versements, les intérêts gagnés, le capital, le versé cumulé et les intérêts cumulés à date. Chaque ligne est libellée par la **date réelle prévue** (ex. « 2028 » en vue annuelle, « 2027 Mars » en vue mensuelle) plutôt que par un compteur abstrait — seule la première ligne reste « Départ ». La vue mensuelle défile (jusqu'à 360 lignes sur 30 ans) dans un cadre à hauteur fixe, en-tête toujours visible.
- **Indépendance financière (FIRE)** : renseigner une dépense annuelle cible et un taux de retrait (4 % par défaut — la « règle des 4 % », un choix méthodologique parmi d'autres, pas une vérité universelle, librement modifiable) affiche le patrimoine nécessaire pour vivre de ce patrimoine, et le délai estimé pour l'atteindre avec les mêmes hypothèses de capital/rendement/versement que ci-dessus. Au-delà de 60 ans de projection, le résultat affiche « Non atteinte » plutôt qu'un nombre d'années trop lointain pour être fiable.

## Écran Dividendes

Calendrier des dividendes déjà perçus : un total en tête, un graphique en barres par mois, puis la liste des mois (les plus récents en premier) — cliquer sur un mois déplie le détail des lignes qui l'ont composé (date, titre, montant net). Ne montre que des montants déjà perçus, jamais une projection future.

## Écran Budget

Suivi des mouvements bancaires importés depuis l'écran Import — indépendant du portefeuille boursier. Sélecteur de période en haut (Mensuel/Annuel/Personnalisé, même fonctionnement que l'écran Rapport ci-dessous).

- **Quatre indicateurs** : Entrées, Sorties, Disponible (entrées − sorties), et Dépenses récurrentes/mois — estimées sur les 3 derniers mois glissants (un mouvement qui revient à l'identique, même libellé et même montant à l'euro près, sur au moins deux de ces trois mois compte comme récurrent).
- **Taux d'épargne réel et reste à vivre** (backlog § 2.N.4) : affichés dès qu'une catégorie « Épargne » (respectivement « Logement ») existe — le taux d'épargne est le rapport entre les sorties classées dans cette catégorie et les entrées de la période ; le reste à vivre retranche des entrées le logement et les charges récurrentes détectées ci-dessous. Un message explicite remplace l'indicateur si la catégorie correspondante a été renommée ou supprimée.
- **Répartition des sorties** : un tableau par catégorie (les sous-catégories sont regroupées avec leur catégorie parente), avec un champ **Budget cible** éditable directement dans le tableau (Entrée valide, ou clic ailleurs) et l'**écart** qui en découle (vert si le budget est respecté, rouge sinon).
- **Mouvements** : liste de la période, filtrable par catégorie et par compte (menus au-dessus du tableau) ; chaque ligne a son propre sélecteur de catégorie pour corriger une catégorisation automatique ou catégoriser une ligne restée sans catégorie.
- **Charges récurrentes et abonnements** (backlog § 2.N.3) : liste des mouvements qui reviennent régulièrement (12 derniers mois, encore vus dans les 45 derniers jours), avec leur périodicité (mensuelle ou irrégulière) et un badge **« Hausse de prix »** si le dernier montant dépasse le précédent de plus de 5 %. Indépendante de la période sélectionnée en haut de l'écran — reste visible même si le mois affiché n'a aucun mouvement.
- **Catégories et règles de catégorisation** (section dépliable en bas de l'écran) : ajouter/supprimer une catégorie ; déclarer une règle (« le libellé contient tel motif → telle catégorie »), appliquée aux futurs imports et réappliquable en masse aux mouvements déjà importés via le bouton dédié — une correction manuelle n'est jamais écrasée par une réapplication.

## Écran Rapport

Rapport récapitulatif généré à la demande — rien n'est envoyé par courriel, l'application n'a pas de serveur mail — sur trois modes possibles (boutons en haut à droite) :

- **Mensuel** (par défaut) : un sélecteur de mois, du 1er au dernier jour du mois choisi.
- **Annuel** : un sélecteur d'année, du 1er janvier au 31 décembre.
- **Personnalisé** : deux sélecteurs de date libres (« du » / « au »), pour n'importe quelle période — un message s'affiche si la date de fin précède la date de début.

Quel que soit le mode : valeur du portefeuille en fin de période, évolution sur la période (en vert si positive, en rouge sinon), dividendes perçus, et les cinq mouvements les plus importants (achats, ventes...). Généré à la demande à chaque changement de mode ou de dates.

## Tableau de bord

Organisé en trois temps, pour aller du plus important au plus accessoire (le chiffre, puis la
courbe, puis le détail replié) :

1. **Le chiffre** — **Patrimoine net**, en tout premier, affiché en très grand : actifs totaux
   (portefeuille financier + immobilier/SCPI/assurance-vie/PER/comptes/épargne/véhicules), passifs
   (somme des emprunts), patrimoine net, et une répartition par grande classe d'actif juste en
   dessous. Sous le chiffre, une ligne de variation (« +10,0 % depuis le début du suivi », ou selon
   la Période active dans la barre de contrôles) — elle porte sur le **portefeuille suivi** (le même
   que la courbe ci-dessous), pas sur le patrimoine net lui-même, ce que la ligne précise
   explicitement. N'apparaît pas tant qu'aucun actif ni passif n'est enregistré.
2. **La courbe** — **Évolution du portefeuille** : graphique avec sélecteur d'échelle (via la
   Période, barre de contrôles) et un mode étagé qui distingue le capital investi des gains cumulés.
   Reste visible même si le reste de l'écran (répartitions, indicateurs) échoue à charger.
3. **Le détail** — tout le reste, replié sous un bouton **Détail** (ouvert par défaut, l'état choisi
   est mémorisé d'une visite à l'autre) :
   - **Sélecteur d'année**, en haut à droite de l'écran (hors du repliable) : change l'année de
     comparaison réel/cible (répartitions, indicateur de rééquilibrage), sans toucher à la
     rentabilité globale ni à la répartition par compte, indépendantes de l'année. Le bouton
     **Actualiser** recharge toutes les données de l'écran.
   - **Rentabilité globale** : valeur totale, coût total investi, gain/perte total et rendement
     associé, rendement annualisé (money-weighted), dividendes perçus (net), intérêts perçus (net),
     autres revenus, frais payés, impôts prélevés, gains réalisés. Frais et impôts sont affichés à
     titre informatif : ils sont déjà pris en compte dans le calcul du gain/perte, pas resoustraits
     une seconde fois.
   - **Répartition géographique/sectorielle — réel vs cible** : deux graphiques en barres. Cliquer
     sur une barre ouvre le détail des lignes qui composent cette catégorie.
   - **Qualité des données** : encart qui apparaît sous les graphiques de répartition dès qu'une
     partie du portefeuille n'est pas mesurée avec certitude — répartition géographique estimée à
     partir de l'indice suivi par un fonds (faute de composition détaillée), donnée totalement
     manquante, ou position valorisée à son coût de revient faute de cotation. N'apparaît pas si tout
     le portefeuille est couvert par une donnée réelle et coté.
   - **Coût de gestion annuel estimé** : n'apparaît que si au moins un fonds/ETF est détenu. Coût
     annuel en euros (somme des frais de gestion de chaque fonds pondérés par sa valeur), avec la
     part du portefeuille en fonds pour laquelle ce frais est réellement connu — ce frais n'est
     récupéré qu'une fois par fonds, au fil des rafraîchissements, donc la couverture peut rester
     partielle un moment après l'ajout d'un nouveau fonds ; le message le rappelle explicitement
     tant qu'elle n'atteint pas 100 %.
   - **Répartition par compte** : n'apparaît que si au moins une ligne porte une annotation de
     compte. Rappelle explicitement qu'aucune rentabilité par compte n'est calculable, seule la
     valeur actuelle l'est (le grand livre importé ne porte aucune information de compte).
   - **Indicateurs de risque** : score de diversification, poids de la plus grosse ligne,
     concentration géographique.
   - **Rééquilibrage** : indicateur résumé (nombre d'actions recommandées, dont nombre d'alertes)
     avec un bouton **Voir le détail** vers l'écran dédié — le détail complet (catégorie par
     catégorie) n'est plus affiché ici.

Les deux bandeaux d'accueil (aucune position dans le portefeuille, aucun objectif défini pour
l'année) restent visibles même si le détail est replié — ce sont des appels à l'action, pas de la
simple information complémentaire.

## Écran Réglages

### Préférences

- **Méthode de calcul du coût de revient** : coût moyen pondéré (par défaut) ou FIFO (premier entré, premier sorti). Changer de méthode recalcule immédiatement le prix de revient et les gains réalisés de tout le portefeuille ; le nombre de positions recalculées est affiché après le changement.
- **Alertes** : seuil d'écart, en points de pourcentage, au-delà duquel une recommandation de rééquilibrage devient une alerte mise en avant sur l'écran Répartition.

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

### Comptes du foyer, sessions et journal d'accès

Section visible uniquement par le propriétaire du compte.

- **Comptes du foyer** : le propriétaire crée les comptes des autres membres du foyer (nom
  d'utilisateur, mot de passe, rôle). Un **membre** peut consulter et saisir des actifs, emprunts et
  transactions comme le propriétaire, mais pas modifier les objectifs ni la sécurité. Un **invité**
  ne voit, en lecture seule, que le patrimoine net et le portefeuille des personnes/sociétés qui lui
  sont explicitement assignées (aucun accès par défaut tant qu'aucun détenteur n'est coché).
  Il n'existe plus d'inscription libre au-delà du tout premier compte du serveur.
- **Sessions actives** : chaque appareil ou navigateur connecté avec ce compte, avec sa dernière
  activité. « Révoquer » déconnecte immédiatement cet appareil précis, sans toucher aux autres — la
  session en cours d'utilisation ne peut pas se révoquer elle-même.
- **Journal d'accès** : historique des connexions et déconnexions (réussies ou non), avec l'adresse
  IP d'origine — utile pour repérer une tentative de connexion suspecte. Après 5 mots de passe
  erronés en 15 minutes, le compte concerné est verrouillé 15 minutes, même avec le bon mot de passe.

### Exporter

Trois boutons téléchargent chacun un fichier CSV (positions, transactions, synthèse de rentabilité), au format directement utilisable par Excel en français (séparateur point-virgule, décimale virgule). Un quatrième bouton télécharge un **relevé de patrimoine au format PDF** : une photographie mise en forme (patrimoine net, répartition par classe d'actif, rentabilité globale, répartition par compte), prête à imprimer ou archiver.

## Écran Aide

Pense-bête pour un débutant, sans lien avec les données personnelles du portefeuille (rien n'y dépend d'une position en particulier) :

- **Les 6 zones géographiques** : une carte par zone, avec la liste des pays qu'elle contient (ex. l'Inde ou la Chine dans « Marchés émergents ») — la même classification que celle utilisée partout ailleurs dans l'application (objectifs, tableau de bord). « Autres zones » est une catégorie résiduelle sans liste fixe, expliquée comme telle.
- **Les 11 secteurs d'activité** : une carte par secteur avec quelques exemples d'entreprises connues, pour se repérer.
- **Comprendre les chiffres de l'application** : questions/réponses dépliables sur les notions les moins évidentes (look-through des fonds, différence entre « Non catégorisé » et « Autres zones/secteurs », coût moyen pondéré vs FIFO, rendement annualisé (XIRR), score de diversification, répartition géographique parfois « estimée »).
- **D'où viennent les données ?** : explique l'origine des cours et compositions (yfinance, justETF) et rappelle qu'aucune donnée du portefeuille n'est envoyée ailleurs que pour interroger ces deux sources de cotation.
- **Glossaire** : définitions courtes des termes courants (ETF, ISIN, PEA/CTO, TER, drawdown, volatilité, plus-value latente/réalisée, rééquilibrage).
