#!/bin/bash
# measure.sh — 冻结 worker → 抓取(带重试) → 比对 → 恢复 worker
# 用法: bash measure.sh [--no-freeze]
VD=/Users/mac/Documents/Dev/infinite-canvas/.verify-tools/frontend-diff
T="$HOME/Library/Application Support/app.galley/managed-ga-state/temp"
FREEZE=1
[ "$1" = "--no-freeze" ] && FREEZE=0
PIDS=$(ps -ax -o pid=,command= | grep "ga_worker.py --task" | grep -v grep | awk '{print $1}')
if [ "$FREEZE" = "1" ]; then for p in $PIDS; do kill -STOP $p 2>/dev/null; done; sleep 1; fi
cd /Users/mac/Documents/Dev/infinite-canvas/web && node "$VD/capture3.mjs" 2>&1 | tail -2
cd "$VD" && python3 spec3.py 2>&1 | head -14
if [ "$FREEZE" = "1" ]; then for p in $PIDS; do kill -CONT $p 2>/dev/null; done; fi
echo "measure done $(date '+%H:%M:%S')"
