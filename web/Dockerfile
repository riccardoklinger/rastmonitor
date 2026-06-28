FROM node:20-alpine AS base

WORKDIR /app

# Dependencies
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --frozen-lockfile || npm install

# Build
FROM base AS builder
ARG NEXT_PUBLIC_MAP_STYLE=https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_col.json
ENV NEXT_PUBLIC_MAP_STYLE=$NEXT_PUBLIC_MAP_STYLE
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production runner
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
