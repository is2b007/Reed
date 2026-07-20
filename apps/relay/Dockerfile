# syntax=docker/dockerfile:1

# Compile on the builder's native architecture. The output is platform-neutral
# JavaScript, so this avoids running an emulated Node toolchain when an Apple-
# silicon Mac produces the Linux/AMD64 image used by Lightsail.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /reed
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/relay/package.json apps/relay/package.json
RUN pnpm install --frozen-lockfile
COPY apps/relay apps/relay
RUN pnpm --filter @reed/relay build

FROM node:22-alpine
ENV HOST=0.0.0.0 PORT=8787 NODE_ENV=production
WORKDIR /app
COPY --from=build /reed/apps/relay/dist ./dist
USER node
EXPOSE 8787
CMD ["node", "dist/index.js"]
