# Kcal Coach — frontend

Angular 21 + PrimeNG (Aura, dark-green brand, light only). One app for:

- **Member pages (LIFF):** `/profile` `/history` `/upgrade` `/login` `/membership/*`
- **Admin:** `/admin` (ภาพรวม) `/admin/users` `/admin/promos` `/admin/plans` `/admin/ai-usage` `/admin/settings` — lazy-loaded

URLs match the old static pages, so rich-menu / LIFF links and Stripe success/cancel URLs keep working.

## Develop
```bash
npm ci            # .npmrc sets legacy-peer-deps
npm start         # http://localhost:4200, proxies /api /admin/api /auth to Nest on :3000
```

## Build
`npm run build` → `dist/frontend/browser`. The root Dockerfile builds it and copies it to `/app/web`;
Nest serves the bundles statically and `index.html` for every page route (`src/web/web-app.ts`).
For a local Nest run without Docker, set `WEB_ROOT=frontend/dist/frontend/browser`.
