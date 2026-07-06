FROM node:20-alpine AS base
WORKDIR /app

# Copy root workspace manifest (needed for workspace resolution)
COPY package.json ./

# Copy shared library (local workspace package)
COPY shared/ ./shared/

# Copy this service
COPY services/analytics-service/ ./services/analytics-service/

# Install using npm workspaces — resolves @url-shortener/shared from ./shared
RUN npm install --workspace=@url-shortener/analytics-service --omit=dev

WORKDIR /app/services/analytics-service

ENV NODE_ENV=production
EXPOSE 3003

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3003/health || exit 1

CMD ["node", "src/server.js"]
