# 多端应用说明

微信小程序、Android、iOS 与 HarmonyOS 共用当前 `miniprogram/` 下的页面和接口代码，连接同一工作台服务。

当前版本为 **v1.0.7**，原生构建号 **107**。

## 构建

1. 使用微信开发者工具打开 `miniprogram/`。
2. 编译并检查登录、日程输入、四个主栏目与个人中心。
3. 通过“多端应用”生成目标平台的安装包或工程。
4. 安装前检查域名、图标、签名与平台隐私配置。

配置文件为 `project.config.json`、`project.miniapp.json` 和 `app.miniapp.json`。Android 原生资源位于 `miniapp/android/nativeResources/`。

源码更新不会替换已安装的 APP 或已发布的小程序。APP 需重新构建并安装；小程序需上传审核、发布后生效。
