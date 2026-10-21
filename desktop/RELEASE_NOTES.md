# 无限画布 桌面版（无需签名）

安装包未做代码签名，首次打开会被系统拦截，按下面的方式放行即可。

## macOS

- 下载 `Infinite-Canvas-<版本>-mac-arm64.dmg`（Apple 芯片）或 `-mac-x64.dmg`（Intel）。
- 打开 DMG，把 **Infinite Canvas** 拖进「应用程序」。
- 首次启动若提示「无法打开，因为无法验证开发者」，在「系统设置 → 隐私与安全性」点「仍要打开」；
  或用终端执行一次：

  ```bash
  xattr -cr "/Applications/Infinite Canvas.app"
  ```

## Windows

- 下载 `Infinite-Canvas-Setup-<版本>-x64.exe`。
- 运行安装包；SmartScreen 提示「Windows 已保护你的电脑」时点「更多信息 → 仍要运行」。
- 安装向导第二步可以**自选安装位置**（默认 `%LOCALAPPDATA%\Programs\Infinite Canvas`），也可改为按机器安装。

## 这一版有什么

- **本地 Agent 一键连接**：右侧 Agent 面板的「连接设置」变成三张卡 —— Claude Code、Codex、Galley，
  各自显示是否已安装、装的哪个版本。点「连接」即可，桌面端会在后台拉起内置的 agent 服务并完成握手，
  不用再手填地址和 token；原来的手动填写收进「高级」折叠里作兜底。
- 选中的运行时会记下来，重启后仍然生效；想换一个，直接在另一张卡上点「连接」。
- 顶部菜单栏的「编辑 / 视图 / 窗口」已移除，右上角的文档入口也一并去掉。
- 生图工作台与视频工作台的选中框改为橙色高亮，跟画布主题统一。
- **应用图标与界面 logo 统一（0.25.1 修正）**：安装包里的 macOS `.icns` 和 Windows `.ico` 都改成与界面同一张 v2 图，
  满幅绘制、去掉原先 10% 的内缩留白，Dock / 任务栏 / 开始菜单显示的就是画布顶部那个 logo。
- 打包版两处稳定性修复：内置 agent 不再把版本号读成 `0.0.0` 并误报「有新版本」；
  连接 Codex 时不再因为找不到入口模块而启动失败。
- 画布数据仍保存在本地（IndexedDB），WebDAV 同步、提示词库等功能与网页版一致。
