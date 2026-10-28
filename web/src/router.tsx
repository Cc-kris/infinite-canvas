import { createBrowserRouter, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import ToolPage from "@/features/tools/tool-page";
import UserLayout from "@/layouts/user-layout";
import AssetsPage from "@/pages/assets";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";
import ConfigPage from "@/pages/config";
import HomePage from "@/pages/home";
import ImagePage from "@/pages/image";
import NotFound from "@/pages/not-found";
import PromptsPage from "@/pages/prompts";
import VideoPage from "@/pages/video";

export const router = createBrowserRouter([
    {
        element: (
            <UserLayout>
                <AnalyticsTracker />
                <Outlet />
            </UserLayout>
        ),
        children: [
            { path: "/", element: <HomePage /> },
            { path: "/image", element: <ImagePage /> },
            { path: "/video", element: <VideoPage /> },
            { path: "/assets", element: <AssetsPage /> },
            { path: "/prompts", element: <PromptsPage /> },
            { path: "/canvas", element: <CanvasPage /> },
            { path: "/canvas/:id", element: <CanvasProjectPage /> },
            { path: "/config", element: <ConfigPage /> },
            // Canonical tool workspace. ToolPage resolves category/tool/batch/legacy/404 itself,
            // so /tools/:category (default tool), /tools/:category/:toolId and
            // /tools/batch-generate(+/:batchId) all share one route layer.
            { path: "/tools", element: <ToolPage /> },
            { path: "/tools/:category", element: <ToolPage /> },
            { path: "/tools/:category/:toolId", element: <ToolPage /> },
        ],
    },
    { path: "*", element: <NotFound /> },
]);
