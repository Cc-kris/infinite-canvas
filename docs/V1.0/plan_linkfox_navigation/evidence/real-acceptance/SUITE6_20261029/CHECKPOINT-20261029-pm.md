# suite6 接管（2026-10-29 下午）执行记录

## 已提交
- `e352c97 feat(tools/suite6): 换色/裁剪/套装/试衣/放大/扩图/POD/修色对齐原站（优秀案例做同款 + 上传区样式）`
  - 12 文件：workspaces/{color,crop,dress,dressing,enhance,enhance.test,outpaint,pod,pod.test,repair}.tsx、
    components/tools/tool-asset-input.tsx（新增 dropLabel / thirdAction，仅 suite6 使用）、
    features/tools/case-apply.ts（新增，案例素材真实入库；被已提交的 color-v2/suite/dress-suite 引用）
  - 提交时未带任何 LinkFox 全局模块（无积分/个人中心/学习中心/促销条/顶栏改动）；help-dock、replace、scene-fission 等属其他 worker，未 stage。

## 验证
- `./node_modules/.bin/tsc --noEmit` → exit 0
- `bun test`（web/）→ 1374 tests，1371 pass；3 fail 全部是 `tests/*.spec.ts`（Playwright e2e 被 bun test 误收集），
  与 suite6 无关，改动前即如此；suite6 子集（color/enhance/outpaint/pod/suite）23 pass。
- 环境坑：本机 code_run 的 bash PATH 只有 /usr/bin:/bin:/usr/sbin:/sbin，
  必须 `export PATH="$HOME/.bun/bin:/opt/homebrew/bin:$PATH"` 才能用 bun/node/tsc。

## 工作树归类（未提交、属他人，勿动）
- help-dock.tsx + tool-page.tsx（HelpDock）、replace.tsx、scene-fission.tsx、registry/product-scene.ts、registry/replace-goods.ts、
  adapters/product-scene.test.ts、docs 下其他 evidence 目录、项目根 *.json（原站 API dump）、.worker-* 目录。
