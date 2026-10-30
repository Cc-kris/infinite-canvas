# 8 工具文案对齐 — 进展记录 (2026-10-30)

## 自检命令
cd /Users/mac/Documents/Dev/infinite-canvas/.verify-tools/frontend-diff
node verify1.mjs <TOOL> && python3 check1.py <TOOL>

## 已完成 缺失0/多余0 (6/8)
IMAGE_TRANSLATION、AI_DRESSING_XSY、SCALE_UP、VIDEO_CONCAT、AI_POSTURE、REPLACE_GOODS

改动文件（web/src/…）：
- components/tools/workspaces/dressing-xsy.tsx  (nav 条 + details 折叠向导 + 上下装)
- components/tools/workspaces/enhance.tsx        (nav 条 + 对比卡 + Section p-2)
- components/tools/workspaces/video.tsx          (AiVideoFamilyNav showDriver；拼接页文案/actions={false})
- components/tools/tool-history-dock.tsx         (hideWhenEmpty) + features/tools/tool-page.tsx
- components/tools/workspaces/model.tsx          (AI_POSTURE 镜像块 + details 折叠)
- components/tools/workspaces/replace.tsx        (REPLACE_GOODS 镜像块含 nav/快捷键/水印 + details 折叠)

## 未完成
IMAGE_TO_VIDEO（缺16/多5）、SCENE_TRANSFER（原站无 DOM，唯一文本是说明备注）

## 关键坑
1. JSX 属性区写 /* */ 注释 → 编译失败 → 整页空白 (verify 显示 els=0)
2. 改结构后先 `./node_modules/.bin/esbuild --loader=tsx --jsx=automatic < file` 校验标签配对
3. verify1 偶发 els=0，重跑一次通常正常
4. 仓库测试用 bun:test，`npx vitest run` 全失败属正常，与改动无关
5. 统计口径：主内容框 x>209, y 57..822；超出视口算缺失；裸文本节点不抓 → 需包 <span>
