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
RUN npm prune --omit=dev && npm cache clean --force

# Production runner stage
FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install tini for proper signal handling and zombie reaping
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-compiled production dependencies and artifacts from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-ui ./dist-ui

# Create knowledge directory and set permissions for non-root node user
RUN mkdir -p /app/.amneshia/knowledge && chown -R node:node /app

VOLUME ["/app/.amneshia"]

USER node

EXPOSE 3457

ENTRYPOINT ["tini", "--", "node", "dist/index.js"]
CMD ["--no-dashboard", "--tool-profile", "core"]
