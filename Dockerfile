# Prepared release/rehearsal image. No deployment authorization is implied.
FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS builder
COPY package.json package-lock.json .npmrc ./
COPY client/package.json client/package-lock.json ./client/
COPY server/package.json server/package-lock.json ./server/
COPY packages/shared/ ./packages/shared/
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
RUN npm ci --no-audit --no-fund
COPY configs/ ./configs/
COPY scripts/prisma-generate.mjs scripts/build-typescript.mjs scripts/check-server.mjs ./scripts/
COPY client/ ./client/
COPY server/src/ ./server/src/
COPY server/prisma/ ./server/prisma/
COPY server/tsconfig*.json ./server/
# No .env or VITE_* build args. Production offline switches remain off.
ENV NODE_ENV=production
RUN npm run db:generate
RUN npm run build:shared
RUN npm run build:server
RUN npm run build:client

FROM base AS migration-job
WORKDIR /app/server
COPY --from=builder --chown=node:node /app/server/node_modules ./node_modules
COPY --chown=node:node server/package.json ./package.json
COPY --chown=node:node server/prisma/ ./prisma/
COPY --chown=node:node server/deploy/release-migrate.mjs ./deploy/release-migrate.mjs
ENV NODE_ENV=production
USER node
ENTRYPOINT ["node", "deploy/release-migrate.mjs"]

FROM builder AS production-deps
RUN npm --prefix server prune --omit=dev --ignore-scripts --workspaces=false --no-audit --no-fund

FROM base AS runtime
WORKDIR /app/server
ENV NODE_ENV=production PORT=3001
COPY --from=production-deps --chown=node:node /app/server/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/server/src/ ./src/
COPY --from=builder --chown=node:node /app/server/build/ ./build/
COPY --from=builder --chown=node:node /app/client/dist/ /app/client/dist/
COPY --chown=node:node server/package.json ./package.json
COPY --chown=node:node server/prisma/ ./prisma/
COPY --chown=node:node server/deploy/ ./deploy/
COPY --chown=node:node server/audit/postgresql/audit-tools.mjs server/audit/postgresql/catalog.sql ./audit/postgresql/
COPY --chown=node:node server/audit/database/declared-catalog.json ./audit/database/declared-catalog.json
USER node
EXPOSE 3001
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=8s --start-period=30s --retries=3 CMD ["node", "deploy/http-healthcheck.mjs"]
CMD ["node", "deploy/release-http.mjs"]
