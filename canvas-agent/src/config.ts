import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_PORT = 17371;
/** 0.25.3: 允许用环境变量切换配置目录，便于自动化测试时不碰用户真实配置。 */
export const CONFIG_DIR = process.env.CANVAS_AGENT_CONFIG_DIR || path.join(os.homedir(), ".infinite-canvas");
export const CONFIG_FILE = path.join(CONFIG_DIR, "canvas-agent.json");
export const VERSION = readPackageVersion();
/**
 * 0.23：桌面端把 canvas-agent 打成单文件分发，`import.meta.url` 指向打包产物，
 * 说明文件可能位于同目录或上一级，这里按候选路径依次探测，源码运行与打包运行都能读到。
 */
function readAgentPrompt(): string {
    const base = new URL(".", import.meta.url);
    const candidates = [
        process.env.CANVAS_AGENT_INSTRUCTIONS || "",
        new URL("./agent-instructions.md", base).pathname,
        new URL("../agent-instructions.md", base).pathname,
    ].filter(Boolean);
    for (const candidate of candidates) {
        try {
            return fs.readFileSync(candidate, "utf8");
        } catch {
            continue;
        }
    }
    return "";
}

export const AGENT_PROMPT = readAgentPrompt();
const initializedWorkspaces = new Set<string>();

export type SiteWorkspaceConfig = { workspacePath: string; activeThreadId?: string; pinnedThreadIds?: string[] };
export type CanvasAgentConfig = { url: string; token: string; origins?: string[]; workspace?: SiteWorkspaceConfig; /** 0.23: 用户在连接面板选中的本地 Agent 运行时。 */ runtime?: "claude" | "codex" | "galley"; /** 0.26: 用户手选的 Agent 安装目录（扫不到默认位置时用）。 */ agentPaths?: Partial<Record<"claude" | "codex" | "galley", string>> };

/** 读取本地 Canvas Agent 配置，不存在时生成默认配置。 */
export function loadConfig(create = false): CanvasAgentConfig {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as CanvasAgentConfig;
    } catch {
        const config = { url: `http://127.0.0.1:${Number(process.env.PORT) || DEFAULT_PORT}`, token: crypto.randomBytes(18).toString("hex") };
        if (create) saveConfig(config);
        return config;
    }
}

/** 将 Canvas Agent 配置写入用户配置目录。 */
export function saveConfig(config: CanvasAgentConfig) {
    // 0.26: agentPaths（用户手选的 Agent 安装目录）只由 runtimes.ts 维护，
    // 这里回填一次，避免工作空间等字段的保存把用户手选的路径冲掉。
    if (!config.agentPaths) {
        try {
            const existing = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as CanvasAgentConfig;
            if (existing?.agentPaths) config.agentPaths = existing.agentPaths;
        } catch {
            /* 首次写入，没有旧配置 */
        }
    }
    writeConfigFile(CONFIG_DIR, CONFIG_FILE, config);
}

/** 写入配置并强制目录 0700、文件 0600，包括纠正已有宽松权限。 */
export function writeConfigFile(dir: string, file: string, config: CanvasAgentConfig) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
    fs.chmodSync(dir, 0o700);
    fs.chmodSync(file, 0o600);
}

/** 确保站点级 Codex 工作空间存在并已初始化。 */
export function ensureSiteWorkspace(config: CanvasAgentConfig) {
    const current = config.workspace;
    if (current?.workspacePath) {
        const workspacePath = resolveWorkspacePath(current.workspacePath);
        initializeWorkspace(workspacePath);
        return { ...current, workspacePath };
    }
    const workspacePath = path.join(CONFIG_DIR, "codex-workspaces", "site");
    config.workspace = { workspacePath };
    initializeWorkspace(workspacePath);
    saveConfig(config);
    return { workspacePath };
}

/** 更新站点级 Codex 工作空间配置。 */
export function updateSiteWorkspace(config: CanvasAgentConfig, patch: Partial<SiteWorkspaceConfig>) {
    const current = ensureSiteWorkspace(config);
    const workspacePath = patch.workspacePath ? resolveWorkspacePath(patch.workspacePath) : current.workspacePath;
    const next = { ...current, ...patch, workspacePath };
    config.workspace = { workspacePath: next.workspacePath, activeThreadId: next.activeThreadId, pinnedThreadIds: next.pinnedThreadIds };
    initializeWorkspace(workspacePath);
    saveConfig(config);
    return config.workspace;
}

/** 创建工作空间目录并写入默认 AGENTS.md。 */
function initializeWorkspace(workspacePath: string) {
    if (initializedWorkspaces.has(workspacePath)) return;
    fs.mkdirSync(workspacePath, { recursive: true });
    const instructionsFile = path.join(workspacePath, "AGENTS.md");
    const current = fs.existsSync(instructionsFile) ? fs.readFileSync(instructionsFile, "utf8") : "";
    if (!current || current.startsWith("# Infinite Canvas Agent")) fs.writeFileSync(instructionsFile, AGENT_PROMPT);
    initializedWorkspaces.add(workspacePath);
}

/** 将用户输入的工作空间路径解析为绝对路径。 */
function resolveWorkspacePath(value: string) {
    if (value === "~") return os.homedir();
    if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
    return path.resolve(value);
}

/**
 * 从当前包信息中读取 Canvas Agent 版本号。
 * 0.23：桌面端以单文件分发，构建时会把 package.json 写到产物同目录，
 * 因此这里先看同目录再回退到上一级（源码运行）。
 * 注意：分发路径可能含空格（Infinite Canvas.app），必须用 fileURLToPath 解码。
 */
function readPackageVersion() {
    const candidates = [
        process.env.CANVAS_AGENT_VERSION || "",
        fileURLToPath(new URL("./package.json", import.meta.url)),
        fileURLToPath(new URL("../package.json", import.meta.url)),
    ].filter(Boolean);
    for (const candidate of candidates) {
        if (/^\d+\.\d+\.\d+/.test(candidate)) return candidate;
        try {
            const pkg = JSON.parse(fs.readFileSync(candidate, "utf8")) as { version?: string };
            if (pkg.version) return pkg.version;
        } catch {
            continue;
        }
    }
    return "0.0.0";
}
