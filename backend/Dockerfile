FROM node:20-alpine AS base

# Install curl and wget for health checks
RUN apk add --no-cache curl wget

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev --no-audit --no-fund

# Copy backend source files
COPY . .

# Ensure storage directories exist and have node user permissions
RUN mkdir -p /app/uploads /app/secure_uploads \
  && chown -R node:node /app

USER node

EXPOSE 5000

ENV PORT=5000 \
    NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/api/health || exit 1

CMD ["node", "server.js"]
