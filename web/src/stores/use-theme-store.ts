import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { appStateStorage } from "@/lib/desktop-storage";

export type ThemeName = "light" | "dark";

const THEME_STORE_KEY = "infinite-canvas:theme_store";

type ThemeStore = {
    theme: ThemeName;
    setTheme: (theme: ThemeName) => void;
};

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: "light",
            setTheme: (theme) => set({ theme }),
        }),
        { name: THEME_STORE_KEY, storage: createJSONStorage(() => appStateStorage) },
    ),
);

// index.html 的启动脚本要在首帧前同步拿到主题，而磁盘读取是异步的，因此额外镜像一份到 localStorage。
useThemeStore.subscribe((state) => {
    try {
        window.localStorage.setItem(THEME_STORE_KEY, JSON.stringify({ state: { theme: state.theme }, version: 0 }));
    } catch {
        /* 隐私模式等场景写不了 localStorage，忽略即可 */
    }
});
