import json, os, re, glob

BASE = "/Users/mac/Documents/Dev/infinite-canvas/.verify-tools/frontend-diff"
ORIG = os.path.join(BASE, "orig-json")
LOCAL = os.path.join(BASE, "local-dom")
OUT = "/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/replica/frontend-1to1"
os.makedirs(OUT, exist_ok=True)

# 原站全站壳 / 品牌 / 计费：不复刻
ORIG_NOISE = [
    r"^购\s*买$", r"算力", r"^用$", r"LinkFox", r"ljq_driver", r"^操作咨询", r"^产品教程",
    r"^学习中心$", r"^免费得算力$", r"^Skills$", r"^Agent$", r"^更多$", r"^HOT$", r"^NEW$",
    r"^个人账号$", r"^用户\d*$", r"^免责声明$", r"^灵感", r"^创作$", r"^工具$", r"^一键做同款$",
    r"^优秀案例$", r"^案例$", r"^@名称$", r"^@水印文案$", r"^默认$", r"^管理水印分组$",
    r"^＋新增水印分组$", r"^本图片由.*生成$", r"^\(\)$", r"^首页$", r"^批量生图$", r"^商品图设计$",
]
# 本地我们自加的壳 / 状态 / 说明：不属于 1:1 工具面板
OUR_NOISE = [
    r"^v\d+\.\d+\.\d+$", r"^中$", r"^EN$", r"^切换到.*主题$", r"^连接$", r"^未连接$", r"^已连接$",
    r"^插件已装$", r"^直接运行$", r"^连接本地Agent$", r"^CLI", r"^Claude\s*Code$", r"^Codex$", r"^Galley$",
    r"^/$", r"^·$", r"^\d+×$", r"^on$", r"^/tools/", r"默认渠道", r"^grok-", r"^【.*模板v\d】",
    r"^原站标注", r"^填好参数并提交后", r"^本工具还没有历史任务", r"^点连接会自动", r"^当前浏览器不支持人脸检测",
]

def noise(t, pats):
    n = re.sub(r"\s+", "", t or "")
    if not n:
        return True
    for p in pats:
        if re.search(p, n):
            return True
    return False

def norm(s):
    s = (s or "").replace("\u00a0", " ")
    s = re.sub(r"\s+", "", s)
    s = re.sub(r"\d+算力", "", s)
    return s.strip()

def load(p, is_orig):
    d = json.load(open(p, encoding="utf-8"))
    ctrls = []
    for c in d.get("controls", []) or []:
        r = c.get("rect") or {}
        ctrls.append({
            "text": (c.get("text") or "").strip(),
            "ph": (c.get("placeholder") or "").strip(),
            "disabled": bool(c.get("disabled")),
            "x": round(r.get("x", 0)), "y": round(r.get("y", 0)),
            "w": round(r.get("width", 0)), "h": round(r.get("height", 0)),
        })
    regions = []
    for g in d.get("regions", []) or []:
        if isinstance(g, dict):
            r = g.get("rect") or {}
            regions.append({
                "text": (g.get("text") or "").strip(),
                "tag": g.get("tag") or "",
                "x": round(r.get("x", 0)), "y": round(r.get("y", 0)),
                "w": round(r.get("width", 0)), "h": round(r.get("height", 0)),
            })
    lines = [l.strip() for l in (d.get("text") or "").split("\n") if l.strip()]
    return {"ctrls": ctrls, "regions": regions, "lines": lines,
            "title": d.get("title", ""), "url": d.get("url", "")}

def main():
    idx = []
    for p in sorted(glob.glob(os.path.join(LOCAL, "*.json"))):
        tid = os.path.basename(p)[:-5]
        op = os.path.join(ORIG, tid + ".json")
        if not os.path.exists(op):
            continue
        o = load(op, True)
        l = load(p, False)

        oset = {norm(c["text"]) for c in o["ctrls"] if c["text"]} | {norm(c["ph"]) for c in o["ctrls"] if c["ph"]}
        lset = {norm(c["text"]) for c in l["ctrls"] if c["text"]} | {norm(c["ph"]) for c in l["ctrls"] if c["ph"]}

        missing = [c for c in o["ctrls"]
                   if (norm(c["text"]) or norm(c["ph"])) and not noise(c["text"] or c["ph"], ORIG_NOISE)
                   and (norm(c["text"]) or norm(c["ph"])) not in lset]
        extra = [c for c in l["ctrls"]
                 if (norm(c["text"]) or norm(c["ph"])) and not noise(c["text"] or c["ph"], OUR_NOISE)
                 and (norm(c["text"]) or norm(c["ph"])) not in oset]

        o_lines = [x for x in o["lines"] if not noise(x, ORIG_NOISE)]
        l_lines_n = {norm(x) for x in l["lines"]}
        miss_txt = [x for x in o_lines if norm(x) not in l_lines_n]
        l_lines_f = [x for x in l["lines"] if not noise(x, OUR_NOISE)]
        o_lines_n = {norm(x) for x in o_lines}
        extra_txt = [x for x in l_lines_f if norm(x) not in o_lines_n]

        # 原站控件按位置排序 = 布局顺序（1:1 依据）
        ordered = sorted([c for c in o["ctrls"] if not noise(c["text"] or c["ph"], ORIG_NOISE)],
                         key=lambda c: (c["y"], c["x"]))

        md = [f"# {tid} — 前端 1:1 对齐规格", "",
              f"- 原站 URL：{o['url']}", f"- 原站控件数：{len(o['ctrls'])}（有效 {len(ordered)}）｜本地控件数：{len(l['ctrls'])}",
              f"- 缺失控件：{len(missing)}｜多余控件：{len(extra)}｜缺失文案：{len(miss_txt)}｜多余文案：{len(extra_txt)}", ""]

        md += ["## A. 原站控件布局（按 y,x 排序，坐标取自原站 1440 视口）", "",
               "| # | y | x | w×h | 文本 | placeholder | 禁用 |", "|---|---|---|---|---|---|---|"]
        for i, c in enumerate(ordered, 1):
            md.append(f"| {i} | {c['y']} | {c['x']} | {c['w']}×{c['h']} | {c['text']} | {c['ph']} | {'是' if c['disabled'] else ''} |")

        md += ["", "## B. 本地缺失（原站有、本地没有）", ""]
        md += [f"- [ ] `{c['text'] or c['ph']}`  @y={c['y']} x={c['x']} {c['w']}×{c['h']}" for c in missing] or ["- （无）"]

        md += ["", "## C. 本地多余（本地有、原站没有 → 移出工具面板）", ""]
        md += [f"- [ ] `{c['text'] or c['ph']}`" for c in extra] or ["- （无）"]

        md += ["", "## D. 缺失可见文案（原站有、本地没有）", ""]
        md += [f"- [ ] {x}" for x in miss_txt] or ["- （无）"]

        md += ["", "## E. 多余可见文案（本地有、原站没有）", ""]
        md += [f"- [ ] {x}" for x in extra_txt[:60]] or ["- （无）"]

        open(os.path.join(OUT, tid + ".md"), "w").write("\n".join(md) + "\n")
        idx.append((tid, len(o["ctrls"]), len(l["ctrls"]), len(missing), len(extra), len(miss_txt), len(extra_txt)))

    lines = ["# 39 工具前端 1:1 差异总表", "",
             "生成方式：原站 DOM 证据（page-dom-20261028）+ 本地页面 Playwright 抓取，机械比对；已剔除 LinkFox 全站壳/品牌词与本产品外壳。", "",
             "| 工具 | 原站控件 | 本地控件 | 缺失控件 | 多余控件 | 缺失文案 | 多余文案 |", "|---|---|---|---|---|---|---|"]
    for t in sorted(idx, key=lambda r: -(r[3] + r[5])):
        lines.append(f"| [{t[0]}](./{t[0]}.md) | {t[1]} | {t[2]} | {t[3]} | {t[4]} | {t[5]} | {t[6]} |")
    open(os.path.join(OUT, "00-INDEX.md"), "w").write("\n".join(lines) + "\n")
    print("wrote", len(idx), "specs to", OUT)
    for t in sorted(idx, key=lambda r: -(r[3] + r[5]))[:15]:
        print(f"{t[0]:26} miss={t[3]:>3} extra={t[4]:>3} missTxt={t[5]:>3}")

if __name__ == "__main__":
    main()
