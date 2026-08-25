# Image de référence pour un déploiement homelab (cf. compose-exemple.yaml à la
# racine du dépôt) — build multi-étapes : Node pour compiler le bundle statique,
# nginx (image finale, plus légère) pour le servir et reverse-proxy /api/ vers le
# service backend Docker Compose.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
