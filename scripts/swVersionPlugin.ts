import type { Plugin } from 'vite';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// Stamp <outDir>/<swFile> with a per-build cache version at writeBundle time. Ported from
// CRM_NEW/scripts/swVersionPlugin.ts. scripts/stamp-sw.cjs runs afterwards and re-stamps with
// the git SHA when the __BUILD_VERSION__ placeholder is still present (local builds where this
// plugin already stamped a value leave it a no-op).
export function swVersionPlugin(outDir = 'dist', swFile = 'sw.js'): Plugin {
  return {
    name: 'sw-version-stamp',
    writeBundle() {
      const swPath = resolve(process.cwd(), outDir, swFile);
      try {
        let content = readFileSync(swPath, 'utf-8');
        const buildId = `bm-${Date.now()}`;
        content = content.replace(
          /const CACHE_VERSION = ['"].*?['"]/,
          `const CACHE_VERSION = '${buildId}'`,
        );
        writeFileSync(swPath, content);
      } catch {
        /* sw.js not in the out dir yet on first run */
      }
    },
  };
}
