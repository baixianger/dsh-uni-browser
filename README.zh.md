# dsh-uni-browser

[English](README.md) | [简体中文](README.zh.md)

> 为 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) 提供可持久化、可命名的浏览器配置，由本地 [uni-browser](https://github.com/baixianger/uni-browser) daemon 驱动。

`dsh-uni-browser` 让用户在 DSH 设置中管理独立的 Chromium 或 Camoufox 配置，
手动登录一次后保留本地 Cookie、localStorage 和 IndexedDB，同时让 Agent 通过可审计的动作 API 操作页面。

## 核心能力

- 在 **DSH 设置 → Uni Browser** 中注册并管理命名浏览器配置。
- 启动和停止配置时保留本地 Cookie、localStorage 与 IndexedDB。
- 让 DSH Agent 通过 uni-browser 已审计的 action API 导航、读取快照、点击、输入和按键。
- 浏览器密码、Cookie 和 daemon token 不进入 DSH UI 或工具参数。

## 快速开始

```bash
dsh plugin --profile web add dsh-uni-browser@next
dsh web
```

1. 打开 **设置 → Uni Browser**。
2. 输入配置名称，选择 Chromium 或 Camoufox，然后创建。
3. 选择 **Open** 启动可见浏览器。
4. 如果需要账号状态，请自己在浏览器中完成登录。
5. 之后 Agent 可以显式指定该 profile 进行浏览器操作。

## Agent 工具

| 工具 | 作用 |
| --- | --- |
| `uni_browser_profiles` | 列出持久化配置与运行状态 |
| `uni_browser_profile_create` | 注册 Chromium 或 Camoufox 配置 |
| `uni_browser_open` | 启动配置并恢复本地登录状态 |
| `uni_browser_close` | 停止配置，但不删除本地状态 |
| `uni_browser_forget` | 经明确确认后永久删除配置 |
| `uni_browser_navigate` | 导航到 URL |
| `uni_browser_snapshot` | 读取页面可访问性快照 |
| `uni_browser_click` / `uni_browser_type` / `uni_browser_press` | 通过审计动作 API 与页面交互 |

## 运行时

npm 安装会通过平台可选依赖带上与 macOS 或 Linux 匹配的 `uni-browser` 运行时。
首次使用时，插件会在 `~/.dsh/dsh-uni-browser/daemon` 下启动私有 daemon，
然后通过 Unix socket 直接与它通信。

如果要使用外部管理的 daemon，可设置：

- `UNI_BROWSER_SOCKET`：指定已有 daemon socket；
- `UNI_BROWSER_BIN`：指定明确的 daemon 可执行文件。

如果安装时刻意省略 optional dependencies，必须提供其中一个覆盖项。

新配置默认使用系统 Chromium / Google Chrome。如果已安装 Camoufox，设置
`UNI_BROWSER_CAMOUFOX_BIN` 后可以选择 Camoufox。平台 npm 包只包含 `uni-browser` daemon，
不会重装现有浏览器，也不会按需下载 Chrome 或 Camoufox。

## 登录配置

创建 profile 时保持 headless 关闭，启动后在可见浏览器中自行登录。后续启动会重用同一个受管 profile 目录。

- **Stop** 只停止浏览器，保留登录状态。
- **Forget** 需要明确确认，并会永久删除 Cookie、localStorage、IndexedDB 和其他本地状态。

## 安全边界

当前版本仅面向本机。插件使用 uni-browser 的 NDJSON action plane，不把 CDP/Juggler
原始协议直接暴露给 Agent，因此浏览器操作会留在 uni-browser 审计记录中。

## 平台支持

预构建 daemon 包覆盖：

- macOS Apple Silicon；
- macOS x64；
- Linux x64；
- Linux ARM64。

当前捆绑运行时不包含 Windows。只有在自行提供兼容 daemon 时，才应通过环境变量连接。

## 维护者文档

[发布指南](docs/releasing.md) 说明了运行时版本合约、GitHub Release 自动化、npm Trusted Publishing 和故障恢复步骤。

## 开发

```bash
npm run check
```

## 许可证

MIT © Xiang Bai
