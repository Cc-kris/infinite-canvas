import ast, json, os, re, glob, sys
from collections import Counter

ORIG_DIR = "/Users/mac/Documents/Dev/infinite-canvas/.verify-tools/frontend-diff/orig-json"
LOCAL_DIR = "/Users/mac/Documents/Dev/infinite-canvas/.verify-tools/frontend-diff/local-dom"
OUT_DIR = "/Users/mac/Documents/Dev/infinite-canvas/.verify-tools/frontend-diff"

# LinkFox 全站壳（用户已明确不复刻）：导航、计费、账号、营销、客服
SHELL = {
    "首页","电商套图","智能修图","新模型","AI视频","HOT","批量生图","商品图设计","Skills","Agent","更多",
    "学习中心","免费得算力","购 买","购买","用","个人账号","灵感","灵感视频","创作","工具","历史记录","免责声明",
    "操作咨询","产品教程","一键做同款","登录","注册","会员","充值","客服","帮助中心","教程","优秀案例",
    "视频剪辑","视频编辑","图转视频","批量生成","NEW","带货口播","视频复刻","视频翻译","视频拼接",
    "商品套图","服装套图","套图换色","图片翻译","高清放大","AI扩图","局部重绘","消除笔","换色","图片裁剪",
    "商品精修","颜色修复","印花修复","手部修复","换背景","商品替换","商品场景","手持商品","AI试穿","AI姿势",
    "AI穿戴","AI文字","装饰文字","SDS设计","印花提取","AI姿势生成","AI试穿XSY","裂变链接","图片文字编辑",
    "上衣素材","新设计师","商品营销素材","场景迁移","图片转视频","带货视频","视频编辑","视频翻译","视频拼接",
    "生成结果","历史记录","案例",
}

def norm(s):
    if not s:
        return ""
    s = s.replace("\u00a0", " ")
    s = re.sub(r"\s+", "", s)
    s = re.sub(r"\d+算力", "", s)
    s = re.sub(r"^0/\d+$", "", s)
    return s.strip()

def is_shell(t):
    n = norm(t)
    if not n:
        return True
    if n in {norm(x) for x in SHELL}:
        return True
    if re.fullmatch(r"用户\d*", n) or re.fullmatch(r"\d+", n):
        return True
    return False

def load_orig(tid):
    p = os.path.join(ORIG_DIR, tid + ".json")
    if not os.path.exists(p):
        return None
    d = json.load(open(p, encoding="utf-8"))
    ctrls = []
    for c in d.get("controls", []):
        t = (c.get("text") or "").strip()
        ph = (c.get("placeholder") or "").strip()
        if t:
            ctrls.append(t)
        if ph and ph != t:
            ctrls.append("@" + ph)
    lines = [l.strip() for l in (d.get("text") or "").split("\n") if l.strip()]
    return {"controls": ctrls, "lines": lines}

def load_local(tid):
    p = os.path.join(LOCAL_DIR, tid + ".json")
    if not os.path.exists(p):
        return None
    d = json.load(open(p, encoding="utf-8"))
    ctrls = []
    for c in d.get("controls", []):
        t = (c.get("text") or "").strip()
        ph = (c.get("placeholder") or "").strip()
        if t:
            ctrls.append(t)
        if ph and ph != t:
            ctrls.append("@" + ph)
    return {"controls": ctrls, "lines": d.get("lines", [])}

def diff_list(orig, local):
    o = Counter(norm(x) for x in orig if not is_shell(x.lstrip("@")))
    l = Counter(norm(x) for x in local if not is_shell(x.lstrip("@")))
    missing = sorted([k for k in o if k and k not in l])
    extra = sorted([k for k in l if k and k not in o])
    return missing, extra

def main():
    ids = [os.path.basename(p)[:-5] for p in sorted(glob.glob(os.path.join(LOCAL_DIR, "*.json")))]
    report = []
    for tid in ids:
        o = load_orig(tid)
        l = load_local(tid)
        if not o or not l:
            report.append({"id": tid, "error": "no-orig" if not o else "no-local"})
            continue
        mc, ec = diff_list(o["controls"], l["controls"])
        ml, el = diff_list(o["lines"], l["lines"])
        report.append({
            "id": tid,
            "orig_controls": len(o["controls"]), "local_controls": len(l["controls"]),
            "missing_controls": mc, "extra_controls": ec,
            "missing_text": ml[:80], "extra_text": el[:80],
            "n_missing_controls": len(mc), "n_extra_controls": len(ec),
            "n_missing_text": len(ml), "n_extra_text": len(el),
        })
    json.dump(report, open(os.path.join(OUT_DIR, "diff-report.json"), "w"), ensure_ascii=False, indent=1)

    print(f"{'TOOL':28} {'ctrl(o/l)':>11} {'miss':>5} {'extra':>6} {'missTxt':>8} {'extraTxt':>9}")
    for r in report:
        if r.get("error"):
            print(f"{r['id']:28} ERROR {r['error']}")
            continue
        print(f"{r['id']:28} {str(r['orig_controls'])+'/'+str(r['local_controls']):>11} {r['n_missing_controls']:>5} {r['n_extra_controls']:>6} {r['n_missing_text']:>8} {r['n_extra_text']:>9}")

if __name__ == "__main__":
    main()
