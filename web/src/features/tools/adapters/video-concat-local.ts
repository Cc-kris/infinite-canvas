/** VIDEO_CONCAT 本地确定性执行：文件裁剪与合成，不调用视频生成网关。 */
import { concatenateVideoClips } from "@/services/api/tools/ffmpeg-media";
import { computeFingerprint, createTaskRecord, transitionTask, type ToolTask, type ToolTaskResultItem } from "@/services/api/tools/task-machine";
import { VIDEO_CONCAT_TOOL_ID, validateVideoConcatState, videoConcatTotalMs, type VideoConcatState } from "@/features/tools/registry/video-concat";
import { buildVideoConcatFields } from "./video-concat";

export type VideoConcatLocalPort = {
    compose: (state: VideoConcatState) => Promise<Blob>;
    save: (task: ToolTask) => void;
};

export async function createVideoConcatLocalPort(): Promise<VideoConcatLocalPort> {
    const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
    return { compose: concatenateVideoClips, save: (task) => useToolTaskStore.getState().upsertTask(task) };
}

export async function runVideoConcatLocalTask(input: {
    state: VideoConcatState;
    port: VideoConcatLocalPort;
    draftRevision?: number | null;
    clientOperationId?: string;
}): Promise<ToolTask> {
    const issues = validateVideoConcatState({ state: input.state });
    if (issues.length) {
        const error = new Error(issues[0].message) as Error & { code?: string };
        error.code = issues[0].code;
        throw error;
    }
    const fields = buildVideoConcatFields({ state: input.state, model: "local-ffmpeg" });
    let task = createTaskRecord({
        toolId: VIDEO_CONCAT_TOOL_ID,
        capability: "video",
        prompt: "本地确定性视频拼接（不调用生成模型）",
        configSnapshot: { capability: "video", model: "local-ffmpeg", count: "1" },
        sourceAssetIds: input.state.clips.map((clip) => clip.assetId),
        draftRevision: input.draftRevision,
        clientOperationId: input.clientOperationId,
        fingerprint: computeFingerprint({
            toolId: VIDEO_CONCAT_TOOL_ID,
            capability: "video",
            prompt: "local-ffmpeg-concat",
            configSnapshot: { capability: "video", model: "local-ffmpeg", count: "1" },
            sourceAssetIds: input.state.clips.map((clip) => clip.assetId),
            fields,
        }),
        inputSnapshot: { mode: "deterministic", videoList: fields.videoList, videoRatio: input.state.videoRatio, videoTime: input.state.videoTime, durationMs: videoConcatTotalMs(input.state.clips) },
    });
    try {
        task = transitionTask(task, "validating");
        input.port.save(task);
        task = transitionTask(task, "submitting", { attempts: 1 });
        input.port.save(task);
        task = transitionTask(task, "running");
        input.port.save(task);
        const blob = await input.port.compose(input.state);
        if (!blob.size) throw new Error("本地合成返回了空视频");
        const result: ToolTaskResultItem = { id: `${task.id}-video-1`, kind: "video", blob, mimeType: blob.type || "video/mp4", bytes: blob.size };
        task = transitionTask(task, "succeeded", { result: { items: [result], receivedAt: Date.now() } });
        input.port.save(task);
        return task;
    } catch (cause) {
        task = transitionTask(task, "failed", {
            error: {
                code: typeof cause === "object" && cause && "code" in cause ? String(cause.code) : "media-processing-failed",
                message: cause instanceof Error ? cause.message : "本地拼接失败",
                retryable: false,
            },
        });
        input.port.save(task);
        return task;
    }
}
