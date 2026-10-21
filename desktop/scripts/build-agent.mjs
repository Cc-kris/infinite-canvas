/**
 * 把 canvas-agent 打成单文件 ESM 放进 desktop/agent/，随桌面端一起分发。
 *
 * 用法：node scripts/build-agent.mjs（等价 pnpm build:agent）
 * 产出：
 *   agent/canvas-agent.mjs        单文件服务
 *   agent/agent-instructions.md   Agent 提示词
 *   agent/package.json            仅含 name/version/type，供运行时读取版本号
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, "..");
const agentSrcDir = path.resolve(desktopDir, "../canvas-agent");
const outDir = path.join(desktopDir, "agent");

// esbuild 装在 canvas-agent 的 node_modules 里，从那里解析。
const requireFromAgent = createRequire(path.join(agentSrcDir, "package.json"));
const esbuildEntry = requireFromAgent.resolve("esbuild");
const { build } = await import(pathToFileURL(esbuildEntry).href);

const pkg = JSON.parse(fs.readFileSync(path.join(agentSrcDir, "package.json"), "utf8"));

fs.mkdirSync(outDir, { recursive: true });

await build({
    entryPoints: [path.join(agentSrcDir, "src/index.ts")],
    outfile: path.join(outDir, "canvas-agent.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: false,
    legalComments: "none",
    // 单文件里没有 node_modules：内置 codex 包必须外部化，运行时再按需解析。
    external: ["@openai/codex", "@openai/codex/*"],
    banner: {
        js: 'import{createRequire as __cr}from"node:module";const require=__cr(import.meta.url);',
    },
});

fs.copyFileSync(path.join(agentSrcDir, "agent-instructions.md"), path.join(outDir, "agent-instructions.md"));
fs.writeFileSync(
    path.join(outDir, "package.json"),
    `${JSON.stringify({ name: "canvas-agent", version: pkg.version, type: "module" }, null, 4)}\n`,
);

console.log(`[build-agent] canvas-agent ${pkg.version} -> ${path.relative(desktopDir, outDir)}/canvas-agent.mjs`);
