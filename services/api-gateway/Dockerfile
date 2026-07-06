FROM node:20-alpine AS base
WORKDIR /app

# Copy root workspace manifest (needed for workspace resolution)
COPY package.json ./

# Copy shared library (local workspace package)
COPY shared/ ./shared/

# Copy this service
COPY services/api-gateway/ ./services/api-gateway/

# Install using npm workspaces — resolves @url-shortener/shared from ./shared
RUN npm install --workspace=@url-shortener/api-gateway --omit=dev

WORKDIR /app/services/api-gateway

ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/gateway.js"]
