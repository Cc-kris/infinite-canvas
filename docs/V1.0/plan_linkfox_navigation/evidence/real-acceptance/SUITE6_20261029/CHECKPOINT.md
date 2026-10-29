
## 2026-10-29 案例同款接入（已完成代码改动）
- 案例素材：真实 API 抓取后下载 & sips 压缩到 1000px JPEG75，落盘 `web/public/__cases/<folder>/<id>-source.jpg|-r.jpg`（color-v2 13条 2.8M / product-image-suite 12条 3.3M / dress-wear-set 12条 3.0M）
- 数据：`web/src/features/tools/suite6-cases-data.ts`（COLOR_V2_CASES / PRODUCT_SUITE_CASES / DRESS_SET_CASES，含 apply.files/colorSubject/colors/ratio）
- color-v2.tsx：优秀案例 tab 由 10 个部位模板 → ToolCases 真实 13 条瀑布流（预览/原图/做同款）；applyCase=uploadCaseFiles→setSuiteIds/Records→patchDraft(assetIds)+caseApplyNonce 重挂载 upload 组件→回填 region+hex color plans
- suite.tsx：suite-panel-cases 占位文案 → ToolCases 12 条；applyCase→setSource+patchDraft+nonce
- dress-suite.tsx：无 tab 结构，改为结果区下方新增 `<Section title="优秀案例">` + 12 条 + applyCase（setRecords+patchDraft+nonce）
- 实机验证（localhost:3000 换色页）：点「做同款」→ 上传区出现 `linkfox-case-2069709136760979456-source.jpeg 41KB 569×639`，提示「已套用案例商品图，换色部位「上装」已回填」
- typecheck 通过（./node_modules/.bin/tsc）
- 已验证 tab：避免复用 1709629149（原站 type=69 API 标签，收尾要关）
