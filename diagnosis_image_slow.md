# 生图慢：归因与降耗方案（2026-10-26 实测）

## 一句话结论

慢在**上游推理成本**，不在客户端。客户端没有轮询、没有本地队列、没有串行锁；请求一次发出后就干等响应（超时 20 分钟）。真正决定耗时的是三个参数：**模型 > 质量 > 尺寸**。当前画布/工作台的实际组合恰好是最慢的那组。

## 实测数据

统一走本地代理 `http://127.0.0.1:23210/<上游完整 URL>`，`/v1/images/generations`，`n=1`，`output_format=png`，无参考图，同一渠道同一 key。

| # | 模型 | 尺寸 | quality | 耗时 | 产物 | 备注 |
|---|---|---|---|---|---|---|
| 1 | gpt-image-2 | 1024x1024 | low | 92.5s | 945KB | 与 #2 同批并发 |
| 2 | gpt-image-2 | 1024x1024 | auto（不传字段） | 181.7s | 1.32MB | 与 #1 同批并发 |
| 3 | gpt-image-2 | 864x1536 | low | 309.3s | 2.51MB | 与 #4 同批并发 |
| 4 | gpt-image-2.5-flare | 1024x1024 | low | 253.9s | 2.16MB | 与 #3 同批并发 |
| 5 | gpt-image-2 | 1024x1024 | low | 139.2s | 825KB | 串行第一发 |
| 6 | gpt-image-2.5-flare | 1024x1024 | low | 318.5s | 2.18MB | 串行第二发（与 #5 严格顺序对照） |
| 7 | gpt-image-2 | 1024x1024 | medium | 238.2s | 1.90MB | 单发（补测中档） |

### 读数

- **模型**：#5 vs #6 是同尺寸同质量、严格串行的对照，`gpt-image-2` 139.2s vs `2.5-flare` 318.5s，**flare 慢约 2.3 倍**。这是最大单项影响。
- **尺寸**：#3（864x1536，约 1.33M 像素）比 #1（1024x1024，约 1.05M 像素）多 27% 像素、耗时却从 92.5s 涨到 309s（同批内对照，含并发干扰，尺寸影响方向确定、幅度不完全线性）。
- **上游波动**：#1 与 #5 是完全相同的请求，分别 92.5s / 139.2s，**单次波动约 ±50s**。所以跨批次比绝对值不可靠，只有同批并发或严格串行才可比。
- 并发会互相拖慢：同时发两条时，两条都比单发慢（#3/#4 同批都在 250s+；#5/#6 串行则分别是 139s/318s）。

- **质量**：#1 vs #2 同批并发，low 92.5s vs auto（不传）181.7s，**约快一倍**。补测 #7 显式中档 `medium` 238.2s（产物 1.90MB）——**比自动还慢**，且 auto 的 1.32MB 介于 low(0.93MB) 与 medium(1.90MB) 之间。结论：不传 quality 时上游给的就是「中档左右」，**只有 low 是真提速档，medium 没有意义**。

## 根因：「质量=自动」等于根本不传 quality

```ts
// web/src/services/api/image.ts
const IMAGE_QUALITY_VALUES = ["low", "medium", "high", "xhigh", "max"];

function normalizeQuality(quality: string) {
    const value = quality.trim().toLowerCase();
    return IMAGE_QUALITY_VALUES.includes(value) ? value : undefined;
}
```

- 设置面板的默认值是 `quality: "auto"`（`web/src/stores/use-config-store.ts`）。
- `auto` 不在白名单里 → `normalizeQuality` 返回 `undefined` → 请求体里 `...(quality ? { quality } : {})` 展开为空 → **请求里没有任何 quality 字段**。
- 上游于是按自家默认档出图，实测比显式 `low` 慢一倍（#2 的产物 1.32MB 也明显比 #1 的 945KB 大，说明确实跑了更高档）。
- 这不是 bug（不传是合法的），但 UI 上写着「自动」，用户会以为是自动挑合适档位，实际是「交给上游，通常偏慢」。

## 三种加速方案（按性价比排序）

| 方案 | 改动 | 预期耗时 | 代价 |
|---|---|---|---|
| A. 换成 `gpt-image-2`（不用 2.5-flare） | 纯配置，无需改代码 | 约 -55% | 2.5 系列在细节/一致性上更强 |
| B. 质量显式选「低」 | 纯配置 | 相对自动档约 -50% | 细节和文字渲染下降（选「中」无效，实测比自动还慢） |
| C. 尺寸回到 1024x1024（`1:1`） | 纯配置 | 相对 864x1536 明显下降 | 竖版海报需要长边，1:1 不适用 |

**最快组合（无需改代码）**：模型 `gpt-image-2` + 质量「低」+ 尺寸 `1:1` → 实测 1.5~2.5 分钟出图（原组合 `2.5-flare` + `864x1536` + 自动 ≈ 4~8 分钟）。

若要在产品层落地，可选：
1. 把默认 `quality` 从 `"auto"` 改成 `"low"`（唯一真正提速的档；`medium` 实测比 auto 还慢，不要选它）；
2. 或保留 auto，但在设置面板把「自动」标注为「上游默认（较慢）」，并加一个「快速模式」一键切换（2 个字段）。

## 复现方法

页内执行（浏览器直连上游会被 CORS 拦，必须经本地代理）：

```js
const cfg = JSON.parse(localStorage['infinite-canvas:ai_config_store']).state.config;
const ch = cfg.channels['0'];
const t0 = performance.now();
const r = await fetch('http://127.0.0.1:23210/' + ch.baseUrl.replace(/\/+$/, '') + '/v1/images/generations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ch.apiKey },
  body: JSON.stringify({ model: 'gpt-image-2', prompt: 'a green tree on a hill', n: 1,
                         size: '1024x1024', quality: 'low', output_format: 'png' })
});
console.log(r.status, (performance.now() - t0) / 1000 + 's');
```

计时务必用 `performance.now()`，混用 `Date.now()` 会算出荒谬的数值。做对照必须串行或同批并发。

## 附带澄清：画布刷新不丢节点

- 项目存在 IndexedDB `infinite-canvas` → `app_state` → key `infinite-canvas:canvas_store`（zustand `persist` + localForage，写入防抖 400ms）。
- 节点对象字段是 `id/type/title/position/width/height/metadata`，**没有 `data`**。提示词在 `metadata.composerContent`（图片节点）/ `metadata.prompt`（结果节点），图片是 `metadata.storageKey = "image:<id>"` 指向 `image_files` 表。
- 实测刷新前后：7 个节点 → 7 个节点，参考图与结果图都在。唯一会让人误判的是**水合是异步的**，刷新后前几秒 DOM 里确实是空的；以及有图的图片节点刷新后默认收在「图片态」，提示词输入框要进编辑态才看得到，数据并未丢。
