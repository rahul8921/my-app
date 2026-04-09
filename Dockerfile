# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10

# Copy workspace config files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json ./

# Copy all package.json files (for workspace linking)
COPY lib/db/package.json ./lib/db/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/replit-auth-web/package.json ./lib/replit-auth-web/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/betting-app/package.json ./artifacts/betting-app/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

# Copy all source files
COPY lib/ ./lib/
COPY artifacts/ ./artifacts/

# Build frontend (VITE_ vars must be baked in at build time)
ENV BASE_PATH=/
ENV PORT=3000
ENV NODE_ENV=production
ENV VITE_SUPABASE_URL=https://hobovhxdusjfolamevro.supabase.co
ENV VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvYm92aHhkdXNqZm9sYW1ldnJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTcwMjIsImV4cCI6MjA5MTE5MzAyMn0.25HUzYaoc_EKiBjD6OWGpY9-iUeOoVtWC8JqBhIbh3E
RUN pnpm --filter betting-app run build

# Build backend
RUN pnpm --filter api-server run build

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy built backend
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist

# Copy built frontend (so backend can serve it)
COPY --from=builder /app/artifacts/betting-app/dist/public ./artifacts/betting-app/dist/public

# Copy node_modules needed at runtime (only pg, drizzle-orm, etc.)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules

EXPOSE 8080

CMD ["node", "artifacts/api-server/dist/index.mjs"]
