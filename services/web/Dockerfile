# syntax=docker/dockerfile:1.7
# ---- Stage 1: install deps (cached on lockfile) ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- Stage 2: lint, test and build static assets ----
FROM deps AS build
ARG APP_VERSION=dev
ENV VITE_APP_VERSION=${APP_VERSION}
COPY . .
RUN npm run lint && npm test && npm run build

# ---- Stage 3: unprivileged nginx serving the SPA (~20 MB) ----
FROM nginxinc/nginx-unprivileged:1.31-alpine AS runtime
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="seatsurge-web" \
      org.opencontainers.image.description="SeatSurge web front-end" \
      org.opencontainers.image.source="https://github.com/seatsurge/seatsurge" \
      org.opencontainers.image.version="${APP_VERSION}"
# Upstreams are injected at start-up by the nginx image's envsubst templating.
ENV INVENTORY_UPSTREAM=inventory:8000 CHECKOUT_UPSTREAM=checkout:3000 DNS_RESOLVER=127.0.0.11
# Pick up Alpine security fixes released after the base image was built.
USER 0
RUN apk upgrade --no-cache
USER 101
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD ["wget", "-qO-", "http://127.0.0.1:8080/healthz"]
