import { execFile, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";

import { VERSION } from "./config.js";
import { logger } from "./utils/logger.js";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
/**
 * 0.23：桌面端以单文件形式分发 canvas-agent，运行时并不存在 node_modules，
 * 这里读不到内置 codex 版本时退化为空字符串，仅影响启动日志提示。
 */
function bundledCodexVersion(): string {
    try {
        return String((require("@openai/codex/package.json") as { version: string }).version);
    } catch {
        return "";
    }
}

const CODEX_VERSION = bundledCodexVersion();

/** 输出当前版本，并在后台检查 npm 最新版本。 */
export function checkVersions() {
    const localCodexVersion = commandVersion("codex");
    logger.info("Canvas Agent version", { version: VERSION });
    logger.info("Bundled Codex version", { version: CODEX_VERSION });
    logger.info("Local Codex version", { version: localCodexVersion || "not found" });
    if (!localCodexVersion) {
        logger.warn("Local Codex was not found. Install the latest version with: npm install -g @openai/codex@latest");
    } else if (CODEX_VERSION && localCodexVersion !== CODEX_VERSION) {
        logger.warn(`Bundled Codex ${CODEX_VERSION} does not match local Codex ${localCodexVersion}. Keep both current with: npm install -g @openai/codex@latest && npx -y @basketikun/canvas-agent@latest`);
    }
    void checkLatestVersions(localCodexVersion);
}

/** 查询 npm，提醒升级不再维护的旧版本。打包分发（无 node_modules、无网络依赖）时跳过。 */
async function checkLatestVersions(localCodexVersion: string) {
    if (process.env.CANVAS_AGENT_SKIP_UPDATE_CHECK === "1" || !CODEX_VERSION) return;
    try {
        const [latestAgent, latestCodex] = await Promise.all([
            npmVersion("@basketikun/canvas-agent"),
            npmVersion("@openai/codex"),
        ]);
        if (isOlder(VERSION, latestAgent)) logger.warn(`Update available: Canvas Agent ${VERSION} -> ${latestAgent}. Run: npx -y @basketikun/canvas-agent@latest`);
        if (CODEX_VERSION && isOlder(CODEX_VERSION, latestCodex)) logger.warn(`Update available: bundled Codex ${CODEX_VERSION} -> ${latestCodex}. Upgrade Canvas Agent with: npx -y @basketikun/canvas-agent@latest`);
        if (localCodexVersion && isOlder(localCodexVersion, latestCodex)) logger.warn(`Update available: local Codex ${localCodexVersion} -> ${latestCodex}. Run: npm install -g @openai/codex@latest`);
    } catch {
        logger.warn("Unable to check the latest npm versions; startup will continue.");
    }
}

/** 读取本机命令输出中的语义版本号。 */
function commandVersion(command: string) {
    try {
        return execFileSync(command, ["--version"], { encoding: "utf8", timeout: 5_000 }).match(/\d+\.\d+\.\d+/)?.[0] || "";
    } catch {
        return "";
    }
}

/** 读取 npm 包的最新版本。 */
async function npmVersion(name: string) {
    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    const { stdout } = await execFileAsync(command, ["view", name, "version"], { encoding: "utf8", timeout: 10_000 });
    return stdout.trim();
}

/** 比较仅包含数字段的稳定版语义版本。 */
function isOlder(current: string, latest: string) {
    const left = current.split(".").map(Number);
    const right = latest.split(".").map(Number);
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
        if ((left[index] || 0) !== (right[index] || 0)) return (left[index] || 0) < (right[index] || 0);
    }
    return false;
}
