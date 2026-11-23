# 多端应用说明

微信小程序、Android、iOS 与 HarmonyOS 共用当前 `miniprogram/` 下的页面和接口代码，连接同一工作台服务。

当前版本为 **v1.1.0**，原生构建号 **110**。

## 构建

1. 在仓库根目录运行 `pnpm --dir web run prepare:mini`，生成小程序使用的共享模块。
2. 使用微信开发者工具打开 `miniprogram/`。发行时使用部署副本及对应 AppID，并按发行平台在 `app.miniapp.json` 配置关联小程序原始 ID。
3. 编译并检查登录、日程输入、四个主栏目与个人中心。
4. 通过“多端应用”生成目标平台的安装包或工程。
5. 安装前检查域名、图标、签名与平台隐私配置。真机在“连接设置”填写部署地址，或使用维护者在部署副本中提供的默认设置。

配置文件为 `project.config.json`、`project.miniapp.json` 和 `app.miniapp.json`。Android 原生资源位于 `miniapp/android/nativeResources/`。

源码更新不会替换已安装的 APP 或已发布的小程序。APP 需重新构建并安装；小程序需上传审核、发布后生效。
