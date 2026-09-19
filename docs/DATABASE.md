# Production database (PostgreSQL)

## Local development (current) — **implemented**

- Prisma provider: **SQLite** (`prisma/schema.prisma`)
- `DATABASE_URL=file:./dev.db`
- Migrations: `prisma/migrations/` (SQLite SQL)
- Day windows: `APP_TIMEZONE` (default `Asia/Bangkok`), not DB session TZ

```bash
npx prisma migrate dev
```

Do **not** change the checked-in SQLite provider for day-to-day local work.

## Production target — **documented** (instance **not configured** by this repo)

- Prisma provider: **PostgreSQL**
- Artifacts: `prisma/postgres/` (schema + migrations)
- Example: `DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public`

### Schema guarantees (SQLite + Postgres)

| Concern | Status |
| --- | --- |
| `DATABASE_URL` | Required at startup; prod must be `postgres://` or `postgresql://` |
| Migrations | Forward-only Prisma migrations (prod: `migrate deploy`) |
| Indexes | `User.lineUserId` unique; `FoodLog(userId,eatenAt)`; `WeightLog(userId,recordedAt)`; `LineEvent.lineEventId` unique; `PendingFoodAnalysis.userId` unique + `expiresAt`; `LineEvent.processedAt` |
| Foreign keys | Cascade from User to logs / pending / profile |
| Unique constraints | LINE identity, pending-per-user, webhook event claim |
| Transactions | Confirm-pending uses interactive transaction |
| Date/time | `DateTime` stored UTC; app applies `APP_TIMEZONE` for “today” |

### Exact production migration process

1. **Create** PostgreSQL database (managed recommended).
2. **Configure** `DATABASE_URL` in the secret store.
3. **Run Prisma migrations** (never `db push` in production):

```bash
cp prisma/postgres/schema.prisma prisma/schema.prisma
rm -rf prisma/migrations
cp -R prisma/postgres/migrations prisma/migrations
npx prisma migrate deploy
npx prisma generate
```

4. **Verify** schema (`prisma migrate status`, spot-check tables/indexes/FKs).
5. **Start** application (`NODE_ENV=production`).

Full runbook: `prisma/postgres/README.md` and `docs/DEPLOYMENT.md`.

### Forbidden in production

- `prisma db push`
- `prisma migrate reset`
- Replaying SQLite migration SQL against Postgres

### What this repo does **not** do

- Does not provision Postgres automatically.
- Does not dual-write SQLite + Postgres.
- Does not ship a live production connection string.
