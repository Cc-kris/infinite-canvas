#!/bin/bash
export PATH="$HOME/.bun/bin:$PATH"
ROOT=/Users/mac/Documents/Dev/ga-gate-af0522f
cd "$ROOT/web" || exit 100
rm -f tsconfig*.tsbuildinfo
echo "=== gate start $(date -u +%FT%TZ) ===" > "$ROOT/.gate-logs/summary.txt"
echo "commit=af0522fcf4ddebaf7a0df2ad5511fa5b051f04f0" >> "$ROOT/.gate-logs/summary.txt"
echo "tree=640582300afc24a109a9abcd0dbb4b457bac60c4" >> "$ROOT/.gate-logs/summary.txt"
echo "bun=$(bun --version) node=$(node --version)" >> "$ROOT/.gate-logs/summary.txt"

start=$SECONDS
bun run typecheck > "$ROOT/.gate-logs/typecheck.log" 2>&1
echo "typecheck_exit=$? duration=$((SECONDS-start))s" >> "$ROOT/.gate-logs/summary.txt"

start=$SECONDS
bun test > "$ROOT/.gate-logs/test.log" 2>&1
echo "test_exit=$? duration=$((SECONDS-start))s" >> "$ROOT/.gate-logs/summary.txt"

start=$SECONDS
bun run build > "$ROOT/.gate-logs/build.log" 2>&1
echo "build_exit=$? duration=$((SECONDS-start))s" >> "$ROOT/.gate-logs/summary.txt"
echo "=== gate end $(date -u +%FT%TZ) ===" >> "$ROOT/.gate-logs/summary.txt"
touch "$ROOT/.gate-logs/DONE"
