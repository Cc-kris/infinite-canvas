## 安装（macOS）

- 下载 `Infinite-Canvas-<版本>-mac-arm64.dmg`（Apple 芯片）或 `-mac-x64.dmg`（Intel）。
- 打开 DMG，把 **Infinite Canvas** 拖进「应用程序」。
- 首次启动若提示「无法打开，因为无法验证开发者」，在「系统设置 → 隐私与安全性」点「仍要打开」；
  或用终端执行一次：

  ```bash
  xattr -cr "/Applications/Infinite Canvas.app"
  ```

## 安装（Windows）

- 下载 `Infinite-Canvas-Setup-<版本>-x64.exe`。
- 运行安装包；SmartScreen 提示「Windows 已保护你的电脑」时点「更多信息 → 仍要运行」。
- 安装向导第二步可以**自选安装位置**（默认 `%LOCALAPPDATA%\Programs\Infinite Canvas`），也可改为按机器安装。
