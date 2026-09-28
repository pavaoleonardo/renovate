#!/usr/bin/env node
/**
 * Keeps `src/lib/default-catalog.ts` and `docs/catalogo-precios.md` in agreement.
 *
 * The doc is the maintainer-facing table (band, basis, recipe, reasoning); the TS is
 * what actually ships. They drift the moment somebody edits one of them by hand, so
 * run this after touching either:
 *
 *   node scripts/check-catalog.mjs
 *
 * Read-only, no dependencies.
 */
import { readFileSync } from 'node:fs';

const DOC_PATH = new URL('../docs/catalogo-precios.md', import.meta.url);
const TS_PATH = new URL('../src/lib/default-catalog.ts', import.meta.url);

const problems = [];

// ---- the doc ------------------------------------------------------------------
const docRows = [];
for (const line of readFileSync(DOC_PATH, 'utf8').split('\n')) {
  const cells = line.split('|').map((c) => c.trim());
  if (cells.length < 11) continue;
  const code = cells[1].replaceAll('*', '');
  if (!/^[A-Z]{3}-\d{3}$/.test(code)) continue;
  docRows.push({
    code,
    name: cells[2].replace(/^\*\*NEW\*\*\s*·\s*/, ''),
    unit: cells[3],
    base_price: Number(cells[4]),
    price_min: Number(cells[5]),
    price_max: Number(cells[6]),
    labour_hours: Number(cells[7]),
    labour_category: cells[8],
    material_anchor: cells[9].startsWith('—') ? null : cells[9],
    source_kind: cells[10],
  });
}

// ---- the shipped catalogue ----------------------------------------------------
const source = readFileSync(TS_PATH, 'utf8');
const revision = (source.match(/DEFAULT_CATALOG_REVISION = '([^']+)'/) || [])[1];
const expectedLabel = `Borrador propio · contraste de bandas de mercado · ${String(revision).slice(0, 7)}`;

const services = [];
for (const phaseBlock of source.split(/\n  \{\n/).slice(1)) {
  const phaseName = (phaseBlock.match(/(?:^|\n)\s*name: '([^']+)'/) || [])[1];
  for (const block of phaseBlock.split(/\n      \{\n/).slice(1)) {
    const pick = (pattern) => (block.match(pattern) || [])[1];
    const anchor = block.match(/material_anchor: (?:'([^']*)'|null)/);
    services.push({
      phase: phaseName,
      code: pick(/code: '([^']+)'/),
      name: pick(/name: '([^']+)'/),
      unit: pick(/unit: '([^']+)'/),
      base_price: Number(pick(/base_price: ([\d.]+)/)),
      price_min: Number(pick(/price_min: ([\d.]+)/)),
      price_max: Number(pick(/price_max: ([\d.]+)/)),
      source_kind: pick(/source_kind: '([^']+)'/),
      labour_hours: Number(pick(/labour_hours: ([\d.]+)/)),
      labour_category: pick(/labour_category: '([^']+)'/),
      material_anchor: !anchor ? undefined : (anchor[1] ?? null),
      usesSourceConstant: /price_source: DEFAULT_CATALOG_PRICE_SOURCE,/.test(block),
      usesRevisionConstant: /price_reviewed_at: DEFAULT_CATALOG_REVISION,/.test(block),
    });
  }
}

// ---- checks -------------------------------------------------------------------
const ALLOWED_DRIVERS = ['labour', 'material', 'mixed', 'admin-fee'];
const ALLOWED_CATEGORIES = ['peón', 'of.1', 'of.2', 'espec.', 'téc.'];

if (docRows.length !== 60) problems.push(`doc: expected 60 partidas, found ${docRows.length}`);
if (services.length !== 60) problems.push(`default-catalog.ts: expected 60 partidas, found ${services.length}`);

const phaseNames = new Set(services.map((s) => s.phase));
if (phaseNames.size !== 10) problems.push(`default-catalog.ts: expected 10 phases, found ${phaseNames.size}`);

for (const [label, rows] of [
  ['doc', docRows],
  ['default-catalog.ts', services],
]) {
  const seen = new Map();
  for (const row of rows) {
    if (seen.has(row.code)) problems.push(`${label}: duplicate code ${row.code}`);
    seen.set(row.code, true);
  }
}

const docByCode = new Map(docRows.map((r) => [r.code, r]));
for (const service of services) {
  const row = docByCode.get(service.code);
  if (!row) {
    problems.push(`${service.code}: in default-catalog.ts but missing from the doc`);
    continue;
  }
  for (const field of ['name', 'unit', 'base_price', 'price_min', 'price_max', 'labour_hours', 'labour_category', 'material_anchor', 'source_kind']) {
    if (service[field] !== row[field]) {
      problems.push(`${service.code}: ${field} code=${service[field]} doc=${row[field]}`);
    }
  }
  if (!(service.price_min <= service.base_price && service.base_price <= service.price_max)) {
    problems.push(`${service.code}: base ${service.base_price} outside band ${service.price_min}-${service.price_max}`);
  }
  if (!(service.labour_hours > 0)) problems.push(`${service.code}: labour_hours must be > 0`);
  if (service.material_anchor === undefined) problems.push(`${service.code}: material_anchor missing`);
  if (!ALLOWED_DRIVERS.includes(service.source_kind)) problems.push(`${service.code}: unknown source_kind ${service.source_kind}`);
  if (!ALLOWED_CATEGORIES.includes(service.labour_category)) problems.push(`${service.code}: unknown labour_category ${service.labour_category}`);
  if (!service.usesSourceConstant) problems.push(`${service.code}: price_source is not DEFAULT_CATALOG_PRICE_SOURCE`);
  if (!service.usesRevisionConstant) problems.push(`${service.code}: price_reviewed_at is not DEFAULT_CATALOG_REVISION`);
}
for (const row of docRows) {
  if (!services.some((s) => s.code === row.code)) problems.push(`${row.code}: in the doc but missing from default-catalog.ts`);
}
if (!revision) problems.push('default-catalog.ts: DEFAULT_CATALOG_REVISION not found');

console.log(`doc: ${docRows.length} partidas | default-catalog.ts: ${services.length} partidas in ${phaseNames.size} phases`);
console.log(`basis shown in the app: "${expectedLabel}" (reviewed ${revision})`);
console.log(problems.length ? `PROBLEMS:\n- ${problems.join('\n- ')}` : 'OK: doc and shipped catalogue agree');
process.exit(problems.length ? 1 : 0);
