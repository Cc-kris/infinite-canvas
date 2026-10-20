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

- 版本更新弹窗新增「立即更新」按钮：桌面版点一下就会下载当前平台的安装包并唤起安装程序，
  浏览器版则跳转本仓库 Release 页手动下载。
- 版本检查与更新来源改为本项目仓库（`Cc-kris/infinite-canvas`）的 Releases，
  显示的当前版本号就是实际安装的版本。
- Windows 安装过程支持选择安装目录与安装范围。
- 桌面版内置本地转发代理：启动应用时会自动检查 `127.0.0.1:23210` 是否已有代理在跑，
  需要时随程序一起启动，无需再手动起代理。
- 配置弹窗里的「本地代理」页签已移除，桌面版始终经内置代理访问模型服务。
- 画布数据仍保存在本地（IndexedDB），WebDAV 同步、提示词库等功能与网页版一致。
