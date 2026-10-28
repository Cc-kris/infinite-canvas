import { AlertTriangle, CheckCircle2, CircleHelp, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * TASK-006：Provider 能力声明与提示（technical_design §7）。
 *
 * 只有拿到“已支持”的明确证据才按支持处理；缺失证据记为 unverified 并阻止提交。
 * 缺失的必需能力 → blocker；缺失的可选能力 → degradation，必须由用户显式确认后才继续。
 */

export type ToolCapabilityKey = "imageEdit" | "mask" | "referenceVideo" | "lipSync" | "multiReference" | "aspectRatio" | "duration" | "resolution" | "outputNum";

export const TOOL_CAPABILITY_KEYS: readonly ToolCapabilityKey[] = ["imageEdit", "mask", "referenceVideo", "lipSync", "multiReference", "aspectRatio", "duration", "resolution", "outputNum"];

export const TOOL_CAPABILITY_LABELS: Record<ToolCapabilityKey, string> = {
    imageEdit: "参考图编辑",
    mask: "局部蒙版",
    referenceVideo: "参考视频",
    lipSync: "口型同步",
    multiReference: "多图参考",
    aspectRatio: "画幅比例",
    duration: "时长设置",
    resolution: "分辨率设置",
    outputNum: "出图/出片数量",
};

export type ToolCapabilityState = "supported" | "unsupported" | "unknown";

export type ToolCapabilityEvidence = Partial<Record<ToolCapabilityKey, ToolCapabilityState>>;

export type ToolCapabilityRequirement = {
    key: ToolCapabilityKey;
    /** 默认 true：必需能力缺失必须阻止提交。 */
    required?: boolean;
    /** 覆盖显示名，用于工具自己的措辞。 */
    label?: string;
    /** 说明该能力在本次请求里承担什么。 */
    note?: string;
};

export type CapabilityIssueSeverity = "blocker" | "unverified" | "degradation";

export type CapabilityIssue = {
    key: ToolCapabilityKey;
    label: string;
    state: ToolCapabilityState;
    severity: CapabilityIssueSeverity;
    title: string;
    detail: string;
    required: boolean;
};

export type CapabilityEvaluation = {
    issues: CapabilityIssue[];
    /** 有 blocker/unverified 时不允许提交。 */
    blocked: boolean;
    /** 需要用户显式确认的降级项。 */
    blockedKeys: ToolCapabilityKey[];
    degradations: ToolCapabilityKey[];
    unverified: ToolCapabilityKey[];
    supported: ToolCapabilityKey[];
};

const SEVERITY_TITLE: Record<CapabilityIssueSeverity, string> = {
    blocker: "当前模型不支持必需能力",
    unverified: "能力未核实",
    degradation: "将以降级方式执行",
};

function detailFor(key: ToolCapabilityKey, severity: CapabilityIssueSeverity, note?: string) {
    const label = TOOL_CAPABILITY_LABELS[key];
    if (severity === "blocker") return `请移除与「${label}」相关的输入或改选支持的模型，不会静默丢弃该参数。${note ? ` ${note}` : ""}`;
    if (severity === "unverified") return `还没有「${label}」的支持证据，按不支持处理；需要先确认 Provider 能力再提交。${note ? ` ${note}` : ""}`;
    return `「${label}」不可用，继续执行会忽略它；确认接受降级后才能提交。${note ? ` ${note}` : ""}`;
}

/**
 * 纯函数：把“需求 + 证据”翻译成问题列表。
 * 证据缺省一律视为 unknown（unverified），绝不默认 supported。
 */
export function evaluateToolCapabilities(requirements: readonly ToolCapabilityRequirement[], evidence: ToolCapabilityEvidence): CapabilityEvaluation {
    const issues: CapabilityIssue[] = [];
    const supported: ToolCapabilityKey[] = [];

    for (const requirement of requirements) {
        const state = evidence[requirement.key] ?? "unknown";
        const required = requirement.required ?? true;
        const label = requirement.label ?? TOOL_CAPABILITY_LABELS[requirement.key];

        if (state === "supported") {
            supported.push(requirement.key);
            continue;
        }

        const severity: CapabilityIssueSeverity = state === "unknown" ? "unverified" : required ? "blocker" : "degradation";
        issues.push({
            key: requirement.key,
            label,
            state,
            severity,
            title: SEVERITY_TITLE[severity],
            detail: detailFor(requirement.key, severity, requirement.note),
            required,
        });
    }

    const blockedKeys = issues.filter((issue) => issue.severity !== "degradation").map((issue) => issue.key);
    return {
        issues,
        blocked: blockedKeys.length > 0,
        blockedKeys,
        degradations: issues.filter((issue) => issue.severity === "degradation").map((issue) => issue.key),
        unverified: issues.filter((issue) => issue.severity === "unverified").map((issue) => issue.key),
        supported,
    };
}

/** 提交按钮的唯一判据：没有 blocker/unverified，且所有降级项都已被接受。 */
export function canSubmitWithCapabilities(evaluation: CapabilityEvaluation, accepted: readonly ToolCapabilityKey[] = []): boolean {
    if (evaluation.blocked) return false;
    return evaluation.degradations.every((key) => accepted.includes(key));
}

const SEVERITY_STYLE: Record<CapabilityIssueSeverity, { icon: typeof AlertTriangle; className: string }> = {
    blocker: { icon: ShieldAlert, className: "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" },
    unverified: { icon: CircleHelp, className: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" },
    degradation: { icon: AlertTriangle, className: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100" },
};

export type CapabilityNoticeProps = {
    requirements: readonly ToolCapabilityRequirement[];
    evidence: ToolCapabilityEvidence;
    title?: string;
    accepted?: readonly ToolCapabilityKey[];
    onAcceptDegradation?: (key: ToolCapabilityKey) => void;
    className?: string;
};

export function CapabilityNotice({ requirements, evidence, title = "能力校验", accepted = [], onAcceptDegradation, className }: CapabilityNoticeProps) {
    const evaluation = evaluateToolCapabilities(requirements, evidence);
    if (evaluation.issues.length === 0) {
        return (
            <div
                data-testid="capability-notice"
                data-blocked={false}
                className={cn("flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200", className)}
            >
                <CheckCircle2 aria-hidden="true" className="size-4" />
                能力已核实：{evaluation.supported.map((key) => TOOL_CAPABILITY_LABELS[key]).join("、")}
            </div>
        );
    }

    return (
        <section data-testid="capability-notice" data-blocked={evaluation.blocked} aria-live="polite" className={cn("space-y-2", className)}>
            <h3 className="text-xs font-medium text-muted-foreground">
                {title}
                {evaluation.blocked ? " · 暂时无法提交" : " · 可确认降级后提交"}
            </h3>
            <ul className="space-y-2">
                {evaluation.issues.map((issue) => {
                    const style = SEVERITY_STYLE[issue.severity];
                    const Icon = style.icon;
                    const isAccepted = accepted.includes(issue.key);
                    return (
                        <li key={issue.key} data-testid={`capability-issue-${issue.key}`} data-severity={issue.severity} className={cn("rounded-xl border px-3 py-2 text-xs", style.className)}>
                            <div className="flex items-start gap-2">
                                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium">
                                        {issue.label}：{issue.title}
                                    </p>
                                    <p className="mt-0.5 opacity-90">{issue.detail}</p>
                                </div>
                            </div>
                            {issue.severity === "degradation" ? (
                                <button
                                    type="button"
                                    disabled={isAccepted || !onAcceptDegradation}
                                    onClick={() => onAcceptDegradation?.(issue.key)}
                                    data-testid={`capability-accept-${issue.key}`}
                                    className="mt-2 rounded-lg border border-current/30 px-2.5 py-1 font-medium transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {isAccepted ? "已接受降级" : "接受降级并继续"}
                                </button>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
