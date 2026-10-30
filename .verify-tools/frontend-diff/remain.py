#!/usr/bin/env python3
"""remain.py — 列出各工具当前剩余差异（与 spec3.py 同算法）。用法: python3 remain.py [--top N]"""
import json, glob, os, sys, importlib.util

B = "/Users/mac/Documents/Dev/infinite-canvas/.verify-tools/frontend-diff"
spec = importlib.util.spec_from_file_location("s3", os.path.join(B, "spec3.py"))
s3 = importlib.util.module_from_spec(spec); spec.loader.exec_module(s3)

def hit(t, keys):
    n = s3.norm(t)
    for x in keys:
        if n == x or (len(n) > 3 and (n in x or x in n)):
            return True
    return False

rows = []
for p in sorted(glob.glob(os.path.join(s3.ORIG, "*.json"))):
    tid = os.path.basename(p)[:-5]
    lp = os.path.join(s3.LOCAL, tid + ".json")
    if not os.path.exists(lp):
        continue
    o = json.load(open(p, encoding="utf-8"))
    l = json.load(open(lp, encoding="utf-8"))
    ot = s3.uniq(s3.lines_of(o.get("text")))
    lt = s3.uniq(s3.local_content_texts(l))
    ok, lk = {s3.norm(t) for t in ot}, {s3.norm(t) for t in lt}
    m = [t for t in ot if not hit(t, lk)]
    e = [t for t in lt if not hit(t, ok)]
    rows.append((tid, len(m), len(e), len(ot), len(lt), m, e))

rows.sort(key=lambda r: -(r[1] + r[2]))
n = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == "--top" else len(rows)
print(f"{'TOOL':24}{'miss':>5}{'extra':>6}{'orig':>6}{'local':>6}")
for r in rows[:n]:
    print(f"{r[0]:24}{r[1]:>5}{r[2]:>6}{r[3]:>6}{r[4]:>6}")
print(f"SUM miss={sum(r[1] for r in rows)} extra={sum(r[2] for r in rows)}  clean={sum(1 for r in rows if r[1]==0 and r[2]==0)}/39")
