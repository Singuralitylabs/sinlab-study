#!/usr/bin/env sh
# Generate app/types/lib/database.types.ts from remote Supabase.
# Prefers already-set env (Cloud secrets) over .env.local placeholders.
set -e

cr=$(printf '\r')

if [ -f .env.local ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    # CRLF from Windows editors must not leak into values
    line=${line%"$cr"}
    case "$line" in
      "" | \#*) continue ;;
      export\ *) line=${line#export } ;;
    esac
    case "$line" in
      *=*) ;;
      *) continue ;;
    esac
    key=${line%%=*}
    val=${line#*=}
    case "$key" in
      [A-Za-z_][A-Za-z0-9_]*) ;;
      *) continue ;;
    esac
    # Strip one layer of matching quotes (dotenv-style KEY="value")
    case "$val" in
      \"*\") val=${val#\"}; val=${val%\"} ;;
      \'*\') val=${val#\'}; val=${val%\'} ;;
    esac
    # Do not overwrite vars already present in the process environment
    cur=$(printenv "$key" 2>/dev/null || true)
    if [ -z "$cur" ]; then
      export "${key}=${val}"
    fi
  done < .env.local
fi

tmp=$(mktemp)
# Remove temp on failure so a half-written types file is never left behind
# shellcheck disable=SC2064
trap 'rm -f "$tmp"' EXIT

# Prefer dedicated DB URL, then project-id + access token.
# DATABASE_URL is intentionally not used (often pooler/prod; see README).
if [ -n "${SUPABASE_DB_URL:-}" ]; then
  bun x supabase gen types --lang=typescript --db-url "$SUPABASE_DB_URL" --schema public >"$tmp"
elif [ -n "${SUPABASE_PROJECT_ID:-}" ]; then
  bun x supabase gen types --lang=typescript --project-id "$SUPABASE_PROJECT_ID" --schema public >"$tmp"
else
  echo "Set SUPABASE_DB_URL or SUPABASE_PROJECT_ID (+ SUPABASE_ACCESS_TOKEN)" >&2
  exit 2
fi

mv "$tmp" app/types/lib/database.types.ts
trap - EXIT
bun x biome format --write app/types/lib/database.types.ts
