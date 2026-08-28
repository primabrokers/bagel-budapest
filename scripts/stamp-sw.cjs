/*
 * Stamp dist/sw.js with a unique per-build version.
 *
 * Ported from CRM_NEW/scripts/stamp-sw.cjs. Runs after `vite build` and replaces the
 * __BUILD_VERSION__ placeholder with a value that changes every deploy, so the browser
 * reliably detects a new service worker and purges the old cache.
 */
const fs = require('fs');
const path = require('path');

const distDir = process.argv[2] || 'dist';
const swFile = process.argv[3] || 'sw.js';
const swPath = path.join(__dirname, '..', distDir, swFile);

if (!fs.existsSync(swPath)) {
  console.warn(`[stamp-sw] ${distDir}/${swFile} not found — skipping (did vite build run?)`);
  process.exit(0);
}

// Prefer the deploy's git commit (stable per commit); fall back to a timestamp locally.
const version =
  (process.env.VERCEL_GIT_COMMIT_SHA && process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 8)) ||
  (process.env.GITHUB_SHA && process.env.GITHUB_SHA.slice(0, 8)) ||
  String(Date.now());

let sw = fs.readFileSync(swPath, 'utf8');
if (!sw.includes('__BUILD_VERSION__')) {
  console.warn(`[stamp-sw] __BUILD_VERSION__ placeholder not found in ${distDir}/${swFile} — already stamped?`);
  process.exit(0);
}

sw = sw.replace(/__BUILD_VERSION__/g, version);
fs.writeFileSync(swPath, sw);
console.log(`[stamp-sw] stamped ${distDir}/${swFile} CACHE_VERSION with build version:`, version);
