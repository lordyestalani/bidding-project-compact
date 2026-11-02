FROM node:24.22.0-bookworm-slim AS build
WORKDIR /app
COPY web/package*.json ./
RUN npm ci
COPY web ./
RUN npm run build
FROM nginx:1.28-alpine
ENV API_UPSTREAM=api:8000
COPY docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
