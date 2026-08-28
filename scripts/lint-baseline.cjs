#!/usr/bin/env node
/*
  Lint ratchet, ported (simplified to a single scope) from CRM_NEW/scripts/lint-baseline.cjs.

  `npm run lint` is a bare `eslint .`. This compares the CURRENT error/warning counts against a
  checked-in baseline and fails only when a count goes UP — so "don't add lint problems" is
  mechanically enforced, and the numbers can ratchet down as the project grows.

  Unlike the CRM root, this project has only one scope (`barmitzvah-planner/src`), so there is
  no per-scope split — just a total.

  Usage:
    node scripts/lint-baseline.cjs            # check (exit 1 if worse than baseline)
    node scripts/lint-baseline.cjs --update   # accept the current counts as the new baseline
*/
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, '.lint-baseline.json');

function runEslint() {
  // -f json to a temp file: safer than a pipe buffer for a large report.
  const out = path.join(os.tmpdir(), `bm-lint-${process.pid}.json`);
  try {
    execFileSync(
      process.execPath,
      [path.join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js'), '.', '-f', 'json', '-o', out],
      { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] },
    );
  } catch {
    // eslint exits non-zero whenever there are errors. That is the normal case here; the report
    // file is still written, so only a missing/unreadable file is a real failure.
  }
  let results;
  try {
    results = JSON.parse(fs.readFileSync(out, 'utf8'));
  } catch (err) {
    throw new Error(`eslint produced no readable report: ${err.message}`);
  } finally {
    fs.rmSync(out, { force: true });
  }
  let errors = 0;
  let warnings = 0;
  const byFile = [];
  for (const r of results) {
    errors += r.errorCount;
    warnings += r.warningCount;
    if (r.errorCount + r.warningCount > 0) {
      byFile.push({ file: path.relative(ROOT, r.filePath), errors: r.errorCount, warnings: r.warningCount });
    }
  }
  return { errors, warnings, byFile };
}

const fmt = (c) => `${c.errors} error${c.errors === 1 ? '' : 's'}, ${c.warnings} warning${c.warnings === 1 ? '' : 's'}`;

const current = runEslint();
const update = process.argv.includes('--update');

if (update || !fs.existsSync(BASELINE_PATH)) {
  const payload = {
    note: 'Lint ratchet baseline — see scripts/lint-baseline.cjs. Counts may go DOWN freely; going up fails the gate.',
    recordedAt: new Date().toISOString().slice(0, 10),
    errors: current.errors,
    warnings: current.warnings,
  };
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Lint baseline ${update ? 'updated' : 'created'}: ${fmt(current)}`);
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const regressions = [];
const improvements = [];

for (const kind of ['errors', 'warnings']) {
  const delta = current[kind] - (baseline[kind] ?? 0);
  if (delta > 0) regressions.push(`${kind}: ${baseline[kind] ?? 0} → ${current[kind]} (+${delta})`);
  else if (delta < 0) improvements.push(`${kind}: ${baseline[kind] ?? 0} → ${current[kind]} (${delta})`);
}

console.log(`Lint: ${fmt(current)}  (baseline ${fmt(baseline)})`);

if (improvements.length > 0) {
  console.log('\nImproved:');
  for (const i of improvements) console.log(`  ${i}`);
  console.log('\nRun `npm run lint:baseline -- --update` to bank these.');
}

if (regressions.length > 0) {
  console.error('\nLint regression — this change added problems:');
  for (const r of regressions) console.error(`  ${r}`);
  const worst = current.byFile.sort((a, b) => b.errors + b.warnings - (a.errors + a.warnings)).slice(0, 10);
  console.error('\nWorst files in the current run (not necessarily the new ones):');
  for (const f of worst) console.error(`  ${String(f.errors + f.warnings).padStart(4)}  ${f.file}`);
  console.error('\nFix them, or if a rule genuinely cannot apply here, disable it inline with a reason.');
  process.exit(1);
}

console.log('\nNo lint regression.');
