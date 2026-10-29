/**
 * 模型标识的展示名。
 *
 * 后端模型 id 形如 `default::gpt-image-2`（`provider::modelId`），直接展示会把
 * 原始 id 泄漏到 UI（B9 视觉对照发现，真实 LinkFox 只显示人类可读名称）。
 * 这里做确定性格式化：去掉 provider 前缀，按 `-`/`_` 分词并将已知缩写大写。
 */
const ACRONYMS = new Set(["gpt", "ai", "tts", "asr", "sdxl", "llm", "vl"]);

export function modelLabel(raw?: string | null, fallback = "未配置"): string {
  const value = (raw ?? "").trim();
  if (!value) return fallback;
  const parts = value.split("::");
  const id = (parts.length > 1 ? parts.slice(1).join("::") : value).trim();
  const label = id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) =>
      ACRONYMS.has(part.toLowerCase())
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ");
  return label || fallback;
}
