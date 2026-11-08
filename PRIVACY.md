# 发布前隐私检查

本项目把运行时数据和机器配置放在 Git 忽略范围内。`.local/`、数据库文件、日志、Cloudflare 隧道配置、网页 `.env` 文件和微信开发者工具的 `project.private.config.json` 不应进入发布包或远程仓库。已有本机文件可以继续使用，但应保持未跟踪状态。

发布前在项目根目录运行：

```powershell
node tools/privacy-audit.mjs
node tools/privacy-audit.mjs --strict release\workbench
```

第一条检查 Git 会纳入的文件，重点拦截绝对用户路径、私钥和凭据样式的值。第二条检查发布暂存目录，并额外拦截微信 AppID、命名隧道域名和动态公网域名。审计失败时先移除值或改用安装者本地配置，再继续打包。

如果某台机器以前已经把本地配置加入索引，补充 `.gitignore` 不会自动取消跟踪。保留本机文件并执行：

```powershell
git rm --cached -- miniprogram/project.private.config.json
```

然后确认 `git status --short` 只显示索引删除，不要把该文件重新加入提交。生产服务地址、云环境标识和小程序 AppID 仍属于部署配置；制作通用 Windows 包时，应通过安装步骤或本地配置文件注入，不要把当前部署值复制到公共压缩包。
