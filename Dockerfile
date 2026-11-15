# SWF Resurrect web app: the whole pipeline (Node 24, Java 17 for FFDec, Chromium for the verify
# stage) behind the web server, with the bundled samples converted at build time.
#
#   docker build -t swf-resurrect .
#   docker run --rm -p 7860:7860 swf-resurrect          # http://localhost:7860
#
# Settings are environment variables (web/README.md); e.g. -e SWF_RESURRECT_UPLOADS=off for a
# gallery-only host, -e TRUST_PROXY=1 behind one reverse proxy. Third-party notes: THIRD_PARTY.md.

ARG NODE_IMAGE=node:24.18.0-bookworm-slim

# ---- FFDec: downloaded from the official release, checked, unpacked unmodified ------------------
FROM debian:bookworm-slim AS ffdec
ARG FFDEC_VERSION=26.4.0
# SHA-256 of ffdec_26.4.0.zip, computed from the release asset at
# https://github.com/jindrapetrik/jpexs-decompiler/releases/download/version26.4.0/ffdec_26.4.0.zip
ARG FFDEC_SHA256=56ce960aeafc7caf034e2052ba49f878a883f7c7ca690da6eeffca9587b5e4b9
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL --retry 3 -o /tmp/ffdec.zip \
      "https://github.com/jindrapetrik/jpexs-decompiler/releases/download/version${FFDEC_VERSION}/ffdec_${FFDEC_VERSION}.zip" \
 && echo "${FFDEC_SHA256}  /tmp/ffdec.zip" | sha256sum -c - \
 && mkdir -p /opt/ffdec \
 && unzip -q /tmp/ffdec.zip -d /opt/ffdec \
 && rm /tmp/ffdec.zip \
 && test -f /opt/ffdec/ffdec-cli.jar \
 && test -f /opt/ffdec/license.txt

# ---- The app ------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS app
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

# Java 17 runtime for FFDec (the man directory is missing on slim images and the JRE's
# post-install step expects it).
RUN mkdir -p /usr/share/man/man1 \
 && apt-get update \
 && apt-get install -y --no-install-recommends openjdk-17-jre-headless \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so source changes do not reinstall them. The pipeline needs the dev
# dependencies at run time (tsx, Vite, PixiJS, Playwright), so all of them are installed.
COPY package.json package-lock.json ./
RUN npm ci --no-audit \
 && npx playwright install --with-deps --only-shell chromium \
 && rm -rf /var/lib/apt/lists/* \
 && npm cache clean --force

COPY . .
RUN npm run web:build

COPY --from=ffdec /opt/ffdec /opt/ffdec
COPY THIRD_PARTY.md /opt/ffdec-THIRD_PARTY.md

# The server writes only to .work/ (jobs, preview staging) and Vite to node_modules/.vite-temp
# (config bundling); everything else stays root-owned and read-only for the app user.
RUN mkdir -p .work node_modules/.vite-temp node_modules/.vite \
 && chown node:node .work node_modules/.vite-temp node_modules/.vite

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=7860 \
    SWF_RESURRECT_FFDEC=/opt/ffdec/ffdec-cli.jar

# Unprivileged user (uid 1000, as Hugging Face Spaces expects).
USER node

# Convert every bundled sample now, so the image starts with the gallery ready. Fails the build
# if any sample does not convert.
RUN npm run web:prewarm

EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||7860)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--import", "tsx", "web/server/main.ts"]
