# PostgreSQL production cutover (this folder)

Local development continues to use **SQLite** via `prisma/schema.prisma` + `prisma/migrations/`.

This folder is the **production PostgreSQL** baseline:

| Path | Purpose |
| --- | --- |
| `schema.prisma` | Same models as SQLite schema, `provider = "postgresql"` |
| `migrations/` | Forward-only Prisma migrations for Postgres |

## Exact production migration process

1. **Create** a managed PostgreSQL database (enable automated backups — see `docs/BACKUP.md`).
2. **Configure** `DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public` in the host secret store (never commit).
3. **Apply migrations** from this folder (do **not** use `prisma db push` in production):

```bash
# From repo root — point Prisma at the postgres artifacts:
cp prisma/postgres/schema.prisma prisma/schema.prisma
rm -rf prisma/migrations
cp -R prisma/postgres/migrations prisma/migrations

export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public"
npx prisma migrate deploy
npx prisma generate
```

4. **Verify schema** (tables, enums, FKs, unique indexes):

```bash
npx prisma migrate status
# Optional: connect with psql and \dt / \d "FoodLog"
```

5. **Start** the application with `NODE_ENV=production` and the same `DATABASE_URL`.

### Docker note

The production `Dockerfile` copies `prisma/postgres/*` into the image’s `prisma/` paths at build time and runs `prisma generate` for PostgreSQL. Migrations are still applied as a **separate deploy step** (`npx prisma migrate deploy`), not on every container start.

### After cutover — keep local SQLite working

Do **not** commit a swapped root `prisma/schema.prisma` with `postgresql` if you still develop on SQLite. Restore from git:

```bash
git checkout -- prisma/schema.prisma prisma/migrations
```

Or keep two checkouts / CI jobs: one for SQLite unit tests, one for Postgres staging.

## Forbidden in production

- `prisma db push`
- `prisma migrate reset`
- `prisma db push --force-reset`
- Replaying SQLite `migration.sql` files against Postgres

## Status

| Item | State |
| --- | --- |
| Postgres baseline SQL | **documented + checked into** `prisma/postgres/migrations` |
| Managed Postgres instance | **not configured** by this repo (manual) |
| Production `DATABASE_URL` | **not shipped** (secrets store only) |
