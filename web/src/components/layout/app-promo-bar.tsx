import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * 顶栏促销条（原站 1:1 结构）：整宽 50px、竖向轮播、右侧 22px 关闭按钮、z-index 8。
 * 原站内容为品牌广告图（外部 CDN），本地按「结构/尺寸/交互一致、内容自有」渲染文案轮播，
 * 不引入任何第三方品牌素材。关闭状态只作用于本次会话（sessionStorage）。
 */
const DISMISS_KEY = "infinite-canvas:shell-promo-dismissed";
const SLIDE_KEYS = ["shellPromo.slide1", "shellPromo.slide2", "shellPromo.slide3"] as const;
const ROTATE_MS = 3000;

function readDismissed() {
    try {
        return window.sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
        return false;
    }
}

export function AppPromoBar() {
    const { t } = useTranslation();
    const [dismissed, setDismissed] = useState(readDismissed);
    const [index, setIndex] = useState(0);

    useEffect(() => {
        if (dismissed) return;
        const timer = window.setInterval(() => setIndex((current) => (current + 1) % SLIDE_KEYS.length), ROTATE_MS);
        return () => window.clearInterval(timer);
    }, [dismissed]);

    if (dismissed) return null;

    return (
        <div
            data-testid="shell-promo-bar"
            role="region"
            aria-label={t("shellPromo.label")}
            className="relative z-[8] h-[50px] w-full shrink-0 bg-[linear-gradient(90deg,#6f3bf5_0%,#8c5cff_52%,#a87cff_100%)] dark:bg-[linear-gradient(90deg,#3b2c63_0%,#4c357e_55%,#5b3f94_100%)]"
        >
            <div className="flex h-[50px] w-full flex-col overflow-hidden transition-transform duration-500 ease-out" style={{ transform: `translateY(-${index * 50}px)` }}>
                {SLIDE_KEYS.map((key) => (
                    <div key={key} data-testid={`shell-promo-slide-${key}`} className="flex h-[50px] w-full shrink-0 items-center justify-center px-[52px] text-[14px] leading-[22px] text-white">
                        <span className="truncate">{t(key)}</span>
                    </div>
                ))}
            </div>
            <button
                type="button"
                data-testid="shell-promo-close"
                aria-label={t("shellPromo.close")}
                title={t("shellPromo.close")}
                onClick={() => {
                    setDismissed(true);
                    try {
                        window.sessionStorage.setItem(DISMISS_KEY, "1");
                    } catch {
                        /* sessionStorage 不可用时仅本次渲染生效 */
                    }
                }}
                className="absolute right-[25px] top-[14px] inline-flex size-[22px] items-center justify-center rounded text-white/90 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
            >
                <X className="size-[14px]" strokeWidth={2.6} aria-hidden />
            </button>
        </div>
    );
}
