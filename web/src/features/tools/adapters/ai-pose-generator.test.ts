/**
 * TASK-033 验证：AI_POSE_GENERATOR「AI 姿势生成」。
 *
 * 三类断言：
 *  1. 纯逻辑（注册表/姿势库/场景/预设/草稿/校验/prompt 合成）—— 场景不得改写姿势、不生吞错误；
 *  2. 适配器（按场景摊平 → 真实请求 → 结果归组/过期/单组重试）—— 空结果不伪装成功；
 *  3. 真实渲染（SSR 首屏）—— 本页独有区域存在，空姿势时提交被真实拦截。
 */
import { describe, expect, test } from "bun:test";

import {
    AI_POSE_GENERATOR_CATEGORIES,
    AI_POSE_GENERATOR_DRAFT_KEY,
    AI_POSE_GENERATOR_FIELD_KEYS,
    AI_POSE_GENERATOR_LAYOUT,
    AI_POSE_GENERATOR_MAX_IMAGES,
    AI_POSE_GENERATOR_MAX_OUTPUT,
    AI_POSE_GENERATOR_OUTPUT_OPTIONS,
    AI_POSE_GENERATOR_PRESETS,
    AI_POSE_GENERATOR_PRESET_LABEL_MAX,
    AI_POSE_GENERATOR_PROMPT_MAX,
    AI_POSE_GENERATOR_ROUTE,
    AI_POSE_GENERATOR_SAVED_PRESETS_MAX,
    AI_POSE_GENERATOR_SCENES_MAX,
    AI_POSE_GENERATOR_TOOL_ID,
    addAiPoseScene,
    aiPoseGeneratorFieldSpecs,
    aiPoseGeneratorSnapshotHash,
    aiPoseGeneratorSnapshotHashOf,
    aiPoseHistoryLabel,
    aiPosePresets,
    aiPoseSceneConflicts,
    applyAiPosePreset,
    auditAiPoseGeneratorFields,
    buildAiPoseGeneratorPrompt,
    buildAiPoseGeneratorSnapshot,
    composeAiPoseGeneratorFields,
    createAiPoseGeneratorWorkspace,
    findAiPosePreset,
    getAiPoseGeneratorSpec,
    isAiPoseGeneratorResultStale,
    moveAiPoseScene,
    parseAiPoseGeneratorDraftValues,
    redoAiPoseEdit,
    removeAiPosePreset,
    removeAiPoseScene,
    resolveAiPoseGeneratorPlan,
    saveAiPosePreset,
    serializeAiPoseGeneratorDraftValues,
    setAiPoseOutputNum,
    setAiPosePrompt,
    toggleAiPosePreset,
    undoAiPoseEdit,
    updateAiPoseScene,
    validateAiPoseGeneratorWorkspace,
} from "@/features/tools/registry/ai-pose-generator";
import {
    AiPoseGeneratorAdapterError,
    aiPoseGeneratorOutcomeFromTask,
    aiPoseGeneratorResultView,
    assertAiPoseGeneratorInput,
    assertAiPoseGeneratorPlan,
    assertAiPoseGeneratorWorkspace,
    buildAiPoseGeneratorInput,
    failedAiPoseGeneratorUnits,
    planAiPoseGeneratorUnits,
    retryAiPoseGeneratorUnit,
    runAiPoseGeneratorPlan,
} from "@/features/tools/adapters/ai-pose-generator";

function workspaceWithScenes(sceneTexts: string[] = ["纯白影棚，地面浅灰反光"]) {
    let workspace = createAiPoseGeneratorWorkspace({ posePrompt: "女性模特侧身站立，一手扶腰，头转向镜头" });
    for (const text of sceneTexts) {
        const added = addAiPoseScene(workspace);
        const sceneId = added.scenes[added.scenes.length - 1]!.id;
        workspace = updateAiPoseScene(added, sceneId, text);
    }
    return workspace;
}

function taskWith(images: { dataUrl?: string; url?: string }[], status = "succeeded") {
    return {
        status,
        result: {
            items: images.map((image, index) => ({ id: `item-${index}`, kind: "image" as const, ...image })),
            receivedAt: 1,
        },
    } as unknown as Parameters<typeof aiPoseGeneratorOutcomeFromTask>[1];
}

function seqIds() {
    let seq = 0;
    return () => `op-${(seq += 1)}`;
}

describe("AI 姿势生成 · 注册表契约", () => {
    test("id/路由/layout/字段/makeType 与页面契约一致", () => {
        const spec = getAiPoseGeneratorSpec();
        expect(spec).toBeDefined();
        expect(spec!.id).toBe(AI_POSE_GENERATOR_TOOL_ID);
        expect(spec!.route).toBe(AI_POSE_GENERATOR_ROUTE);
        expect(spec!.layout).toBe(AI_POSE_GENERATOR_LAYOUT);
        expect(spec!.makeType).toBe(57);
        expect(spec!.fields.map((field) => field.key)).toEqual([...AI_POSE_GENERATOR_FIELD_KEYS]);
        expect(aiPoseGeneratorFieldSpecs().map((field) => field.key)).toEqual([...AI_POSE_GENERATOR_FIELD_KEYS]);
        expect(AI_POSE_GENERATOR_DRAFT_KEY).toBe(`tool-draft:v1:${AI_POSE_GENERATOR_TOOL_ID}`);
    });

    test("姿势库有分类且有结构化指令，按分类筛选只换可见集合", () => {
        expect(AI_POSE_GENERATOR_PRESETS.length).toBeGreaterThanOrEqual(8);
        expect(aiPosePresets(null).length).toBe(AI_POSE_GENERATOR_PRESETS.length);
        expect(AI_POSE_GENERATOR_PRESETS.every((preset) => preset.instruction.trim().length > 0)).toBe(true);
        for (const category of AI_POSE_GENERATOR_CATEGORIES) {
            const filtered = aiPosePresets(category.id);
            expect(filtered.every((preset) => preset.categoryId === category.id)).toBe(true);
        }
        expect(findAiPosePreset(AI_POSE_GENERATOR_PRESETS[0]!.id)?.label).toBe(AI_POSE_GENERATOR_PRESETS[0]!.label);
    });

    test("张数 1–4、总产出上限 = 场景上限 × 张数上限", () => {
        expect([...AI_POSE_GENERATOR_OUTPUT_OPTIONS]).toEqual([1, 2, 3, 4]);
        expect(AI_POSE_GENERATOR_MAX_OUTPUT).toBe(4);
        expect(AI_POSE_GENERATOR_MAX_IMAGES).toBe(AI_POSE_GENERATOR_SCENES_MAX * AI_POSE_GENERATOR_MAX_OUTPUT);
        expect(setAiPoseOutputNum(createAiPoseGeneratorWorkspace(), 9).outputNum).toBe(AI_POSE_GENERATOR_MAX_OUTPUT);
    });
});

describe("AI 姿势生成 · 计划与 prompt", () => {
    test("无场景按「默认场景」出图，不是空计划", () => {
        const plan = resolveAiPoseGeneratorPlan(createAiPoseGeneratorWorkspace({ outputNum: 2 }));
        expect(plan.scenes.length).toBe(1);
        expect(plan.scenes[0]!.label).toBe("默认场景");
        expect(plan.total).toBe(2);
    });

    test("总产出 = 场景数 × 每场景张数", () => {
        const workspace = setAiPoseOutputNum(workspaceWithScenes(["影棚", "街头"]), 3);
        const plan = resolveAiPoseGeneratorPlan(workspace);
        expect(plan.scenes.length).toBe(2);
        expect(plan.counts).toEqual([3, 3]);
        expect(plan.total).toBe(6);
    });

    test("prompt 含姿势/场景/硬约束；无场景时用默认影棚且不空转", () => {
        const workspace = workspaceWithScenes(["纯白影棚，地面浅灰反光"]);
        const prompt = buildAiPoseGeneratorPrompt(workspace, workspace.scenes[0]!.text);
        expect(prompt).toContain("女性模特侧身站立");
        expect(prompt).toContain("纯白影棚");
        expect(prompt).toContain("must never change the body pose");

        const fallback = buildAiPoseGeneratorPrompt(createAiPoseGeneratorWorkspace({ posePrompt: "正面站立" }), "");
        expect(fallback).toContain("plain studio backdrop");
        expect(fallback).toContain("正面站立");
    });

    test("姿势库约束会合入 prompt（结构化指令不是装饰）", () => {
        const preset = AI_POSE_GENERATOR_PRESETS[0]!;
        const workspace = toggleAiPosePreset(createAiPoseGeneratorWorkspace({ posePrompt: "站立" }), preset.id);
        expect(buildAiPoseGeneratorPrompt(workspace, "")).toContain(preset.instruction);
        expect(buildAiPoseGeneratorPrompt(toggleAiPosePreset(workspace, preset.id), "")).not.toContain(preset.instruction);
    });
});

describe("AI 姿势生成 · 场景不得改写姿势", () => {
    test("冲突措辞被识别，正常场景不误判", () => {
        expect(aiPoseSceneConflicts("换个姿势，让模特坐下")).toBe(true);
        expect(aiPoseSceneConflicts("改变姿势")).toBe(true);
        expect(aiPoseSceneConflicts("纯白影棚，柔光箱左前 45°，浅灰地面")).toBe(false);
        expect(aiPoseSceneConflicts("街头咖啡馆门口，自然光，背景虚化")).toBe(false);
    });

    test("冲突场景 → 校验报 scene-overrides-pose，且适配器拦截提交", () => {
        const workspace = workspaceWithScenes(["改变姿势，让模特坐下"]);
        const issues = validateAiPoseGeneratorWorkspace(workspace);
        expect(issues.some((issue) => issue.code === "scene-overrides-pose")).toBe(true);
        expect(() => assertAiPoseGeneratorWorkspace(workspace)).toThrow(AiPoseGeneratorAdapterError);
    });
});

describe("AI 姿势生成 · 校验与草稿", () => {
    test("空姿势 → 拦截；空场景 → 拦截", () => {
        expect(validateAiPoseGeneratorWorkspace(createAiPoseGeneratorWorkspace()).some((issue) => issue.code === "pose-prompt-empty")).toBe(true);
        const emptyScene = addAiPoseScene(workspaceWithScenes());
        expect(validateAiPoseGeneratorWorkspace(emptyScene).some((issue) => issue.code === "scene-empty")).toBe(true);
    });

    test("合法工作区无 issue；超长姿势在输入处直接截断（不产生超限草稿）", () => {
        expect(validateAiPoseGeneratorWorkspace(workspaceWithScenes(["影棚"])).length).toBe(0);
        const tooLong = setAiPosePrompt(createAiPoseGeneratorWorkspace(), "姿".repeat(AI_POSE_GENERATOR_PROMPT_MAX + 1));
        expect(tooLong.posePrompt.length).toBe(AI_POSE_GENERATOR_PROMPT_MAX);
        expect(validateAiPoseGeneratorWorkspace(tooLong).some((issue) => issue.code === "pose-prompt-too-long")).toBe(false);
    });

    test("场景增删改调序真实生效，上限内不允许超出", () => {
        let workspace = workspaceWithScenes(["A 场景", "B 场景"]);
        const [first, second] = workspace.scenes;
        workspace = moveAiPoseScene(workspace, second!.id, -1);
        expect(workspace.scenes.map((scene) => scene.text)).toEqual(["B 场景", "A 场景"]);
        workspace = removeAiPoseScene(workspace, first!.id);
        expect(workspace.scenes.map((scene) => scene.text)).toEqual(["B 场景"]);

        let full = createAiPoseGeneratorWorkspace({ posePrompt: "站立" });
        for (let index = 0; index < AI_POSE_GENERATOR_SCENES_MAX; index += 1) full = addAiPoseScene(full);
        expect(addAiPoseScene(full).scenes.length).toBe(AI_POSE_GENERATOR_SCENES_MAX);
    });

    test("草稿序列化 ↔ 还原保真，脏数据返回 null 而不是静默清空", () => {
        const workspace = setAiPoseOutputNum(workspaceWithScenes(["影棚", "街头"]), 3);
        const restored = parseAiPoseGeneratorDraftValues(serializeAiPoseGeneratorDraftValues(workspace));
        expect(restored).not.toBeNull();
        expect(restored!.posePrompt).toBe(workspace.posePrompt);
        expect(restored!.scenes.map((scene) => scene.text)).toEqual(workspace.scenes.map((scene) => scene.text));
        expect(restored!.outputNum).toBe(3);
        expect(parseAiPoseGeneratorDraftValues("not-an-object")).toBeNull();
    });

    test("字段合成齐全：prompt + scenePrompts，缺字段可被审计发现", () => {
        const workspace = workspaceWithScenes(["影棚"]);
        const fields = composeAiPoseGeneratorFields(workspace);
        expect(auditAiPoseGeneratorFields(fields as unknown as Record<string, unknown>)).toEqual([]);
        expect(auditAiPoseGeneratorFields({ prompt: "x" }, ).length).toBeGreaterThan(0);
    });

    test("快照哈希稳定且随配置变化；结果过期判定跟随", () => {
        const workspace = workspaceWithScenes(["影棚"]);
        const hash = aiPoseGeneratorSnapshotHash(workspace);
        expect(aiPoseGeneratorSnapshotHashOf(buildAiPoseGeneratorSnapshot(workspace))).toBe(hash);
        expect(aiPoseGeneratorSnapshotHash(workspaceWithScenes(["影棚"]))).toBe(hash);
        expect(aiPoseGeneratorSnapshotHash(setAiPoseOutputNum(workspace, 4))).not.toBe(hash);
        expect(isAiPoseGeneratorResultStale(hash, setAiPoseOutputNum(workspace, 4))).toBe(true);
        expect(isAiPoseGeneratorResultStale(hash, workspace)).toBe(false);
    });
});

describe("AI 姿势生成 · 预设与撤销重做", () => {
    test("保存预设 → 应用还原姿势+场景 → 删除", () => {
        const workspace = workspaceWithScenes(["影棚"]);
        const saved = saveAiPosePreset(workspace, "通勤正面", 1);
        expect(saved.savedPresets.length).toBe(1);

        const cleared = setAiPosePrompt(removeAiPoseScene(saved, saved.scenes[0]!.id), "别的姿势");
        const applied = applyAiPosePreset(cleared, saved.savedPresets[0]!.id);
        expect(applied.posePrompt).toBe(workspace.posePrompt);
        expect(applied.scenes.map((scene) => scene.text)).toEqual(["影棚"]);

        expect(removeAiPosePreset(applied, applied.savedPresets[0]!.id).savedPresets.length).toBe(0);
    });

    test("预设名超长被截断，最多保存 12 条", () => {
        let workspace = createAiPoseGeneratorWorkspace({ posePrompt: "站立" });
        for (let index = 0; index < AI_POSE_GENERATOR_SAVED_PRESETS_MAX + 3; index += 1) {
            workspace = saveAiPosePreset(workspace, `预设${index}`, index + 1);
        }
        expect(workspace.savedPresets.length).toBe(AI_POSE_GENERATOR_SAVED_PRESETS_MAX);
        const long = saveAiPosePreset(workspace, "名".repeat(AI_POSE_GENERATOR_PRESET_LABEL_MAX + 10), 99);
        expect(long.savedPresets[long.savedPresets.length - 1]!.label.length).toBe(AI_POSE_GENERATOR_PRESET_LABEL_MAX);
    });

    test("撤销/重做按步回放上一条编辑（不是清空重来）", () => {
        const workspace = workspaceWithScenes(["影棚"]);
        expect(aiPoseHistoryLabel(workspace).canUndo).toBe(true);

        // 最后一步是「写入场景文本」，撤销后场景仍在、文本回空；重做再写回。
        const undone = undoAiPoseEdit(workspace);
        expect(undone.scenes.length).toBe(1);
        expect(undone.scenes[0]!.text).toBe("");
        expect(aiPoseHistoryLabel(undone).canRedo).toBe(true);

        const redone = redoAiPoseEdit(undone);
        expect(redone.scenes[0]!.text).toBe("影棚");
        expect(aiPoseHistoryLabel(createAiPoseGeneratorWorkspace()).canUndo).toBe(false);
    });
});

describe("AI 姿势生成 · 适配器", () => {
    test("每个场景一个单元：张数=outputNum，prompt 带该场景", () => {
        const workspace = setAiPoseOutputNum(workspaceWithScenes(["影棚", "街头"]), 2);
        const units = planAiPoseGeneratorUnits({ workspace, nextClientOperationId: seqIds() });
        expect(units.length).toBe(2);
        expect(units.every((unit) => unit.count === 2)).toBe(true);
        expect(units[0]!.prompt).toContain("影棚");
        expect(units[1]!.prompt).toContain("街头");
        expect(units[0]!.id).not.toBe(units[1]!.id);
        expect(new Set(units.map((unit) => unit.clientOperationId)).size).toBe(2);

        const plan = resolveAiPoseGeneratorPlan(workspace);
        expect(() => assertAiPoseGeneratorPlan(units, { scenes: plan.scenes.length, outputNum: 2, total: plan.total })).not.toThrow();
        expect(() => assertAiPoseGeneratorPlan(units, { scenes: 3, outputNum: 2, total: 6 })).toThrow(AiPoseGeneratorAdapterError);
    });

    test("请求构造：无源图（references 为空）、字段齐全、场景冲突被拦", () => {
        const unit = planAiPoseGeneratorUnits({ workspace: workspaceWithScenes(["影棚"]), nextClientOperationId: seqIds() })[0]!;
        const input = buildAiPoseGeneratorInput(unit, { draftRevision: 7 });
        expect(input.references).toEqual([]);
        expect(input.count).toBe(1);
        expect((input.fields as Record<string, unknown>).sceneId).toBe(unit.sceneId);
        expect((input.fields as Record<string, unknown>).draftRevision).toBe(7);
        expect(() => assertAiPoseGeneratorInput(input)).not.toThrow();

        const conflicting = buildAiPoseGeneratorInput(
            { ...unit, fields: { ...unit.fields, scenePrompts: ["改变姿势，坐下"] } },
            {},
        );
        expect(() => assertAiPoseGeneratorInput(conflicting)).toThrow(AiPoseGeneratorAdapterError);
    });

    test("串行执行：一个场景成功、一个空结果 → partial，失败组可单组重试", async () => {
        const workspace = workspaceWithScenes(["影棚", "街头"]);
        const units = planAiPoseGeneratorUnits({ workspace, nextClientOperationId: seqIds() });
        const seen: string[] = [];

        const outcomes = await runAiPoseGeneratorPlan(
            {
                run: async (input) => {
                    const prompt = String(input.prompt ?? "");
                    seen.push(prompt);
                    return prompt.includes("街头") ? taskWith([]) : taskWith([{ dataUrl: "data:image/png;base64,AAA" }]);
                },
            },
            units,
            { draftRevision: 1, onUnitOutcome: (outcome) => void outcome },
        );

        expect(seen.length).toBe(2);
        expect(outcomes[0]!.status).toBe("succeeded");
        expect(outcomes[1]!.status).toBe("failed");
        expect(outcomes[1]!.error?.code).toBe("empty-result");
        expect(outcomes[1]!.images.length).toBe(0);

        const view = aiPoseGeneratorResultView({ units, outcomes, currentHash: aiPoseGeneratorSnapshotHash(workspace) });
        expect(view.status).toBe("partial");
        expect(view.groups.length).toBe(2);
        expect(view.groups[1]!.canRetry).toBe(true);
        expect(view.stale).toBe(false);
        expect(failedAiPoseGeneratorUnits(outcomes).map((unit) => unit.id)).toEqual([units[1]!.id]);

        const retried = await retryAiPoseGeneratorUnit(
            { run: async () => taskWith([{ url: "https://cdn.example.com/a.png" }]) },
            units[1]!,
            { draftRevision: 1 },
        );
        expect(retried.status).toBe("succeeded");
        expect(retried.unit.id).toBe(units[1]!.id);

        const afterRetry = aiPoseGeneratorResultView({ units, outcomes: [outcomes[0]!, retried], currentHash: aiPoseGeneratorSnapshotHash(workspace) });
        expect(afterRetry.status).toBe("succeeded");
        expect(afterRetry.totalImages).toBe(2);
    });

    test("上游异常不吞：单单元失败但后续单元继续执行", async () => {
        const workspace = workspaceWithScenes(["影棚", "街头"]);
        const units = planAiPoseGeneratorUnits({ workspace, nextClientOperationId: seqIds() });
        const outcomes = await runAiPoseGeneratorPlan(
            {
                run: async (input) => {
                    if (String(input.prompt ?? "").includes("影棚")) throw new Error("provider 502");
                    return taskWith([{ dataUrl: "data:image/png;base64,BBB" }]);
                },
            },
            units,
        );
        expect(outcomes[0]!.status).toBe("failed");
        expect(outcomes[0]!.error?.message).toContain("502");
        expect(outcomes[1]!.status).toBe("succeeded");
    });

    test("配置改动后结果标记为旧版本", () => {
        const workspace = workspaceWithScenes(["影棚"]);
        const units = planAiPoseGeneratorUnits({ workspace, nextClientOperationId: seqIds() });
        const outcomes = [aiPoseGeneratorOutcomeFromTask(units[0]!, taskWith([{ dataUrl: "data:image/png;base64,AAA" }]))];
        const changed = updateAiPoseScene(workspace, workspace.scenes[0]!.id, "纯黑影棚");
        const view = aiPoseGeneratorResultView({ units, outcomes, currentHash: aiPoseGeneratorSnapshotHash(changed) });
        expect(view.stale).toBe(true);
        expect(view.groups.every((group) => group.stale)).toBe(true);
        expect(view.snapshotHash).toBe(aiPoseGeneratorSnapshotHash(changed));
    });
});

describe("AI 姿势生成 · 工作区渲染", () => {
    test("首屏有本页独有区域；空姿势时提交被拦截并给出原因", async () => {
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
        const { AiPoseGeneratorWorkspace } = await import("@/components/tools/workspaces/model");
        const html = renderToStaticMarkup(
            React.createElement(MemoryRouter, null, React.createElement(AiPoseGeneratorWorkspace)) as Parameters<typeof renderToStaticMarkup>[0],
        );

        for (const id of [
            "ai-pose-generator-workspace",
            "ai-pose-pose-panel",
            "ai-pose-prompt",
            "ai-pose-prompt-count",
            "ai-pose-categories",
            "ai-pose-preset-list",
            "ai-pose-preset-name",
            "ai-pose-preset-save",
            "ai-pose-scene-panel",
            "ai-pose-scene-add",
            "ai-pose-scene-count",
            "ai-pose-preview-panel",
            "ai-pose-preview-prompt",
            "ai-pose-output-control",
            "ai-pose-plan-total",
            "ai-pose-submit",
            "ai-pose-issues",
            "ai-pose-results",
            "ai-pose-results-empty",
            "ai-pose-snapshot",
            "ai-pose-undo",
            "ai-pose-redo",
        ]) {
            expect(html).toContain(`data-testid="${id}"`);
        }

        // 默认态：1 张选中、无场景时提示默认场景、空姿势 → 提交拦截
        expect(html).toMatch(/data-testid="ai-pose-output-1"[^>]*aria-pressed="true"/);
        expect(html).toContain("默认场景");
        expect(html).toMatch(/data-testid="ai-pose-submit"[^>]*disabled/);
        expect(html).toContain("请先填写姿势描述");
        expect(html).toContain(`data-testid="ai-pose-preset-${AI_POSE_GENERATOR_PRESETS[0]!.id}"`);
        expect(html).toContain(AI_POSE_GENERATOR_DRAFT_KEY);
    });
});
