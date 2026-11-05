import { launchBrowser, prepareContext, BASE_URL, sleep } from "./lib.mjs";

const URL_IMG = "https://oss-us.dimenoss.com/images/2026/10/28/1793198918_efe68b3d380801d28b26a09588374ae9.png";
const browser = await launchBrowser({ headless: true });
const { context, page } = await prepareContext(browser);
try {
    await page.goto(`${BASE_URL}/tools/product-design/image-text-edit`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="tool-result"]', { timeout: 60000 });
    const before = await page.evaluate(async () => {
        const mod = (performance.getEntriesByType("resource").map((e) => e.name).find((n) => n.includes("/src/stores/use-tool-task-store.ts"))) || "/src/stores/use-tool-task-store.ts";
        const store = await import(mod);
        return { mod, keys: Object.keys(store.useToolTaskStore.getState().tasks || {}), hydrated: store.useToolTaskStore.getState().hydrated };
    });
    const injected = await page.evaluate(async (url) => {
        const mod = (performance.getEntriesByType("resource").map((e) => e.name).find((n) => n.includes("/src/stores/use-tool-task-store.ts"))) || "/src/stores/use-tool-task-store.ts";
        const store = await import(mod);
        const taskId = `dbg-${Date.now()}`;
        const task = {
            id: taskId, toolId: "IMAGE_TEXT_EDIT", capability: "image", status: "succeeded",
            createdAt: Date.now(), updatedAt: Date.now(), prompt: "dbg",
            configSnapshot: { model: "gpt-image-2" },
            result: { items: [{ id: `${taskId}-0`, kind: "image", url, mimeType: "image/png" }] },
        };
        store.persistTask(task);
        store.useToolTaskStore.setState({ tasks: { ...store.useToolTaskStore.getState().tasks, [taskId]: task }, hydrated: true });
        return Object.keys(store.useToolTaskStore.getState().tasks);
    }, URL_IMG);
    await sleep(1500);
    const after = await page.evaluate(async () => {
        const mod = (performance.getEntriesByType("resource").map((e) => e.name).find((n) => n.includes("/src/stores/use-tool-task-store.ts"))) || "/src/stores/use-tool-task-store.ts";
        const store = await import(mod);
        const tasks = store.useToolTaskStore.getState().tasks || {};
        const html = document.querySelector('[data-testid="tool-result"]')?.outerHTML ?? "";
        return {
            keys: Object.keys(tasks),
            sample: Object.values(tasks).map((t) => ({ id: t.id, toolId: t.toolId, status: t.status, items: (t.result?.items ?? []).length })),
            hasImage: Boolean(document.querySelector('[data-testid="tool-result-image"]')),
            html: html.slice(0, 900),
        };
    });
    console.log(JSON.stringify({ before, injected, after }, null, 1));
} finally {
    await browser.close();
}
