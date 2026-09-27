# Copilot / agent instructions

The working rules for this repository live in [`AGENTS.md`](../AGENTS.md) at the repo root.

Read that file before the first tool call and follow it. It is the single source of truth —
do not duplicate the rules here.

Highlights (full detail in `AGENTS.md`):

- Reply in **English**; the app's UI copy stays Spanish.
- Never read `.next/`, `node_modules/`, `venv/`, binaries, or `.env*` values.
- Bounded reads (line ranges) and filtered command output (`tail`/`head`/`grep -c`).
- One verification pass (`tsc`, `lint`, `build`) per code change.
- Read-only SQL with `LIMIT`; mutations only on explicit request, with a backup.
- No commits, and never a push, unless the user explicitly asks.
- These rules never outrank security or correctness.
