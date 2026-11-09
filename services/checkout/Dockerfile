# syntax=docker/dockerfile:1.7
# ---- Stage 1: install all deps (cached on package*.json) ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- Stage 2: lint, test and compile TypeScript ----
FROM deps AS build
COPY tsconfig*.json eslint.config.js vitest.config.ts ./
COPY src ./src
COPY test ./test
RUN npm run lint && npm run typecheck && npm test && npm run build \
 && npm prune --omit=dev

# ---- Stage 3: distroless runtime: no shell, no package manager, non-root ----
FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runtime
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="seatsurge-checkout" \
      org.opencontainers.image.description="SeatSurge checkout service" \
      org.opencontainers.image.source="https://github.com/seatsurge/seatsurge" \
      org.opencontainers.image.version="${APP_VERSION}"
ENV NODE_ENV=production APP_VERSION=${APP_VERSION} PORT=3000
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Numeric UID (distroless "nonroot") so Kubernetes can enforce runAsNonRoot.
USER 65532
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["dist/server.js"]
