# atalaya backend image (NestJS + Prisma 7 over SQLite).
#
# The build context is the REPOSITORY ROOT, not backend/, so every deployment
# file lives together under infra/ instead of mixed into each application's
# code. infra/homeserver/docker-compose.yml passes
# `dockerfile: infra/homeserver/atalaya/backend.Dockerfile`.
#
# Multi-stage: compilation happens in here, not on anyone's machine.

# ------------------------------------------------------------------- build
#
# Pinned to the architecture of whoever BUILDS, not the target. What tsc emits
# is identical .js wherever it runs, and emulating a whole compile under QEMU
# costs several times more. The runtime stage is the target architecture, which
# is where it matters.
FROM --platform=$BUILDPLATFORM node:22-slim AS build
WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/ .

# prisma.config.ts does `import "dotenv/config"` and reads DATABASE_URL on load.
# `generate` connects to nothing — it only reads the schema — so a placeholder is
# enough here. It belongs to this stage: the final image does not inherit it and
# gets the real path from its own environment.
ENV DATABASE_URL="file:./build.db"

# The generator is `prisma-client` (not `prisma-client-js`): it writes TypeScript
# into src/generated/prisma rather than native binaries, so tsc compiles the
# client along with everything else and nothing has to be copied out of
# node_modules into the final image.
RUN npx prisma generate
RUN npm run build

# ----------------------------------------------------------------- runtime
#
# Debian slim rather than Alpine on purpose. better-sqlite3 is a native module
# and its prebuilt binaries target glibc; on Alpine's musl it usually falls back
# to compiling from source, which means dragging python3, make and g++ into the
# image. Slim is larger on paper and far simpler in practice.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY backend/package.json backend/package-lock.json ./

# Production dependencies plus the Prisma CLI: deployment runs
# `prisma migrate deploy` inside this image and `prisma` is a dev dependency.
# The version is read from package.json so it cannot drift from the generated
# client.
RUN PRISMA_VERSION="$(node -p "require('./package.json').dependencies.prisma || require('./package.json').devDependencies.prisma")" \
    && npm ci --omit=dev \
    && npm i --no-save "prisma@${PRISMA_VERSION}" \
    && npm cache clean --force

COPY --from=build /app/dist ./dist

# Schema and migrations are needed at runtime: they are the input to
# `prisma migrate deploy`. prisma.config.ts tells the CLI where they are and
# where to read the URL from.
COPY backend/prisma ./prisma
COPY backend/prisma.config.ts ./

# The SQLite file is the database. It lives on a named volume declared in
# infra/docker-compose.yml; the directory is created here so the volume
# inherits the right owner rather than root's.
RUN mkdir -p /app/data
ENV DATABASE_URL="file:/app/data/atalaya.db"

# The template server registration personalises into a downloadable artifact.
# Single source of truth stays at infra/fleet/server-setup/; this is a copy,
# not a fork. Fixed path, not an env var — SetupScriptService hardcodes this
# same /app/setup-server.sh for NODE_ENV=production.
COPY infra/fleet/server-setup/setup-server.sh ./setup-server.sh

# Cosmetic under network_mode: host — nothing is actually published — but
# documents which port HOST/PORT in the env file must agree on.
EXPOSE 3000

# Migrations are NOT run here: they are a separate, explicit step before
# bringing the new version up (see infra/atalaya/README.md). Doing them on
# start leaves the container in a restart loop when they fail.
CMD ["node", "dist/src/main.js"]
