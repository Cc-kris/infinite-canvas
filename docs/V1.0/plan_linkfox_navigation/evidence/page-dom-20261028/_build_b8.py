#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""B8: 把 _raw_*.txt (CDP Runtime.evaluate 回包) 落成逐工具 JSON + index.json + visual-parity.json"""
import ast, json, os, datetime

BASE = os.path.dirname(os.path.abspath(__file__))
TODAY = "2026-10-29"
METHOD = ("同源 iframe 注入已登录 Chrome 页面 (CDP Runtime.evaluate), viewport 1600x1000, "
          "等待 9s 后取 body.innerText + 可见 button/input/textarea 的 rect/字号/颜色/圆角")
ROUTE_SRC = "workbench-BcUrzOPA.js 侧栏菜单表 (text/label/path/drawType/whitelist)"


def load(name):
    p = os.path.join(BASE, name)
    if not os.path.exists(p):
        return None
    d = ast.literal_eval(open(p, encoding="utf-8").read())
    return json.loads(d["result"]["value"])


def norm(v):
    """把 batch 抓取的裸文本转成半结构化 regions"""
    lines = [l.strip() for l in (v or "").split("\n") if l.strip()]
    return lines


rich = {}
for f in ("_raw_rich1.txt", "_raw_rich2.txt"):
    arr = load(f) or []
    for a in arr:
        rich[a["r"].split("?")[0]] = a

batch = {}
for f in ("_raw_batchA.txt", "_raw_batchB.txt", "_raw_batchC.txt", "_raw_batchD.txt"):
    arr = load(f) or []
    if isinstance(arr, dict):
        arr = arr.get("out", [])
    for a in arr:
        if isinstance(a, dict) and "r" in a:
            batch[a["r"]] = a

ifr = load("_raw_iframe_pilot.txt") or []
ifr_map = {}
for a in ifr:
    if isinstance(a, dict) and "r" in a:
        ifr_map[a["r"]] = a

SPEC = [
    # id, label, url, status, event, note
    ("FIX_COLOR", "色差修复", "https://www.linkfox.com/draw/color-diff-repair", "workspace_dom", "rich",
     "旧页 URL 纠正为 /draw/color-diff-repair；旧猜测 /draw/fix-color、/draw/high-definition-repair 均 404"),
    ("AI_TEXT", "POD素材（原站现名「创意文字」）", "https://www.linkfox.com/draw/ai-text", "permission_redirect_home", "gated",
     "bundle 菜单表 AI_TEXT path=/draw/ai-text whitelist:!0 noQuick:!0；本账号同源 iframe finalUrl=https://www.linkfox.com/home，white-list 未开通"),
    ("ORNAMENT_TEXT", "饰品文字", "https://www.linkfox.com/draw/ornament-text", "permission_redirect_home", "gated",
     "bundle 菜单表 ORNAMENT_TEXT path=/draw/ornament-text label「饰品文字」Beta whitelist:!0；本账号同样被重定向 /home"),
    ("NEW_REPLACE_BG_V2", "商品图（换背景）", "https://www.linkfox.com/draw/product-home", "workspace_dom", "rich",
     "商品图工具台真实工作区：商品图/我的商品/场景参考图/商品替换/场景裂变/手持商品"),
    ("VIDEO_CONCAT", "视频拼接", "https://www.linkfox.com/draw/video-concat", "workspace_dom", "rich",
     "真实工作区：选择 2~4 个视频素材、视频比例 16:9/9:16/1:1/4:3、60 算力"),
    ("NEW_DESIGNER", "商品图设计器", "https://www.linkfox.com/draw/designer-home", "workspace_dom", "rich",
     "草稿箱/模板推荐/创建设计入口；/draw/designer 本身为 404，编辑态在 designer-home 内进入"),
    ("AI_POSE_GENERATOR", "AI姿势生成", "https://www.linkfox.com/draw/ai-posture", "workspace_dom", "rich",
     "字段 modelPose/modelStyle/outputNum/modelImageUrl 与姿势裂变页一致（姿势库/自定义/生成张数）"),
    ("AI_DRESSING_XSY", "AI试衣XSY", "https://www.linkfox.com/draw/ai-dressing", "workspace_dom", "rich",
     "字段 down/upper/suitImageUrl+Mask+Origin 与 AI穿衣页一致（上下装/连体）"),
    ("FISSION_LINK", "场景裂变链接", "https://www.linkfox.com/draw/product-scene?type=2", "workspace_dom", "rich",
     "场景裂变 tab：上传参考图/背景相似度/场景描述；?type=2 命中场景裂变"),
    ("PRODUCT_MARKET_MATERIAL", "商品营销素材", "https://www.linkfox.com/draw/product-image-suite?batchType=PRODUCT_MATERIAL",
     "workspace_dom_text_only", "batch",
     "商品套图 batchType=PRODUCT_MATERIAL 工作区（主副图8张+A+图4张=600点）；本轮仅取文本层，未取控件样式"),
    ("MATERIAL_UPPER_BODY", "上装换料", "https://www.linkfox.com/draw/clothing-image-suite", "workspace_dom", "rich",
     "服装套图工作区；未找到独立「上装换料」入口，判定为服装套图内的换料子能力（PARTIAL）"),
    ("SCENE_TRANSFER", "场景迁移", "https://www.linkfox.com/draw/", "private_b2b_route", "none",
     "bundle 仅见自定义路由 M.custom.bsqSceneTransfer（倍思奇 B2B），公共站无菜单入口，无 DOM"),
    ("IMAGE_TEXT_EDIT", "图片文字编辑", "https://www.linkfox.com/draw/designer", "route_not_found", "batch",
     "/draw/designer 返回「页面不存在」；/draw/ai-image-edit 被 whitelist 重定向 /home；编辑态应经 designer-home 进入"),
]

out_index_updates = {}
written = []
for tid, label, url, status, kind, note in SPEC:
    key = url.replace("https://www.linkfox.com", "")
    doc = {"tool": tid, "label": label, "status": status, "url": url,
           "capturedAt": TODAY, "method": METHOD, "routeSource": ROUTE_SRC, "note": note}
    if kind == "rich":
        a = rich.get(key)
        if a:
            doc.update({"finalUrl": a.get("finalUrl"), "title": a.get("title"),
                        "text": a.get("txt"), "regions": norm(a.get("txt")),
                        "controls": a.get("controls", []),
                        "styles": {k: a[k] for k in ("bodyBg", "bodyColor", "bodyFont", "docW", "docH") if k in a}})
        else:
            doc["captureMissing"] = key
    elif kind == "batch":
        a = batch.get(key)
        if a:
            doc.update({"finalUrl": a.get("finalUrl"), "text": a.get("txt"),
                        "regions": norm(a.get("txt")), "controlsCount": a.get("ctrl"),
                        "controls": []})
        else:
            doc["captureMissing"] = key
    elif kind == "gated":
        doc.update({"finalUrl": "https://www.linkfox.com/home",
                    "redirectObserved": True,
                    "routeEvidence": "whitelist:!0 in menu table",
                    "text": "重定向到 /home 首页，工具未开通；无工具 DOM"})
    else:
        doc.update({"finalUrl": None, "text": note})

    path = os.path.join(BASE, f"{tid}.json")
    json.dump(doc, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    written.append(path)
    out_index_updates[tid] = {
        "id": tid, "label": label, "status": status, "url": url,
        "title": doc.get("title") or ("LinkFox 首页（重定向）" if status == "permission_redirect_home" else ""),
        "evidence": path, "capturedAt": TODAY,
    }

# ---- index.json ----
idx_path = os.path.join(BASE, "index.json")
idx = json.load(open(idx_path, encoding="utf-8"))
seen = set()
for i, item in enumerate(idx):
    u = out_index_updates.get(item["id"])
    if u:
        idx[i] = u
        seen.add(item["id"])
for tid, u in out_index_updates.items():
    if tid not in seen:
        idx.append(u)
json.dump(idx, open(idx_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

# ---- visual-parity.json ----
parity = {
    "generatedAt": TODAY,
    "gate": "1:1 布局/样式/文案/字段/交互 对照；仅去除 LinkFox 品牌字样与算力区",
    "screenshotCapability": "不可用（无屏幕录制权限）→ 仅 DOM + computed CSS 证据",
    "originalCapture": "https://www.linkfox.com 已登录账号 用户6991，viewport 1600x1000",
    "localCapture": "本轮未采集（B8 范围=原站路由与 DOM 落证；本地对照留待 B9）",
    "overall": "PARTIAL",
    "tools": {},
}
VERDICT = {
    "workspace_dom": ("PARTIAL", ["本地页面尚未与本轮原站 DOM 逐项 diff"], 0.55),
    "workspace_dom_text_only": ("PARTIAL", ["仅文本层证据，缺控件样式/坐标", "本地对照未采集"], 0.35),
    "permission_redirect_home": ("BLOCKED", ["账号无白名单，原站无可对照 DOM"], 0.0),
    "route_not_found": ("BLOCKED", ["原站该 URL 404，入口在 designer-home 内部"], 0.0),
    "private_b2b_route": ("BLOCKED", ["仅 B2B 自定义路由，公共站无入口"], 0.0),
}
for tid, label, url, status, kind, note in SPEC:
    v, gaps, score = VERDICT[status]
    d = json.load(open(os.path.join(BASE, f"{tid}.json"), encoding="utf-8"))
    parity["tools"][tid] = {
        "label": label, "originalUrl": url, "originalStatus": status,
        "layout": "原站区域序列已落证" if kind == "rich" else "无",
        "style": "原站 bodyBg/bodyColor/bodyFont + 控件字号/颜色已落证" if kind == "rich" else "无",
        "copy": "原站可见文案已落证" if kind in ("rich", "batch") else "无",
        "fields": "控件清单已落证" if kind == "rich" else ("控件数量 %s" % d.get("controlsCount")) if kind == "batch" else "无",
        "interaction": "按钮/输入可见性与算力提示已记录" if kind in ("rich", "batch") else "无",
        "localEvidence": None,
        "evidenceLevel": v, "score": score, "gaps": gaps,
        "verdict": "PARTIAL-待本地对照" if v == "PARTIAL" else "BLOCKED-不可 1:1 验收",
    }
json.dump(parity, open(os.path.join(BASE, "visual-parity.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)

print("written:", len(written))
print("index total:", len(idx))
from collections import Counter
print(Counter(i["status"] for i in idx))
