# Career-Ops Web Dashboard — multi-stage Docker build
# Build from project root: docker build -t career-ops-web .

# Stage 1: Build frontend
FROM node:24-slim AS frontend-build
WORKDIR /build/client
COPY web/client/package.json web/client/package-lock.json* ./
RUN npm install
COPY web/client/ .
RUN npm run build

# Stage 2: Production server
FROM node:24-slim AS production
WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install server dependencies
COPY web/package.json web/package-lock.json* ./
RUN npm install --omit=dev
RUN npx playwright install --with-deps chromium

# Copy server code
COPY web/server/ server/

# Copy built frontend
COPY --from=frontend-build /build/client/dist client/dist/

# Copy career-ops modes, templates, and config (needed for AI evaluation)
COPY modes/ /career-ops/modes/
COPY templates/ /career-ops/templates/
COPY config/ /career-ops/config/

# Data directory for SQLite (use Railway volume for persistence)
RUN mkdir -p /data

ENV PLAYWRIGHT_BROWSERS_PATH=0
ENV NODE_ENV=production
ENV PORT=3000
ENV CAREER_OPS_PATH=/career-ops
ENV DATABASE_URL=/data/career-ops.db

EXPOSE 3000
CMD ["node", "server/index.mjs"]
