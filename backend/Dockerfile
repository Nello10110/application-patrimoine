# Image de référence pour un déploiement homelab (cf. compose-exemple.yaml à la
# racine du dépôt) — même version de Python que l'environnement de développement.
FROM python:3.14-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# --host 0.0.0.0 est nécessaire pour être joignable DEPUIS Docker Compose (le
# service frontend, ou l'hôte) — la restriction "pas exposé publiquement" se fait
# au niveau de la publication du port sur l'hôte (127.0.0.1:8000:8000 dans le
# compose), pas ici.
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
