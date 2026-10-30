# media-auth「真实 HTTP 链路」定向跑失败：复现定位报告（R30 后）

- 日期：2026-10-30
- 分支：`feat/linkfox-v1-real`（共享工作树 HEAD `e1fe463a`）
- 被审计基线：R30 固定 HEAD `e7826acfe4620a91c7651dc160112b1dad13bd1e`，隔离快照 `/tmp/icw-r30-head`（`blob-verify-head.txt`：tree entries 3874 / blobs ok=3874 diff=0）
- 原始证据（只读，未改动）：`/tmp/icw-r30-logs/gate2b-targeted-tests.log`、`/tmp/icw-r30-logs/gate2-bun-test.log`、`/tmp/icw-r30-logs/gate1-typecheck.log`
- 运行时：`bun 1.4.2 (744846f84)`（`/Users/mac/.bun/bin/bun`，与 R30 日志同版本）

## 0. 结论先行

1. **不是产品缺陷**。失败的测试压根没跑到被测逻辑：它拿到的 `fetchMediaBlob` 是 `undefined`，报错为
   `fetchMediaBlob is not a function. (In 'fetchMediaBlob(url, { timeoutMs: 5000 })', 'fetchMediaBlob' is undefined)`，
   而不是 401/超时/连接被拒。本地 server 用 `port 0`（内核分配），不存在端口冲突；断言失败点是被吞掉异常后拼出的
   `anonymousError` 里没有 "401"。
2. **不是随机 flake，而是测试隔离缺陷（确定性、与「怎么跑」强相关）**：`use-tool-task-store.ingest-auth.test.ts`
   用 `mock.module("@/services/file-storage", ...)` 注册了一个只含 5 个导出的替身；bun 的 `mock.module` 是**进程级**的，
   在多文件同进程运行时会让别的测试文件 import 到的 `@/services/file-storage` 缺少 `fetchMediaBlob`。
   定向（显式指定 2 个文件）时该 mock 先于 `media-auth.test.ts` 的首次 import 生效 → 1 fail；
   全量 92 文件跑时该 specifier 已被更早的文件实例化为真实模块 → mock 未接管 → 1556/1556 全绿。
   同一份代码，**换个跑法就红/绿互换**，这本身就是必须修掉的测试缺陷。
3. 修复：在共享仓库做**最小稳定化**（只改测试装置，`+6` 行，**未删除任何断言、未改动任何被测源码**），
   回归：定向 6/6、相关 6 文件 78/78 ×3、全量 1560/1560 ×3、`tsc --noEmit` 0 error。

## 1. 复现矩阵（先复现，再定性）

在 `/tmp/icw-r30-head` 的**副本** `/tmp/icw-repro/web` 上做（`node_modules` 软链到快照），保证 R30 快照与日志零改动。

| # | 跑法 | 次数 | 结果 |
|---|---|---|---|
| A | `bun test src/stores/use-tool-task-store.ingest-auth.test.ts src/services/media-auth.test.ts`（与 R30 日志同序） | 3 | **3/3 fail**（同一测试、同一报错） |
| B | 同样两文件，**参数顺序反转** | 2 | **2/2 fail** |
| C | `bun test src/services/media-auth.test.ts` 单跑 | 3 | 3/3 pass（11 tests） |
| D | `bun test src/stores/use-tool-task-store.ingest-auth.test.ts` 单跑 | 1 | pass（3 tests） |
| E | 全量 `bun test`（92 文件） | 2 | **1556/1556 pass**，含 `(pass) 真实 HTTP 链路…`（与 R30 日志一致） |

- 参数顺序反转仍然失败，说明**不是「谁在命令行里排前面」**，而是 bun 的文件评测顺序。
- 加探针文件 `zz-probe.test.ts` 实测（日志打点，scratch 内）：
  - 定向模式：`[LOAD] ingest-auth evaluated at 18~91ms` → `registers mock at 18~92ms`，**probe 文件在 173~367ms 才被评测**，
    此时 `typeof fetchMediaBlob === "undefined"`。**两种参数顺序下 ingest-auth 都最先被评测**（bun 的加载顺序与 CLI 顺序无关）。
  - 全量模式：mock 在 362ms 注册，probe 在 485ms 看到 `typeof fetchMediaBlob === "function"` —— 即该 specifier 早已被
    更早的文件实例化为真实模块，mock 没能接管。

### 1.1 逐项排除

| 假设 | 判定 | 依据 |
|---|---|---|
| 时序/竞态（等待、超时） | **排除** | 3+2 次确定性失败，同一行、同一报错；单跑必绿 |
| 端口冲突 | **排除** | 测试用 `server = Bun.serve({ port: 0 })` 后读 `server.port`，内核分配；且失败信息不是 ECONNREFUSED |
| 环境/依赖脏（node_modules） | **排除** | 同一 `node_modules`、同一 bun 版本；全量跑同一棵树全绿 |
| 产品缺陷（鉴权头拼错 / 401 逻辑） | **排除** | 失败时函数是 `undefined`，根本没发出请求；`taskMediaHeaders` 单独断言那一行在失败前的用例里全绿 |
| 测试隔离（mock 泄漏） | **成立** | 见 §2：`mock.module` 是唯一的跨文件污染源，展开真实模块后 100% 转绿 |

## 2. 根因

`web/src/stores/use-tool-task-store.ingest-auth.test.ts:35`（R30 HEAD 原样）：

```ts
mock.module("@/services/file-storage", () => ({
    uploadMediaFile: ..., getMediaBlob: ..., resolveMediaUrl: ..., setMediaBlob: ..., listTaskResultMedia: ...,
}));   // 只给 5 个桩，而模块有 12 个运行时导出（源文件 16 个 export，含 4 个 type-only）
```

- `src/services/file-storage.ts` 真实导出含 `fetchMediaBlob`（`media-auth.test.ts` 的核心被测函数）。
- 该 `mock.module` 是 **src 下唯一一处** `mock.module` 调用（`rg -n 'mock\.module' web/src` 全仓库仅 1 处）。
- bun 的 `mock.module` 注册在**进程级模块表**，因此 `media-auth.test.ts` 里
  `import { fetchMediaBlob }` 拿到的是替身模块的 `undefined`，运行时炸成 `not a function`。
- 触发条件是「谁先实例化 `@/services/file-storage`」：定向跑时 mock 抢先（ingest-auth 最先评测），全量跑时真实模块抢先 → 红绿互换。

**定性**：`media-auth.test.ts`（R30 的 D1 真实链路回归，用真实 `Bun.serve` + 真实 `fetchMediaBlob`）本身没问题 ——
断言完整、走真链路；问题在**另一个测试文件**用不完整的 mock 污染了同进程的其他文件。这属于测试装置缺陷，
按任务约定走「最小稳定化」路径，不删断言、不改产品代码。

## 3. 修复（最小稳定化，+6 行）

`web/src/stores/use-tool-task-store.ingest-auth.test.ts`：

```ts
// bun 的 mock.module 是进程级、跨测试文件生效的：工厂里只写 5 个桩会让同一进程里
// 其它测试文件 import 到的 file-storage 缺 export（media-auth.test.ts 的 fetchMediaBlob
// 会变成 undefined）。所以先取真实模块，只覆盖需要桩的函数，其余导出原样透出。
const realFileStorage = await import("@/services/file-storage");

mock.module("@/services/file-storage", () => ({
    ...realFileStorage,          // ← 透出全部真实导出，mock 只覆盖下面 5 个
    uploadMediaFile: ...,
    ...
}));
```

- 断言：**0 删除、0 修改**（`git diff` 只有 6 行新增）。
- 产品源码：**0 改动**。
- 桩仍然生效（关键验证）：该文件 3 个用例依赖 `captured` 数组被**替身**的 `uploadMediaFile` 填充
  （真实实现只写 IndexedDB、绝不会 push），修复后 3/3 仍通过且 `expect(captured).toHaveLength(1)` +
  `expect(captured[0].options?.headers).toEqual({Authorization:"Bearer sub2-key"})` 精确命中
  → 替身没有被「展开真实模块」冲掉，断言强度不变。
  补充观察（不影响结论）：把替身临时改成在其入口 `throw` 时用例仍绿，说明被测代码会吞掉上传异常并按失败路径记账；
  因此「绿」并非由异常吞没造成，`captured` 的填充才是有效证据。该 sentinel 实验只在 scratch 副本做过，未进入提交。

## 4. 回归证据（共享仓库 `feat/linkfox-v1-real`）

| 项 | 结果 |
|---|---|
| 定向（日志同序）×3 | 14 pass / 0 fail ×3 |
| 定向（反序）×3 | 14 pass / 0 fail ×3 |
| `media-auth.test.ts` 单跑 | 11 pass / 0 fail |
| `ingest-auth.test.ts` 单跑 | 3 pass / 0 fail |
| 相关 6 文件（media-auth / ingest-auth / result-assets / batch-runner / tool-result-actions.asset-meta / media-publish）×3 | 78 pass / 0 fail ×3 |
| 全量 `bun test`（92 文件，含本次 WIP 的 video-translation 用例）×3 | **1560 pass / 0 fail** ×3 |
| `tsc --noEmit`（`bun x tsc --noEmit`） | exit 0，0 error |

（R30 日志侧 `gate1-typecheck.log`：`tsc --noEmit` 90.2s exit 0；`gate2-bun-test.log`：1556 pass / 0 fail，92 文件。）

## 5. 风险与遗留

1. **bun 的 `mock.module` 仍是进程级**：以后任何测试文件再写 `mock.module`，都必须「展开真实模块 + 只覆盖需要的导出」，
   否则同样的跨文件污染会重演。建议后续在 CI 加一条「定向跑关键测试文件对」的门禁（本次的 2 文件对就是最小样本）。
2. 全量跑之所以一直是绿的，是因为加载顺序碰巧让真实模块先实例化 —— **绿是偶然，红是必然**，不能以全量绿作为该链路的唯一保证。
3. 本次只在测试装置层稳定化，未改动 `media-auth.test.ts` 的断言与真实 HTTP 链路；也未触碰 R30 日志/快照。
4. 工作树里 `web/src/features/tools/adapters/video-translation.ts|.test.ts`、`project_memory.md` 的未提交 WIP **未 stage、未改动**。

## 6. 复现入口

```bash
cd /Users/mac/Documents/Dev/infinite-canvas/web
BUN=/Users/mac/.bun/bin/bun
# 修复前（用 R30 快照副本）：红
$BUN test src/stores/use-tool-task-store.ingest-auth.test.ts src/services/media-auth.test.ts
# 修复后：绿（两种顺序都应绿）
$BUN test src/stores/use-tool-task-store.ingest-auth.test.ts src/services/media-auth.test.ts
$BUN test src/services/media-auth.test.ts src/stores/use-tool-task-store.ingest-auth.test.ts
$BUN test && $BUN x tsc --noEmit
```
