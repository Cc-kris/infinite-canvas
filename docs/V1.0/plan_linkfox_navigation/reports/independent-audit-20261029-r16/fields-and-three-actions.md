# r16 · PIS / I2V / VIDEO_TRANSLATION / VIDEO_CONCAT 字段与三动作对账

日期：2026-10-29　仓库基线 HEAD：`2e0bb42`（feat/linkfox-v1-real）

> 本报告只汇总**已落库的真实回执**，不重跑上游、不注入数据。每条结论都指到可复核文件与字段。
> worker `lf_pis_i2v_fields` 退出时未留下未提交文件：I2V 部分已在 `a087ce4`（r14 证据）+ `2e0bb42`（r15 修复）提交；PIS/VT/VC 回执此前已入库，本次仅核对。

## 1. 字段（wire 级）对账

| 工具 | 判定 | 依据 |
|---|---|---|
| IMAGE_TO_VIDEO | **PASS（请求体已捕获）** | `reports/independent-audit-20261029-r14/receipt-image-to-video.json` → `net[0]`：`POST .../v1/videos`，字段 `model / prompt / seconds / size / resolution_name / generate_audio / watermark / mode / images[]` |
| PRODUCT_IMAGE_SUITE | **PARTIAL** | 只有本地配置与结果回执：`PRODUCT_IMAGE_SUITE/01-net.json`（`request.kind/count/source` 为本地记录）、`r12-task-record.json`（`configSnapshot`: `apiFormat/capability/channelId/count/model/quality/size`）。**未捕获上行请求体**，`docs/V1.0/assets/09-tool-schemas.md` 中 type=71 顶层字段 `imageUrl / outputNum` 无法逐条对齐 |
| VIDEO_TRANSLATION | **PARTIAL** | `VIDEO_TRANSLATION/run-real.json` 的 `network` 仅保留响应（首次 400 `'utf-8' codec can't decode byte 0xe8`，重试 200 → `task_DPYuSe6RoixDbhaD8K97vDBoMu2X1xeR`），**无请求体**；type=96 的 7 个顶层字段（`lipSync/outputNum/sourceLanguage/sourceVideoName/sourceVideoUrl/targetLanguage/videoType`）无法逐条比对 |
| VIDEO_CONCAT | **PARTIAL** | `VIDEO_CONCAT/run-concat.json`：`calls: []`，`network` 只有响应体；type=52 字段同理无法逐条比对 |

I2V 真实请求体实测值（原样取自上文件）：
```
model=MiniMax-H3, seconds="5", size="1280x720", resolution_name="768p",
generate_audio=true, watermark=false, mode="reference",
images=["data:image/jpeg;base64,..."]
```
与 UI 表单维度（时长 5s / 768P / 自适应 / 英语）一一对应，无字段丢失或错位。

## 2. 三动作结果（下载 / 存资产 / 发画布）

| 工具 | 下载 | 存资产 | 发画布 | 判定 |
|---|---|---|---|---|
| PRODUCT_IMAGE_SUITE | 2151517B `product-image-suite-result-1.png` | 资产库 `UYp_dv-uc0hSomtg1eSDm`，0→1，2151517B | 画布 `65yYmm9rIsyZ39-8AC64-`，1 image 节点，2151517B | **PASS**（沿 `bytesMatch.same=true`；`PRODUCT_IMAGE_SUITE/b4-actions.json`） |
| IMAGE_TO_VIDEO | 1266723B `ftyp` sha256 `fe5c85f8…8c091a524` | 已保存到资产库 | 画布 `ZEMIi3QSB_NHNU5bOYx3L`，IDB 项目 1 video 节点 | **PASS**（本次复算 `r14/i2v-result.mp4`：1266723B，sha256 与回执一致） |
| VIDEO_TRANSLATION | 1080637B `ftyp`，`matchesResultBytes=true` | 资产库 `B6d0Tr3H2GZ6MNBYXIe09` | 画布 `C62Iwwjc0E4NP9TcXH7C_` | **PASS**（`run-resume-translation.json`：reload 历史 1 条 `matched=true`，`task-mvth8drs-dk86it` succeeded） |
| VIDEO_CONCAT | 2133234B `ftyp`，`matchesResultBytes=true` | 资产库 `NCM6l4cDKtyL6cz6o67OG` | 画布 `ce14D3JIahdvNNuS173zT` | **PASS**（`run-resume-concat.json`：reload 历史 1 条命中，`task-mvthgaa4-pdg1eq` succeeded） |

注：VT/VC 回执 `actions.save.assets.count=0`（按 video 类型查询为空），但 `feedback` 给出资产 id 且下载/画布字节与结果一致——按回执原样记录，不推断。

## 3. 质量门

```
web$ node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit   → exit 0（0 error）
web$ bun test src/components/tools/tool-result.test.tsx \
              src/features/tools/image-to-video-cases.test.ts \
              src/features/tools/adapters/image-to-video.test.ts
      → 60 pass / 0 fail / 333 expect()（3 files）
```
环境：`bun 1.4.2` 位于 `~/.bun/bin`（不在默认 PATH）；`npx` 不存在。

## 4. 缺口与风险（如实 PARTIAL）

1. **字段级证据缺口**：PIS / VT / VC 的上行请求体无任何存量回执，因此「表单字段 → 上游字段」仅能靠代码推断，不算真实回执证据。补齐需各工具再真实提交一次并抓请求体。
2. **I2V 二次刷新**：`receipt-image-to-video.json` 中 `panel.afterReload2` 的 `download/save/canvas` 均 `exists:false`、`video:null`；首次 reload（`afterReload`）三项均存在。二次连续刷新后结果面板未重建，属残留问题，本次未修。
3. 未纳入本组提交的脏文件：`reports/independent-audit-20261029-r9/matrix.{json,md}`、`project_memory.md`（其他 worker 改动，来源未确认，不动）。

## 5. 复核入口

- I2V：`docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029-r14/{receipt-image-to-video.json,i2v-result.mp4,report.md}`、`...-r15/findings.md`
- PIS：`.../evidence/real-acceptance/PRODUCT_IMAGE_SUITE/{b4-actions.json,01-net.json,r12-task-record.json}`
- VT：`.../evidence/real-acceptance/VIDEO_TRANSLATION/{run-real.json,run-resume-translation.json}`
- VC：`.../evidence/real-acceptance/VIDEO_CONCAT/{run-concat.json,run-resume-concat.json}`
