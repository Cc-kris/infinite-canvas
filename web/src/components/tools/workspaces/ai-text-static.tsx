/**
 * AI_TEXT（AI 文字）——原站该工具未开通，访问时直接重定向到 /home。
 * 原站可见内容文本仅 1 条 + 「业务咨询」入口（属账号/运营类，按需求 §7 不复刻），因此本地只呈现占位说明，不渲染任何工具 DOM。
 */
export function AiTextStatic({ className }: { className?: string }) {
    return (
        <div
            className={`grid h-full min-h-0 place-items-center gap-3 p-6 ${className ?? ""}`}
            data-testid="ai-text-unavailable"
        >
            <span className="text-[13px] leading-5 text-muted-foreground">重定向到 /home 首页，工具未开通；无工具 DOM</span>
        </div>
    );
}

export default AiTextStatic;
