# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./

# Install production deps only
RUN npm ci --omit=dev

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Non-root user
RUN addgroup -S peerpal && adduser -S -G peerpal peerpal

WORKDIR /app

# Copy prod deps from build stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Remove dev-only files that shouldn't be in the image
RUN rm -rf .env .env.* tests *.test.js

# Own files as non-root user
RUN chown -R peerpal:peerpal /app

USER peerpal

EXPOSE 3001

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server.js"]
