import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

type Expectation = {
    toBe: (expected: unknown) => void;
    toContain: (expected: string) => void;
    not: { toContain: (expected: string) => void };
};

// The runtime ships no bun type package, so the runner is imported dynamically with an explicit
// contract; a static `bun:test` import would add a TS2307 to `tsc --noEmit`.
const { afterAll, describe, expect, test } = (await import("bun:test" as string)) as {
    afterAll: (fn: () => void) => void;
    describe: (name: string, fn: () => void) => void;
    expect: (actual: unknown) => Expectation;
    test: (name: string, fn: () => void | Promise<void>) => void;
};

/**
 * Shared shell guard: the top navigation must not re-import LinkFox-style monetisation
 * surfaces (points / account centre / promo strip / learning centre / external Skills),
 * and must keep the canvas workspace entries reachable.
 */

// i18n (and some stores) read localStorage while initialising.
const storage = new Map<string, string>();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => void storage.set(key, value),
        removeItem: (key: string) => void storage.delete(key),
    },
});
afterAll(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

// Vite `define` globals are not present under the bun runner.
const globals = globalThis as Record<string, unknown>;
globals.__APP_VERSION__ = "test";
globals.__APP_RELEASES__ = [];

await import("@/i18n");

const { AppTopNav } = await import("./app-top-nav");

const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/tools/ecommerce-suite/scale-up"]}>
        <AppTopNav />
    </MemoryRouter> as ReactElement,
);

describe("AppTopNav shell", () => {
    test("drops LinkFox monetisation and account surfaces", () => {
        expect(html).not.toContain("积分");
        expect(html).not.toContain("个人中心");
        expect(html).not.toContain("学习中心");
        expect(html).not.toContain("免费");
        expect(html).not.toContain("升级");
        expect(html).not.toContain("购买");
        expect(html).not.toContain("linkfox");
        expect(html).not.toContain("Skills");
        expect(html).not.toContain("data-testid=\"app-promo-bar\"");
        expect(html).not.toContain("data-testid=\"app-user-area\"");
    });

    test("keeps the five canonical tool categories and canvas entries", () => {
        for (const slug of ["ecommerce-suite", "smart-edit", "product-design", "ai-video", "batch-generate"]) {
            expect(html).toContain(`data-testid="tools-nav-trigger-${slug}"`);
        }
        expect(html).not.toContain('data-testid="tools-nav-more"');
        expect(html).toContain('href="/assets"');
        expect(html).toContain('href="/image"');
        expect(html).toContain('href="/video"');
    });

    test("uses the requested primary order without a duplicate catalogue", () => {
        const order = ["canvas", "image", "video", "ecommerce-suite", "smart-edit", "ai-video", "batch-generate", "product-design", "prompts", "assets", "config"];
        const rendered = [...html.matchAll(/data-testid="tools-nav-trigger-([^"]+)"/g)].map((match) => match[1]);
        expect(rendered.join(",")).toBe(order.join(","));
        expect(html).not.toContain('data-testid="mobile-nav-trigger"');
        expect(html).not.toContain('data-testid="tools-nav-menu"');
        expect(html).not.toContain('href="/tools/ecommerce-suite/scale-up"');
    });

    test("uses the canvas shell chrome instead of pixel-copied metrics", () => {
        expect(html).toContain("data-testid=\"shell-top-nav\"");
        expect(html).toContain("h-14");
        expect(html).not.toContain("--shell-pad-left");
        expect(html).not.toContain('aria-disabled="true"');
    });
});
