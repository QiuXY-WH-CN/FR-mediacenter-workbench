# 冯如学媒协作工作台

面向校园学媒团队的协作工作台，包含网页端和小程序端。

## 目录结构

```text
.
├── web/            网页端 + 服务端（含小程序接口）
├── miniprogram/    微信小程序端
└── README.md
```

## 快速开始

### 网页端 / 服务端

```bash
cd web
启动本地工作台.cmd
```

访问 `http://127.0.0.1:8766/`。

构建与测试：

```bash
cd web
pnpm install --frozen-lockfile
pnpm run build
pnpm run test
pnpm run test:mini
```

### 微信小程序端

用微信开发者工具打开 `miniprogram/` 目录，编译即可。

小程序默认连接本机服务，地址可在“连接设置”中调整。

## 说明

- 本地业务数据保存在 `web/.local/`，该目录不会提交到仓库。
- 云函数相关配置请参考 `miniprogram/README.md`。
