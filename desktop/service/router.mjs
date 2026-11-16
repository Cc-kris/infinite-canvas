/** 极简路由表：精确路径或末尾 `*` 前缀匹配，够服务端按能力拆分模块即可。 */
export function createRouter() {
    const routes = [];
    const add = (method, path, handler) => routes.push({ method, path, handler });
    return {
        get: (path, handler) => add("GET", path, handler),
        post: (path, handler) => add("POST", path, handler),
        put: (path, handler) => add("PUT", path, handler),
        delete: (path, handler) => add("DELETE", path, handler),
        any: (path, handler) => ["GET", "POST", "PUT", "DELETE"].forEach((method) => add(method, path, handler)),
        match(method, pathname) {
            return routes.find((route) => route.method === method && matches(route.path, pathname))?.handler || null;
        },
    };
}

function matches(pattern, pathname) {
    if (pattern.endsWith("*")) return pathname.startsWith(pattern.slice(0, -1));
    return pattern === pathname;
}
