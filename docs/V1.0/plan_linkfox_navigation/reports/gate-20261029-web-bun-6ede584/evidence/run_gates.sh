#!/bin/bash
# 固定快照 web 三闸：git archive 独立导出 + frozen install + typecheck/test/build
# 用法: ./run_gates.sh <commit> <绝对导出目录>
set -u
COMMIT="${1:?commit required}"
ROOT="${2:?export dir required}"
REPO=/Users/mac/Documents/Dev/infinite-canvas
export PATH="$HOME/.bun/bin:$PATH"

rm -rf "$ROOT"; mkdir -p "$ROOT"
git -C "$REPO" archive --format=tar "$COMMIT" | tar -x -C "$ROOT" || exit 100

cd "$ROOT/web" || exit 100
bun install --frozen-lockfile || exit 101
rm -f tsconfig*.tsbuildinfo

mkdir -p "$ROOT/.gate-logs"
S="$ROOT/.gate-logs/summary.txt"
{
  echo "=== gate start $(date -u +%FT%TZ) ==="
  echo "commit=$(git -C "$REPO" rev-parse "$COMMIT")"
  echo "tree=$(git -C "$REPO" rev-parse "$COMMIT^{tree}")"
  echo "bun=$(bun --version) node=$(node --version 2>/dev/null)"
} > "$S"

start=$SECONDS
bun run typecheck > "$ROOT/.gate-logs/typecheck.log" 2>&1
echo "typecheck_exit=$? duration=$((SECONDS-start))s" >> "$S"

start=$SECONDS
bun test > "$ROOT/.gate-logs/test.log" 2>&1
echo "test_exit=$? duration=$((SECONDS-start))s" >> "$S"

start=$SECONDS
bun run build > "$ROOT/.gate-logs/build.log" 2>&1
echo "build_exit=$? duration=$((SECONDS-start))s" >> "$S"

echo "=== gate end $(date -u +%FT%TZ) ===" >> "$S"
touch "$ROOT/.gate-logs/DONE"
cat "$S"
