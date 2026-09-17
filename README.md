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


## 注意

- `web/.local/preview.db` 是本地业务数据库，请勿删除。
- 云函数正式使用前，仍需要在云开发后台配置环境变量并部署 `workbenchGateway`。

