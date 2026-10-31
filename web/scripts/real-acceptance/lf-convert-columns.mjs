// 把工具页根布局改为唯一的 ToolWorkspaceColumns（AST 精确偏移，不猜行号）
// 用法: node lf-convert-columns.mjs <tsx路径> [--side=left|right] [--canvas] [--dry]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const parser = require(path.resolve(process.cwd(), "node_modules/@babel/parser"));

const file = process.argv[2];
const side = (process.argv.find((a) => a.startsWith("--side=")) || "--side=left").split("=")[1];
const canvas = process.argv.includes("--canvas");
const dry = process.argv.includes("--dry");
const wrapRest = process.argv.find((a) => a.startsWith("--wrap-rest="))?.split("=")[1] || null;
const shellIndex = process.argv.find((a) => a.startsWith("--shell-index="))?.split("=")[1];

const src = fs.readFileSync(file, "utf8");
const ast = parser.parse(src, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
    errorRecovery: false,
});

const nameOf = (el) => {
    const n = el?.openingElement?.name;
    if (!n) return null;
    if (n.type === "JSXIdentifier") return n.name;
    if (n.type === "JSXMemberExpression") return `${n.object.name}.${n.property.name}`;
    return null;
};

const tidOf = (el) => (src.slice(el.start, el.openingElement.end).match(/data-testid="([^"]+)"/) || [])[1] || "";
const rootHint = process.argv.find((a) => a.startsWith("--root-testid="))?.split("=")[1] || null;
const rootLine = Number(process.argv.find((a) => a.startsWith("--root-line="))?.split("=")[1] || 0);
const lineOf = (el) => src.slice(0, el.start).split("\n").length;

// 找布局根：优先 --root-testid，其次 ToolShell 内 testid 以 -workspace 结尾、且有 2 个元素子节点的那个
let shell = null;
let root = null;
let shellCount = 0;
const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "JSXElement") {
        if (nameOf(node) === "ToolShell") {
            shellCount += 1;
            if (shellIndex === undefined || Number(shellIndex) === shellCount) shell = node;
        }
        const t = tidOf(node);
        const nKids = node.children.filter((c) => c.type === "JSXElement").length;
        if (rootHint ? t === rootHint : /-workspace$/.test(t) && nKids === 2) root = node;
        if (!root) node.children.forEach(walk);
        return;
    }
    for (const k of Object.keys(node)) {
        if (k === "loc" || k === "leadingComments" || k === "trailingComments") continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object" && v.type) walk(v);
    }
};
walk(ast);
if (rootLine) {
    root = null;
    const pick = (n) => {
        if (!n || typeof n !== "object") return;
        if (n.type === "JSXElement" && lineOf(n) === rootLine) { root = n; return; }
        for (const k of Object.keys(n)) {
            if (root) return;
            if (k === "loc") continue;
            const v = n[k];
            if (Array.isArray(v)) v.forEach(pick);
            else if (v && typeof v === "object" && v.type) pick(v);
        }
    };
    pick(ast);
    if (!root) throw new Error("--root-line 未命中：" + rootLine);
}
if (!root && shell) {
    const ks = shell.children.filter((c) => c.type === "JSXElement");
    if (ks.length === 1) root = ks[0];
}
if (!root) throw new Error("找不到布局根；请用 --root-testid= 或确认 ToolShell 下只有一个元素子节点");
const rootName = nameOf(root);

// 单子节点包装层自动下钻，直到出现 >=2 个元素子节点或无法下钻
let guard = 0;
while (guard++ < 4) {
    const ks = root.children.filter((c) => c.type === "JSXElement");
    if (ks.length !== 1) break;
    if (ks[0].children.filter((c) => c.type === "JSXElement").length < 2) break;
    root = ks[0];
}
let kids = root.children.filter((c) => c.type === "JSXElement");
if (kids.length !== 2 && !(wrapRest && kids.length > 2)) {
    throw new Error(`根 <${rootName}> 有 ${kids.length} 个元素子节点，需人工确认（>2 个请给 --wrap-rest=<css class>）`);
}
const text = (n) => src.slice(n.start, n.end);
const testid = (n) => (src.slice(n.start, n.openingElement.end).match(/data-testid="([^"]+)"/) || [])[1] || "";

let cfgIdx;
if (nameOf(kids[0]) === "aside" || /config|settings|panel-rail/.test(testid(kids[0]))) cfgIdx = 0;
else if (nameOf(kids[1]) === "aside" || /config|settings|panel-rail/.test(testid(kids[1]))) cfgIdx = 1;
else {
    // 兜底：窄的那个（有 w-[xxx] / max-w）是配置栏
    const narrow = (n) => /w-\[(2\d\d|3\d\d|4[0-2]\d)px\]/.test(src.slice(n.start, n.openingElement.end));
    cfgIdx = narrow(kids[0]) ? 0 : narrow(kids[1]) ? 1 : 0;
}
const cfg = kids[cfgIdx];
const rest = kids.filter((_, i) => i !== cfgIdx);
const mainSrc =
    rest.length === 1
        ? text(rest[0])
        : `<div className="${wrapRest}">\n${rest.map(text).join("\n")}\n${" ".repeat(20)}</div>`;

const info = {
    file: path.basename(file),
    root: rootName,
    rootTestId: testid(root),
    config: { tag: nameOf(cfg), testid: testid(cfg), indent: src.slice(root.start, cfg.start).split("\n").pop() },
    main: { tag: rest.length === 1 ? nameOf(rest[0]) : `wrap(${rest.length})`, testid: rest.length === 1 ? testid(rest[0]) : "" },
    cfgIdx,
    side,
    canvas,
};
if (dry) {
    console.log(JSON.stringify(info, null, 2));
    process.exit(0);
}

const indent = " ".repeat(src.slice(0, root.start).split("\n").pop().length);
const inner = `${indent}    `;
const open = [
    `<ToolWorkspaceColumns`,
    `${inner}configSide="${side}"`,
    canvas ? `${inner}canvas` : null,
    `${inner}config={`,
].filter(Boolean).join("\n");
const rebuilt =
    `${open}\n${text(cfg)}\n${inner}}>\n${mainSrc}\n${indent}</ToolWorkspaceColumns>`;

let out = src.slice(0, root.start) + rebuilt + src.slice(root.end);

// 清理商业化残留：水印面板 + 算力文案
out = out
    .replace(/\n\s*<WatermarkGroupPanel \/>/g, "")
    .replace(/import \{ WatermarkGroupPanel \} from "@\/components\/tools\/watermark-group-panel";\n/g, "")
    .replace(/<span[^>]*title="可用算力"[^>]*>\s*\d+\s*<\/span>\s*/g, "")
    .replace(/<span[^>]*>\(\s*\d+\s*算力\s*\)<\/span>\s*/g, "")
    .replace(/<span[^>]*>\s*\d+\s*算力\s*<\/span>\s*/g, "");

if (!/ToolWorkspaceColumns \} from/.test(out)) {
    const IMP = 'import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";';
    if (/^["']use client["'];?\n/.test(out)) out = out.replace(/^(["']use client["'];?\n)/, `$1${IMP}\n`);
    else out = IMP + "\n" + out;
}


fs.writeFileSync(file, out);
console.log(JSON.stringify({ ...info, watermarkLeft: (out.match(/WatermarkGroupPanel/g) || []).length, creditLeft: (out.match(/算力/g) || []).length }));
