# 冯如学媒协作工作台 · 最终版

本目录为整合后的最终交付项目，包含两个子项目：

## 目录结构

```text
冯如学媒协作SOP工作台/
├── web/            网页端 + 本机服务端（含 /mini/api 小程序接口）
├── miniprogram/    微信小程序端
└── README.md       本说明
```

## 1. 网页端 / 服务端

路径：`web/`

启动方式：

```bat
cd web
启动本地工作台.cmd
```

- 默认地址：http://127.0.0.1:8766/
- 手机同 Wi-Fi 联调：运行 `启动局域网服务.cmd`，再查看窗口输出的局域网 IP。
- 小程序接口：`POST /mini/api`
- 数据文件：`web/.local/preview.db`

构建 / 测试：

```bat
cd web
pnpm install --frozen-lockfile
pnpm run build
pnpm run test
pnpm run test:mini
```

## 2. 微信小程序端

路径：`miniprogram/`

用微信开发者工具打开该目录：

```text
C:\Users\QiuXY\Desktop\冯如学媒协作SOP工作台\miniprogram
```

- 小程序源码：`miniprogram/miniprogram/`
- 云函数：`miniprogram/cloudfunctions/workbenchGateway/`
- 默认连接：本机直连 `http://127.0.0.1:8766`
- 云函数通道：在小程序“连接设置”选择“微信云函数”，填写云开发环境 ID。

## 已清理内容

- 旧 `新版工作台/`、旧 `微信小程序移植/`、旧根目录网页工程已不再作为最终项目目录。
- 这些旧文件已统一移入 `_deprecated/` 文件夹，避免误用；确认新版运行正常后，可手动删除 `_deprecated/`。
- 最终小程序目录为根目录下的 `miniprogram/`，请以该目录为准在开发者工具中打开。
- 已去除 `.backup/`、`.qa/`、旧测试截图、旧编译缓存等无用内容。

## 注意

- `web/.local/preview.db` 是本地业务数据库，请勿删除。
- 云函数正式使用前，仍需要在云开发后台配置环境变量并部署 `workbenchGateway`。

