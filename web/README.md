# 冯如学媒协作工作台 · 网页与服务端

当前版本 **v1.0.4**。服务端同时提供网页资源、业务接口和 `/mini/api` 小程序网关。多端使用同一份业务数据和账号设置。

## 环境与构建

需要 Node.js 24 或更高版本；本地 SQLite 使用 Node.js 的内置模块。

```powershell
cd web
pnpm install --frozen-lockfile
pnpm run build
pnpm run dev
```

手动 `dev` 不会重新构建资源，更新源码后须先运行 `build`。默认仅监听本机 `http://127.0.0.1:8766/`。

## Windows 日常启动

推荐从项目根目录双击 `启动全部云服务.cmd`。它调用同目录 PowerShell 脚本；不需要额外 EXE。命令行可运行：

```powershell
& './启动全部云服务.ps1' -NonInteractive
```

脚本会检查 Node.js 版本，复用已经通过健康检查的同工作区服务。需要新启动时先构建并备份已有数据库；只会停止身份已核验为本工作区的服务，不会清理所有 node、cloudflared 或任意端口占用者。构建和备份失败会保留旧服务，并返回明确错误。

修改代码后，从项目根目录运行：

```powershell
& './web/scripts/restart-local.ps1'
```

旧版启动器可能留下 `node scripts/dev.mjs` 相对路径实例。脚本不能仅凭这一行证明它来自哪个工作区，因而拒绝自动终止。首次迁移时先核验旧实例归属，再执行：

```powershell
$verifiedOldServerId = [int](Read-Host '输入已核验属于此工作区的旧网页服务 PID')
& './web/scripts/restart-local.ps1' -ExpectedProcessId $verifiedOldServerId
```

新实例以绝对脚本路径启动，后续正常重启不需要此参数。服务通过 `/api/info` 健康检查后才报告本机就绪。

## 固定公网访问

当前项目使用 [https://fengrumedia.dpdns.org/](https://fengrumedia.dpdns.org/)，Cloudflare Tunnel 连接本机 8766 端口。公网可用需要网页源站运行、固定隧道连接正常及域名配置生效；不能仅凭进程存在或 DNS 可解析宣称已上线。

固定隧道配置保存在本机 `web/cloudflared-config.yml`，配置使用实际 tunnel ID 和本机凭据文件路径；凭据文件不应进入版本库。配置示意：

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: C:\Users\YOUR_USER\.cloudflared\YOUR_TUNNEL_ID.json

ingress:
  - hostname: fengrumedia.dpdns.org
    service: http://127.0.0.1:8766
  - service: http_status:404
```

把占位符替换为部署环境的真实值，并通过 Cloudflare 的 tunnel 路由与域名设置完成绑定。已有正常配置无需重新创建隧道或改 DNS。启动器会正确引用带空格和中文的配置路径、复用当前配置对应的固定隧道；其他 cloudflared 进程保持运行。

未配置有效固定隧道时默认只启动本机服务。如明确需要临时公网入口，可以运行：

```powershell
& './启动全部云服务.ps1' -NonInteractive -QuickTunnel
```

临时域名由后台生成，在 `web/.local/cloudflared-quick.err.log` 查看；脚本不会长时间等待随机域名，也不会把临时隧道误报为固定域名已在线。

## 故障检查与版本核验

先访问本机 `/api/info`，再访问公网 `/api/info`，比较版本号。当前构建应为 `v1.0.4`。网页脚本和样式带版本参数，资源响应禁用浏览器与 CDN 缓存；源站重启后公网隧道继续转发新的构建。

启动失败时查看：

- `web/.local/startup.err.log`：双击启动器的明确失败原因。
- `web/.local/server.err.log`：网页服务运行错误。
- `web/.local/cloudflared-domain.err.log`：固定公网隧道连接错误。
- `web/.local/cloud-status.json`：最近一次启动和健康检查结果。

端口由陌生进程占用时，核验该进程用途后自行处理；不要直接结束全部 node 进程。若本机正常但公网未通过健康检查，检查隧道连接和域名路由，不要反复初始化数据库。

## 验证

```powershell
pnpm run build
pnpm run test
pnpm run test:workspace
pnpm run test:mini
pnpm run test:privacy
node scripts/service-start-test.mjs
```

`service-start-test.mjs` 需 Windows PowerShell 与 CIM，使用隔离临时目录和 8893 测试端口，覆盖路径引用、陌生进程保护、备份与构建失败、健康检查、重复启动及旧实例迁移。不要在该端口已被其他程序占用时强制结束它。

浏览器与多端交互测试见 `package.json`。本机 Playwright 如未安装在项目中，可使用 `PLAYWRIGHT_MODULE` 指向已有模块。测试在隔离数据库运行，不使用真实成员账号。

## 界面与文档

个人中心整合资料、设置和退出账号。移动网页底部提供三个常用工作入口和“我的”，其他工作页面在“我的”中访问。通用设置提供语言与 85%—135% 字号；外观提供主题、白／黑显示、动效总开关、粒子样式和运动／触点／光色参数。

六款粒子预设、渐变与触控操作说明见 [操作手册](sop/工作台操作手册.md)。高级粒子模拟与小程序／APP 共用参数模型；保存后同账号的其他端刷新获取。鼠标与触点坐标只在本机内存中计算，不发往接口，也不写日志。

构建时将 `sop/知识库.md` 与 `sop/工作台操作手册.md` 打包为登录后可读的知识库快照；编辑文档后需要重新构建和重启。知识库配图若注明旧界面示意，以正文和当前界面为准。

## 数据目录

```text
src/       网页、业务路由与后端逻辑
scripts/   构建、启动、网关及测试
sop/       知识库与协作规范
db/        数据结构
drizzle/   数据库迁移
dist/      构建后的服务
.local/    本机数据库、备份与日志，不提交
```

已有数据库在更新服务前备份至 `.local/backups/`。`.env`、`.local/`、真实隧道凭据、初始化令牌和小程序密钥不得提交到公开仓库。未配置 `BOOTSTRAP_HASH` 时禁止首管理员初始化，不使用公开默认口令。版本按 `v1.0.4 → v1.0.5` 的补丁序列递增。
