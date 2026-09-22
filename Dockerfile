# One image = the whole product: the built web app + the API that serves it.
#   docker build -t social .
#   docker run -p 4000:4000 -e DATABASE_URL=... -e JWT_SECRET=... -e APP_URL=https://... social
# Works on any host that runs containers (a VPS, Render, Fly.io, Railway, your own server, Kubernetes...).

# ---- 1. build the web app ------------------------------------------------------------------
FROM node:24-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---- 2. the API (production dependencies only; the dev-only embedded Postgres is left out) ---
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=web /app/dist /app/dist

USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-4000}/api/health || exit 1
CMD ["node", "src/server.js"]
