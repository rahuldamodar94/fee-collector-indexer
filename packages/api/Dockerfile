# syntax=docker/dockerfile:1.7

# ===== build stage =====
FROM node:20-alpine AS base
WORKDIR /app

# Workspace manifests (cache-friendly install layer)
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/indexer/package.json packages/indexer/
COPY packages/api/package.json packages/api/

# Install entire workspace graph including dev deps (need tsc)
RUN npm ci

# Copy source for the packages this image builds
COPY packages/shared packages/shared
COPY packages/api packages/api

# Compile shared first (api imports it), then api
RUN npx tsc -p packages/shared
RUN npx tsc -p packages/api

# Drop dev deps from node_modules so the runtime stage gets a slim copy
RUN npm prune --omit=dev

# ===== runtime stage =====
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Pruned node_modules plus root package.json so npm workspace symlinks resolve
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./

# Shared package: compiled dist + manifest pointed at dist
COPY --from=base /app/packages/shared/package.json ./packages/shared/
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
RUN npm pkg set main=./dist/index.js -w packages/shared

# API package: compiled dist + manifest
COPY --from=base /app/packages/api/package.json ./packages/api/
COPY --from=base /app/packages/api/dist ./packages/api/dist

# Drop privileges
USER node

EXPOSE 3000

CMD ["node", "packages/api/dist/index.js"]
