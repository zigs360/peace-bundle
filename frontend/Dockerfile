# Stage 1: Build Vite React application
FROM node:20-alpine AS builder

WORKDIR /app

# Cap Node memory to prevent OOM spikes on 1GB droplets with swap
ENV NODE_OPTIONS="--max-old-space-size=1024"

COPY package*.json ./

RUN npm ci --no-audit --no-fund

COPY . .

# Build Vite React SPA into /app/dist
RUN npm run build

# Stage 2: Serve built assets with Nginx
FROM nginx:1.27-alpine AS production

# Remove default nginx placeholder page completely
RUN rm -rf /usr/share/nginx/html/*

COPY --from=builder /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
