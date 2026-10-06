#!/usr/bin/env bash
# Redacting psql wrapper — the ONLY sanctioned way for an agent to touch the DB.
#
# Why this exists: the shared password has been leaked into the transcript three
# times (grep from the repo root, and inline connection strings). The app itself
# never reads DATABASE_URL (0 refs in src/), so this wrapper covers the *only*
# legitimate use of the password: a hand-run query.
#
# Guarantees:
#   * loads DATABASE_URL from .env.local WITHOUT printing the file;
#   * pipes every byte of psql output (stdout AND stderr) through a redactor, so
#     even a libpq error can never carry the secret into the transcript;
#   * forces non-interactive psql (-tAX style) so it can never hang on a pager.
#
# Usage:  scripts/db.sh -tAX -c "select count(*) from estimates;"
#         scripts/db.sh -tAX -f /tmp/query.sql
set -euo pipefail

cd "$(dirname "$0")/.." || exit 1

if [[ -z "${DATABASE_URL:-}" && -f .env.local ]]; then
  # Pull ONLY the one key; never dump the file.
  DATABASE_URL="$(grep -m1 -E '^DATABASE_URL=' .env.local | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//')"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "db.sh: no DATABASE_URL in environment or .env.local" >&2
  exit 1
fi

# Mask "scheme://user:PASSWORD@" and any "...password=VALUE" / "DATABASE_URL=VALUE".
redact() {
  sed -E \
    -e 's#(://[^:/@]+:)[^@]+@#\1***@#g' \
    -e 's#([Pp]assword=)[^[:space:]]+#\1***#g' \
    -e 's#(DATABASE_URL=)[^[:space:]]+#\1***#g'
}

# -tAX: tuples only, unaligned, no psqlrc → no pager, no prompts, no surprises.
psql -tAX -v ON_ERROR_STOP=1 "$DATABASE_URL" "$@" 2>&1 | redact
