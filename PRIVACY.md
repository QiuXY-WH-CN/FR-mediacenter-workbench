# 发布前隐私检查

运行时数据库、备份、日志、凭据和机器配置保存在本机。`.local/`、真实 `.env` 文件、Cloudflare 隧道配置和微信开发者工具的 `project.private.config.json` 都在 Git 忽略范围内。小程序 AppID、原始 ID、云环境和服务地址由维护者在部署副本中配置，固定公网域名由本机的 `web/cloudflared-config.yml` 提供。

在项目根目录核验工作区、准备推送的提交和 Windows 发布暂存目录。最后一条的路径替换为打包脚本打印的实际暂存目录。

```powershell
node tools/privacy-audit.mjs --strict
node tools/privacy-audit.mjs --strict --range 'origin/main..HEAD'
node tools/privacy-audit.mjs --strict '发布版\workbench-v1.1.0-win-x64'
```

审计拦截本机数据文件、绝对用户路径、私钥和常见凭据格式。严格模式还检查微信部署标识和常见隧道域名。提交范围检查会检查每次新增或修改的文件，包括随后被删除的内容。审计日志只报告相对路径、行号和发现类型。发布者还需核对附件清单及业务样例，确认可以公开。

此前被 Git 跟踪的本机配置需要单独从索引移除。例如，下列命令保留本机文件。

```powershell
git rm --cached -- miniprogram/project.private.config.json
```

如果历史提交包含有效凭据，应先吊销或轮换凭据，再评估公开历史的处理方式。
