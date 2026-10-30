/**
 * VIDEO_TRANSLATION 诚实能力边界（r27 协议调查，提交 1ef24fba）。
 *
 * 事实依据 `docs/V1.0/plan_linkfox_navigation/reports/vt-protocol-r27/REPORT.md`：
 *   - 上游 sub2api `/v1/videos`（MiniMax-H3）只有 model/prompt/seconds/size/ratio/resolution_name/generate_audio/watermark，
 *     没有 sourceLanguage / targetLanguage / lipSync / 字幕字段；
 *   - 语言只能写进提示词，r24 内容级复验输出中文旁白、无字幕 → 无法承诺「换成目标语言」；
 *   - 真正的译制契约是 LinkFox `type=96 / bizType=814` + `SEED_V25`（渠道 DOUBAO_API），我方未接入。
 *
 * 因此面板必须持续说明「当前为 AI 视频重生成，非逐句翻译/口型对齐」，并且：
 *   - 语言选择只影响提示词；
 *   - 口型同步置灰并说明原因（不静默丢参）；
 *   - 结果标为「未验证翻译」草稿，禁止出现「翻译完成/已译制/已对口型/已生成字幕/已识别源语言」。
 *
 * 文案放 i18n（zh-CN / en-US 两套），组件只负责渲染，便于测试断言两种语言都不出现虚假承诺。
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
 * 面板顶部常驻的琥珀色提示：不能折叠、不能关闭。
 * 文案要点（报告 §6.1）：可选择目标语言，但它只会作为提示词发送，不保证换语言；
 * 不会生成译制字幕或口型对齐。
 */
export function VideoTranslationHonestyNotice({ className, copy }: { className?: string; copy?: VideoTranslationHonestyCopy }) {
    const text = copy ?? videoTranslationHonestyCopy();
    return (
        <section
            data-testid="video-translation-honesty-notice"
            data-capability="ai-regeneration"
            role="note"
            aria-live="polite"
            className={cn(
                "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800",
                "dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
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

/** 结果区徽标：结果只能当「未验证翻译」草稿。 */
export function VideoTranslationDraftBadge({ className, copy }: { className?: string; copy?: VideoTranslationHonestyCopy }) {
    const text = copy ?? videoTranslationHonestyCopy();
    return (
        <span
            data-testid="video-translation-draft-badge"
            data-capability="unverified-translation"
            className={cn(
                "inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700",
                "dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
                className,
            )}
        >
            <FileWarning aria-hidden="true" className="size-3" />
            {text.resultBadge}
        </span>
    );
}
