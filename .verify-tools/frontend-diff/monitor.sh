#!/bin/bash
# 每 60s 记录 worker 进度快照；跑 90 分钟后自停
T="$HOME/Library/Application Support/app.galley/managed-ga-state/temp"
P=/Users/mac/Documents/Dev/infinite-canvas
LOG="$T/monitor_workers.log"
for i in $(seq 1 90); do
  {
    echo "########## $(date '+%m-%d %H:%M:%S') alive=$(ps -ax -o command= | grep 'ga_worker.py --task' | grep -vc grep)"
    ps -ax -o command= | grep "ga_worker.py --task" | grep -v grep | sed -E 's/.*--task ([a-z0-9_]+) --llm ([0-9]+).*/\1(llm\2)/' | tr '\n' ' '; echo
    cd "$P" && git diff --stat -- web/src | tail -8
    grep -l "SSE Upstream\|forbidden" "$T"/fx_b*/run.log 2>/dev/null | tr '\n' ' '; echo
  } >> "$LOG"
  sleep 60
done
