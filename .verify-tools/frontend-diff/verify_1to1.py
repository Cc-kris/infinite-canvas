import json, os, re, glob

B = "/Users/mac/Documents/Dev/infinite-canvas/.verify-tools/frontend-diff"
ORIG, LOCAL = os.path.join(B, "orig-json"), os.path.join(B, "local-dom2")

SHELL = re.compile(r"^(首页|电商套图|智能修图|新模型|AI视频|HOT|批量生图|商品图设计|Skills|Agent|更多|学习中心|免费得算力|购\s*买|用|个人账号|用户\d*|灵感|创作|工具|历史记录|免责声明|操作咨询|产品教程|登录|注册|会员|充值|客服|帮助中心|教程|优秀案例|一键做同款)$")

def norm(s):
    s = re.sub(r"\s+", "", s or "")
    return re.sub(r"\d+算力", "", s)

def content_box(regs, vw, vh):
    cands = []
    for g in regs or []:
        if not isinstance(g, dict):
            continue
        b = g.get("box") or {}
        if not isinstance(b, dict):
            continue
        w, h = b.get("w", 0) or 0, b.get("h", 0) or 0
        x, y = b.get("x", 0) or 0, b.get("y", 0) or 0
        if w <= 50 or h <= 50:
            continue
        if x < 0 or y < 0 or x + w > vw + 8 or y + h > vh + 8:
            continue
        cls = str(g.get("cls") or "")
        tag = str(g.get("tag") or "")
        cands.append((tag, cls, w * h, b))
    big = [c for c in cands if c[2] >= 200000]
    pool = ([c for c in big if any(k in c[1] for k in ("content", "workspace", "panel"))]
            or [c for c in big if c[0] == "MAIN"] or big)
    if pool:
        return max(pool, key=lambda c: c[2])[3]
    return {"x": 190, "y": 110, "w": vw - 190, "h": vh - 110}


def inside(b, cb, tol=2):
    return (b.get("x", 0) >= cb["x"] - tol and b.get("y", 0) >= cb["y"] - tol
            and b.get("x", 0) + b.get("w", 0) <= cb["x"] + cb["w"] + tol
            and b.get("y", 0) + b.get("h", 0) <= cb["y"] + cb["h"] + tol)

def collect(d):
    vw, vh = (d.get("viewport") or [1920, 839])[:2]
    cb = content_box(d.get("regions"), vw, vh)
    els = []
    for e in d.get("textEls") or []:
        if not isinstance(e, dict):
            continue
        t = norm(e.get("text"))
        b = e.get("box") or {}
        if not isinstance(b, dict):
            continue
        if not t or SHELL.match(t) or len(t) > 120:
            continue
        if not inside(b, cb):
            continue
        els.append({"t": t, "x": b.get("x", 0) - cb["x"], "y": b.get("y", 0) - cb["y"],
                    "w": b.get("w", 0), "h": b.get("h", 0), "font": b.get("font")})
    return cb, els

def main():
    rows = []
    for p in sorted(glob.glob(os.path.join(LOCAL, "*.json"))):
        tid = os.path.basename(p)[:-5]
        op = os.path.join(ORIG, tid + ".json")
        if not os.path.exists(op):
            continue
        od = json.load(open(op, encoding="utf-8"))
        ld = json.load(open(p, encoding="utf-8"))
        ocb, oels = collect(od)
        lcb, lels = collect(ld)
        lmap = {}
        for e in lels:
            lmap.setdefault(e["t"], e)
        aligned = misplaced = 0
        missing, moved = [], []
        for e in oels:
            m = lmap.get(e["t"])
            if not m:
                missing.append(e)
                continue
            dx, dy = abs(m["x"] - e["x"]), abs(m["y"] - e["y"])
            if dx <= 12 and dy <= 12:
                aligned += 1
            else:
                misplaced += 1
                moved.append((e["t"], dx, dy))
        oset = {e["t"] for e in oels}
        extra = [e for e in lels if e["t"] not in oset]
        seen, ex = set(), []
        for e in extra:
            if e["t"] in seen:
                continue
            seen.add(e["t"]); ex.append(e)
        tot = len(oels)
        rows.append({
            "id": tid, "orig": tot, "local": len(lels),
            "aligned": aligned, "misplaced": misplaced,
            "missing": len(missing), "extra": len(ex),
            "score": round(aligned / tot * 100, 1) if tot else 0,
            "missing_items": [e["t"] for e in missing][:40],
            "moved_items": moved[:20],
            "extra_items": [e["t"] for e in ex][:40],
            "orig_box": ocb, "local_box": lcb,
        })
    json.dump(rows, open(os.path.join(B, "verify-1to1.json"), "w"), ensure_ascii=False, indent=1)

    print(f"{'TOOL':26}{'orig':>5}{'loc':>5}{'align':>6}{'move':>5}{'miss':>5}{'extra':>6}{'score%':>8}")
    for r in sorted(rows, key=lambda r: r["score"]):
        print(f"{r['id']:26}{r['orig']:>5}{r['local']:>5}{r['aligned']:>6}{r['misplaced']:>5}{r['missing']:>5}{r['extra']:>6}{r['score']:>8}")
    n = len(rows)
    print(f"\n平均对齐率 {sum(r['score'] for r in rows)/n:.1f}%  | 原站元素合计 {sum(r['orig'] for r in rows)}  缺失合计 {sum(r['missing'] for r in rows)}  多余合计 {sum(r['extra'] for r in rows)}")

if __name__ == "__main__":
    main()
