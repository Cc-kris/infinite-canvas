import json, os, re, glob

B = "/Users/mac/Documents/Dev/infinite-canvas/.verify-tools/frontend-diff"
ORIG, LOCAL = os.path.join(B, "orig-json"), os.path.join(B, "local-dom2")
OUT = "/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/replica/frontend-1to1"
os.makedirs(OUT, exist_ok=True)

SHELL = re.compile(
    r"^(首页|电商套图|智能修图|新模型|AI视频|HOT|批量生图|商品图设计|Skills|Agent|更多|学习中心"
    r"|免费得算力|购\s*买|用|个人账号|用户\d*|灵感|灵感视频|创作|工具|历史记录|免责声明|操作咨询"
    r"|产品教程|登录|注册|会员|充值|客服|帮助中心|优秀案例|一键做同款|LinkFox.*|ljq_driver)$")

def norm(s):
    s = re.sub(r"\s+", "", s or "")
    s = re.sub(r"^[·•\-\|]+|[·•\-\|]+$", "", s)
    return s.lower()

def lines_of(txt):
    out = []
    for ln in (txt or "").split("\n"):
        ln = ln.strip()
        if not ln or SHELL.match(ln):
            continue
        out.append(ln)
    return out

def uniq(seq):
    seen, out = set(), []
    for s in seq:
        k = norm(s)
        if k and k not in seen:
            seen.add(k)
            out.append(s)
    return out

def local_content_texts(l):
    vw, vh = (l.get("viewport") or [1920, 839])[:2]
    cands = []
    for g in l.get("regions") or []:
        if not isinstance(g, dict):
            continue
        b = g.get("box") or {}
        if not isinstance(b, dict):
            continue
        w, h = b.get("w") or 0, b.get("h") or 0
        x, y = b.get("x") or 0, b.get("y") or 0
        if w <= 50 or h <= 50 or x < 0 or y < 0 or x + w > vw + 8 or y + h > vh + 8:
            continue
        cands.append((str(g.get("tag") or ""), str(g.get("cls") or ""), w * h, b))
    big = [c for c in cands if c[2] >= 200000]
    pool = ([c for c in big if any(k in c[1] for k in ("content", "workspace", "panel"))]
            or [c for c in big if c[0] == "MAIN"] or big)
    cb = max(pool, key=lambda c: c[2])[3] if pool else {"x": 190, "y": 110, "w": vw - 190, "h": vh - 110}
    out = []
    for e in l.get("textEls") or []:
        if not isinstance(e, dict):
            continue
        b = e.get("box") or {}
        if not isinstance(b, dict):
            continue
        x, y = b.get("x") or 0, b.get("y") or 0
        if x + 2 >= cb["x"] and y + 2 >= cb["y"] and x <= cb["x"] + cb["w"] and y <= cb["y"] + cb["h"]:
            for ln in lines_of(e.get("text")):
                out.append(ln)
    return out


def main():
    rows = []
    for p in sorted(glob.glob(os.path.join(ORIG, "*.json"))):
        tid = os.path.basename(p)[:-5]
        lp = os.path.join(LOCAL, tid + ".json")
        if not os.path.exists(lp):
            continue
        o = json.load(open(p, encoding="utf-8"))
        l = json.load(open(lp, encoding="utf-8"))
        otexts = uniq(lines_of(o.get("text")))
        ltexts = uniq(local_content_texts(l))
        lkeys = {norm(t) for t in ltexts}
        okeys = {norm(t) for t in otexts}
        # 子串也算命中（原站「共 1/20 个」vs 本地「共1/20个」）
        def hit(t, keys):
            k = norm(t)
            return any(k == x or (len(k) > 3 and (k in x or x in k)) for x in keys)
        missing = [t for t in otexts if not hit(t, lkeys)]
        extra = [t for t in ltexts if not hit(t, okeys)]
        rows.append(dict(id=tid, url=o.get("url", ""), o=otexts, l=ltexts,
                         missing=missing, extra=extra))
        md = [f"# {tid} — 前端 1:1 对齐工单", "",
              f"- 原站：{o.get('url','')}",
              f"- 原站内容文本 {len(otexts)} 条｜本地 {len(ltexts)} 条｜缺失 {len(missing)}｜多余 {len(extra)}",
              "", "## A. 原站内容清单（按页面顺序，逐条必须在本地出现且位置/样式一致）", ""]
        md += [f"{i+1}. {t}" for i, t in enumerate(otexts)]
        md += ["", "## B. 缺失（原站有、本地没有 → 必须补齐）", ""]
        md += [f"- [ ] {t}" for t in missing] or ["- （无）"]
        md += ["", "## C. 多余（本地有、原站没有 → 删除或移出工具面板）", ""]
        md += [f"- [ ] {t}" for t in extra] or ["- （无）"]
        open(os.path.join(OUT, tid + ".md"), "w").write("\n".join(md) + "\n")

    rows.sort(key=lambda r: -(len(r["missing"]) + len(r["extra"])))
    idx = ["# 39 工具前端 1:1 对齐工单总表", "",
           "| 工具 | 原站文本 | 本地文本 | 缺失 | 多余 |", "|---|---|---|---|---|"]
    for r in rows:
        idx.append(f"| [{r['id']}](./{r['id']}.md) | {len(r['o'])} | {len(r['l'])} | {len(r['missing'])} | {len(r['extra'])} |")
    open(os.path.join(OUT, "00-INDEX.md"), "w").write("\n".join(idx) + "\n")

    tot_m = sum(len(r["missing"]) for r in rows)
    tot_e = sum(len(r["extra"]) for r in rows)
    print(f"tools={len(rows)} 缺失合计={tot_m} 多余合计={tot_e}")
    for r in rows[:12]:
        print(f"{r['id']:24} o={len(r['o']):>3} l={len(r['l']):>3} miss={len(r['missing']):>3} extra={len(r['extra']):>3}")

if __name__ == "__main__":
    main()
