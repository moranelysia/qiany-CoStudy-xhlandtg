# CoStudy 开发维护指南

[返回项目首页](../README.md) · [历史记录](archive/)

## 日常开发

在仓库根目录运行 `pnpm install --frozen-lockfile` 安装依赖，再运行 `pnpm exec install-electron` 下载对应版本的 Electron 运行时，然后用 `pnpm run dev` 启动。Vite 构建结果写入 `out/`，其中 `main/`、`preload/`、`renderer/` 对应 Electron 的三个入口。

| 命令 | 用途 |
| --- | --- |
| `pnpm run dev` | 启动 Electron 开发环境 |
| `pnpm run typecheck` | 检查主进程与渲染端 TypeScript |
| `pnpm run build` | 生成 `out/` 中的桌面构建产物 |
| `.\run.cmd` | 启动已有构建 |
| `.\run.cmd --smoke` | 验证桌面端启动 |
| `.\run.cmd --mcptest` | 验证 MCP 宿主与测试服务通路 |
| `.\run.cmd --plugintest` | 检查插件注册、开关与安装状态 |

完整自检在 `.\scripts\check-all.cmd`。它会结束本机的 `electron.exe` 进程。运行前请保存工作并关闭其他使用 Electron 的程序；日常可直接挑选上表中的单项检查。

## 数据位置

| 项目 | 桌面安装版默认位置 |
| --- | --- |
| 安装根目录 | `%LOCALAPPDATA%\Programs\CoStudy` |
| 会话、角色卡、学习记录与模型设置 | `<安装目录>\app\记忆` |
| 学习资料目录 | `<安装目录>\学习` |
| 代码工作区 | `<安装目录>\工作区`。选择过其他位置时使用设置中的目录 |
| 生效配置文件 | `<安装目录>\costudy.config.json`（如存在） |

源码运行时，程序目录为仓库根目录，`记忆/` 默认位于该程序目录，学习资料目录默认位于仓库上一级。路径可由 `COSTUDY_WORKSPACE_ROOT`、`COSTUDY_DATA_DIR`、`COSTUDY_LEARNING_DIR` 或配置文件覆盖，具体解析见 [`src/main/config.ts`](../src/main/config.ts)。

跨设备迁移时请复制实际生效的数据目录。桌面版使用系统加密时，旧设备保存的密钥需要在新设备重新录入。请将密钥、会话、工作区资料和自检日志留在本机。

## 预览与更新网页

GitHub Pages 从 `main` 分支的 `/docs` 目录发布，三个入口分别是：

| 文件 | 用途 |
| --- | --- |
| `docs/index.html` | 官网、Windows 下载和实机演示。旧的 `#lesson` 链接会进入试学 |
| `docs/trial.html`、`trial.css`、`trial.js` | 无需模型的交互试学样例，刷新会重置本次试学进度 |
| `docs/app.html`、`bridge.js`、`build.json`、`assets/` | 网页版壳、浏览器接口适配层、资源清单和共用渲染端产物 |

在仓库根目录本地预览（需要 Python 3）：

```powershell
python -m http.server 8899 --bind 127.0.0.1 --directory docs
```

访问 `http://127.0.0.1:8899/`。发布前检查首页、`/trial.html` 和 `/app.html`。

修改 `src/renderer/` 后，如果也要发布到网页端：

1. 执行 `pnpm run build`，将 `out/renderer/assets/` 的内容复制到 `docs/assets/`。保留现有文件，以便缓存中的旧网页入口仍可加载对应版本。
2. 在 `out/renderer/index.html` 找到实际生成的模块脚本和样式文件名，更新 `docs/build.json` 的 `entry`、`css` 和 `v`。`v` 使用本次发布唯一的版本标识，供浏览器区分缓存。
3. 同步 `docs/app.html` 中的 `fallback` 资源清单及 `boot-css` 样式路径。只有改动网页适配层时，也应更新两个位置的 `v`，以更新 `bridge.js` 缓存。
4. 通过本地预览检查，并将页面改动、清单和新增资源一并提交。合入 `main` 后，在 GitHub Actions 确认 Pages 发布成功，再检查线上 `build.json` 和页面。

发布前可以按以下流程验收：

- 试学样例第一题选 `6`，两步订正依次选 `3`、`9`，复测选 `16`，确认报告显示订正后独立答对。重开样例并切换角色，第一题选 `9`，复测先选 `4` 再选 `16`，确认报告记录提示后的结果。
- 网页版验证角色工坊、模型连接、发送文字和附件。可用自己的测试接口验证无密钥、跨域或不支持图片/PDF 的错误提示。
- 检查手机窄屏的输入栏、官网三个入口和桌面版下载链接。

## 打包 Windows 安装程序

准备 Windows、仓库依赖和 NSIS。让 `makensis.exe` 可在 PATH 中找到，或通过 `-Makensis` 指定它的完整路径。

```powershell
pnpm run typecheck
.\scripts\windows\build-installer.ps1
```

脚本使用与项目依赖一致的 Electron 版本，打包构建产物和本地 MCP 服务，输出到 `dist/windows/v<版本号>/CoStudy-Desktop-Setup.exe`。如果 PowerShell 阻止直接运行本地脚本，可按系统策略允许后再执行。需要指定其他 Electron 运行时目录时，使用 `-ElectronDir`，脚本会校验版本。

发布桌面新版本时，先同步 `package.json` 版本与 Git 标签，再把安装包以上述固定文件名添加到对应 GitHub Release。官网和 README 的下载按钮使用 `releases/latest/download/CoStudy-Desktop-Setup.exe`。替换线上版本前，请验证新安装和原目录升级，并在「插件」页检查数学作图和实验演示是否可用。

## 排查常见问题

| 现象 | 检查方法 |
| --- | --- |
| 模型连接失败 | 先核对 Base URL、模型 ID、密钥和账户余额。浏览器端还需确认服务允许 CORS，公网模型地址应使用 HTTPS |
| 图片或 PDF 发不出 | 在模型服务说明中确认当前模型、接口和文件输入格式。先发短文本验证连通性 |
| 无法启动 MCP 服务 | 确认运行的是桌面版，安装目录下 `app/scripts/` 中有对应脚本。源码环境可运行 MCP 自检 |
| 网页提示资源加载失败 | 以 HTTP 预览 `docs/`，核对 `build.json`、备用清单以及对应文件是否存在 |
| 更新后找不到学习记录 | 核对安装路径和实际生效的 `dataDir`，以及是否切换了浏览器或浏览器用户 |

## 历史资料

以下文件用于了解早期设计和决策，内容反映记录时的版本。当前运行和发布步骤以本指南为准。

- [开发记录](archive/开发记录.md)
- [参赛说明](archive/参赛说明.md)
- [页面转场实现说明](archive/页面转场-实现说明.md)
- [UI v4 改造记录](archive/UI-v4-改造记录.md)
- [早期迁移说明](archive/迁移说明.md)
