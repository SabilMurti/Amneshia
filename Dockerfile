# Multi-stage build for Amneshia MCP Server
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install native compilation dependencies for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production runner stage
FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install native dependencies to install better-sqlite3 in production
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Purge build tools to minimize surface area
RUN apt-get purge -y --auto-remove python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist

# Create knowledge directory
RUN mkdir -p /app/.amneshia/knowledge

EXPOSE 3457

ENTRYPOINT ["node", "dist/index.js"]
CMD ["--no-dashboard", "--tool-profile", "core"]
