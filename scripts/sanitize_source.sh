#!/usr/bin/env bash
set -euo pipefail

# Collect target JS files (root + src), skip node_modules and scripts
mapfile -d '' FILES < <(
  { find . -maxdepth 1 -type f \( -name "*.js" -o -name "*.mjs" -o -name "*.cjs" \);
    find ./src -type f \( -name "*.js" -o -name "*.mjs" -o -name "*.cjs" \); } \
  | grep -vzE '^(./node_modules/|./scripts/)' \
  | tr '\n' '\0'
)

DRY=1
[[ "${1:-}" == "--apply" ]] && DRY=0

needs_clean() {
  grep -qE '&(amp|lt|gt|quot|apos|#[0-9]+);|\\_|\\\*' "$1"
}

fix_file() {
  local f="$1"
  local sedscript
  sedscript="$(mktemp)"
  cat > "$sedscript" <<'SED'
s/&quot;/"/g
s/&#34;/"/g
s/&apos;/'"'"'/g
s/&#39;/'"'"'/g
s/&amp;/\&/g
s/&lt;/</g
s/&gt;/>/g
s/\\_/_/g
s/\\\*/\*/g
SED

  if [[ "$DRY" -eq 1 ]]; then
    tmp="$(mktemp)"; cp -- "$f" "$tmp"
    sed -i -f "$sedscript" "$tmp"
    if ! cmp -s "$f" "$tmp"; then
      echo "Would fix: $f"
      diff -u --color=always "$f" "$tmp" || true
    fi
    rm -f "$tmp" "$sedscript"
  else
    sed -i -f "$sedscript" "$f"
    rm -f "$sedscript"
    echo "Fixed: $f"
  fi
}

for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || continue
  if needs_clean "$f"; then
    fix_file "$f"
  fi
done

[[ "$DRY" -eq 1 ]] && echo -e "\nDry run complete. Re-run with --apply to write changes."
