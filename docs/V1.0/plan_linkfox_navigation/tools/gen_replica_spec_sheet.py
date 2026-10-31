#!/usr/bin/env python3
"""生成 REPLICA_SPEC_SHEET.md：39 工具逐页「可验收事实清单」。

事实来源（只读，不猜）：
- page-specs/NN-*.md  → 区域顺序(§1)、真实控件(§2)、组件与视觉(§6)
- tool_specs.json     → id/route/layout/fields（字段名即提交键）
- ui_brief.md §4      → 布局数值

产出：docs/V1.0/plan_linkfox_navigation/REPLICA_SPEC_SHEET.md
用途：worker 逐页对照的验收清单；tools-layout-check.mjs 断言同一套数值。
"""
import glob
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))            # .../plan_linkfox_navigation/tools
BASE = os.path.dirname(HERE)                                 # .../plan_linkfox_navigation
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(BASE)))  # repo root
BASE = os.path.join(ROOT, "docs/V1.0/plan_linkfox_navigation")

# ---- 唯一布局规则（PRD ui_brief §4 + page-specs「配置区 320–420 / 结果 1fr」） ----
# 画布类工具允许 420 上限（页面有大画布/图层编辑区），其余一律 360 上限。
CANVAS_LAYOUTS = {"mask", "outpaint", "crop", "designer"}
CONFIG_MIN, CONFIG_MAX, CONFIG_MAX_CANVAS = 320, 360, 420
RESULT_MIN_RATIO = 0.55          # 结果区 ≥ 工作区宽度 55%
GAP_PX, PADDING_PX = 16, 20

FORBIDDEN = [
    "算力", "点/张", "积分", "免费领", "立即购买", "会员",
    "免责声明", "水印分组", "促销", "折", "余额",
]


def sec(text, num):
    m = re.search(r"^##\s*%d[\.、]" % num + r"[^\n]*\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    return m.group(1).strip() if m else ""


def regions_of(layout_text):
    """§1 的「区域｜区域｜区域」→ 列表；砍掉后面那段通用套话。"""
    if "｜" not in layout_text:
        return []
    head = layout_text.split("。桌面采用")[0].split("\n")[0]
    return [x.strip() for x in head.split("｜") if x.strip()]


def one_line(text):
    return re.sub(r"\s+", " ", text).strip()


def main():
    specs = json.load(open(os.path.join(BASE, "tool_specs.json")))["tools"]
    files = {}
    for f in sorted(glob.glob(os.path.join(BASE, "page-specs/[0-9][0-9]-*.md"))):
        files[int(os.path.basename(f)[:2])] = f

    out = []
    out.append("# REPLICA_SPEC SHEET｜39 工具逐页验收事实清单\n")
    out.append("> 自动生成，勿手改：`python3 docs/V1.0/plan_linkfox_navigation/tools/gen_replica_spec_sheet.py`\n")
    out.append("> 事实源：`page-specs/NN-*.md`（区域/控件/组件）、`tool_specs.json`（字段名即提交键）、`ui_brief.md §4`（布局数值）。\n")
    out.append("> 运行时断言脚本：`web/scripts/real-acceptance/tools-layout-check.mjs`（与本表同一套数值）。\n")

    out.append("\n## 0. 唯一布局规则（所有 39 页共同，不许各页自创）\n")
    out.append("| 项 | 值 | 断言 |")
    out.append("|---|---|---|")
    out.append("| 工具侧栏 | 184px（现 180 允许 ±4） | `[data-testid=tool-sidebar]` width 176–188 |")
    out.append(f"| 配置栏 | {CONFIG_MIN}–{CONFIG_MAX}px；画布类（mask/outpaint/crop/designer）上限 {CONFIG_MAX_CANVAS} | `[data-testid=tool-config-column]` width |")
    out.append(f"| 结果/编辑区 | `minmax(0,1fr)`，≥ 工作区宽度 {int(RESULT_MIN_RATIO*100)}% | `[data-testid=tool-main-column]` width |")
    out.append(f"| 列间距 / 页面内边距 | {GAP_PX}px / {PADDING_PX}px | 视觉 |")
    out.append("| 竖排 fallback | <1024px 单列，结果在下 | — |")
    out.append(f"\n**禁用文案（39 页正文均不得出现）**：{'、'.join(FORBIDDEN)}\n")
    out.append("**禁用视觉**：LinkFox 紫 `#723cf9`、渐变光斑、玻璃拟态、原站像素 className。一律用无限画布令牌"
               "（`bg-background`/`bg-card`/`text-foreground`/`text-muted-foreground`/`border-border`/`bg-primary`/`bg-accent`/`text-destructive`）。\n")
    out.append("**控件尺寸**：控件高 36px、主按钮 40px、卡片圆角 10px、输入圆角 8px、最小点击区 40×40、正文 14/22。\n")

    out.append("\n## 1. 逐页清单\n")
    for t in specs:
        path = files[t["index"]]
        txt = open(path).read()
        regions = regions_of(sec(txt, 1))
        controls = one_line(sec(txt, 2))
        ui = one_line(sec(txt, 6))
        comps = ""
        m = re.search(r"组件[：:]\s*`([^`]+)`", ui)
        if m:
            comps = m.group(1)
        canvas = t.get("layout") in CANVAS_LAYOUTS
        cmax = CONFIG_MAX_CANVAS if canvas else CONFIG_MAX
        out.append(f"### T{t['index']:02d}｜{t.get('title') or t['label']} `{t['id']}`\n")
        out.append(f"- 路由：`{t['route']}`　layout：`{t.get('layout')}`　adapter：`{t.get('adapter')}`"
                   f"{'　**画布类**' if canvas else ''}")
        out.append(f"- 布局断言：配置栏 {CONFIG_MIN}–{cmax}px + 结果区 1fr（≥{int(RESULT_MIN_RATIO*100)}%）")
        out.append(f"- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：{' ｜ '.join(regions) if regions else '（见 page-specs）'}")
        out.append(f"- 必备控件（§2）：{controls}")
        out.append(f"- 组件（§6）：{comps or '见 page-specs §6'}")
        out.append(f"- 提交字段（字段名即提交键，禁改名）：{' / '.join(t.get('fields', [])) if t.get('fields') else '—'}")
        out.append(f"- 事实源：`{os.path.relpath(path, ROOT)}`\n")

    dst = os.path.join(BASE, "REPLICA_SPEC_SHEET.md")
    open(dst, "w").write("\n".join(out) + "\n")
    print("wrote", dst, len("\n".join(out)), "bytes,", len(specs), "tools")


if __name__ == "__main__":
    main()
