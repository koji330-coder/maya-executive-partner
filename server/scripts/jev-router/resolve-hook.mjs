import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    specifier = pathToFileURL(path.join(repoRoot, 'src', specifier.slice(2))).href;
  }
  const isPath = specifier.startsWith('.') || specifier.startsWith('file:');
  if (isPath && !path.extname(specifier)) {
    const base = new URL(specifier, context.parentURL);
    for (const suffix of ['.ts', '/index.ts']) {
      const candidate = new URL(base.href + suffix);
      if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
    }
  }
  return next(specifier, context);
}
