import { deletePluginValue, readPluginValue, writePluginValue } from "@/services/desktop-storage";

import type { PluginStorage } from "@/types/canvas-plugin";

// Lightweight canvas event bus for communication between nodes and plugins.
type Handler = (payload: unknown) => void;
const handlers = new Map<string, Set<Handler>>();

export function emitCanvasEvent(event: string, payload?: unknown) {
    handlers.get(event)?.forEach((handler) => {
        try {
            handler(payload);
        } catch (error) {
            console.error(`[canvas-event] handler for "${event}" failed`, error);
        }
    });
}

export function onCanvasEvent(event: string, handler: Handler) {
    let set = handlers.get(event);
    if (!set) {
        set = new Set();
        handlers.set(event, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
}

// Private plugin storage isolated by pluginId namespace.
export function createPluginStorage(pluginId: string): PluginStorage {
    return {
        get: <T = unknown>(key: string) => readPluginValue<T>(pluginId, key),
        set: (key, value) => writePluginValue(pluginId, key, value),
        remove: (key) => deletePluginValue(pluginId, key),
    };
}
