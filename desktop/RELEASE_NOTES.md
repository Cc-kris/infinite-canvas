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

## 这一版有什么

- 桌面版内置本地转发代理：启动应用时会自动检查 `127.0.0.1:23210` 是否已有代理在跑，
  需要时随程序一起启动，无需再手动 `npx @basketikun/canvas-proxy`。
- 配置弹窗里的「本地代理」页签已移除，桌面版始终经内置代理访问模型服务。
- 画布数据仍保存在本地（IndexedDB），WebDAV 同步、提示词库等功能与网页版一致。
