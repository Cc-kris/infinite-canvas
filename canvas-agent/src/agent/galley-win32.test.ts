import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/** 伪造平台：模块在加载时读 process.platform，所以必须先改平台再动态 import。 */
async function withPlatform<T>(platform: NodeJS.Platform, env: Record<string, string>, run: (mod: typeof import("./runtimes.js")) => Promise<T> | T) {
    const original = process.platform;
    const saved = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(env)) {
        saved.set(key, process.env[key]);
        process.env[key] = value;
    }
    Object.defineProperty(process, "platform", { value: platform, configurable: true });
    try {
        const mod = await import(`./runtimes.js?platform=${platform}-${Date.now()}-${Math.random()}`);
        return await run(mod as typeof import("./runtimes.js"));
    } finally {
        Object.defineProperty(process, "platform", { value: original, configurable: true });
        for (const [key, value] of saved) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
}

function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "ic-galley-"));
}

test("Windows 从 %APPDATA%\\galley\\cli-path 找到 galley.exe", async () => {
    const root = tempDir();
    const appdata = path.join(root, "Roaming");
    const local = path.join(root, "Local");
    // 真实布局：%LOCALAPPDATA%\Programs\Galley\galley.exe
    const cli = path.join(local, "Programs", "Galley", "galley.exe");
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.writeFileSync(cli, "");
    fs.mkdirSync(path.join(appdata, "galley"), { recursive: true });
    fs.writeFileSync(path.join(appdata, "galley", "cli-path"), `${cli}\r\n`);

    await withPlatform("win32", { APPDATA: appdata, LOCALAPPDATA: local, PATH: "", XDG_CONFIG_HOME: path.join(root, "xdg") }, (mod) => {
        assert.equal(mod.resolveCommand("galley"), cli);
    });
});

test("Windows 没有发现文件时，下探 %LOCALAPPDATA%\\Programs\\Galley 子目录", async () => {
    const root = tempDir();
    const local = path.join(root, "Local");
    const cli = path.join(local, "Programs", "Galley", "galley.exe");
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.writeFileSync(cli, "");

    await withPlatform(
        "win32",
        {
            APPDATA: path.join(root, "Roaming-empty"),
            LOCALAPPDATA: local,
            PATH: "",
            XDG_CONFIG_HOME: path.join(root, "xdg"),
            ProgramFiles: path.join(root, "PF"),
            "ProgramFiles(x86)": path.join(root, "PF86"),
        },
        (mod) => {
            assert.equal(mod.resolveCommand("galley"), cli);
        },
    );
});

test("Windows 完全找不到 Galley 时返回空串，交给调用方报可读错误", async () => {
    const root = tempDir();
    await withPlatform(
        "win32",
        {
            APPDATA: path.join(root, "Roaming"),
            LOCALAPPDATA: path.join(root, "Local"),
            PATH: "",
            XDG_CONFIG_HOME: path.join(root, "xdg"),
            ProgramFiles: path.join(root, "PF"),
            "ProgramFiles(x86)": path.join(root, "PF86"),
        },
        (mod) => {
            assert.equal(mod.resolveCommand("galley"), "");
        },
    );
});

test("CLI 用 GBK 输出 cmd 报错时，界面拿到的是可执行的中文建议", async () => {
    const root = tempDir();
    // 中文 Windows cmd 的原话，GBK 编码（0.25.7 在 Windows 上显示成乱码的就是它）。
    const gbk = Buffer.from([
        0x27, 0x67, 0x61, 0x6c, 0x6c, 0x65, 0x79, 0x27, 0x20, 0xb2, 0xbb, 0xca, 0xc7, 0xc4, 0xda, 0xb2, 0xbf,
        0xbb, 0xf2, 0xcd, 0xe2, 0xb2, 0xbf, 0xc3, 0xfc, 0xc1, 0xee, 0xa3, 0xac,
    ]);
    fs.writeFileSync(path.join(root, "msg.bin"), gbk);
    const stub = path.join(root, "galley-stub.sh");
    fs.writeFileSync(stub, `#!/bin/sh\ncat "$(dirname "$0")/msg.bin" >&2\nexit 1\n`);
    fs.chmodSync(stub, 0o755);

    const saved = process.env.GALLEY_BIN;
    process.env.GALLEY_BIN = stub;
    try {
        const { listGalleyModels } = await import(`./galley.js?stub=${Date.now()}`);
        await assert.rejects(listGalleyModels, (error: Error) => {
            assert.match(error.message, /未找到 Galley 命令行工具/);
            return true;
        });
    } finally {
        if (saved === undefined) delete process.env.GALLEY_BIN;
        else process.env.GALLEY_BIN = saved;
    }
});
