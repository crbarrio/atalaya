# atalaya frontend image (Angular 22 served by nginx).
#
# The build context is the REPOSITORY ROOT, not frontend/.
# infra/homeserver/docker-compose.yml passes
# `dockerfile: infra/homeserver/atalaya/frontend.Dockerfile`.

# ------------------------------------------------------------------- build
#
# Pinned to the architecture of whoever BUILDS. What Angular produces is
# identical static files wherever they are compiled, and emulating a whole
# `ng build` under QEMU costs several times more. Only the runtime stage needs
# to match the target architecture.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build

# ----------------------------------------------------------------- runtime
FROM nginx:1.27-alpine

# network_mode: host (see infra/docker-compose.yml): the backend has no
# published port of its own to proxy to by Docker DNS, only its own loopback
# bind, so nginx reaches it the same way everything else on this host does —
# at 127.0.0.1. See infra/atalaya/nginx.conf.
COPY infra/homeserver/atalaya/nginx.conf /etc/nginx/conf.d/default.conf

# angular.json declares no outputPath, so Angular 22 uses dist/<project> and the
# application builder puts the result under browser/. atalaya has no i18n, so
# there is a single tree rather than one per locale.
COPY --from=build /app/dist/frontend/browser/ /usr/share/nginx/html/

# Cosmetic under network_mode: host — nothing is actually published — but
# documents the port nginx.conf binds to.
EXPOSE 4200
