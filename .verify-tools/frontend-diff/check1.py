#!/usr/bin/env python3
"""单工具比对闭环：python3 check1.py TOOL [TOOL...] [--json]
输出该工具的原站/本地文本数、缺失清单、多余清单（与 spec3.py 完全同一算法）。"""
import json, os, sys, importlib.util

B = "/Users/mac/Documents/Dev/infinite-canvas/.verify-tools/frontend-diff"
spec = importlib.util.spec_from_file_location("spec3", os.path.join(B, "spec3.py"))
s3 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s3)

args = [a for a in sys.argv[1:] if not a.startswith("--")]
as_json = "--json" in sys.argv
if not args:
    print("usage: check1.py TOOL [TOOL...] [--json]"); sys.exit(2)

tot_m = tot_e = 0
for tid in [a.upper() for a in args]:
    op = os.path.join(s3.ORIG, tid + ".json")
    lp = os.path.join(s3.LOCAL, tid + ".json")
    if not (os.path.exists(op) and os.path.exists(lp)):
        print(f"{tid}: 缺数据文件（orig={os.path.exists(op)} local={os.path.exists(lp)}）"); continue
    o = json.load(open(op, encoding="utf-8"))
    l = json.load(open(lp, encoding="utf-8"))
    otexts = s3.uniq(s3.lines_of(o.get("text")))
    ltexts = s3.uniq(s3.local_content_texts(l))
    lkeys = {s3.norm(t) for t in ltexts}
    okeys = {s3.norm(t) for t in otexts}
    def hit(t, keys):
        k = s3.norm(t)
        return any(k == x or (len(k) > 3 and (k in x or x in k)) for x in keys)
    missing = [t for t in otexts if not hit(t, lkeys)]
    extra = [t for t in ltexts if not hit(t, okeys)]
    tot_m += len(missing); tot_e += len(extra)
    if as_json:
        print(json.dumps({"tool": tid, "orig": len(otexts), "local": len(ltexts),
                          "missing": missing, "extra": extra}, ensure_ascii=False)); continue
    print(f"\n===== {tid}  原站{len(otexts)} 本地{len(ltexts)}  缺失 {len(missing)}  多余 {len(extra)}")
    if missing:
        print("-- 缺失（原站有、本地无 → 必须逐字补齐）:")
        for t in missing: print("   -", t)
    if extra:
        print("-- 多余（本地有、原站无 → 删除或移出面板）:")
        for t in extra: print("   +", t)
if not as_json:
    print(f"\n合计 缺失={tot_m} 多余={tot_e}")
