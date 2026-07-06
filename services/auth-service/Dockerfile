FROM node:20-alpine AS base
WORKDIR /app

# Copy root workspace manifest (needed for workspace resolution)
COPY package.json ./

# Copy shared library (local workspace package)
COPY shared/ ./shared/

# Copy this service
COPY services/auth-service/ ./services/auth-service/

# Install using npm workspaces — resolves @url-shortener/shared from ./shared
RUN npm install --workspace=@url-shortener/auth-service --omit=dev

WORKDIR /app/services/auth-service

ENV NODE_ENV=production
EXPOSE 3004

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3004/health || exit 1

CMD ["node", "src/server.js"]
