ARG NODE_IMAGE=node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3

FROM ${NODE_IMAGE} AS base
ARG OPENSSL_PACKAGE_VERSION=3.0.20-1~deb12u2
RUN apt-get update \
  && apt-get install --yes --no-install-recommends "openssl=${OPENSSL_PACKAGE_VERSION}" \
  && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npx prisma generate \
  && NODE_OPTIONS=--max-old-space-size=3072 npm run build

FROM base AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --omit=dev \
  && DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npx prisma generate \
  && npm cache clean --force

FROM base AS runtime
ARG FFMPEG_PACKAGE_VERSION=7:5.1.9-0+deb12u1
RUN apt-get update \
  && apt-get install --yes --no-install-recommends "ffmpeg=${FFMPEG_PACKAGE_VERSION}" \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
  FFPROBE_PATH=/usr/bin/ffprobe \
  FFPROBE_TIMEOUT_MS=15000 \
  FFPROBE_MAX_OUTPUT_BYTES=1048576 \
  MEDIA_VERIFICATION_VERSION=ffprobe-5.1.9-debian12-learning-media-v1

WORKDIR /app
COPY --chown=node:node --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node prisma.config.ts package.json ./
COPY --chown=node:node scripts/media-runtime-contract.cjs scripts/verify-media-runtime.cjs ./scripts/

USER node
EXPOSE 3000
CMD ["node", "dist/src/main.js"]

FROM runtime AS media-test
USER root
COPY --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node src ./src
COPY --chown=node:node test ./test
COPY --chown=node:node tsconfig.json tsconfig.build.json nest-cli.json package.json ./
USER node

FROM runtime AS final
