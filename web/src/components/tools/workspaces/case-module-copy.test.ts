import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 与仓库其他测试一致：动态导入 bun:test，避免 tsc --noEmit 报 TS2307。
const { describe, expect, test } = (await import("bun:test" as string)) as {
    describe: (name: string, fn: () => void) => void;
    expect: (actual: unknown) => {
        toBe: (value: unknown) => void;
        toContain: (value: string) => void;
        toBeGreaterThan: (value: number) => void;
    };
    test: (name: string, fn: () => void) => void;
};

/**
 * R7/R8 「T 文案」PARTIAL 的回归守卫（7 个工具）。
 *
 * 历史问题（见 reports/independent-audit-20261029-r7/scope-audit.json）：
 *   案例区可见文案写成「案例库未接入：暂无真实案例可回填」/「…待接入（PARTIAL）」，
 *   并直接写上游产品名 LinkFox。
 * 现口径（本测试锁定）：
 *   1. 案例区文案不得出现上游品牌字样、不得出现「未接入/待接入/暂无真实案例」占位；
 *   2. 原功能字段必须保留：上游案例接口路径 + `type=<bizType>`（产品套图保留真实案例数据源）；
 *   3. 不新增无关模块：PRODUCT_MARKET_MATERIAL 本就没有案例区，不得被凭空加一个。
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(HERE, file), "utf8");

const SOURCES = {
    video: read("video.tsx"),
    videoTranslation: read("video-translation.tsx"),
    suite: read("suite.tsx"),
};

const PLACEHOLDER = /案例库未接入|暂无真实案例|待接入（PARTIAL）|待接入\(PARTIAL\)/;
/** 案例区/文案里的品牌字样（大小写不敏感，避免改写成 linkfox / LinkFox 绕过）。 */
const BRAND = /linkfox/i;
/** 文件级检查用大小写敏感版：`data-layout="linkfox-two-pane"`、`variant="linkfox"` 是功能标识，不是文案。 */
const BRAND_TEXT = /LinkFox/;

type CaseSection = {
    tool: string;
    source: keyof typeof SOURCES;
    testId: string;
    /** 案例区必须保留的原功能字段（上游接口路径 + bizType 或本地真实案例数据源） */
    keeps: string[];
};

const CASE_SECTIONS: CaseSection[] = [
    { tool: "SALE_VIDEO", source: "video", testId: "sale-video-cases", keeps: ["优秀案例", "type=73", "/image/make-case/list?type=<bizType>"] },
    { tool: "VIDEO_REPLICATION", source: "video", testId: "video-replication-cases", keeps: ["优秀案例", "type=89", "/image/make-case/list?type=<bizType>"] },
    { tool: "AI_VIDEO_EDITING", source: "video", testId: "ai-video-editing-cases", keeps: ["优秀案例", "type=95", "/image/make-case/list?type=<bizType>"] },
    { tool: "VIDEO_CONCAT", source: "video", testId: "video-concat-cases", keeps: ["优秀案例", "type=52", "/image/make-case/list?type=<bizType>"] },
    { tool: "VIDEO_TRANSLATION", source: "videoTranslation", testId: "video-translation-cases", keeps: ["优秀案例", "type=814", "/image/make-case/list?type=<bizType>"] },
    { tool: "PRODUCT_IMAGE_SUITE", source: "suite", testId: "suite-panel-cases", keeps: ["cases={PRODUCT_SUITE_CASES}"] },
];

/** 取 data-testid 对应的区块源码（案例区本身很短，截到最近的闭合标签即可）。 */
function sliceSection(code: string, testId: string): string {
    const start = code.indexOf(`data-testid="${testId}"`);
    if (start < 0) return "";
    const rest = code.slice(start, start + 1500);
    const end = rest.search(/<\/section>|<\/div>/);
    return end < 0 ? rest : rest.slice(0, end);
}

describe("案例区文案：7 工具无品牌字样 / 无占位 / 保留原功能字段", () => {
    for (const item of CASE_SECTIONS) {
        test(`${item.tool}：${item.testId} 区块存在且文案合规`, () => {
            const section = sliceSection(SOURCES[item.source], item.testId);
            expect(section.length).toBeGreaterThan(0);
            expect(section).toContain("优秀案例");
            expect(BRAND.test(section)).toBe(false);
            expect(PLACEHOLDER.test(section)).toBe(false);
            for (const keep of item.keeps) {
                expect(section).toContain(keep);
            }
        });
    }

    test("PRODUCT_MARKET_MATERIAL：不新增案例模块，自身也没有品牌/占位文案", () => {
        const code = SOURCES.suite;
        const start = code.indexOf("export function ProductMarketMaterialWorkspace");
        expect(start).toBeGreaterThan(0);
        const body = code.slice(start);
        // 该页规格（page-specs/32）没有「优秀案例」区，不得为了对齐审计而新造一个
        expect(body.includes('data-testid="product-market-material-cases"')).toBe(false);
        expect(BRAND.test(body)).toBe(false);
        expect(PLACEHOLDER.test(body)).toBe(false);
    });

    test("三个工作区文件整体不再出现上游品牌字样与占位文案", () => {
        for (const [name, code] of Object.entries(SOURCES)) {
            expect(`${name}:${BRAND_TEXT.test(code)}`).toBe(`${name}:false`);
            expect(`${name}:${PLACEHOLDER.test(code)}`).toBe(`${name}:false`);
        }
    });

    test("保留功能标识：不改 data-layout / variant 等既有功能字段", () => {
        // 这两个是 ToolAssetInput 的样式变体与双栏布局标记，属功能字段（20+ 工作区共用），只清文案不删它们
        expect(SOURCES.suite).toContain('data-layout="linkfox-two-pane"');
        expect(SOURCES.suite).toContain('variant="linkfox"');
    });
});
