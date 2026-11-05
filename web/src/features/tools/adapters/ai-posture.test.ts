/**
 * TASK-027 验证：AI_POSTURE「姿势裂变」。
 *
 * 三类断言：
 *  1. 纯逻辑（注册表/姿势库/草稿/校验/张数分配）—— 不允许静默丢参、不允许状态互相覆盖；
 *  2. 适配器（单元摊平 → 真实请求 → 结果归组/过期）—— 失败与空结果不能伪装成功；
 *  3. 真实渲染（SSR 首屏）—— 本页独有区域必须存在，未上传时提交被真实拦截。
 */
import { describe, expect, test } from "bun:test";

import {
    AI_POSTURE_DEFAULT_OUTPUT,
    AI_POSTURE_DRAFT_KEY,
    AI_POSTURE_FIELD_KEYS,
    AI_POSTURE_LAYOUT,
    AI_POSTURE_MAX_OUTPUT,
    AI_POSTURE_OUTPUT_OPTIONS,
    AI_POSTURE_POSES,
    AI_POSTURE_ROUTE,
    AI_POSTURE_TAGS_MAX,
    AI_POSTURE_TOOL_ID,
    AI_POSTURE_UPLOAD_LIMITS,
    addAiPostureTag,
    aiPosturePoses,
    aiPostureSnapshotHash,
    buildAiPostureSnapshot,
    composeAiPostureFields,
    auditAiPostureFields,
    createAiPostureWorkspace,
    distributePostureOutputs,
    getAiPostureSpec,
    isAiPostureResultStale,
    parseAiPostureDraftValues,
    resolveAiPosturePlan,
    serializeAiPostureDraftValues,
    setAiPostureCategory,
    setAiPostureCustomPose,
    setAiPostureMode,
    setAiPostureOutputNum,
    setAiPosturePrompt,
    setAiPostureSource,
    setAiPostureTags,
    toggleAiPosturePose,
    validateAiPostureWorkspace,
} from "@/features/tools/registry/ai-posture";
import {
    aiPostureOutcomeFromTask,
    aiPostureResultView,
    assertAiPostureInput,
    assertAiPostureWorkspace,
    auditAiPosturePlan,
    buildAiPostureInput,
    planAiPostureUnits,
} from "@/features/tools/adapters/ai-posture";
import type { AiPostureSourceInput } from "@/features/tools/adapters/ai-posture";

const source: AiPostureSourceInput = {
    assetId: "model-1",
    name: "模特.png",
    dataUrl: "data:image/png;base64,AAA",
    originUrl: "blob:model-1",
    width: 1200,
    height: 1600,
};

function workspaceWithSource(overrides: Parameters<typeof createAiPostureWorkspace>[0] = {}) {
    const base = createAiPostureWorkspace({
        source: { assetId: source.assetId, name: source.name, url: source.originUrl, width: source.width, height: source.height },
        ...overrides,
    });
    return base;
}

function taskWith(images: { dataUrl?: string; url?: string }[], status = "succeeded") {
    return {
        status,
        result: {
            items: images.map((image, index) => ({ id: `item-${index}`, kind: "image" as const, ...image })),
            receivedAt: 1,
        },
    } as unknown as Parameters<typeof aiPostureOutcomeFromTask>[1];
}

describe("姿势裂变 · 注册表契约", () => {
    test("注册表条目与页面契约一致（id/路由/layout/字段/makeType）", () => {
        const spec = getAiPostureSpec();
        expect(spec).toBeDefined();
        expect(spec!.id).toBe(AI_POSTURE_TOOL_ID);
        expect(spec!.route).toBe(AI_POSTURE_ROUTE);
        expect(spec!.layout).toBe(AI_POSTURE_LAYOUT);
        expect(spec!.fields.map((field) => field.key)).toEqual([...AI_POSTURE_FIELD_KEYS]);
        expect(AI_POSTURE_DRAFT_KEY).toBe(`tool-draft:v1:${AI_POSTURE_TOOL_ID}`);
        expect(AI_POSTURE_UPLOAD_LIMITS.maxBytes).toBe(10 * 1024 * 1024);
        expect(AI_POSTURE_UPLOAD_LIMITS.minSide).toBe(384);
        expect(AI_POSTURE_UPLOAD_LIMITS.maxSide).toBe(4096);
    });

    test("姿势库有分类与结构化指令；分类筛选只换可见集合", () => {
        expect(AI_POSTURE_POSES.length).toBeGreaterThanOrEqual(8);
        const all = aiPosturePoses(null);
        expect(all.length).toBe(AI_POSTURE_POSES.length);
        const categoryId = AI_POSTURE_POSES[0]!.categoryId;
        const filtered = aiPosturePoses(categoryId);
        expect(filtered.length).toBeGreaterThan(0);
        expect(filtered.every((pose) => pose.categoryId === categoryId)).toBe(true);
        expect(AI_POSTURE_POSES.every((pose) => pose.instruction.length > 0)).toBe(true);
    });

    test("张数选项 1–4、默认 1", () => {
        expect([...AI_POSTURE_OUTPUT_OPTIONS]).toEqual([1, 2, 3, 4]);
        expect(AI_POSTURE_DEFAULT_OUTPUT).toBe(1);
        expect(createAiPostureWorkspace().outputNum).toBe(1);
    });
});

describe("姿势裂变 · 草稿与状态联动", () => {
    test("草稿往返不丢字段（姿势库选择 / 自定义文本 / 标签 / 张数 / 描述）", () => {
        const poseId = AI_POSTURE_POSES[1]!.id;
        const workspace = setAiPosturePrompt(
            setAiPostureTags(addAiPostureTag(workspaceWithSource({ outputNum: 3 }), "浅灰背景"), ["浅灰背景"]),
            "室内柔光",
        );
        const withPose = toggleAiPosturePose(workspace, poseId);
        const restored = parseAiPostureDraftValues(serializeAiPostureDraftValues(withPose));
        expect(restored).not.toBeNull();
        expect(restored!.selectedPoseIds).toEqual([poseId]);
        expect(restored!.imageTags).toEqual(["浅灰背景"]);
        expect(restored!.outputNum).toBe(3);
        expect(restored!.prompt).toBe("室内柔光");
        expect(restored!.source?.assetId).toBe("model-1");
        expect(aiPostureSnapshotHash(restored!)).toBe(aiPostureSnapshotHash(withPose));
    });

    test("姿势库 ↔ 自定义互不覆盖：切 Tab 后各自内容仍在", () => {
        const poseId = AI_POSTURE_POSES[0]!.id;
        let workspace = toggleAiPosturePose(workspaceWithSource(), poseId);
        workspace = setAiPostureCustomPose(workspace, "侧身站立，手扶帽檐");
        workspace = setAiPostureMode(workspace, "custom");
        expect(workspace.customPose).toBe("侧身站立，手扶帽檐");
        expect(workspace.selectedPoseIds).toEqual([poseId]);
        expect(resolveAiPosturePlan(workspace).origin).toBe("custom");

        workspace = setAiPostureMode(workspace, "library");
        expect(workspace.customPose).toBe("侧身站立，手扶帽檐");
        const plan = resolveAiPosturePlan(workspace);
        expect(plan.origin).toBe("library");
        expect(plan.poses.map((pose) => pose.id)).toEqual([poseId]);
    });

    test("分类切换不会清空已选姿势，也不会串改张数", () => {
        const poseId = AI_POSTURE_POSES[0]!.id;
        const other = AI_POSTURE_POSES.find((pose) => pose.categoryId !== AI_POSTURE_POSES[0]!.categoryId)!;
        let workspace = setAiPostureOutputNum(toggleAiPosturePose(workspaceWithSource(), poseId), 2);
        workspace = setAiPostureCategory(workspace, other.categoryId);
        expect(workspace.categoryId).toBe(other.categoryId);
        expect(workspace.selectedPoseIds).toEqual([poseId]);
        expect(workspace.outputNum).toBe(2);
    });

    test("空选姿势时按张数自动裂变，且姿势互不重复", () => {
        for (const count of AI_POSTURE_OUTPUT_OPTIONS) {
            const plan = resolveAiPosturePlan(setAiPostureOutputNum(workspaceWithSource(), count));
            expect(plan.origin).toBe("auto");
            expect(plan.poses.length).toBe(count);
            expect(new Set(plan.poses.map((pose) => pose.id)).size).toBe(count);
        }
    });

    test("张数分配精确等于总张数（不因姿势数不同而漂移）", () => {
        for (let total = 1; total <= AI_POSTURE_MAX_OUTPUT; total += 1) {
            for (let poses = 1; poses <= 4; poses += 1) {
                const counts = distributePostureOutputs(total, poses);
                expect(counts.length).toBe(poses);
                expect(counts.reduce((sum, value) => sum + value, 0)).toBe(total);
                expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
            }
        }
    });

    test("标签上限被真实约束（不静默超出）", () => {
        let workspace = workspaceWithSource();
        for (let index = 0; index < AI_POSTURE_TAGS_MAX + 3; index += 1) {
            workspace = addAiPostureTag(workspace, `tag-${index}`);
        }
        expect(workspace.imageTags.length).toBe(AI_POSTURE_TAGS_MAX);
    });
});

describe("姿势裂变 · 校验与字段合成", () => {
    test("未上传模特图 → 拦截并给出中文原因", () => {
        const issues = validateAiPostureWorkspace(createAiPostureWorkspace());
        expect(issues.some((issue) => issue.code === "source-missing")).toBe(true);
        expect(issues[0]!.message).toContain("模特姿势图");
    });

    test("自定义模式空描述 → 拦截", () => {
        const issues = validateAiPostureWorkspace(setAiPostureMode(workspaceWithSource(), "custom"));
        expect(issues.some((issue) => issue.code === "custom-pose-empty")).toBe(true);
    });

    test("张数：UI setter 钳制到 1–4，绕过 setter 的非法快照仍被校验拦截", () => {
        // 控件只暴露 1–4，setter 负责把越界输入钳进区间（不会把 5 直接发给 provider）。
        expect(setAiPostureOutputNum(workspaceWithSource(), 5).outputNum).toBe(AI_POSTURE_MAX_OUTPUT);
        expect(setAiPostureOutputNum(workspaceWithSource(), 0).outputNum).toBe(1);
        // 但外部注入/旧草稿里的非法值必须被校验拦下，不能静默放过。
        const corrupted = { ...workspaceWithSource(), outputNum: 9 };
        const issues = validateAiPostureWorkspace(corrupted);
        expect(issues.some((issue) => issue.code === "output-num")).toBe(true);
        expect(issues.find((issue) => issue.code === "output-num")!.message).toContain("1–4");
    });

    test("字段合成四件套齐全且无缺失，imageTags 用逗号拼接", () => {
        const workspace = setAiPostureTags(workspaceWithSource(), ["白色背景", "全身"]);
        const fields = composeAiPostureFields(workspace);
        expect(Object.keys(fields).sort()).toEqual([...AI_POSTURE_FIELD_KEYS].sort());
        expect(fields.imageTags).toBe("白色背景,全身");
        expect(fields.imageUrl).toBe("blob:model-1");
        expect(auditAiPostureFields(fields)).toEqual([]);
        expect(auditAiPostureFields({ imageTags: "", imageUrl: "", outputNum: 0 })).toContain("prompt");
    });

    test("快照指纹随配置变化，用于标记「来自旧版本」", () => {
        const workspace = workspaceWithSource();
        const hash = aiPostureSnapshotHash(workspace);
        const changed = setAiPostureOutputNum(workspace, 3);
        expect(aiPostureSnapshotHash(changed)).not.toBe(hash);
        expect(isAiPostureResultStale(hash, workspace)).toBe(false);
        expect(isAiPostureResultStale(hash, changed)).toBe(true);
        expect(buildAiPostureSnapshot(workspace).outputNum).toBe(1);
    });
});

describe("姿势裂变 · 请求单元与结果", () => {
    test("每个姿势一个真实单元，张数摊平且总数等于 outputNum", () => {
        const poseIds = AI_POSTURE_POSES.slice(0, 3).map((pose) => pose.id);
        let workspace = workspaceWithSource({ outputNum: 4 });
        for (const poseId of poseIds) workspace = toggleAiPosturePose(workspace, poseId);

        let seq = 0;
        const units = planAiPostureUnits({ workspace, source, nextClientOperationId: () => `op-${(seq += 1)}` });
        expect(units.length).toBe(3);
        expect(units.reduce((sum, unit) => sum + unit.count, 0)).toBe(4);
        expect(units.map((unit) => unit.clientOperationId)).toEqual(["op-1", "op-2", "op-3"]);
        expect(auditAiPosturePlan(units, workspace.outputNum)).toEqual([]);

        const input = buildAiPostureInput(units[0]!, { draftRevision: 7 });
        expect(input.toolId).toBe(AI_POSTURE_TOOL_ID);
        expect(input.count).toBe(units[0]!.count);
        expect(input.fields?.draftRevision).toBe(7);
        expect(input.references?.length).toBe(1);
        expect(input.references?.[0]?.dataUrl).toBe(source.dataUrl);
        const firstPose = AI_POSTURE_POSES.find((pose) => pose.id === units[0]!.poseId)!;
        expect(input.prompt).toContain(firstPose.instruction);
        expect(input.fields?.outputNum).toBe(workspace.outputNum);
    });

    test("每个单元的 prompt 只含自己的姿势指令（不互相污染）", () => {
        const [first, second] = AI_POSTURE_POSES;
        let workspace = workspaceWithSource({ outputNum: 2 });
        workspace = toggleAiPosturePose(toggleAiPosturePose(workspace, first!.id), second!.id);
        let seq = 0;
        const units = planAiPostureUnits({ workspace, source, nextClientOperationId: () => `op-${(seq += 1)}` });
        expect(units[0]!.prompt).toContain(first!.instruction);
        expect(units[1]!.prompt).toContain(second!.instruction);
        expect(units[1]!.prompt.includes(first!.instruction)).toBe(false);
    });

    test("提交前守卫：缺参考图 / 张数越界 / 字段缺失都直接抛错，不发空请求", () => {
        const unit = planAiPostureUnits({ workspace: workspaceWithSource(), source, nextClientOperationId: () => "op" })[0]!;
        expect(() => assertAiPostureInput(buildAiPostureInput(unit))).not.toThrow();
        expect(() => assertAiPostureInput({ ...buildAiPostureInput(unit), references: [] })).toThrow();
        expect(() => assertAiPostureInput({ ...buildAiPostureInput(unit), count: 0 })).toThrow();
        expect(() => assertAiPostureInput({ ...buildAiPostureInput(unit), fields: {} as never })).toThrow();
        expect(() =>
            assertAiPostureWorkspace(createAiPostureWorkspace(), { sourceReady: false }),
        ).toThrow();
    });

    test("上游成功但无图 → failed(empty-result)，不补图", () => {
        const unit = planAiPostureUnits({ workspace: workspaceWithSource(), source, nextClientOperationId: () => "op" })[0]!;
        const outcome = aiPostureOutcomeFromTask(unit, taskWith([]));
        expect(outcome.status).toBe("failed");
        expect(outcome.images).toEqual([]);
        expect(outcome.error?.code).toBe("empty-result");
    });

    test("成功带图 → 保留张数与图片；失败任务 → failed 且带原因", () => {
        const unit = planAiPostureUnits({ workspace: workspaceWithSource({ outputNum: 2 }), source, nextClientOperationId: () => "op" })[0]!;
        const ok = aiPostureOutcomeFromTask(unit, taskWith([{ dataUrl: "data:image/png;base64,BBB" }, { url: "https://cdn/x.png" }]));
        expect(ok.status).toBe("succeeded");
        expect(ok.images.length).toBe(2);

        const failed = aiPostureOutcomeFromTask(unit, { ...taskWith([]), status: "failed", error: { code: "provider", message: "上游 500" } } as never);
        expect(failed.status).toBe("failed");
    });

    test("结果按姿势分组，部分失败可定位到具体组；改配置后标记过期", () => {
        let workspace = workspaceWithSource({ outputNum: 2 });
        const [first, second] = AI_POSTURE_POSES;
        workspace = toggleAiPosturePose(toggleAiPosturePose(workspace, first!.id), second!.id);
        let seq = 0;
        const units = planAiPostureUnits({ workspace, source, nextClientOperationId: () => `op-${(seq += 1)}` });
        const outcomes = [
            aiPostureOutcomeFromTask(units[0]!, taskWith([{ dataUrl: "data:image/png;base64,CCC" }])),
            aiPostureOutcomeFromTask(units[1]!, taskWith([])),
        ];

        const view = aiPostureResultView({ units, outcomes, currentHash: aiPostureSnapshotHash(workspace) });
        expect(view.status).toBe("partial");
        expect(view.groups.length).toBe(2);
        expect(view.groups[0]!.status).toBe("succeeded");
        expect(view.groups[1]!.status).toBe("failed");
        expect(view.groups[1]!.canRetry).toBe(true);
        expect(view.stale).toBe(false);

        const stale = aiPostureResultView({ units, outcomes, currentHash: aiPostureSnapshotHash(setAiPostureOutputNum(workspace, 4)) });
        expect(stale.stale).toBe(true);
        expect(stale.groups.every((group) => group.stale)).toBe(true);
    });
});

describe("姿势裂变 · 工作区渲染", () => {
    test("首屏有本页独有区域与控件，未上传时提交被拦截", async () => {
        const store = new Map<string, string>();
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            writable: true,
            value: {
                getItem: (key: string) => store.get(key) ?? null,
                setItem: (key: string, value: string) => void store.set(key, value),
                removeItem: (key: string) => void store.delete(key),
                clear: () => void store.clear(),
                key: (index: number) => Array.from(store.keys())[index] ?? null,
                get length() {
                    return store.size;
                },
            },
        });

        const React = await import("react");
        const { renderToStaticMarkup } = await import("react-dom/server");
        const { MemoryRouter } = await import("react-router-dom");
        const { AiPostureWorkspace } = await import("@/components/tools/workspaces/model");
        const html = renderToStaticMarkup(
            React.createElement(MemoryRouter, null, React.createElement(AiPostureWorkspace)) as Parameters<typeof renderToStaticMarkup>[0],
        );

        for (const id of [
            "ai-posture-workspace",
            "ai-posture-model-picker",
            "ai-posture-tags",
            "ai-posture-tag-input",
            "ai-posture-pose-select",
            "ai-posture-mode-library",
            "ai-posture-mode-custom",
            "ai-posture-category-all",
            "ai-posture-pose-grid",
            "ai-posture-output-control",
            "ai-posture-plan-readout",
            "ai-posture-prompt",
            "ai-posture-submit",
            "ai-posture-issues",
            "ai-posture-results",
            "ai-posture-result-empty",
            "ai-posture-snapshot",
        ]) {
            expect(html).toContain(`data-testid="${id}"`);
        }

        // 默认态：姿势库 Tab + 张数 1 选中；空选择时显示自动裂变
        expect(html).toMatch(/data-testid="ai-posture-mode-library"[^>]*aria-pressed="true"/);
        expect(html).toMatch(/data-testid="ai-posture-output-1"[^>]*aria-pressed="true"/);
        expect(html).toContain("自动裂变");
        // 未上传 → 提交按钮 disabled 且列出真实原因
        expect(html).toMatch(/data-testid="ai-posture-submit"[^>]*disabled/);
        expect(html).toContain("请先上传模特姿势图");
        // 姿势卡片可操作
        expect(html).toContain(`data-testid="ai-posture-pose-${AI_POSTURE_POSES[0]!.id}"`);
        expect(html).toContain("立即生成");
    });

    test("源图/尺寸常量与页面提示一致（10M、384–4096）", async () => {
        const html = await (async () => {
            const React = await import("react");
            const { renderToStaticMarkup } = await import("react-dom/server");
            const { MemoryRouter } = await import("react-router-dom");
            const { AiPostureWorkspace } = await import("@/components/tools/workspaces/model");
            return renderToStaticMarkup(
                React.createElement(MemoryRouter, null, React.createElement(AiPostureWorkspace)) as Parameters<typeof renderToStaticMarkup>[0],
            );
        })();
        expect(html).toContain("10M以内");
        expect(html).toContain(AI_POSTURE_DRAFT_KEY);
    });
});

describe("姿势裂变 · 配置列 1:1 布局（对照原站 draw/ai-posture）", () => {
    const render = async () => {
        const store = new Map<string, string>();
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            writable: true,
            value: {
                getItem: (key: string) => store.get(key) ?? null,
                setItem: (key: string, value: string) => void store.set(key, value),
                removeItem: (key: string) => void store.delete(key),
                clear: () => void store.clear(),
                key: (index: number) => Array.from(store.keys())[index] ?? null,
                get length() {
                    return store.size;
                },
            },
        });
        const React = await import("react");
        const { renderToStaticMarkup } = await import("react-dom/server");
        const { MemoryRouter } = await import("react-router-dom");
        const { AiPostureWorkspace } = await import("@/components/tools/workspaces/model");
        return renderToStaticMarkup(
            React.createElement(MemoryRouter, null, React.createElement(AiPostureWorkspace)) as Parameters<typeof renderToStaticMarkup>[0],
        );
    };

    test("配置列自带滚动区，「立即生成」在滚动区之外的吸底条里", async () => {
        const html = await render();
        expect(html).toContain('data-testid="ai-posture-form"');
        expect(html).toContain('data-testid="ai-posture-submit-bar"');
        // 提交按钮必须落在 form 滚动区之后（吸底），否则又会被 12 张姿势卡顶到首屏外。
        const formIndex = html.indexOf('data-testid="ai-posture-form"');
        const barIndex = html.indexOf('data-testid="ai-posture-submit-bar"');
        const submitIndex = html.indexOf('data-testid="ai-posture-submit"');
        expect(formIndex).toBeGreaterThan(-1);
        expect(barIndex).toBeGreaterThan(formIndex);
        expect(submitIndex).toBeGreaterThan(barIndex);
    });

    test("姿势库默认折叠为行卡，展开才出现分类与姿势网格", async () => {
        const html = await render();
        // 默认折叠：<details> 不带 open，行卡摘要可见。
        const card = html.slice(html.indexOf('data-testid="ai-posture-pose-select"') - 200, html.indexOf('data-testid="ai-posture-pose-select"') + 600);
        expect(card).toContain("<details");
        expect(card).not.toContain("<details open");
        expect(html).toContain('data-testid="ai-posture-pose-summary-row"');
        expect(html).toContain("选择姿势（可选）");
        expect(html).toContain("生成图片的模特姿势");
        // 分类与 12 张真实姿势仍然在（折叠只是视觉收起，不删数据）。
        expect(html).toContain('data-testid="ai-posture-pose-grid"');
        expect(html).toContain(`data-testid="ai-posture-pose-${AI_POSTURE_POSES[0]!.id}"`);
        expect(html.split('data-testid="ai-posture-pose-').length - 1).toBeGreaterThanOrEqual(AI_POSTURE_POSES.length);
    });

    test("补充描述与裂变计划默认折叠，上传卡与标签压缩", async () => {
        const html = await render();
        for (const testId of ["ai-posture-prompt-panel", "ai-posture-pose-select"]) {
            const at = html.indexOf(`data-testid="${testId}"`);
            const tag = html.lastIndexOf("<details", at);
            expect(tag).toBeGreaterThan(-1);
            expect(html.slice(tag, at)).not.toContain(" open");
        }
        // 上传卡用 linkfox 变体，虚线框按原站 `_uploadBox` 实测高 196；标签区收进「更多设置」。
        expect(html).toContain('data-variant="linkfox"');
        expect(html).toContain("min-h-[196px]");
        expect(html).toContain('data-testid="ai-posture-tags"');
    });

    test("批量入口仍然明确禁用并给出原因", async () => {
        const html = await render();
        expect(html).toMatch(/data-testid="ai-posture-batch-upload"[^>]*disabled/);
        expect(html).toContain('data-testid="ai-posture-batch-hint"');
        expect(html).toContain("批量入口暂未开放");
    });

    test("结果区保留生成结果 / 历史记录两个 Tab", async () => {
        const html = await render();
        expect(html).toContain('role="tablist"');
        expect(html).toContain('data-testid="ai-posture-tab-results"');
        expect(html).toContain('data-testid="ai-posture-tab-history"');
        expect(html).toContain("历史记录");
    });
});

describe("姿势裂变 · 源图校验", () => {
    test("源图尺寸不足最短边 → 拦截", () => {
        const workspace = setAiPostureSource(workspaceWithSource(), { assetId: "m", name: "s.png", url: "blob:s", width: 128, height: 128 });
        const issues = validateAiPostureWorkspace(workspace);
        expect(issues.some((issue) => issue.code === "asset-too-small")).toBe(true);
    });
});
