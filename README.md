# Application Patrimoine

Application web locale de suivi patrimonial complet, gratuite et open source, dans l'esprit de Finary : reconstruction automatique du portefeuille boursier depuis un historique de transactions, enrichissement des positions via Yahoo Finance/justETF, patrimoine net (immobilier, SCPI, assurance-vie, PER, dettes), projections et indépendance financière, calendrier des dividendes, relevé PDF, rapport mensuel, comparaison de la répartition réelle à des objectifs géo/sectoriels, calcul de rentabilité (XIRR), application installable (PWA), et rafraîchissement planifiable.

## Démarrage rapide

```bash
# Backend (API FastAPI, port 8000)
cd backend
python -m venv venv
./venv/Scripts/python.exe -m pip install -r requirements.txt
./venv/Scripts/python.exe -m uvicorn app.main:app --port 8000

# Frontend (Vite, port 5173)
cd frontend
npm install
npm run dev
```

Puis ouvrir `http://localhost:5173`.

## Tests et lint

```bash
# Backend
cd backend
pip install -r requirements-dev.txt
python -m pytest -q
python -m ruff check app/ scripts/

# Frontend
cd frontend
npm run test
npm run lint    # oxlint
npm run build   # inclut la vérification des types (tsc)

# Tests IHM de bout en bout (navigateur réel piloté par Playwright, contre un
# backend isolé sur une base SQLite jetable — jamais la vraie base de l'utilisateur)
npx playwright install --with-deps chromium   # une seule fois
npm run test:e2e
```

Ces cinq commandes (pytest, ruff, vitest, oxlint + build, Playwright) sont aussi
exécutées automatiquement sur chaque push/PR par [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
La suite E2E (`frontend/e2e/`) démarre elle-même un backend dédié (base seedée par
[`backend/scripts/seed_e2e.py`](backend/scripts/seed_e2e.py)) et une preview de
production du frontend — rien à lancer à la main au préalable. En cas d'échec,
`npx playwright show-report` affiche le rapport HTML (traces, captures d'écran).

## Documentation

- [Expression de besoin](docs/EXPRESSION_DE_BESOIN.md) — **point d'entrée des développements** : contexte, exigences, lots priorisés, critères d'acceptation
- [Spécifications fonctionnelles](docs/SPECIFICATIONS_FONCTIONNELLES.md) — périmètre, règles métier, modèle de données
- [Manuel utilisateur](docs/MANUEL_UTILISATEUR.md) — mode d'emploi de chaque écran
- [Manuel d'exploitation](docs/MANUEL_EXPLOITATION.md) — architecture, démarrage, tests, sauvegarde, dépannage
- [Backlog](docs/BACKLOG.md) — évolutions futures envisagées
- [État du chantier](docs/ETAT_DU_CHANTIER.md) — avancement du chantier de refonte en cours

## Stack technique

- **Backend** : Python, FastAPI, SQLAlchemy 2.0, SQLite, APScheduler, `yfinance`
- **Frontend** : React, TypeScript, Vite, Tailwind CSS, Recharts
