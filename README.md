# 冯如学媒协作工作台

当前版本 **v1.1.0**。网页端是主端，提供后台服务、账号和业务数据。微信小程序、Android、iOS 和 HarmonyOS 应用使用同一套微信端源码，连接同一个工作台服务时可读取同一账号有权限查看的日程、任务、成果、模板和设置。

## Windows 本机安装

在 [GitHub Releases](https://github.com/QiuXY-WH-CN/FR-mediacenter-workbench/releases) 下载对应版本的 `FengruWorkbench-v1.1.0-win-x64-setup.exe`，核对同版本的 SHA-256 后运行。安装后从开始菜单打开工作台，按网页提示创建首个管理员账号。安装包包含 Node.js 和网页服务，可在本机离线处理工作台数据。连接微信、外部素材链接或公网部署需要相应的网络与服务配置。

## 项目结构

| 目录 | 用途 |
| --- | --- |
| `web/src/browser/` | 网页界面、交互与合并后的样式表 |
| `web/src/` | 网页资源入口、业务接口、权限与工作区规则 |
| `web/shared/` | 网页与微信端共用的任务、日程、模板、界面模型 |
| `web/scripts/` | 网页构建、本地服务与微信网关、维护脚本和回归验证 |
| `web/sop/` | 操作手册、知识库与团队流程模板 |
| `miniprogram/` | 微信小程序与多端应用的页面、微信适配和云函数 |
| `tools/` | Windows 安装包构建与发布前隐私审计 |

## 从源码运行

需要 Node.js 24 和 pnpm。在仓库根目录运行：

```powershell
pnpm --dir web install --frozen-lockfile
pnpm --dir web run build
pnpm --dir web run dev
```

默认访问 `http://127.0.0.1:8766/`。首次初始化管理员、服务重启、旧实例迁移及固定公网部署见 [网页与服务端说明](web/README.md)。已配置固定隧道的 Windows 部署可继续使用根目录的 `启动全部云服务.cmd`。

更改共用规则时，先修改 `web/shared/` 和网页接口，再从仓库根目录运行：

```powershell
pnpm --dir web run prepare:mini
pnpm --dir web run verify
```

第一条命令生成微信项目所需的公共模块。随后在微信开发者工具打开 `miniprogram/`，按 [小程序说明](miniprogram/README.md) 和 [多端应用说明](miniprogram/README-多端.md) 构建。已安装的 APP 和已发布的小程序需通过微信各自的发布流程更新。

## 数据、隐私与维护

业务数据库、备份和运行日志保存在服务使用的本机数据目录中。源码部署默认使用 `web/.local/`。公网地址、微信身份配置和凭据按环境设置。隐私审计与打包说明见 [PRIVACY.md](PRIVACY.md)。

- [工作台操作手册](web/sop/工作台操作手册.md)
- [知识库](web/sop/知识库.md)
- [更新记录](CHANGELOG.md)
