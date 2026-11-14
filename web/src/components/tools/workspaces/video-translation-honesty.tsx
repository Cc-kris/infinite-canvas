/**
 * VIDEO_TRANSLATION 能力边界：原片译制与历史重生成任务必须明确区分。
 * 当前新任务由独立 ASR/文本翻译/TTS/FFmpeg 管线执行；口型同步仍未实现。
 * 共享 i18n 由父会话维护；本工作区对新增管线文案使用本地中文说明。
 */

import { AlertTriangle, FileWarning } from "lucide-react";

import i18n from "@/i18n";
import { cn } from "@/lib/utils";

export type VideoTranslationHonestyCopy = {
    subtitle: string;
    noticeTitle: string;
    noticeBody: string;
    noticeBasis: string;
    languageTitle: string;
    languageHint: string;
    sourceHint: string;
    lipSyncTitle: string;
    lipSyncHint: string;
    lipSyncSnapshot: string;
    outputHint: string;
    resultTitle: string;
    resultPanelLabel: string;
    resultBadge: string;
    resultEmpty: string;
    submitting: string;
    sidebarTitle: string;
    sidebarHint: string;
    historyHint: string;
};

const NAMESPACE = "videoTranslation";
const FALLBACK_LOCALE = "zh-CN";

/** 当前语言下的诚实边界文案；locale 缺省跟随 i18n（未初始化时回落 zh-CN）。 */
export function videoTranslationHonestyCopy(locale?: string): VideoTranslationHonestyCopy {
    const t = i18n.getFixedT(locale || i18n.language || FALLBACK_LOCALE, "translation");
    const key = (name: keyof VideoTranslationHonestyCopy) => String(t(`${NAMESPACE}.${name}`));
    return {
        subtitle: key("subtitle"),
        noticeTitle: key("noticeTitle"),
        noticeBody: key("noticeBody"),
        noticeBasis: key("noticeBasis"),
        languageTitle: key("languageTitle"),
        languageHint: key("languageHint"),
        sourceHint: key("sourceHint"),
        lipSyncTitle: key("lipSyncTitle"),
        lipSyncHint: key("lipSyncHint"),
        lipSyncSnapshot: key("lipSyncSnapshot"),
        outputHint: key("outputHint"),
        resultTitle: key("resultTitle"),
        resultPanelLabel: key("resultPanelLabel"),
        resultBadge: key("resultBadge"),
        resultEmpty: key("resultEmpty"),
        submitting: key("submitting"),
        sidebarTitle: key("sidebarTitle"),
        sidebarHint: key("sidebarHint"),
        historyHint: key("historyHint"),
    };
}

/**
 * 文案由调用方区分新原片管线与历史重生成任务；口型同步仍未实现。
 */
export function VideoTranslationHonestyNotice({ className, copy }: { className?: string; copy?: VideoTranslationHonestyCopy }) {
    const text = copy ?? videoTranslationHonestyCopy();
    return (
        <section
            data-testid="video-translation-honesty-notice"
            data-capability="source-preserving-translation"
            role="note"
            aria-live="polite"
            className={cn(
                "rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-5 text-amber-700",
                "dark:text-amber-300",
                className,
            )}
        >
            <p className="flex items-start gap-2 font-medium">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span data-testid="video-translation-honesty-title">{text.noticeTitle}</span>
            </p>
            <p className="mt-1 opacity-90" data-testid="video-translation-honesty-body">
                {text.noticeBody}
            </p>
            <p className="mt-1 opacity-75" data-testid="video-translation-honesty-basis">
                {text.noticeBasis}
            </p>
        </section>
    );
}

/** 结果区徽标：新译制需人工核对；历史重生成仍使用旧「未验证翻译」文案。 */
export function VideoTranslationDraftBadge({ className, copy, legacy = false }: { className?: string; copy?: VideoTranslationHonestyCopy; legacy?: boolean }) {
    const text = copy ?? videoTranslationHonestyCopy();
    return (
        <span
            data-testid="video-translation-draft-badge"
            data-capability={legacy ? "unverified-translation" : "source-preserving-translation-result"}
            className={cn(
                "inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-700",
                "dark:text-amber-300",
                className,
            )}
        >
            <FileWarning aria-hidden="true" className="size-3" />
            {text.resultBadge}
        </span>
    );
}
