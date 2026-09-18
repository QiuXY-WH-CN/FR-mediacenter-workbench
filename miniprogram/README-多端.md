# 多端应用说明

本项目已切换为微信开发者工具的“多端应用”架构，可在同一套小程序代码基础上生成：

- 微信小程序
- Android App
- iOS App
- HarmonyOS / OpenHarmony 轻应用

## 核心目录

```text
miniprogram/
├── miniprogram/                 小程序页面与逻辑
│   ├── app.json                 微信小程序配置
│   ├── app.miniapp.json         多端适配配置
│   └── ...
├── miniapp/
│   └── android/nativeResources  Android 原生资源目录
├── project.config.json          项目配置（multiPlatform）
├── project.miniapp.json         多端应用配置
└── cloudfunctions/workbenchGateway/  云函数
```

## 如何生成各端应用

1. 用微信开发者工具打开当前 `miniprogram/` 目录。
2. 等待模拟器编译通过。
3. 点击工具栏中的“多端应用” / “生成多端应用”。
4. 按引导分别生成：
   - Android APK / AAB
   - iOS 工程
   - HarmonyOS 工程

## 当前配置状态

- `project.config.json` 已设置 `projectArchitecture: multiPlatform`
- `project.miniapp.json` 已配置 Android、iOS、HarmonyOS 基础参数
- 小程序主代码仍以 `miniprogram/miniprogram/` 为准

## 注意

- 生成 Android / iOS 前，需要在开发者工具中补齐图标、启动图、签名证书等信息。
- 当前仍是开发版，正式上架应用商店前需完成隐私政策、权限说明和平台审核。
