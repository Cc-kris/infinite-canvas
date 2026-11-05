/**
 * TASK-023 验证：REPLACE_GOODS 的字段合成、草稿往返、几何/蒙版守卫与真实渲染。
 *
 * 断言目标是「无静默丢参」：22 个字段必须逐个落齐，少一个就报错；
 * 以及工作区首屏真的渲染出本页独有区域（不是通用占位）。
 */
import { describe, expect, test } from "bun:test";

import {
    REPLACE_GOODS_FIELD_KEYS,
    REPLACE_GOODS_MIN_QUAD_COVERAGE,
    applyQuad,
    buildUnitSnapshot,
    composeReplaceGoodsFields,
    composeReplaceGoodsPrompt,
    createSku,
    createTransform,
    createWorkspace,
    deriveQuadFields,
    dragQuadCorner,
    parseDraftValues,
    protectMaskCoverage,
    quadCoverage,
    serializeDraftValues,
    unitSnapshotHash,
    isUnitSnapshotStale,
    validateWorkspace,
} from "@/features/tools/registry/replace-goods";
import { auditReplaceGoodsFields, assertReplaceGoodsInput, buildReplaceGoodsInput } from "@/features/tools/adapters/replace-goods";
import type { ReplaceGoodsUnit } from "@/features/tools/adapters/replace-goods";

const scene = {
    assetId: "scene-1",
    name: "客厅场景.png",
    url: "blob:scene-1",
    originUrl: "blob:scene-1",
    width: 1600,
    height: 1200,
};

function readyWorkspace() {
    const sku = {
        ...createSku({ id: "sku-1", label: "商品 1" }),
        targetAssetId: "target-1",
        targetName: "新品.png",
        targetUrl: "blob:target-1",
        targetOriginUrl: "blob:target-1",
        targetWidth: 900,
        targetHeight: 900,
    };
    return createWorkspace({ scene, skus: [sku], activeSkuId: sku.id });
}

describe("商品替换 · 工作区校验", () => {
    test("空态被拦住，且原因具体到缺什么", () => {
        const issues = validateWorkspace(createWorkspace());
        const codes = issues.map((issue) => issue.code);
        expect(codes).toContain("scene-missing");
        expect(codes).toContain("target-missing");
    });

    test("全齐后无问题，且四边形覆盖率高于下限", () => {
        const workspace = readyWorkspace();
        expect(validateWorkspace(workspace)).toEqual([]);
        expect(quadCoverage(workspace.skus[0].history.present.quad)).toBeGreaterThan(REPLACE_GOODS_MIN_QUAD_COVERAGE);
    });

    test("四边形退化过小会被拦住，不交给上游", () => {
        const workspace = readyWorkspace();
        const tiny = {
            topLeft: { x: 0.5, y: 0.5 },
            topRight: { x: 0.52, y: 0.5 },
            bottomRight: { x: 0.52, y: 0.52 },
            bottomLeft: { x: 0.5, y: 0.52 },
        };
        const issues = validateWorkspace(applyQuad(workspace, tiny));
        expect(issues.map((issue) => issue.code)).toContain("quad-too-small");
    });
});

describe("商品替换 · 几何与蒙版", () => {
    test("透视模式拖动单角时对边保持平行；扭曲模式只动该角", () => {
        const quad = createTransform({ width: 0.6, height: 0.6 }).quad;
        const perspective = dragQuadCorner(quad, "topLeft", { x: 0.2, y: 0.25 }, "perspective");
        const distort = dragQuadCorner(quad, "topLeft", { x: 0.2, y: 0.25 }, "distort");
        const slope = (a: { x: number; y: number }, b: { x: number; y: number }) => (b.y - a.y) / (b.x - a.x);
        expect(slope(perspective.topLeft, perspective.topRight)).toBeCloseTo(slope(perspective.bottomLeft, perspective.bottomRight), 5);
        expect(distort.bottomLeft).toEqual(quad.bottomLeft);
    });

    test("中心点/缩放/旋转由四边形派生，随拖动真实变化", () => {
        const quad = createTransform({ width: 0.4, height: 0.4 }, { x: 0.5, y: 0.5 }).quad;
        const before = deriveQuadFields(quad, { width: 0.4, height: 0.4 });
        const moved = dragQuadCorner(quad, "bottomRight", { x: 0.95, y: 0.95 }, "distort");
        const after = deriveQuadFields(moved, { width: 0.4, height: 0.4 });
        expect(after.scale).toBeGreaterThan(before.scale);
        expect(after.point.x).toBeGreaterThanOrEqual(before.point.x);
    });

    test("补锁笔画会真实抬高四边形外的保护覆盖率", () => {
        const workspace = readyWorkspace();
        const sku = workspace.skus[0];
        const empty = protectMaskCoverage(sku.mask, sku.history.present.quad);
        const painted = protectMaskCoverage(
            { ...sku.mask, strokes: [{ id: "s1", tool: "brush", size: 120, points: [{ x: 0.05, y: 0.05 }, { x: 0.3, y: 0.1 }] }] },
            sku.history.present.quad,
        );
        expect(painted).toBeGreaterThan(empty);
    });
});

describe("商品替换 · 草稿与快照", () => {
    test("草稿往返不丢四边形、蒙版与参数", () => {
        const workspace = readyWorkspace();
        const withMask = {
            ...workspace,
            mode: "distort" as const,
            denoiseStrength: 55,
            outputNum: 2,
            skus: workspace.skus.map((item) => ({
                ...item,
                sceneChange: "high" as const,
                mask: { ...item.mask, brush: 88, strokes: [{ id: "k", tool: "brush" as const, size: 88, points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] }] },
            })),
        };
        const restored = parseDraftValues(serializeDraftValues(withMask));
        expect(restored).not.toBeNull();
        expect(restored!.mode).toBe("distort");
        expect(restored!.denoiseStrength).toBe(55);
        expect(restored!.outputNum).toBe(2);
        expect(restored!.skus[0].mask.strokes.length).toBe(1);
        expect(restored!.skus[0].history.present.quad).toEqual(withMask.skus[0].history.present.quad);
    });

    test("22 个字段全部落齐，一字段缺失即被审计抓出", () => {
        const workspace = readyWorkspace();
        const sku = workspace.skus[0];
        const snapshot = buildUnitSnapshot({ workspace, sku });
        const fields = composeReplaceGoodsFields(snapshot, { maskUrl: "data:image/png;base64,mask" });
        expect(Object.keys(fields).length).toBe(REPLACE_GOODS_FIELD_KEYS.length);
        expect(auditReplaceGoodsFields(fields)).toMatchObject({ expected: REPLACE_GOODS_FIELD_KEYS.length, present: REPLACE_GOODS_FIELD_KEYS.length, missing: [], extra: [] });

        const broken = { ...fields } as Record<string, unknown>;
        delete broken.point;
        expect(auditReplaceGoodsFields(broken).missing).toEqual(["point"]);
    });

    test("提示词带出落位与变化程度，且随快照变化失效", () => {
        const workspace = readyWorkspace();
        const sku = workspace.skus[0];
        const snapshot = buildUnitSnapshot({ workspace, sku });
        const prompt = composeReplaceGoodsPrompt(snapshot);
        expect(prompt.length).toBeGreaterThan(20);
        expect(prompt).toContain("商品");
        const hash = unitSnapshotHash(snapshot);
        expect(isUnitSnapshotStale(hash, snapshot)).toBe(false);
        const changed = { ...snapshot, denoiseStrength: snapshot.denoiseStrength + 5 };
        expect(isUnitSnapshotStale(hash, changed)).toBe(true);
    });

    test("提交守卫：参考图不足 4 张直接抛错，不静默降级", () => {
        const unit = {
            id: "u1",
            label: "商品 1",
            snapshot: {},
            fields: {},
            prompt: "p",
            references: [{ id: "a", role: "scene", name: "a", url: "blob:a" }],
        } as unknown as ReplaceGoodsUnit;
        expect(() => assertReplaceGoodsInput(buildReplaceGoodsInput(unit))).toThrow();
    });
});

/* ================================================================== */
/* 真实渲染：react-dom/server 渲染真组件                                 */
/* ================================================================== */

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
        clear: () => store.clear(),
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() {
            return store.size;
        },
    },
});

async function renderWorkspace(): Promise<string> {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { MemoryRouter } = await import("react-router-dom");
    const { ReplaceGoodsWorkspace } = await import("@/components/tools/workspaces/replace");
    const element = React.createElement(MemoryRouter, null, React.createElement(ReplaceGoodsWorkspace));
    return renderToStaticMarkup(element as Parameters<typeof renderToStaticMarkup>[0]);
}

describe("商品替换 · 工作区渲染", () => {
    test("本页独有区域齐全，不是通用占位", async () => {
        const html = await renderWorkspace();
        for (const id of [
            "replace-goods-workspace",
            "replace-goods-canvas",
            "replace-goods-param-bar",
            "replace-goods-submit",
            "replace-goods-sku-tabs",
            "replace-goods-result-empty",
        ]) {
            expect(html).toContain(`data-testid="${id}"`);
        }
    });

    test("布局按原站：画布主区 + 参数条置底 + 结果列在右，不再有分步卡/自造工具条", async () => {
        const html = await renderWorkspace();
        // 结果列在右（configSide="right"），画布在上方主区。
        expect(html).toContain('data-config-side="right"');
        // 参数条与立即生成都在画布同一列，且不再有右侧属性面板里的重复控件。
        expect(html).toContain('data-testid="replace-goods-param-bar"');
        expect(html.indexOf('data-testid="replace-goods-canvas"')).toBeLessThan(html.indexOf('data-testid="replace-goods-param-bar"'));
        // 已删除：重复导航 / 键盘快捷键面板 / 锁定覆盖读数 / 多商品分步卡。
        for (const removed of ["replace-goods-mirror", "replace-goods-shortcuts", "replace-goods-quad-readout", "replace-goods-step-", "键盘快捷键", "锁定覆盖", "上一张", "下一张"]) {
            expect(html).not.toContain(removed);
        }
    });

    test("默认态：透视模式 / 4 张 / 画布与控制都在，生成按钮始终可点（缺图时给真实原因）", async () => {
        const html = await renderWorkspace();
        expect(html).toMatch(/data-testid="replace-goods-mode-perspective"[^>]*aria-pressed="true"/);
        expect(html).toMatch(/data-testid="replace-goods-output-4"[^>]*aria-pressed="true"/);
        expect(html).toContain('data-testid="replace-goods-denoise"');
        expect(html).toContain('data-testid="replace-goods-cutout"');
        expect(html).toContain('data-testid="replace-goods-canvas-empty"');
        // 原站按钮可点：不写死 disabled 属性，缺输入用 aria-disabled + 结果区列出原因表达。
        expect(html).toMatch(/data-testid="replace-goods-submit"(?![^>]*\sdisabled=)[^>]*aria-disabled="true"/);
    });

    test("未上传场景时列出真实拦截原因，提交按钮不锁死", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-testid="replace-goods-result-empty"');
        expect(html).toMatch(/data-testid="replace-goods-submit"[^>]*aria-disabled="true"/);
    });

    test("多 SKU 默认 1 个，可增删（上限来自 registry）", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-testid="replace-goods-sku-tab-0"');
        expect(html).toContain('data-testid="replace-goods-sku-add"');
        expect(html).toContain('data-testid="replace-goods-sku-remove"');
        expect(html).toMatch(/data-testid="replace-goods-sku-remove"[^>]*disabled/);
    });
});
