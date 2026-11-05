/**
 * 原站基线可信度核验。
 *
 * 原站路由与本地 slug 不同（如服装套图 = /draw/clothing-image-suite），且未登录访问会被重定向首页，
 * 所以不能用 `/draw/<本地slug>` 自动探测。下表是登录态下逐页点击侧栏、读页面正文确认的真实路由。
 * 原站改版后需重新在登录态核对并更新本表。
 *
 * 用法：cd web && node scripts/real-acceptance/original-baseline-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(process.cwd(), "..");
const SPECS = path.join(REPO, "docs/V1.0/plan_linkfox_navigation/tool_specs.json");
const EVIDENCE = path.join(REPO, "docs/V1.0/e2e-1to1/20261102");

// route：原站页面；note：原站页面名或匹配说明
const ROUTES = {
    PRODUCT_IMAGE_SUITE: ["/draw/product-image-suite", "商品套图"],
    DRESS_WEAR_SET: ["/draw/clothing-image-suite", "服装套图"],
    CHANGE_COLOR_V2: ["/draw/change-color-v2", "套图换色"],
    IMAGE_TRANSLATION: ["/draw/image-translation", "图片翻译"],
    SCALE_UP: ["/draw/quality-increase", "高清放大"],
    AI_OUTPAINTING: ["/draw/ai-outpainting", "智能扩图"],
    AREA_REPAIR: ["/draw/area-repair", "局部重绘"],
    REMOVE_PEN: ["/draw/remove-pen", "局部消除"],
    CHANGE_COLOR: ["/draw/change-color", "一键换色"],
    IMAGE_CROP: ["/draw/image-crop", "图片裁剪"],
    PRODUCT_REFINE: ["/draw/product-refine", "商品精修"],
    FIX_COLOR: ["/draw/color-diff-repair", "色差修复"],
    PRINTING_REPAIR: ["/draw/printing-repair", "印花修复"],
    HAND_REPAIR: ["/draw/hand-repair", "手部修复（原站标即将下架）"],
    NEW_REPLACE_BG_V2: ["/draw/product-home", "商品图合成（侧栏「商品图」）"],
    REPLACE_GOODS: ["/draw/product-replacement", "商品替换"],
    PRODUCT_SCENE: ["/draw/product-scene", "场景裂变"],
    HANDHELD_GOODS: ["/draw/handheld-goods", "手持商品（标题为站点通用标题，正文为工具页）"],
    AI_DRESSING_V2: ["/draw/ai-dressing", "AI穿衣"],
    AI_POSTURE: ["/draw/ai-posture", "姿势裂变"],
    AI_WEARABLE: ["/draw/ai-wearable", "AI穿戴"],
    SDS_DESIGN: ["/draw/sds-design", "素材贴合"],
    PRINT_EXTRACT: ["/draw/print-extract", "印花提取"],
    IMAGE_TEXT_EDIT: ["/designer?type=78", "商品图设计编辑器（文字/素材/背景/图层）"],
    NEW_DESIGNER: ["/draw/designer-home", "创建设计"],
    IMAGE_TO_VIDEO: ["/draw/video", "商品视频（参考素材/首尾帧/商品链接）"],
    SALE_VIDEO: ["/draw/sale-video", "带货视频"],
    VIDEO_REPLICATION: ["/draw/video-replication", "视频复刻"],
    AI_VIDEO_EDITING: ["/draw/ai-video-edit", "视频编辑"],
    VIDEO_TRANSLATION: ["/draw/video-translation", "视频翻译"],
    VIDEO_CONCAT: ["/draw/video-edit", "视频剪辑（待字段级确认）"],
};

// 原站存在但当前账号看不到页面
const BLOCKED = {
    AI_TEXT: "POD素材：本账号访问重定向（/draw/ai-text → /home，侧栏点击回到场景素材）",
    ORNAMENT_TEXT: "饰品文字：本账号访问 /draw/ornament-text 重定向首页",
    PRODUCT_MARKET_MATERIAL: "仅批量生图 create-task 入口，需团队版账号，个人账号重定向批量首页",
};

// 原站只有内部组件/类型，没有独立页面
const NO_PAGE = {
    AI_POSE_GENERATOR: "只在 AIDressingV2 chunk 内出现，AI穿衣页无对应入口",
    AI_DRESSING_XSY: "只在 AIDressingV2 chunk 内出现，AI穿衣页无对应入口",
    SCENE_TRANSFER: "只有 SceneTransfer 组件，/draw/scene-transfer 404",
    MATERIAL_UPPER_BODY: "只在 PreviewModal 中出现，/draw/material-upper-body 404",
    FISSION_LINK: "只在 LinkCard 分享卡片中出现，无工具页",
};

const tools = JSON.parse(fs.readFileSync(SPECS, "utf8")).tools;
const has = (id, f) => fs.existsSync(path.join(EVIDENCE, id, f));
const rows = tools.map((t) => {
    const r = ROUTES[t.id];
    const status = r ? "comparable" : BLOCKED[t.id] ? "blocked" : NO_PAGE[t.id] ? "no-page" : "unmapped";
    return { id: t.id, label: t.label, status, route: r?.[0] ?? null, note: r?.[1] ?? BLOCKED[t.id] ?? NO_PAGE[t.id] ?? "未登记", hasShot: has(t.id, "original.png") };
});

const by = (s) => rows.filter((r) => r.status === s);
const comparable = by("comparable");
const lines = [
    "# 原站基线可信度核验",
    "",
    "由 `web/scripts/real-acceptance/original-baseline-audit.mjs` 生成。路由表在登录态下逐页点击侧栏并读取页面正文确认；未登录访问会被重定向首页，不能用 `/draw/<本地slug>` 自动探测。",
    "",
    `## 结论：${comparable.length}/${rows.length} 页可做 1:1 对照`,
    "",
    "| 工具 | 名称 | 原站路由 | 原站页面 | 有 original.png |",
    "|---|---|---|---|---|",
    ...comparable.map((r) => `| ${r.id} | ${r.label} | \`${r.route}\` | ${r.note} | ${r.hasShot ? "有" : "**缺**"} |`),
    "",
    `## 原站存在但本账号不可见（${by("blocked").length}）`,
    "",
    ...by("blocked").map((r) => `- ${r.id} ${r.label}：${r.note}`),
    "",
    `## 原站无独立页面（${by("no-page").length}）`,
    "",
    ...by("no-page").map((r) => `- ${r.id} ${r.label}：${r.note}`),
    "",
    ...(by("unmapped").length ? ["## 未登记", "", ...by("unmapped").map((r) => `- ${r.id}`), ""] : []),
    "## 说明",
    "",
    "- 上一版用本地 slug 探测，把服装套图、高清放大、色差修复、商品图、商品替换、AI穿衣、图转视频、视频编辑、商品图设计器、视频拼接、图片文字编辑共 11 页误判为不可对照。",
    "- `_INVALID-BASELINE/` 中这些页面的旧截图是按错误 URL 截的（首页/404），不能直接恢复，需按上表路由重新采集。",
    "",
];
fs.writeFileSync(path.join(EVIDENCE, "BASELINE-AUDIT.md"), lines.join("\n"));
for (const r of rows) console.log(`${r.status.padEnd(11)} ${r.id.padEnd(24)} ${r.route ?? ""} ${r.hasShot ? "" : "(缺 original.png)"}`);
console.log(`\n可对照 ${comparable.length}/${rows.length}，缺基线 ${comparable.filter((r) => !r.hasShot).length}`);
