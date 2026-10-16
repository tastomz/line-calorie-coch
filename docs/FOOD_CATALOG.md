# Food catalog (verified-label lookup)

`FoodCatalogItem` is an optional, name-matched lookup tried **before** AI for
text food logs. A hit answers instantly from a verified product label — no
OpenAI call, no token cost, and no guessing. The table starts empty in every
environment; an empty table is a no-op (every lookup misses, AI runs exactly
as before). This replaces the earlier `ThaiFoodItem`/`ThaiFoodKey` tables,
which were built but never populated.

## Current dataset: 7-Eleven (fit-d.com)

504 packaged products/menu items sold at 7-Eleven Thailand, scraped from
[fit-d.com](https://fit-d.com/food/shop/OQ,,/7-eleven) on 2026-10-16. Fields:
Thai/English name, serving label, calories, protein, carbs, fat per the
serving the source page states. **No barcodes** — fit-d.com doesn't have
them, so matching is by product **name**, not a barcode/QR scan.

Known gaps (see the delivered `quality_report.json` kept alongside the raw
data for the full list):

- 9 items have all three macros at 0 despite non-zero calories (unverified
  against the product label).
- 60 items don't state a mass/volume for their serving.
- 37 items have other serving-size options on the source page that were not
  captured (only the page's default serving was imported).
- Data reflects what Fit-D had listed on the retrieval date — not confirmed
  against current stock or current label revisions.

This is a secondary source, not a certified nutrition database. Treat a
catalog hit as "probably right, from a real label" — same spirit as the AI
estimate it replaces, just higher-confidence for an exact name match.

## How matching works (`FoodCatalogService.findByText`)

1. Normalize (trim, lowercase, strip whitespace) both the user's text and
   each catalog name (Thai and English).
2. A match is "either string contains the other" after normalizing, with a
   minimum shared length (6 chars) so short words never trigger a match.
3. If **exactly one** catalog item matches, use it. Zero matches, or more
   than one ambiguous match, falls through to AI — this never guesses.
4. The catalog itself is small (hundreds of rows), so matching scans it in
   memory rather than pushing the "contains, either direction" logic into
   SQL. Re-add DB-side filtering if the catalog grows much larger.

A DB error during lookup is caught and logged, then treated as "no match" —
a catalog outage must never block food logging.

## Importing / re-importing a dataset

```bash
npx prisma migrate deploy   # creates FoodCatalogItem if not already there
npm run import:food-catalog -- prisma/seed-data/food-catalog-7eleven.json
```

Upserts by `(source, sourceFoodId)` — safe to re-run; re-importing the same
file updates existing rows in place rather than duplicating them. Run
`npm run import:food-catalog:prod -- <path>` against a built `dist/` instead
of `ts-node` in a deployed environment.

## Adding another dataset

1. Add a new JSON file under `prisma/seed-data/` with the same field names
   `import-food-catalog.ts` expects (see `RawFoodCatalogItem` in that file).
2. Give it its own `source` value — `(source, sourceFoodId)` must stay
   globally unique, so a second dataset's ids only need to be unique
   *within* that dataset.
3. Run `npm run import:food-catalog -- prisma/seed-data/<file>.json`.

## Future direction: barcode/QR scanning

This dataset has no barcodes, so there is no barcode-scan feature yet.
Open Food Facts (`world.openfoodfacts.org`) has a public API and real
barcodes, with roughly 8,000–9,000 Thailand-tagged products (decent for
major international/national brands, not for small local ones) — a
plausible next step is a **live** API call per scanned barcode (no bulk
import, since pre-populating a barcode table without a live data source is
exactly the mistake the original `ThaiFoodItem` attempt made). Not built in
this PR — text-name matching against this catalog is independent of it and
ships first.
