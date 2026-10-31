// 打印 video.tsx 每套 ToolShell 的布局树（两层）
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const parser = require(path.resolve(process.cwd(), "node_modules/@babel/parser"));

const src = fs.readFileSync(process.argv[2], "utf8");
const ast = parser.parse(src, { sourceType: "module", plugins: ["jsx", "typescript"] });

const nm = (e) => (e.openingElement ? (e.openingElement.name.type === "JSXIdentifier" ? e.openingElement.name.name : "<member>") : "?");
const tid = (e) => (src.slice(e.start, e.openingElement.end).match(/data-testid="([^"]+)"/) || [])[1] || "";
const cls = (e) => (src.slice(e.start, e.openingElement.end).match(/className="([^"]*)"/) || [])[1] || "";
const kids = (e) => e.children.filter((c) => c.type === "JSXElement");
const lineOf = (e) => src.slice(0, e.start).split("\n").length;

const shells = [];
const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (n.type === "JSXElement") {
        if (nm(n) === "ToolShell") shells.push(n);
        n.children.forEach(walk);
        return;
    }
    for (const k of Object.keys(n)) {
        if (k === "loc" || k === "leadingComments" || k === "trailingComments") continue;
        const v = n[k];
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object" && v.type) walk(v);
    }
};
walk(ast);

const idx = Number(process.argv[3] || 0);
const sh = idx ? shells[idx - 1] : null;
const targets = sh ? [sh] : shells;
targets.forEach((sh2, i) => {
    console.log(`ToolShell#${idx || i + 1} line=${lineOf(sh2)}`);
    kids(sh2).forEach((k, j) => {
        console.log(`  [${j}] line=${lineOf(k)} <${nm(k)}> [${tid(k)}] kids=${kids(k).length} cls=${cls(k).slice(0, 110)}`);
        kids(k).forEach((g, m) => {
            console.log(`      <${m}> <${nm(g)}> [${tid(g)}] kids=${kids(g).length} cls=${cls(g).slice(0, 90)}`);
        });
    });
});
