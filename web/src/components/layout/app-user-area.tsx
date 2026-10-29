import { Popover, Tooltip } from "antd";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

/**
 * 顶栏右侧用户区（原站 1:1 结构）：
 *   免费得算力（#FEE2E2/#EF4444，pad 0 12px，32px 高）
 *   积分 + 购买（同一枚 #E2ECFE 药丸，32px 高，购买 44px 宽紫底）
 *   头像 36px + 用户名 14px/20 + 副标 12px/16（行距 4px）
 * 本地没有账户与计费系统，因此额度按真实值 0 呈现、购买按钮禁用并说明原因；
 * 原站的设置/语言/主题/版本/GitHub 等入口收进头像下拉（children 传入），保持可达。
 */
export function AppUserArea({ children, menuLabel }: { children?: ReactNode; menuLabel?: string }) {
    const { t } = useTranslation();
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div data-testid="shell-user-area" className="flex h-full shrink-0 items-center gap-[15px] pr-3 max-md:gap-2">
            <a
                href="https://github.com/Cc-kris/infinite-canvas#readme"
                target="_blank"
                rel="noreferrer"
                data-testid="shell-user-learning-center"
                style={{ color: "rgba(0, 0, 0, 0.88)" }}
                className="hidden h-8 shrink-0 items-center justify-center rounded-[6px] bg-[#f4f4f5] px-[10px] text-[14px] leading-[22px] transition hover:bg-[#ececee] lg:inline-flex lg:min-w-[92px] dark:bg-white/10 dark:text-white/85"
            >
                {t("shellUser.learningCenter")}
            </a>
            <Link
                to="/tools"
                data-testid="shell-user-free-quota"
                className="hidden h-8 shrink-0 items-center rounded-[6px] bg-[#fee2e2] px-3 text-[14px] leading-[22px] text-[#ef4444] transition hover:brightness-[0.98] md:inline-flex dark:bg-[#3b2021] dark:text-[#f87171]"
            >
                {t("shellUser.freeQuota")}
            </Link>

            <div data-testid="shell-user-points" className="hidden h-8 shrink-0 items-center rounded-[4px] bg-[#e2ecfe] text-[12px] leading-[18.857px] font-bold text-black/85 md:flex dark:bg-[#1e2a44] dark:text-white/85">
                <span>{t("shellUser.points")}</span>
                <span data-testid="shell-user-points-value" className="mx-[3px] min-w-[24px] text-right tabular-nums">
                    0
                </span>
                <Tooltip title={t("shellUser.buyHint")} mouseEnterDelay={0.2}>
                    <button
                        type="button"
                        data-testid="shell-user-buy"
                        disabled
                        aria-label={t("shellUser.buyHint")}
                        className="inline-flex h-8 w-11 shrink-0 cursor-not-allowed items-center justify-center px-2 text-[12px] font-normal text-white opacity-60 bg-[linear-gradient(90deg,#3a7df9_0%,#723cf9_100%)]"
                    >
                        <span className="tracking-[1.7px] text-white" style={{ lineHeight: "normal" }}>
                            {t("shellUser.buy")}
                        </span>
                    </button>
                </Tooltip>
            </div>

            <Popover
                open={menuOpen}
                onOpenChange={setMenuOpen}
                trigger="click"
                placement="bottomRight"
                arrow={false}
                content={
                    <div className="flex w-[252px] flex-col gap-2">
                        <p className="px-1 text-[12px] leading-4 text-muted-foreground">{menuLabel ?? t("shellUser.menuLabel")}</p>
                        {children}
                    </div>
                }
            >
                <button
                    type="button"
                    data-testid="shell-user-menu-trigger"
                    aria-label={t("shellUser.menuLabel")}
                    aria-expanded={menuOpen}
                    className="flex h-9 shrink-0 items-center gap-1 rounded-[6px] pr-1 outline-none transition hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/[0.06]"
                >
                    <span data-testid="shell-user-avatar" aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[#a88ded] text-[14px] leading-[22px] text-white">
                        {t("shellUser.avatarText")}
                    </span>
                    <span className="flex w-[61px] shrink-0 flex-col items-start">
                        <span data-testid="shell-user-name" className="w-full truncate text-[14px] leading-5 text-[#333] dark:text-white/85">
                            {t("shellUser.localUserName")}
                        </span>
                        <span data-testid="shell-user-account-type" className="w-full truncate text-[12px] leading-4 text-[#999] dark:text-white/45">
                            {t("shellUser.accountType")}
                        </span>
                    </span>
                </button>
            </Popover>
        </div>
    );
}
