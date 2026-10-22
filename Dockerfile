# Node 20 is EOL; keep build and runtime on the same supported LTS major.
FROM node:22-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci

FROM base AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# Explicit inputs: never COPY the checkout, local env files or operator data.
COPY package.json package-lock.json ./
COPY next.config.js postcss.config.js tailwind.config.ts tsconfig.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY src ./src
COPY public ./public
# PublicServicePage imports this JSON at build time. Other docs stay outside
# the build context, especially private handoffs and operational records.
COPY docs/app-store/METADATA.zh-Hant.json ./docs/app-store/METADATA.zh-Hant.json
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
