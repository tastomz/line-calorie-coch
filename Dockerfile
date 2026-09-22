# Production image for the NestJS LINE nutrition coach.
# Secrets must be injected at runtime — never baked into layers.

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY prisma ./prisma

# Production client targets PostgreSQL. Local SQLite schema stays untouched in git.
RUN cp prisma/postgres/schema.prisma prisma/schema.prisma \
  && rm -rf prisma/migrations \
  && cp -R prisma/postgres/migrations prisma/migrations \
  && npx prisma generate \
  && npm run build \
  && npm prune --omit=dev

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/prisma ./prisma
# Membership / admin / (dev) HTML pages — served via Nest page controllers
COPY --chown=app:app public ./public

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/live').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations are a separate deploy step: `npx prisma migrate deploy`
# Do not auto-migrate on every container start.
CMD ["node", "dist/main.js"]