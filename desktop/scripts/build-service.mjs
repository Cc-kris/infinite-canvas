/**
 * 把 desktop/service/index.mjs 打成单文件 ESM 放进 desktop/service.mjs，随桌面端一起分发。
 *
 * 用法：node scripts/build-service.mjs（等价 pnpm build:service）
 * 产出：
 *   service.mjs                                    单文件本地业务服务
 *   bin/<platform>-<arch>/ffmpeg                   当前构建机架构的原生 ffmpeg
 *
 * ffmpeg-static 保持 external：它的默认导出是二进制文件路径，打进 bundle 会丢失真实位置。
 * 打包时把二进制复制到 bin/，由 service 里的 resolveFfmpegBinary 按 resourcesPath 读取。
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, "..");
const agentSrcDir = path.resolve(desktopDir, "../canvas-agent");
const requireFromAgent = createRequire(path.join(agentSrcDir, "package.json"));
const esbuildEntry = requireFromAgent.resolve("esbuild");
const { build } = await import(pathToFileURL(esbuildEntry).href);

await build({
    entryPoints: [path.join(desktopDir, "service/index.mjs")],
    outfile: path.join(desktopDir, "service.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: false,
    legalComments: "none",
    external: ["ffmpeg-static"],
    banner: {
        js: 'import{createRequire as __cr}from"node:module";const require=__cr(import.meta.url);',
    },
});

const requireFromDesktop = createRequire(path.join(desktopDir, "package.json"));
const ffmpegStatic = requireFromDesktop("ffmpeg-static");
const binDir = path.join(desktopDir, "bin", `${process.platform}-${process.arch}`);
const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
fs.mkdirSync(binDir, { recursive: true });
fs.copyFileSync(ffmpegStatic, path.join(binDir, binaryName));
fs.chmodSync(path.join(binDir, binaryName), 0o755);

console.log(`[build-service] service.mjs + bin/${process.platform}-${process.arch}/${binaryName}`);
