import { defineConfig } from "@playwright/test";

/**
 * 工具台 E2E 配置。
 *
 * 本机（macOS）只装了 Google Chrome，Playwright 自带的 chromium-1248 下载被网络阻断，
 * 所以默认走 `channel: "chrome"`；有完整 chromium 的环境可用 IC_E2E_CHANNEL 覆盖。
 *
 * 端口默认 4317（避开项目常用的 3000），已有 dev server 时复用，不重复起进程。
 */
const PORT = Number(process.env.IC_E2E_PORT ?? 4317);
const BASE_URL = process.env.IC_E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const CHANNEL = process.env.IC_E2E_CHANNEL ?? "chrome";
const SKIP_WEBSERVER = process.env.IC_E2E_NO_WEBSERVER === "1";

export default defineConfig({
    testDir: "./tests",
    testMatch: ["tools-*.spec.ts"],
    timeout: 120_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 1,
    retries: 0,
    forbidOnly: !!process.env.CI,
    reporter: [["list"]],
    use: {
        baseURL: BASE_URL,
        channel: CHANNEL,
        viewport: { width: 1440, height: 960 },
        actionTimeout: 20_000,
        navigationTimeout: 45_000,
        trace: "off",
        video: "off",
        screenshot: "off",
        acceptDownloads: true,
    },
    webServer: SKIP_WEBSERVER
        ? undefined
        : {
              command: `./node_modules/.bin/vite --host 127.0.0.1 --port ${PORT}`,
              url: BASE_URL,
              reuseExistingServer: true,
              timeout: 120_000,
              stdout: "ignore",
              stderr: "pipe",
          },
});
