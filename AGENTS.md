# AGENTS.md — working rules for this repo

Applies to every AI agent (Cline, GitHub Copilot, Codex, Claude Code…) working in
`renovation-estimates-saas`. Read this before the first tool call.

## 0. Language

- Always **answer the user in English**, whatever language they write in.
- Code, comments, commit messages and docs you write: English.
- Exception: the app's user-facing UI copy stays Spanish (see `SPEC.md`), and `SPEC.md`
  itself is written Spanish-first — that is about the product, not about how you reply.

## 1. Priority of these rules

These rules exist to cut token cost. They **never** outrank security or correctness.
The savings apply to exploration, verbosity and repetition — never to validation,
RLS/authorization checks, secret handling, or "the build must pass".
If a rule below would hide a security problem or ship unverified code, break the rule
and say why.

## 2. Never read, never search (or only names, not values)

- `.next/`, `node_modules/`, `venv/`, `out/`, `dist/`, `.vercel/`
- `.git/` internals, `package-lock.json`, `tsconfig.tsbuildinfo`
- Binaries and documents: `*.pdf`, `*.xlsx`, images. Parse them with a script and print
  counts/derived values, never the payload.
- `.env.local`: key **names** only, never values. Never echo `DATABASE_URL`, tokens or
  any secret into the transcript.
- Prefer `grep -c` / `grep -l` / `grep -n` over reading a file; print counts instead of matches.
- Do not grep build output for strings that live in `src/` — search the source.

## 3. Bounded reads

- Read with a line range (`start_line`/`end_line`, or `sed -n 'X,Yp'`). Never pull a whole
  large file "to be safe". Cap a single read at ~400 lines.
- Never re-read a file already read in this session; use what you already have.
- Read `SPEC.md` section by section, not end to end.

## 4. Bounded command output

- Pipe long output through `| tail -40`, `| head -40`, `grep -c` or `wc -l`.
- No dumps of `psql` result sets, JSON payloads, build logs or diffs of generated files.
- Prefer one command that answers the question over three that explore.
- Never repeat a command whose result you already have, and never re-run it "just to confirm".

## 5. Database

- Read-only `SELECT` only, with `LIMIT` or `count(*)`; never `SELECT *` without a limit.
- Mutations (INSERT/UPDATE/DELETE) only when the user explicitly asks, always preceded by a
  backup (`\copy … to '/tmp/…'`) or wrapped in a transaction, with counts verified before and after.
- Always scope by `company_id` (multi-tenant) and re-check the affected rows.
- Never touch `supabase/` migrations or RLS policies unless that is exactly the task.

## 6. Verification budget

- Run `npx tsc --noEmit`, `npm run lint` and `npm run build` **once per code change**.
- Do not re-run a regression suite to reconfirm something already confirmed, and do not loop
  on hypotheses: state what you will check, then check it once.
- Deploy/alias polling: at most 2–3 checks.
- Do not commit or push unless the user asks; **never push without an explicit instruction**.
  Before any commit: `git status --short` plus a scoped conventional message.

## 7. Sessions and reporting

- One session per task. When the topic closes, end the session instead of stacking a new
  topic onto a large context.
- If context grows without progress: stop, summarize state and open questions, and ask.
- Close every task with: files changed (and commit), how it was verified, what remains
  unverified. Say plainly when something was not tested.
