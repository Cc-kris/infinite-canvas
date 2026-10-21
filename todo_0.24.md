# infinite-canvas 0.24 待办（用户 2026-10-21 提出）

1. [ ] Windows 点击更新：不要再走安装向导（选择给谁装/装哪），直接静默覆盖到原位置并重启
   - 根因：desktop/main.js `launchInstaller()` 里 win32 分支 `spawn(filePath, [])` 无参数
   - 方案：quit 后 spawn `["/S", "--force-run"]`；NSIS 模板静默模式会用注册表 InstallLocation 覆盖安装，`--force-run` 才会装完自启
2. [ ] Agent 面板去掉「方式一 / 方式二」旧文案（web/src/components/agent/agent-connect-view.tsx + i18n pluginTitle/directTitle/pluginText/directText/pluginReminder*）
3. [ ] 应用内 logo 还没换（build/icon.icns 只影响 Dock/安装包，界面里是 web 资源）
4. [ ] 三张卡都提示「安装 CLI」但本机已装；要加桌面端探测；点连接应真正装插件并连通，不是只列出来
5. [ ] 左上角还残留「文件」菜单，以及那一条空白行要去掉

## 已完成（0.23 已发布）
- Release desktop-v0.23.0（mac arm64/x64 dmg + win setup）
- 三卡连接、打包版版本号/Codex 启动修复、v2 图标、CI 补 build:agent
