import React from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "streamdown/styles.css";
import "./styles/globals.css";
import { RouterProvider } from "react-router-dom";

import { AppProviders } from "@/components/layout/app-providers";
import "@/i18n";
import { initAnalytics } from "@/lib/analytics";
import { installLocalAgentHub } from "@/lib/local-agent-hub";
import { router } from "@/router";
import { ensureStorageMigration } from "@/services/storage-migration";

initAnalytics();

document.body.style.fontFamily = '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';

async function bootstrap() {
    // 旧 IndexedDB/localStorage 必须在任何 zustand store 读取前导入磁盘。
    await ensureStorageMigration();
    // 本机 dev 环境先接上 Agent 桥接垫片：连接页据此直接出示卡片，不再要求手填地址。
    await installLocalAgentHub().catch(() => undefined);
    createRoot(document.getElementById("root")!).render(
        <React.StrictMode>
            <AppProviders>
                <RouterProvider router={router} />
            </AppProviders>
        </React.StrictMode>,
    );
}

void bootstrap();
