#!/usr/bin/env python3
"""B9 前半 20 工具：字段/默认值/控件类型 抽取 + 真实站 vs 本地 对照。
证据来源：evidence/b9-visual-parity-20261029/{real,local}/<ID>/form.json（真实 DOM 快照，禁猜）。
真实站选中态判定：边框色 rgb(114,60,249)（LinkFox 紫）。
本地选中态：class 含 primary/accent/selected 或 aria-pressed/aria-checked=true。
"""
import json, os, re, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EV = os.path.join(ROOT, "evidence", "b9-visual-parity-20261029")
ORDER = ["PRODUCT_IMAGE_SUITE", "DRESS_WEAR_SET", "CHANGE_COLOR_V2", "IMAGE_TRANSLATION", "SCALE_UP",
         "AI_OUTPAINTING", "AREA_REPAIR", "REMOVE_PEN", "CHANGE_COLOR", "IMAGE_CROP", "PRODUCT_REFINE",
         "FIX_COLOR", "PRINTING_REPAIR", "HAND_REPAIR", "NEW_REPLACE_BG_V2", "REPLACE_GOODS",
         "PRODUCT_SCENE", "HANDHELD_GOODS", "AI_DRESSING_V2", "AI_POSTURE"]
BATCH = {"PRODUCT_IMAGE_SUITE", "DRESS_WEAR_SET", "IMAGE_TRANSLATION", "SCALE_UP", "AI_OUTPAINTING",
         "AREA_REPAIR", "CHANGE_COLOR", "IMAGE_CROP", "PRODUCT_REFINE", "PRODUCT_SCENE"}
PURPLE = "114, 60, 249"


def load(side, tid):
    p = os.path.join(EV, side, tid, "form.json")
    if not os.path.exists(p):
        return None
    with open(p) as f:
        return json.load(f)


def real_selected(item):
    return PURPLE in (item["css"].get("bc") or "")


def local_selected(item):
    cls = (item.get("cls") or "")
    if re.search(r"(border|ring|bg)-(primary|accent)", cls):
        return True
    for k in ("ariaPressed", "ariaChecked", "ariaSelected"):
        v = item.get(k)
        if v in ("true", True):
            return True
    if item.get("checked") is True:
        return True
    return False


def rows(items, xmax=720):
    """按 y 行聚类（8px 容差），返回 [(y, [items...])]，仅左栏 x<xmax。"""
    sel = [i for i in items if i["r"]["x"] < xmax and i["r"]["w"] < 460]
    sel.sort(key=lambda i: (i["r"]["y"], i["r"]["x"]))
    out = []
    for i in sel:
        if out and abs(i["r"]["y"] - out[-1][0]) <= 8:
            out[-1][1].append(i)
        else:
            out.append((i["r"]["y"], [i]))
    return out


def adjacent(items, gap=28):
    """同行 items 是否水平相邻（真实/本地选项组都紧挨着）；抑制「整行无关按钮」误判为选项组。"""
    xs = sorted(items, key=lambda i: i["r"]["x"])
    for a, b in zip(xs, xs[1:]):
        if b["r"]["x"] - (a["r"]["x"] + a["r"]["w"]) > gap:
            return False
    return True


def group_rows(form):
    """真实站：把 chips 按行分组，取每行选项文本与默认项。"""
    chips = form["chips"]
    res = []
    for y, items in rows(chips):
        texts, defs = [], []
        seen = set()
        for i in items:
            t = " ".join(i["text"].split())
            if not t or t in seen:
                continue
            seen.add(t)
            texts.append(t)
            if real_selected(i):
                defs.append(t)
        if len(texts) >= 2 and adjacent(items):
            res.append({"y": y, "options": texts, "default": defs})
    return res


def local_groups(form):
    res = []
    pool = form["chips"] + [c for c in form["controls"] if c.get("tag") == "button"]
    for y, items in rows(pool):
        texts, defs, seen = [], [], set()
        for i in items:
            t = " ".join((i.get("text") or "").split())
            if not t or t in seen or len(t) > 28:
                continue
            seen.add(t)
            texts.append(t)
            if local_selected(i):
                defs.append(t)
        if len(texts) >= 2 and adjacent(items):
            res.append({"y": y, "options": texts, "default": defs})
    return res


def labels_of(form):
    out, seen = [], set()
    for l in form["labels"]:
        t = " ".join(l["text"].split())
        if not t or len(t) > 40 or t in seen:
            continue
        r = l["r"]
        if r["x"] < 720 and r["w"] < 420:
            seen.add(t)
            out.append(t)
    return out


def key_terms(texts):
    """抽取高信息量关键词用于差异比对（去噪）。"""
    stop = set("首页 电商套图 智能修图 批量生图 商品图设计 AI视频 商品套图 服装套图 更多 学习中心 免费得算力 购 买 用 个人账号".split())
    return {t for t in texts if t not in stop}


def analyze(tid):
    real, local = load("real", tid), load("local", tid)
    rec = {"id": tid, "status": "PARTIAL", "diffs": [], "real_url": None, "local_url": None}
    if not real:
        rec["diffs"].append({"type": "missing_evidence", "detail": "真实站证据缺失"})
        return rec
    rec["real_url"] = real["url"]
    rec["local_url"] = local["url"] if local else None
    rec["real_groups"] = group_rows(real)
    rec["real_labels"] = labels_of(real)
    rec["batch"] = tid in BATCH
    if not local:
        rec["diffs"].append({"type": "missing_evidence", "detail": "本地证据缺失"})
        return rec
    rec["local_groups"] = local_groups(local)
    rec["local_labels"] = labels_of(local)
    # 差异 1：真实侧存在的选项文案，本地左栏完全没有
    all_local = " \n ".join(rec["local_labels"]) + "\n" + local["bodyText"]
    missing = [t for t in key_terms(rec["real_labels"]) if t not in all_local]
    if missing:
        rec["diffs"].append({"type": "missing_copy", "items": missing[:14]})
    # 差异 2：真实侧选项组在本地缺失（按首选项文本判断）
    lopt = " \n ".join(o for g in rec["local_groups"] for o in g["options"])
    missing_groups = [g["options"][0] for g in rec["real_groups"] if g["options"][0] not in lopt]
    if missing_groups:
        rec["diffs"].append({"type": "missing_option_group", "items": missing_groups[:8]})
    # 差异 3：模型原始 id 泄漏 / 未配置
    if re.search(r"(default|openai)::", local["bodyText"]):
        rec["diffs"].append({"type": "raw_model_id_leak",
                             "items": re.findall(r"\S*::\S*", local["bodyText"])[:4]})
    # 差异 4：本地主体为空（渲染失败）
    if len((local.get("bodyText") or "").strip()) < 120:
        rec["diffs"].append({"type": "empty_body", "detail": "本地主区无文本（疑似未渲染/加载中）"})
    rec["status"] = "PASS" if not rec["diffs"] else ("FAIL" if any(
        d["type"] == "empty_body" for d in rec["diffs"]) else "PARTIAL")
    return rec


def main():
    recs = [analyze(t) for t in ORDER]
    out = {"generated_at": "2026-10-29", "scope": "B9 前半 20 工具（registry 顺序）",
           "method": "真实站 DOM 快照（登录态）+ 本地 dev DOM 快照，同参数提取；默认值=真实站紫框选中项，未取到即 PARTIAL",
           "tools": recs}
    with open(os.path.join(EV, "visual-parity.json"), "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    # 报告
    lines = ["# B9 前半 20 工具：字段/默认值/控件类型 与视觉对照", "",
             "证据：`evidence/b9-visual-parity-20261029/{real,local}/<ID>/`（2026-10-29 实拍，真实站为登录态 DOM 快照）。",
             "默认值判定：真实站选中项 = 选项边框 `rgb(114,60,249)`（LinkFox 紫）；未取到即标 PARTIAL，不猜。", ""]
    for r in recs:
        lines.append(f"## {r['id']}  `{r['status']}`")
        lines.append(f"- 真实：{r['real_url']}｜本地：{r['local_url']}")
        if r.get("real_groups"):
            lines.append("")
            lines.append("| 组(y) | 选项 | 真实默认 |")
            lines.append("|---|---|---|")
            for g in r["real_groups"]:
                lines.append(f"| {g['y']} | {' / '.join(g['options'][:8])} | {'、'.join(g['default']) or '—'} |")
        if r["diffs"]:
            lines.append("")
            lines.append("**差异**")
            for d in r["diffs"]:
                lines.append(f"- `{d['type']}`: {json.dumps(d.get('items') or d.get('detail'), ensure_ascii=False)}")
        lines.append("")
    lines.append("## 联动（LINKAGE）")
    lines.append("真实站联动仅做了静态观察（分辨率↔品质可选集、生成类型↔张数/排版互斥、多选计数）。"
                 "未做逐项点击探针 → 联动表状态 PARTIAL，不作为已完成证据。")
    with open(os.path.join(EV, "REPORT.md"), "w") as f:
        f.write("\n".join(lines))
    for r in recs:
        print(r["id"], r["status"], len(r["diffs"]), [d["type"] for d in r["diffs"]])


if __name__ == "__main__":
    main()
