# 冯如学媒协作工作台 · 服务端

校园学媒团队的本地协作工作台，提供网页端页面与小程序接口。

## 运行

首次运行前，如果 `dist/server/index.js` 不存在，请先构建：

```bash
pnpm install --frozen-lockfile
pnpm run build
```

然后启动：

```bash
启动本地工作台.cmd
```

访问 `http://127.0.0.1:8766/`。

## 公网访问（Cloudflare Tunnel）

根目录的 `启动全部云服务.exe` 或 `启动全部云服务.cmd` 会同时启动本机服务与 cloudflared：

- **默认使用域名** `https://fengrumedia.dpdns.org`
- 若尚未配置域名隧道，会自动退回随机 tunnel

### 1. 创建并绑定隧道

```bash
cd web
cloudflared tunnel login
cloudflared tunnel create fengrumedia
cloudflared tunnel route dns fengrumedia fengrumedia.dpdns.org
```

### 2. 填写隧道配置

编辑 `web/cloudflared-config.yml`：

```yaml
tunnel: 503797d9-a624-44ab-a07f-1d07831da93d
credentials-file: C:\Users\QiuXY\.cloudflared\503797d9-a624-44ab-a07f-1d07831da93d.json

ingress:
  - hostname: fengrumedia.dpdns.org
    service: http://127.0.0.1:8766
  - service: http_status:404
```

### 3. 在 DDNS 服务商添加 CNAME（关键）

`fengrumedia.dpdns.org` 的权威 DNS 是 digitalplat（dpdns.org 的 NS），Cloudflare 无法直接为它签发 DNS。请到你的 DDNS 管理后台，把 `fengrumedia` 主机记录类型改为：

```text
类型：CNAME
值：  503797d9-a624-44ab-a07f-1d07831da93d.cfargotunnel.com
```

保存后等 1–2 分钟，外网即可通过 `https://fengrumedia.dpdns.org/` 访问。

### 4. 启动

双击根目录：

- `启动全部云服务.exe`（推荐）
- 或 `启动全部云服务.cmd`

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
## v1.0.1 更新与验证

启动脚本会先构建资源再启动源站；单独重启使用 scripts/restart-local.ps1（先备份数据库）。公网与本机版本通过 /api/info 查看；应为 v1.0.1。入口脚本和样式携带版本号，响应禁止 CDN 和浏览器缓存。

新增部门模式、账号设置、优先级和气泡成员图。运行 npm run test:workspace 验证部门隔离、排序、设置与注销流程。浏览器新增交互验证使用 npm run test:workspace:browser，需要 PLAYWRIGHT_MODULE 指向本机 Playwright。

Windows 启动建议使用根目录 启动全部云服务.cmd；不依赖额外 EXE。

## v1.0.2

左下角个人中心提供通用、外观、账号设置。粒子图层位于内容上层并允许关闭；轮换间隔只在定时轮换时出现。通用可切换中文/英语；任务内容、姓名与知识库正文保留原文。新增动效验证：npm run test:motion:browser。

## v1.0.3

组织图采用弹性漂浮并保留拖动，粒子约90%沿页面四周移动且覆盖导航；颜色文案为白/黑。网页日历布局没有更改。部门内部日程和通知由接口鉴权过滤，网关校验会话格式。服务缺少 BOOTSTRAP_HASH 时禁止首管理员初始化，不再使用公开默认口令。

发布前运行 build、test、test:workspace、test:mini、test:privacy，以及 test:mini:share、test:mini:calendar、test:mini:organization、test:mini:motion 和浏览器回归；公网重启使用 scripts/restart-local.ps1。
