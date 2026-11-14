const { describe, expect, test } = (await import("bun:test" as string)) as {
    describe: (name: string, fn: () => void) => void;
    test: (name: string, fn: () => void | Promise<void>) => void;
    expect: (actual: unknown) => { toBe: (value: unknown) => void; toBeCloseTo: (value: number) => void; toBeUndefined: () => void; toEqual: (value: unknown) => void; toContain: (value: unknown) => void; not: { toEqual: (value: unknown) => void } };
};

const { cutoutProductBgImage, drawProductBgLayer, drawProductBgReplacementRegion, flipProductBgQuad, moveProductBgCorner, parseProductBgLayout, productBgBaseQuad, productBgPerspectiveMatrix } = await import("./product-bg-layout");

describe("商品图编辑器的真实布局状态", () => {
    test("元素、背景、商品透视和替换区域可完整往返草稿", () => {
        const layout = parseProductBgLayout({
            sceneId: "daily-01",
            goodsOnTop: false,
            goodsTransform: { scale: 1.2, flipX: true, quad: [{ x: 0, y: 0 }, { x: 1, y: 0.1 }, { x: 1, y: 1 }, { x: 0, y: 1 }] },
            bgTransform: { scale: 1.3, flipY: true },
            bgOffset: { x: 0.1, y: -0.1 },
            replacementRegion: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 0.9 }, { x: 0.1, y: 0.9 }],
            elements: [{ id: "el-1", assetId: "asset-1", url: "data:image/png;base64,AA==", name: "贴纸", x: 0.5, y: 0.5, w: 0.2, ratio: 2, transform: { flipX: true } }],
        });
        expect(parseProductBgLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
        expect(layout.elements[0]!.assetId).toBe("asset-1");
        expect(layout.goodsOnTop).toBe(false);
    });

    test("翻转和四角透视会改变贴图矩阵，不只是 CSS 类名", () => {
        const base = { scale: 1, rotate: 0, flipX: false, flipY: false };
        const flipped = flipProductBgQuad(base, "x");
        expect(flipped.quad).toBeUndefined();
        const transform = moveProductBgCorner({ ...base, quad: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }, 1, { x: 1.1, y: 0.2 });
        expect(transform.quad?.[1]).toEqual({ x: 1.1, y: 0.2 });
        const rotated = productBgBaseQuad({ ...base, rotate: 90 })[0]!;
        expect(rotated.x).toBeCloseTo(1);
        expect(rotated.y).toBeCloseTo(0);
        expect(productBgPerspectiveMatrix(transform.quad!, 100, 200)).toContain("matrix3d");
        const matrices: number[][] = [];
        const context = {
            save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {}, drawImage() {},
            setTransform(...values: number[]) { matrices.push(values); },
        } as unknown as CanvasRenderingContext2D;
        drawProductBgLayer(context, {} as CanvasImageSource, 100, 200, transform);
        expect(matrices.length).toBe(200);
        expect(matrices[0]).not.toEqual([1, 0, 0, 1, 0, 0]);
    });

    test("替换蒙版只含黑色区域和白色保护区，编辑描边不进入像素", () => {
        const fills: string[] = [];
        let strokes = 0;
        const context = {
            fillStyle: "",
            fillRect() { fills.push(this.fillStyle); },
            fill() { fills.push(this.fillStyle); },
            stroke() { strokes += 1; },
        } as unknown as CanvasRenderingContext2D;
        const previous = globalThis.Path2D;
        Object.defineProperty(globalThis, "Path2D", { configurable: true, value: class { moveTo() {} lineTo() {} closePath() {} } });
        try {
            drawProductBgReplacementRegion(context, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], 100, 100);
        } finally {
            Object.defineProperty(globalThis, "Path2D", { configurable: true, value: previous });
        }
        expect(fills).toEqual(["#fff", "#000"]);
        expect(strokes).toBe(0);
    });

    test("黑白主体蒙版按亮度导出 alpha，透明通道也会保留", () => {
        const pixels = new Uint8ClampedArray([
            0, 0, 0, 255,
            255, 255, 255, 255,
            0, 0, 0, 0,
            128, 128, 128, 128,
        ]);
        let exported: Uint8ClampedArray | undefined;
        const context = {
            drawImage() {}, getImageData: () => ({ data: pixels }),
            putImageData: (image: { data: Uint8ClampedArray }) => { exported = image.data; },
        };
        const canvas = { width: 0, height: 0, getContext: () => context };
        const previous = globalThis.document;
        Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => canvas } });
        try {
            cutoutProductBgImage({} as CanvasImageSource, {} as CanvasImageSource, 2, 2);
        } finally {
            Object.defineProperty(globalThis, "document", { configurable: true, value: previous });
        }
        expect(Array.from(exported ?? [])).toEqual([
            255, 255, 255, 0,
            255, 255, 255, 255,
            255, 255, 255, 0,
            255, 255, 255, 64,
        ]);
    });
});
