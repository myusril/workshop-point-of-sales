# syntax=docker/dockerfile:1

FROM node:26.13.1-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --no-audit --no-fund

FROM base AS dev
ENV NODE_ENV=development
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --no-audit --no-fund
COPY apps/web ./apps/web
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace", "@workshop-pos/web", "--", "--hostname", "0.0.0.0", "--port", "3000"]

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/web ./apps/web
RUN npm run build --workspace @workshop-pos/web

# Image optimization is disabled (next.config.mjs). Remove sharp and its
# optional libvips payload from the build output so no LGPL binary can be
# copied into the runtime layer.
RUN rm -rf apps/web/.next/standalone/node_modules/sharp apps/web/.next/standalone/node_modules/@img/sharp-*

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

# Fail the build if a Next.js upgrade reintroduces the optional sharp/libvips
# payload. This is a build-time guarantee, not a post-hoc image inspection.
RUN set -eu; \
  test ! -e /app/node_modules/sharp; \
  if find /app/node_modules -name 'sharp*' -o -name '*libvips*' | grep -q .; then \
    echo "forbidden sharp/libvips payload in runtime image" >&2; \
    exit 1; \
  fi

USER nextjs
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
