# Outil Bourse

Application web locale de suivi de portefeuille boursier : reconstruction automatique du portefeuille depuis un historique de transactions, enrichissement des positions via Yahoo Finance, comparaison de la répartition réelle à des objectifs géo/sectoriels, calcul de rentabilité (XIRR), et rafraîchissement planifiable.

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

## Documentation

- [Spécifications fonctionnelles](docs/SPECIFICATIONS_FONCTIONNELLES.md) — périmètre, règles métier, modèle de données
- [Manuel utilisateur](docs/MANUEL_UTILISATEUR.md) — mode d'emploi de chaque écran
- [Manuel d'exploitation](docs/MANUEL_EXPLOITATION.md) — architecture, démarrage, sauvegarde, dépannage
- [Backlog](docs/BACKLOG.md) — évolutions futures envisagées

## Stack technique

- **Backend** : Python, FastAPI, SQLAlchemy 2.0, SQLite, APScheduler, `yfinance`
- **Frontend** : React, TypeScript, Vite, Tailwind CSS, Recharts
