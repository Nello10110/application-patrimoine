# Instructions pour Claude Code — refonte « liquid glass »

Ce dossier est un paquet de portage de design. Lis `design_handoff_refonte_liquid_glass/README.md`
en entier avant d'écrire une ligne de code : il contient le plan en 5 étapes, la spec de chaque
écran et les jetons.

## Contexte

Dépôt : application de suivi de patrimoine, React + TypeScript + Tailwind + Vite,
frontend dans `frontend/`. Le design actuel est du Tailwind par défaut (slate + indigo).
La refonte le remplace par un système de verre translucide à deux modes (clair / sombre).

## Règles non négociables

1. **Ne pas coder de couleur en dur.** Tout passe par les jetons de
   `frontend/src/styles/tokens-glass.css` (`var(--ink)`, `var(--panel)`, `var(--accent)`…).
   Si une valeur te manque, ajoute un jeton — n'écris pas un hex dans un composant.
2. **Respecter l'ordre des étapes du README.** Chaque étape est livrable seule et l'app
   doit tourner à la fin de chacune. Ne pas commencer l'étape N+1 avant que N soit fusionnée.
3. **L'étape 2 est le point de bascule** : réécrire `components/Card.tsx` comme une
   enveloppe de `GlassPanel` en **conservant sa signature de props actuelle**. Toute l'app
   passe au verre sans qu'aucune page soit modifiée. Ne pas réécrire les pages à cette étape.
4. **Mobile : 44px minimum** pour toute cible tactile, sans exception. C'est le point
   le plus facile à casser.
5. **Cohérence des données avant esthétique.** Le brief d'origine était : « pas mal de
   petites incohérences au niveau des graphiques et des données à l'intérieur ». Donc :
   - tout total, compte de lignes ou performance affiché sous une liste filtrée se calcule
     **depuis la liste filtrée**, jamais depuis le jeu complet ;
   - une performance globale est `(Σ valeurs − Σ coûts) / Σ coûts`, jamais une moyenne
     de pourcentages ;
   - la courbe « investi » du mode étagé vient des transactions réelles et ne doit pas
     contredire la variation annoncée par le chiffre héros.
6. **Ne pas réintroduire ce qui a été retiré volontairement** (fil d'Ariane, sidebar
   repliable, onglets de Réglages, camembert, période globale en haut) : ce sont des
   décisions de design validées, listées dans le README.

## Fichiers du paquet

| Fichier | À en faire quoi |
| --- | --- |
| `README.md` | La spec. À lire en premier, en entier. |
| `tokens-glass.css` | Copier tel quel dans `frontend/src/styles/`. |
| `tailwind.config.additions.js` | Fusionner dans `tailwind.config.js`. |
| `components/GlassPanel.tsx` | Copier dans `frontend/src/components/`. |
| `components/Controls.tsx` | Copier dans `frontend/src/components/`. |
| `components/useTheme.ts` | Copier dans `frontend/src/hooks/`. |
| `Refonte.dc.html` | Prototype desktop — **la vérité visuelle**. Ouvre-le dans un navigateur. |
| `Refonte mobile.dc.html` | Prototype mobile 390×844. |

Les deux `.dc.html` sont des prototypes de référence, **pas du code à copier** : ils utilisent
un runtime de maquettage. Lis-les pour les valeurs exactes (couleurs, tailles, espacements,
libellés) et recrée-les en React + Tailwind. `support.js` est ce runtime — ignore-le.

## Ce qui n'est pas encore maquetté

Écran Salaire, palette de recherche ⌘K, onglets Comptes & sécurité / Partage /
Automatisations, assistant de bienvenue, déclaration de patrimoine PDF, période
personnalisée, suppression d'un compte (recommandation dans le README), et les écrans
Comptes / Budget / Objectifs en mobile. Ces éléments se déclinent sur les gabarits
existants — demande avant d'inventer un motif nouveau.
