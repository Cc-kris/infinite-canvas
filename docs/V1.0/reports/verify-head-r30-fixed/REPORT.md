# 固定 HEAD 独立四闸验证（r30 · UI 诚实降级 + 媒体鉴权修复）

日期：2026-10-30
验证者：独立验证 worker（lf_r30_gate，DeepSeek；未改任何源码，未嵌套派工，未读取任何密钥）
仓库：`/Users/mac/Documents/Dev/infinite-canvas`，分支 `feat/linkfox-v1-real`

## 0. 结论

**PASS**。固定 HEAD `e7826acf` 已同时包含「UI 诚实降级」与「媒体取值鉴权修复」两个提交；
用 `git archive` 生成隔离快照，快照内全部 3874 个 blob 逐字节与 git 一致（含 `web/src` 416/416），
再从零安装依赖并跑四闸：**install 0 / typecheck 0 error / 全量单测 1556 pass·0 fail / build 0**。

一个 P2 级测试卫生问题（非产品缺陷）见第 6 节：`mock.module` 进程级污染会让「只挑两个文件一起跑」出现 1 条假失败，
全量套件与单文件运行均 0 fail。

## 1. 固定 HEAD 与前置条件

| 项 | 值 |
|---|---|
| 验证 PIN | `e7826acfe4620a91c7651dc160112b1dad13bd1e` |
| commit tree | `020c4d86e98fe1da4557c129c405c625b6dea2b9` |
| `web` tree | `3a03b1786207f3327eb6126a22626c68342863ad` |
| `web/src` tree | `c48eca4220a417b31bedacf257998f6211b6a094` |
| 文件数（blob） | 3874（r28 基线 3825，+49） |
| 分支持有 | `git merge-base --is-ancestor` 对 `73075698` / `a1f29d0c` / `e7826acf` 均返回 YES |

两个必需提交（均在本 PIN 祖先链上）：

| 提交 | 主题 | 变更 |
|---|---|---|
| `73075698` | feat(video-translation): 诚实降级 UI——标明 AI 重生成，非逐句翻译/口型对齐 | 6 文件 +455/−68 |
| `e7826acf` | fix(media-auth): 视频结果入库按原任务渠道补鉴权，修 401 API_KEY_REQUIRED | 8 文件 +518/−6 |

> 等待说明：验证开始时 HEAD 只有 `73075698`（UI 已落、鉴权未落），`lf_r29_media_auth` 仍在改
> `media-auth.ts`（未提交）。本轮按指示等待，13:49 该 worker 提交 `e7826acf` 并退出，随即以它为 PIN 开跑，
> 未退化为验证旧 HEAD。等待期间的可观测证据见 `logs/working-tree-status.txt` 与第 7 节。
>
> HEAD 位移：本报告自身的提交（仅 `docs/V1.0/reports/verify-head-r30-fixed/`，hash 见 `git log -1`）在 PIN 之后落盘，
> 故分支当前 HEAD 即该 docs 提交，`e7826acf` 仍是其祖先；本报告所有数字均来自 PIN（`e7826acf`）的 archive 快照，
> 与后续 docs 提交无关。

## 2. 隔离快照与源码 blob 核对

```
$ git archive --format=tar e7826acf > /tmp/icw-r30-head.tar
tar 大小   450,078,720 B
tar sha256 f2fb3cd43a737a4c903c75e3ed73254102f3b44d72ac929b77cb4b6519714f6f
解包文件   3874
```

blob 核对不是抽样，而是**全量重算**：对快照内每个文件按 git 的 `blob <len>\0<content>` 口径算 sha1，
与 `git ls-tree -r --full-tree <PIN>` 的 oid 逐个比对：

```
commit=e7826acfe4620a91c7651dc160112b1dad13bd1e
tree entries: 3874  blobs ok=3874 diff=0 missing=0
web/src blobs: ok=416 diff=0 missing=0
non-blob entries: 0
RESULT: PASS
```

即：快照与 PIN **零字节差异、零缺失**；`web/src` 416 个文件（r28 为 411，+5）全部对上。
关键文件 blob 指纹（与 PIN 绑定，可直接复核）：

```
b6309a80e9929d8a23eea530de595aec4c201cbb  web/src/services/media-auth.ts
7e108f35bd2aa137e619ec2930a11c83615f9aac  web/src/services/media-auth.test.ts
ec7cb129092ce463a4599e3a2f4923b8039abb2f  web/src/stores/use-tool-task-store.ingest-auth.test.ts
e228bb2762bb9bd30f39c6320d80946fb6c06ef6  web/src/components/tools/workspaces/video-translation-honesty.tsx
20639d258824594a16caea2b9bbbbcbeb5e35024  web/src/components/tools/workspaces/video-translation-honesty.test.tsx
a77348da75d8786f48de662443790dc2f5c61221  web/src/services/file-storage.ts
1414723d8fa4fee6e9c3ef573b47f0ef1a9ec9b4  web/src/stores/use-tool-task-store.ts
bf19d37ac1e9bee67c8023ccdfe4047480eae1d1  web/src/services/api/tools/result-assets.ts
```

环境：macOS（Apple Silicon），bun `1.4.2`（`/Users/mac/.bun/bin/bun`），node `v26.11.0`。
所有命令在 `/tmp/icw-r30-head/web` 内执行，**不读写工作区 `node_modules`、不受未提交改动影响**。

## 3. 四闸结果

| # | 闸门 | 命令 | exit | 结果 | 耗时 |
|---|---|---|---|---|---|
| 0 | 全新安装 | `bun install --frozen-lockfile` | **0** | 931 packages，node_modules 701M | 3.81s（real 3.93s） |
| 1 | typecheck | `bun run typecheck`（`tsc --noEmit`） | **0** | **0 error** | 90.2s |
| 1b | 非空跑证明 | `node_modules/.bin/tsc --noEmit --listFiles --incremental false` | **0** | **3449** 行程序清单，命中 `web/src` **415** 个文件 | 后台完成 |
| 2 | 全量单测 | `bun test` | **0** | **1556 pass / 0 fail / 0 skip**，92 文件，8586 `expect()` | 9.55s（复跑 12.15s 仍 0 fail） |
| 3 | build | `bun run build`（`vite build`） | **0** | **8833 modules**，443 产物 / 37M | 2m38s |

补充口径：

- `dist/assets/index-n92QGR0f.js` = 5,630,976 B；`dist/index.html` = 1050 B；产物清单 `logs/dist-files.txt`（443 行）。
- build 只有 vite 的「chunk > 500 kB」常规提示，无 error/warning 失败项。
- typecheck 的 415 vs `web/src` 416 差 1，与 r28 同因：`src/styles/globals.css` 不被 tsconfig 的
  `include: ["src/**/*.ts","src/**/*.tsx"]` 匹配，属口径差；`--listFiles` 3449 行本身即「非空跑」反证。

## 4. 能力验证（两个提交是否真的生效）

### 4.1 UI 诚实降级（73075698）

- 新增 `video-translation-honesty.tsx`(125 行) + 同名测试(152 行)；工作台 `video-translation.tsx` 变更 +123/−67；
  中英 i18n 各 +27 行（`git show --numstat 73075698` 可复核）。
- 定向 7 条断言全 pass：面板固定展示「AI 视频重生成，非逐句翻译 / 口型对齐；真实翻译通道未接入」；
  源/目标语言标注「仅影响提示词」；口型同步 `aria-checked=false` 且置灰；输出数量标注仅 1 条；
  整页不出现「翻译完成/已译制/已对口型/已生成字幕/已识别源语言」等承诺；工具入口与历史任务保留；英文界面同样无 dub 承诺。
- 产物侧复核：`dist` 中 `AI 视频重生成` 命中 3 次、`非逐句翻译` 命中 2 次（`logs/` 可复算），说明文案进了真实 bundle 而非仅测试桩。

### 4.2 媒体取值鉴权（e7826acf）

- 新增 `media-auth.ts`(124 行)：按任务快照（`model`/`channelId`，**不存凭据**）回查当前配置里的原渠道，只在
  「同 origin + 渠道 API 路径前缀」下发 `Authorization: Bearer <key>`；公网/CDN、同域非 API 路径、`blob:`/`data:`、
  渠道缺失、渠道无 key 一律不带；gemini 渠道走 query 不走 Bearer。
- 接入三处真实链路：`file-storage.fetchMediaBlob`/`StoreMediaOptions` 支持 `headers` 透传；
  `use-tool-task-store.ingestResultMedia` 按快照补头；`result-assets` 的「保存到资产库」「发送到画布」按 `ctx.taskId` 反查补头。
  并收紧 `api/video.ts`：原先对任意结果 URL 都挂 `aiHeaders`（公网也会漏 key），改为仅渠道 API URL 带。
- 定向 11 条断言全 pass，其中包含**真起本地 HTTP server、真跑 fetchMediaBlob** 的端到端用例：
  匿名 GET → 401；带任务渠道头 → 200，且返回字节与源字节逐字节相等；server 侧实际收到头部序列为 `[null, "Bearer …"]`。
- `ingestResultMedia` 3 条链路断言 pass（渠道 content 地址带 Bearer / 公网 CDN 不带 / 结果面板保存同样带）。
- 泄露面复核：`dist` 内测试 key 字面量命中 **0**；`logs` 里 `sk-[a-z0-9]{8}` 的 3 处命中经核查均为文件名子串
  （`disk-recovery`、`disk-snapshot`、`disk-degenera…`），非真实凭据。
- 说明：bundle 经 minify 后函数名不存在（`taskMediaHeaders` 等在 `dist` 命中 0），故**不以符号名 grep 作为证据**，
  以行为测试 + blob 指纹为准。

## 5. 与 r28 基线对比

| 指标 | r28（c17890c3） | r30（e7826acf） | Δ |
|---|---|---|---|
| blob 总数 | 3825 | 3874 | +49 |
| `web/src` 文件 | 411 | 416 | +5 |
| 单测用例 | 1535 / 89 文件 | **1556 / 92 文件** | +21 用例 / +3 文件 |
| `expect()` | 8520 | 8586 | +66 |
| build modules | 8831 | 8833 | +2 |
| dist 产物 | 443 | 443 | 0 |

`+21` 用例恰好来自新增三个测试文件（media-auth 11 + ingest-auth 3 + honesty 7 = 21）。

> 差异说明：`lf_r29_media_auth` 自报 1560 pass。该数字包含主工作区**未提交**的语言契约改动
> （`adapters/video-translation.test.ts` 里 +4 个 test），不在 HEAD 内；本报告的 1556 才是 PIN 的真实值。
> 这也反向证明「按 archive 快照验证」是必要的。

## 6. 风险与未覆盖

1. **P2 · 测试隔离缺陷（非产品缺陷，未修，交由源码 owner）**
   `use-tool-task-store.ingest-auth.test.ts` 用 `mock.module("@/services/file-storage", …)` 提供**部分**导出
   （`uploadMediaFile/getMediaBlob/resolveMediaUrl/setMediaBlob/listTaskResultMedia`，缺 `fetchMediaBlob`）。
   bun 的 `mock.module` 是进程级全局，故：
   - 单跑 `bun test src/services/media-auth.test.ts` → 11 pass / 0 fail（连跑 2 次稳定）；
   - 但把该文件与 ingest-auth 测试**放同一进程**跑 → 1 fail，报
     `fetchMediaBlob is not a function`（media-auth 那条「真实 HTTP 链路」用例拿到的 `file-storage` 是 mock）；
   - 全量 `bun test` → 0 fail（文件加载顺序使真模块先入缓存）。
   结论：现有全量闸门是绿的，但这是「顺序侥幸」。建议 owner 在 `mock.module` 之后加 `afterAll(() => mock.restore())`，
   或让 mock 工厂 `...realFileStorage` 透出未桩的导出，避免将来挑文件跑/并行分片时出现假红。
   **后续（PIN 之后发生，不改变本次结论）**：验证结束时有并发 worker 已在主工作区给出同类修法（工厂里
   `...await import("@/services/file-storage")` 透出真实导出，未提交）。我在 `/tmp/icw-r30-probe`（快照副本 + 该补丁文件，
   node_modules 软链）复跑同一条命令，结果 **14 pass / 0 fail**，反向证明根因判断正确、修法有效。
2. **E2E 真实上游未跑**：本报告只做 HEAD 四闸 + 定向能力断言，不是验收。401 修复由「本地真 HTTP server + 真
   `fetchMediaBlob`」用例与单测覆盖，**未**对真实 sub2api 生成任务复跑（凭据与上游配额不在本次验证范围，且明确禁读密钥）。
3. 未提交改动按设计排除：主工作区仍有语言契约 WIP（`adapters/video-translation.{ts,test.ts}` 等），
   本快照不含、本报告不评。

## 7. 复现步骤

```bash
# 1) 固定 HEAD 并核对祖先
cd /Users/mac/Documents/Dev/infinite-canvas
PIN=e7826acfe4620a91c7651dc160112b1dad13bd1e
git merge-base --is-ancestor 73075698 $PIN && git merge-base --is-ancestor e7826acf $PIN
git rev-parse $PIN^{tree} $PIN:web $PIN:web/src

# 2) 隔离快照 + 全量 blob 核对
git archive --format=tar $PIN > /tmp/icw-r30-head.tar
mkdir -p /tmp/icw-r30-head && tar -x -C /tmp/icw-r30-head < /tmp/icw-r30-head.tar
python3 /tmp/icw-r30-tools/blob_verify.py "$PWD" $PIN /tmp/icw-r30-head

# 3) 四闸（快照内，全新依赖）
export PATH="/Users/mac/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd /tmp/icw-r30-head/web
bun install --frozen-lockfile
bun run typecheck
node_modules/.bin/tsc --noEmit --listFiles --incremental false | wc -l
bun test
bun run build
```

## 8. 证据清单（logs/）

| 文件 | 内容 |
|---|---|
| `archive-sha256.txt` | tar 大小与 sha256 |
| `blob-verify-head.txt` | 3874/3874 与 416/416 blob 核对输出（RESULT: PASS） |
| `working-tree-status.txt` | 验证时主工作区 git status + 最近 5 条提交（证明未提交改动被排除） |
| `gate0-install.log` | 931 packages 安装输出与耗时 |
| `gate1-typecheck.log` | typecheck 输出、耗时、`typecheck_exit=0` |
| `gate1b-tsc-listfiles.log` | 3449 行程序文件清单（非空跑证明） |
| `gate2-bun-test.log` | 全量单测输出（1556 pass / 92 files / 8586 expect） |
| `gate2b-targeted-tests.log` | 三文件定向运行：20 pass / 1 fail（`fetchMediaBlob is not a function`，即第 6.1 条） |
| `gate3-build.log` | vite 输出（8833 modules）与耗时 |
| `dist-files.txt` | 443 个产物清单 |
