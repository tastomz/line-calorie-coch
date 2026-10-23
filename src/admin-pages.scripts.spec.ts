import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Script } from 'vm';

/** Inline <script> blocks of the static HTML pages must at least parse. */
describe('static page scripts', () => {
  const dirs = ['public/dev'];
  const pages = dirs.flatMap((d) =>
    readdirSync(join(process.cwd(), d))
      .filter((f) => f.endsWith('.html'))
      .map((f) => join(d, f)),
  );

  it.each(pages)('%s has valid inline JavaScript', (page) => {
    const html = readFileSync(join(process.cwd(), page), 'utf8');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
      (m) => m[1],
    );
    for (const code of scripts) {
      expect(() => new Script(code, { filename: page })).not.toThrow();
    }
  });
});
