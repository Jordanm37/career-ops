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

# Install server dependencies
COPY web/package.json web/package-lock.json* ./
RUN npm install --omit=dev

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

ENV NODE_ENV=production
ENV PORT=3000
ENV CAREER_OPS_PATH=/career-ops
ENV DATABASE_URL=/data/career-ops.db

EXPOSE 3000
CMD ["node", "server/index.mjs"]
