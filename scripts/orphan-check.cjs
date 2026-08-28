#!/usr/bin/env node
/*
  A TESTED MODULE NOTHING RENDERS IS NOT DONE.

  Ported from CRM_NEW/scripts/orphan-check.cjs, scoped to this project's own src/lib and
  src/data. Every `src/lib/**` and `src/data/**` module with a `.test.ts` beside it must be
  imported by something that is not itself a test. Genuinely consumer-free infrastructure goes
  in ALLOWED below, with a reason — an entry with no reason is an unwired feature, not an
  exemption.
*/
const fs = require('node:fs');
const path = require('node:path');

/** Modules with tests that genuinely have no component consumer, and why. */
const ALLOWED = new Map([]);

const root = path.resolve(__dirname, '..');

/** Every .ts/.tsx under src/, working tree rather than the index — a module and the consumer
 *  that wires it up usually land in the SAME commit, and git grep would not yet see the
 *  consumer. */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(full, out); }
    else if (/\.tsx?$/.test(e.name)) out.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return out;
}

const srcDir = path.join(root, 'src');
const all = fs.existsSync(srcDir) ? walk(srcDir) : [];
const tests = all.filter((f) => /^src\/(lib|data)\/.*\.test\.ts$/.test(f));
const sources = all.filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));

const orphans = [];
for (const test of tests) {
  const modulePath = test.replace(/\.test\.ts$/, '');          // e.g. src/lib/foo
  const key = modulePath.replace(/^src\//, '');                 // e.g. lib/foo
  if (ALLOWED.has(key)) continue;
  const base = path.basename(modulePath);

  // Any import of this basename from a file that is not the module itself.
  const needle = new RegExp(`from '[^']*/${base}'`);
  const importers = sources.filter(
    (f) => f !== `${modulePath}.ts` && f !== `${modulePath}.tsx`
      && needle.test(fs.readFileSync(path.join(root, f), 'utf8')),
  );

  if (importers.length === 0) orphans.push(key);
}

if (orphans.length > 0) {
  console.error('\nTested modules that nothing imports — written but never wired up:\n');
  for (const o of orphans) console.error(`  src/${o}.ts`);
  console.error(
    '\nEach is either unfinished work (mount it) or genuinely consumer-free infrastructure\n' +
    '(add it to ALLOWED in scripts/orphan-check.cjs, with the reason).\n',
  );
  process.exit(1);
}

console.log(`Orphan check: ${tests.length} tested modules, all wired up.`);
