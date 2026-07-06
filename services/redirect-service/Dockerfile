FROM node:20-alpine AS base
WORKDIR /app

# Copy root workspace manifest (needed for workspace resolution)
COPY package.json ./

# Copy shared library (local workspace package)
COPY shared/ ./shared/

# Copy this service
COPY services/redirect-service/ ./services/redirect-service/

# Install using npm workspaces — resolves @url-shortener/shared from ./shared
RUN npm install --workspace=@url-shortener/redirect-service --omit=dev

WORKDIR /app/services/redirect-service

ENV NODE_ENV=production

EXPOSE 3002

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3002/health || exit 1

CMD ["node", "src/server.js"]
