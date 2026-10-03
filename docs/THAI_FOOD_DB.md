# Thai food reference table

Status: **implemented, empty by design** — the lookup, importer and tests are in
place; no nutrition data ships with the repo. Until a licensed dataset is
imported every message goes to the AI exactly as before.

## What it does

For a text meal message, before any OpenAI call:

1. Split the message into dish + optional amount (`ข้าวมันไก่ 2 จาน`, `ครึ่งชาม ก๋วยเตี๋ยว`).
2. Exact-match the normalized dish name against `ThaiFoodKey` (name, English name, aliases).
3. On a hit, build the estimate from the stored per-serving values × amount.
   No AI call, no AI quota or rate-limit usage, and the card shows
   `ค่ามาตรฐาน <serving> · <source>` so the user can see where the numbers came from.
4. On a miss, or whenever anything is unclear, fall through to the AI path.

It is deliberately conservative — a wrong confident answer is worse than a miss:

- Only "one known dish + optional `N จาน/ชาม/ถ้วย/แก้ว/ชิ้น/ส่วน`" matches.
- A bare number (`ข้าวมันไก่ 2`), amounts above 10, modifiers (`ไม่ใส่หนัง`) or several dishes → AI.
- A unit that differs from the stored serving unit (`1 ชาม` vs per-plate data) → AI. No silent conversion.
- Images never use the table.
- Quantity edits after the estimate (`กินแค่ครึ่งหนึ่ง`) keep working: they scale proportionally, still without AI.

## Data sources (researched 2026-10)

| Source | Fit | Why |
| --- | --- | --- |
| Thai FCD / Thai FCTs 2015, INMU Mahidol (`inmu.mahidol.ac.th/thaifcd`) | Best coverage (~1,700 items) | Free for **non-commercial** use only, all rights reserved. This product has a paid PRO plan, so commercial permission from INMU is needed first. |
| hdmall.co.th/nutrition-hub | Do not use | Re-publishes INMU data. Scraping it copies the same restricted data with no permission. |
| Open Food Facts | Not suitable | ODbL (commercial use OK, needs attribution + share-alike) but packaged products only — no dishes like ข้าวมันไก่. |
| data.go.th | Nothing found | No Thai dish nutrition dataset located. |
| fit-d.com | Unverified | Suggested as accurate. Not reachable from the dev sandbox (egress policy) and no terms found. A commercial app's database is normally proprietary: get written permission or an API/licensing agreement before importing anything from it. |

**Rule:** only import data you have the right to use commercially, and record
that right in the `license` column. Do not scrape sites; request a licence or an export.

Nutrition numbers are never invented or guessed in this repo.

## Open Food Facts: 7-Eleven / CP / Ezygo packaged products

Open Food Facts (ODbL; attribute "© Open Food Facts contributors") lists a few
hundred Thai 7-Eleven-related products with barcodes and printed nutrition.
Coverage is community-made and incomplete. Photos of packs are already handled by
reading the printed label in the vision prompt; this data helps typed product names.

The sandbox cannot reach openfoodfacts.org, so the data is prepared on a developer
machine:

1. Download the **JSONL** product export (not the MongoDB dump) from
   <https://world.openfoodfacts.org/data> — a large file (several GB, gzip). The
   file name is expected to be `openfoodfacts-products.jsonl.gz`; check the page.
2. Reduce it to Thai 7-11 / CP / Ezygo products (add `--all-thailand` for every Thai product):

   ```bash
   node tools/off-extract-thailand.mjs ~/Downloads/openfoodfacts-products.jsonl.gz off-thailand.jsonl
   ```

3. The result is a small file of public data. A converter from it to the import CSV
   (per-100 g values × pack weight, pack units) is the next step and is written
   against real rows, not guessed field names.

## CSV format

UTF-8, header row required. Required: `name_th, serving_unit, calories, protein_g, carbs_g, fat_g, source, license`.
Optional: `name_en, aliases, serving_desc, serving_grams, source_ref`.

| Column | Notes |
| --- | --- |
| `name_th` | Dish name shown to the user. |
| `name_en` | Also becomes a lookup key. |
| `aliases` | Extra names, separated by `\|`. Each must be unique across the whole table. |
| `serving_unit` | `piece, plate, bowl, cup, serving` (or Thai: จาน ชาม ถ้วย แก้ว ชิ้น ส่วน). The values are **per one** of this unit. |
| `serving_desc` | Shown to users, e.g. `1 จาน (300 g)`. Defaults to `1 <unit>`. |
| `calories, protein_g, carbs_g, fat_g` | Per one serving. |
| `source` | Dataset name shown to users. |
| `license` | Required: the licence / permission you rely on (e.g. `written permission from <owner>, <date>`). |

The importer rejects the **whole file** (nothing written) on: missing required
column/field, unknown unit, non-numeric or out-of-range values, macros that do
not roughly add up to the calories (4·P + 4·C + 9·F within max(50 kcal, 40%) —
catches swapped columns), duplicate dish, or an alias used by two dishes
(in the file or already in the database under a different dish).

## Importing

Validate first, then import. The command is idempotent per (`source`, `name_th`).

```bash
npm run import:thai-food -- --file ./thai-food.csv --dry-run
npm run import:thai-food -- --file ./thai-food.csv
```

It runs with `ts-node` (a dev dependency), so run it from a source checkout, not
inside the production container. For Postgres: generate the Postgres client
(`npx prisma generate --schema prisma/postgres/schema.prisma`) and point
`DATABASE_URL` at that environment's database (Railway's *public* URL when running
from a laptop; the internal URL only resolves inside Railway). Import to SIT first,
check a few dishes in LINE, then UAT, then production. Restore the SQLite client
afterwards (`npx prisma generate`).

Rollback: `DELETE FROM "ThaiFoodItem" WHERE source = '<dataset>'` — keys are removed
by cascade, and lookups simply miss again.

## Checks before enabling in production

- Have the licence/permission on file and in the `license` column.
- Spot-check 10–20 dishes in SIT against the source (serving size is the usual mismatch).
- Remember per-plate values assume the source's serving size; `serving_desc` is what tells the user.
