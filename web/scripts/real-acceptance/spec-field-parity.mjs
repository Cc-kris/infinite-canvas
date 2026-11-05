/**
 * 规格字段契约一致性核验（不依赖原站登录，可随时复跑）。
 *
 * 目的：确认「页面规格声明的字段」与「实现里真实提交的字段」一致，
 * 防止页面看起来有控件、实际提交字段缺失或凭空多出字段。
 *
 * 数据源：
 *   - 规格：docs/V1.0/plan_linkfox_navigation/page-specs/<n>-<slug>.md 的字段表
 *   - 实现：web/src/features/tools/registry/*.ts 里的 *_FIELD_KEYS 常量
 *
 * 用法：cd web && node scripts/real-acceptance/spec-field-parity.mjs
 */
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(process.cwd(), "..");
const SPEC_DIR = path.join(REPO, "docs/V1.0/plan_linkfox_navigation/page-specs");
const REG_DIR = path.join(REPO, "web/src/features/tools/registry");
const SPECS = path.join(REPO, "docs/V1.0/plan_linkfox_navigation/tool_specs.json");

const tools = JSON.parse(fs.readFileSync(SPECS, "utf8")).tools;

/** 从规格 md 里抽 `| \`field\` | 说明 |` 表格行。 */
function specFields(file) {
    const txt = fs.readFileSync(path.join(SPEC_DIR, file), "utf8");
    const out = [];
    for (const m of txt.matchAll(/^\|\s*`([a-zA-Z_][\w.]*)`\s*\|\s*([^|]*)\|/gm)) out.push(m[1]);
    return [...new Set(out)];
}

/** 把 registry 里所有 *_FIELD_KEYS 常量收集成 Map<toolId, string[]>。 */
function registryFields() {
    const map = new Map();
    for (const f of fs.readdirSync(REG_DIR)) {
        if (!f.endsWith(".ts")) continue;
        const txt = fs.readFileSync(path.join(REG_DIR, f), "utf8");
        // 各页常量命名不统一：有 *_FIELD_KEYS、*_FIELDS、*_FIELD_ORDER 三种。
        for (const m of txt.matchAll(/export const ([A-Z0-9_]+?)_(?:FIELD_KEYS|FIELDS|FIELD_ORDER)\s*=\s*\[([\s\S]*?)\]/g)) {
            const keys = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
            if (!keys.length) continue;
            const prev = map.get(m[1]) ?? [];
            map.set(m[1], [...new Set([...prev, ...keys])]);
        }
    }
    return map;
}

const ADAPTER_DIR = path.join(REPO, "web/src/features/tools/adapters");

/** 该字段是否以「条件赋值」方式写入请求体（只有填了值才提交）。 */
function isConditionalField(_toolId, field) {
    for (const f of fs.readdirSync(ADAPTER_DIR)) {
        if (!f.endsWith(".ts")) continue;
        const txt = fs.readFileSync(path.join(ADAPTER_DIR, f), "utf8");
        // 覆盖三种写法：if (x) fields.f = ...；if (x) { fields.f = ... }；f: x || undefined
        const patterns = [
            // 条件表达式里可能包含括号（如 values.styles.trim()），不能只匹配到第一个 )。
            new RegExp(`if\\s*\\(.*?\\)\\s*\\{?\\s*fields\\.${field}\\s*=`, "m"),
            new RegExp(`${field}\\s*:\\s*[^,\\n]*\\|\\|\\s*undefined`, "m"),
        ];
        if (patterns.some((re) => re.test(txt))) return true;
        continue;
        if (re.test(txt)) return true;
    }
    return false;
}

const reg = registryFields();
const RUNTIME = "/tmp/runtime-fields.json";
const runtime = fs.existsSync(RUNTIME) ? JSON.parse(fs.readFileSync(RUNTIME, "utf8")) : {};
const rows = [];

for (const t of tools) {
    // 必须精确匹配 <num>-<slug>.md：用 includes 会让 change-color 命中 change-color-v2。
    const specFile = fs.readdirSync(SPEC_DIR).find((f) => f.replace(/^\d+-/, "").replace(/\.md$/, "") === t.slug);
    if (!specFile) {
        rows.push({ id: t.id, status: "NO_SPEC" });
        continue;
    }
    const sf = specFields(specFile);
    // registry 常量名通常与 toolId 同名（去掉 ID 后缀差异），逐个大写匹配
    const runtimeFields = runtime[t.id];
    if (Array.isArray(runtimeFields) && runtimeFields.length) {
        // 条件字段：实现只在「用户填了值」时才写进请求体，默认值下不出现属于正确行为。
        // 判定方式：在 adapter 源码里该字段被 `if (...) fields.<name> =` 形式条件赋值。
        const adapterTxt = fs
            .readdirSync(path.dirname(path.join(REG_DIR, "x")))
            .length
            ? ""
            : "";
        const missing = sf.filter((k) => !runtimeFields.includes(k));
        const extra = runtimeFields.filter((k) => !sf.includes(k));
        const conditional = missing.filter((k) => isConditionalField(t.id, k));
        const realMissing = missing.filter((k) => !conditional.includes(k));
        const status = realMissing.length || extra.length ? "DIFF" : "MATCH";
        rows.push({ id: t.id, status, source: "runtime", spec: sf, impl: runtimeFields, missing: realMissing, conditional, extra });
        continue;
    }
    const candidates = [...reg.keys()].filter((k) => k === t.id || k.replace(/_/g, "") === t.id.replace(/_/g, ""));
    const rf = candidates.length ? reg.get(candidates[0]) : null;
    if (!rf) {
        rows.push({ id: t.id, status: "NO_REGISTRY_KEYS", spec: sf });
        continue;
    }
    // 规格字段表可能位于多个小节（字段契约 / 状态联动），取并集后再比。
    const missing = sf.filter((k) => !rf.includes(k));
    const extra = rf.filter((k) => !sf.includes(k));
    rows.push({ id: t.id, status: missing.length || extra.length ? "DIFF" : "MATCH", spec: sf, impl: rf, missing, extra });
}

let match = 0;
for (const r of rows) {
    if (r.status === "MATCH") {
        match++;
        process.stdout.write(`MATCH  ${r.id}\n`);
    } else if (r.status === "DIFF") {
        process.stdout.write(`DIFF   ${r.id.padEnd(24)} 规格缺实现=${JSON.stringify(r.missing)} 实现多出=${JSON.stringify(r.extra)}\n`);
    } else if (r.conditional?.length) {
        match++;
        process.stdout.write(`MATCH  ${r.id.padEnd(24)} （条件字段按需提交：${r.conditional.join(", ")}）\n`);
    } else {
        process.stdout.write(`${r.status.padEnd(6)} ${r.id}\n`);
    }
}

const diffs = rows.filter((r) => r.status === "DIFF");
console.log(`\n字段契约一致：${match}/${rows.length}；存在差异：${diffs.length}`);
fs.writeFileSync("/tmp/spec-field-parity.json", JSON.stringify({ at: new Date().toISOString(), rows }, null, 2));
console.log("→ /tmp/spec-field-parity.json");
