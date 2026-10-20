#!/usr/bin/env node
/**
 * What the app actually looks like on a phone, measured instead of guessed.
 *
 * The mobile work is judged at a 390px viewport, and eying a desktop browser squeezed
 * narrow is not the same thing. This drives the local dev server at an iPhone-sized
 * viewport, logs in with a QA account, screenshots the screens that matter, and prints
 * the three numbers a human eye is bad at:
 *
 *   - horizontal overflow  (is the page wider than the screen?)
 *   - field font size      (below 16px, iOS Safari zooms and never zooms back)
 *   - tap targets          (anything under 40×40 is a miss with a thumb)
 *
 *   node scripts/mobile-shots.mjs                  # assumes `npm run dev` on :3000
 *   node scripts/mobile-shots.mjs --port 3111
 *   node scripts/mobile-shots.mjs --only catalog
 *   node scripts/mobile-shots.mjs --public         # login screen only, no account needed
 *
 * Needs Playwright, deliberately *not* a saved dependency (it would download browsers
 * on every Vercel install for a script CI never runs):
 *
 *   npm i --no-save playwright-core      # uses the Chrome installed on the machine
 *
 * Credentials come from `.env.e2e.local` (gitignored) as E2E_EMAIL / E2E_PASSWORD.
 * They are read here and handed to the browser — never printed, never logged, and a
 * failure says only *that* login failed, not what was tried.
 *
 * Chromium is not iOS Safari: this proves layout, sizes and overflow at phone width.
 * It cannot prove the iOS zoom, the native decimal keypad or `navigator.share` —
 * those need the real device (see SPEC.md §5, mobile phase 1).
 *
 * Screenshots land in `--out` (default `/tmp/mobile-shots`). Read-only against the
 * app: no save, no delete, no import.
 */
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

// ---- arguments & env -----------------------------------------------------------
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const OUT = arg('out', '/tmp/mobile-shots');
const PORT = arg('port', '3000');
const BASE = arg('base', `http://localhost:${PORT}`).replace(/\/$/, '');
const ONLY = arg('only', ''); // a substring of a screen name, to re-shoot just one

/** Minimal `.env.e2e.local` reader: KEY=value, `#` comments, optional quotes. */
function readEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const env = readEnvFile(new URL('../.env.e2e.local', import.meta.url));
const email = process.env.E2E_EMAIL || env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD || env.E2E_PASSWORD;

/** `--public` shoots only what needs no session — useful before there is a QA account. */
const PUBLIC_ONLY = process.argv.includes('--public');

if (!PUBLIC_ONLY && (!email || !password)) {
  console.error(
    [
      'No QA credentials found.',
      '',
      '  Put two lines in .env.e2e.local (gitignored, never commit it):',
      '    E2E_EMAIL=…',
      '    E2E_PASSWORD=…',
      '',
      'Use a dedicated QA account on a throwaway company — never a real customer login.',
      'Or run with --public to check the login screen alone.',
    ].join('\n'),
  );
  process.exit(2);
}

const TAP = 40; // 40px is the floor for a thumb; 44 is the iOS HIG number.

// ---- measuring -----------------------------------------------------------------
/**
 * Everything a screenshot shows but a screenshot cannot count. Runs inside the page,
 * so it sees computed styles — the 16px rule and the CSS grid, not the source.
 */
function measure() {
  const TAP = 40; // module scope is not visible inside the page; keep the number here too
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const overflow = document.documentElement.scrollWidth - vw;

  // Which elements stick out past the right edge — the row that breaks the layout.
  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= vw + 1) continue;
    // Only the outermost offender matters: a child of a too-wide row adds noise.
    const parent = el.parentElement;
    if (parent && parent.getBoundingClientRect().right > vw + 1) continue;
    offenders.push({
      tag: el.tagName.toLowerCase(),
      cls: String(el.className || '').slice(0, 70),
      right: Math.round(r.right),
    });
  }

  const fields = [...document.querySelectorAll('input, select, textarea')].map((el) => ({
    name: el.getAttribute('aria-label') || el.name || el.type,
    px: Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10,
  }));

  const targets = [];
  for (const el of document.querySelectorAll('button, a, [role="button"]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.top > vh * 60) continue; // a long page: keep the list usable
    const label = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ');
    targets.push({
      label: label.slice(0, 44) || `(${el.tagName.toLowerCase()})`,
      w: Math.round(r.width),
      h: Math.round(r.height),
    });
  }

  return {
    overflow,
    offenders: offenders.slice(0, 5),
    fieldCount: fields.length,
    minFieldPx: fields.length ? Math.min(...fields.map((f) => f.px)) : null,
    smallFields: fields.filter((f) => f.px > 0 && f.px < 16).slice(0, 8),
    targetCount: targets.length,
    smallTargets: targets.filter((t) => t.w < TAP || t.h < TAP).slice(0, 10),
  };
}

/** Screens that matter, in the order a person walks through them. */
const SCREENS = [
  { name: '02-clients', path: '/clients' },
  {
    name: '03-client',
    path: '/clients',
    async prepare(page) {
      await page.locator('a[href^="/clients/"]').first().click();
      await page.waitForURL(/\/clients\/[^/]+$/);
    },
  },
  {
    name: '04-estimate',
    path: '/clients',
    // The editor paints its rows client-side; measuring it early invents overflow.
    settle: 3000,
    async prepare(page) {
      await page.locator('a[href^="/clients/"]').first().click();
      await page.waitForURL(/\/clients\/[^/]+$/);
      const firstEstimate = page.locator('a[href*="/estimates/"]').first();
      if ((await firstEstimate.count()) === 0) return false;
      await firstEstimate.click();
      await page.waitForURL(/\/estimates\/[^/]+$/);
    },
  },
  { name: '05-catalog', path: '/catalog' },
];

// ---- the run -------------------------------------------------------------------
const main = async () => {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 12/13/14 logical size
    deviceScaleFactor: 1, // CSS pixels are what the rules are written in; keeps PNGs small
    isMobile: true,
    hasTouch: true,
    locale: 'es-ES',
  });
  const page = await context.newPage();
  const report = [];

  // The login screen is captured *before* signing in: once a session exists, /login
  // redirects away and the shot would show /clients instead.
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  {
    const metrics = await page.evaluate(measure);
    const file = join(OUT, '01-login.png');
    await page.screenshot({ path: file, fullPage: true });
    report.push({ name: '01-login', file, ...metrics });
  }

  // Then log in: everything below is behind the middleware.
  if (!PUBLIC_ONLY) {
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    // `login()` reports a refusal by redirecting to /login?message=… (see actions.ts),
    // so "still on /login" is a failure *with an explanation in the query string*.
    await page
      .waitForFunction(
        () =>
          !location.pathname.startsWith('/login') ||
          new URLSearchParams(location.search).has('message'),
        null,
        { timeout: 25000 },
      )
      .catch(() => {});
    const after = new URL(page.url());
    if (after.pathname.startsWith('/login')) {
      const said = after.searchParams.get('message');
      console.error(`Login rejected${said ? `: ${said.slice(0, 160)}` : ' (no message returned)'}.`);
      // Supabase answers "invalid credentials" both for a wrong password *and* for an
      // address that never signed up, so point at the two checks worth making first.
      console.error('  Check: does that address exist in this Supabase project, and is its email confirmed?');
      console.error('The credentials were read from .env.e2e.local and were not printed.');
      await browser.close();
      process.exit(3);
    }
  }

  for (const screen of SCREENS) {
    if (PUBLIC_ONLY) break;
    if (ONLY && !screen.name.includes(ONLY)) continue;

    await page.goto(`${BASE}${screen.path}`, { waitUntil: 'domcontentloaded' });
    // The editor fetches its rows client-side; give it a beat to paint. `networkidle`
    // is the honest signal, the timer is only there for pages that poll forever.
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(screen.settle ?? 1200);

    if (screen.prepare) {
      const moved = await screen.prepare(page).catch(() => false);
      if (moved === false) {
        report.push({ name: screen.name, skipped: 'no link to open' });
        continue;
      }
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(screen.settle ?? 1200);
    }

    const metrics = await page.evaluate(measure);
    const file = join(OUT, `${screen.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    report.push({ name: screen.name, file, ...metrics });
  }

  await browser.close();

  // A compact, printable summary: the numbers first, the pretty pictures second.
  for (const r of report) {
    if (r.skipped) {
      console.log(`\n${r.name}: skipped — ${r.skipped}`);
      continue;
    }
    console.log(`\n${r.name}  → ${r.file}`);
    console.log(`  overflow: ${r.overflow > 0 ? `+${r.overflow}px WIDER THAN THE SCREEN` : 'none'}`);
    for (const o of r.offenders) console.log(`    past the edge: <${o.tag}> right=${o.right} ${o.cls}`);
    const under16 = r.smallFields.length ? '  ← under 16px (iOS will zoom)' : '';
    console.log(`  fields: ${r.fieldCount}, smallest ${r.minFieldPx ?? '—'}px${under16}`);
    for (const f of r.smallFields) console.log(`    ${f.px}px  ${f.name}`);
    console.log(`  tap targets: ${r.targetCount}, under ${TAP}px: ${r.smallTargets.length}`);
    for (const t of r.smallTargets) console.log(`    ${t.w}×${t.h}  «${t.label}»`);
  }

  const bad = report.filter((r) => !r.skipped && (r.overflow > 0 || r.smallFields.length > 0));
  console.log(
    bad.length
      ? `\n${bad.length} screen(s) need a look: ${bad.map((r) => r.name).join(', ')}`
      : '\nNo horizontal overflow and no field under 16px.',
  );
  console.log(`Screenshots in ${OUT}`);
};

main().catch((error) => {
  console.error(`mobile-shots failed: ${error.message}`);
  process.exit(1);
});
