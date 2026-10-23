import type { Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Angular app (frontend/) built into ./web — the Dockerfile copies
 * frontend/dist/frontend/browser there. WEB_ROOT overrides for local runs.
 */
export function webRoot(): string {
  return process.env.WEB_ROOT?.trim() || join(process.cwd(), 'web');
}

/** Serve the SPA shell for a page route; the Angular router renders the page. */
export function sendWebApp(res: Response): void {
  const index = join(webRoot(), 'index.html');
  if (!existsSync(index)) {
    res
      .status(503)
      .type('text/plain')
      .send(
        'Frontend is not built. Run: cd frontend && npm ci && npm run build',
      );
    return;
  }
  // index.html must never be cached: it points at the current hashed bundles.
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(index);
}

/** Hashed bundle names (main-ABC123.js) are immutable; everything else revalidates. */
export function staticCacheHeaders(res: Response, path: string): void {
  if (/[-.][A-Z0-9]{8,}\.(js|css|woff2?)$/.test(path)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    res.setHeader('Cache-Control', 'no-cache');
  }
}
