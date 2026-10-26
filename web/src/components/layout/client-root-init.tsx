import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { App } from "antd";
import { useTranslation } from "react-i18next";

import { isDesktopApp } from "@/lib/desktop";
import { DEFAULT_LOCAL_PROXY_URL, detectLocalProxy, localProxyDisabledByUser, useConfigStore } from "@/stores/use-config-store";
import { usePromptSourceScheduler } from "@/hooks/use-prompt-source-scheduler";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const handledConfigParams = useRef(false);
    const importChannelCredentials = useConfigStore((state) => state.importChannelCredentials);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);

    usePromptSourceScheduler();

    // 浏览器端：探测本机 canvas-proxy，探到就自动开启代理——和桌面端外壳的行为保持一致，
    // 否则浏览器直连跨域中转会被 CORS 挡掉（表现为"请求失败"或一直转圈）。
    useEffect(() => {
        if (localProxyDisabledByUser()) return; // 用户显式关过，别擅自打开
        if (isDesktopApp()) return; // 桌面端由外壳负责
        const controller = new AbortController();
        void detectLocalProxy(DEFAULT_LOCAL_PROXY_URL, controller.signal).then((ok) => {
            if (!ok) return;
            const config = useConfigStore.getState().config;
            if (config.proxyEnabled) return;
            useConfigStore.getState().updateConfig("proxyUrl", config.proxyUrl || DEFAULT_LOCAL_PROXY_URL);
            useConfigStore.getState().updateConfig("proxyEnabled", true);
        });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (handledConfigParams.current) return;
        const searchParams = new URLSearchParams(window.location.search);
        const baseUrl = searchParams.get("baseUrl") || searchParams.get("baseurl");
        const apiKey = searchParams.get("apiKey") || searchParams.get("apikey");
        if (!baseUrl && !apiKey) return;
        handledConfigParams.current = true;
        searchParams.delete("baseUrl");
        searchParams.delete("baseurl");
        searchParams.delete("apiKey");
        searchParams.delete("apikey");
        window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);
        const result = importChannelCredentials({ baseUrl, apiKey });
        openConfigDialog(false, "channels");
        if (result.status === "created") message.success(t("config.importedChannelCreated", { name: result.channelName }));
        else if (result.status === "updated") message.success(t("config.importedChannelUpdated", { name: result.channelName }));
        else if (result.status === "missing-base-url") message.error(t("config.importedChannelBaseUrlRequired"));
        else message.error(t("config.importedChannelBaseUrlInvalid"));
    }, [importChannelCredentials, message, openConfigDialog, t]);

    return <>{children}</>;
}
