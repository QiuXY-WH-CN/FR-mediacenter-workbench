# 冯如学媒协作工作台 · 服务端

校园学媒团队的本地协作工作台，提供网页端页面与小程序接口。

## 运行

```bash
启动本地工作台.cmd
```

访问 `http://127.0.0.1:8766/`。

需要手机同 Wi-Fi 联调时：

```bash
启动局域网服务.cmd
```

## 开发

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run test
pnpm run test:mini
```

## 目录

```text
src/       网页、服务端与业务逻辑
scripts/   构建、本地服务和测试脚本
sop/       SOP 文档
db/        数据库结构
drizzle/   数据库迁移
dist/      已构建服务
```

## 数据

本地数据默认保存在 `.local/preview.db`，该目录不会提交到版本库。
