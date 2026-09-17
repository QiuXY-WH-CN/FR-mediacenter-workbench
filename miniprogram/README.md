# 冯如学媒 · 微信小程序

原生微信小程序，复用网页端的账户、日程、任务、模板、积分与 SOP 数据。

## 目录结构

```text
miniprogram/
├── miniprogram/                     小程序前端源码
├── cloudfunctions/workbenchGateway/ 云函数
├── project.config.json
└── uploadCloudFunction.sh
```

## 本地运行

1. 启动网页端服务：

```bash
cd ../web
启动本地工作台.cmd
```

2. 用微信开发者工具打开当前 `miniprogram/` 目录。

3. 默认连接为 `http://127.0.0.1:8766`，可直接在开发者工具中调试。

4. 手机同 Wi-Fi 调试时，在“连接设置”中填写电脑局域网地址。

## 云函数方式

正式跨网络使用时，选择“连接设置 → 微信云函数”，填写云开发环境 ID。

云函数环境变量：

```text
MINI_APP_ID=小程序 AppID
LOCAL_API_ORIGIN=https://服务端公网地址
BRIDGE_SECRET=随机桥接密钥
```

详细配置请参考云开发官方文档。

## 注意

- 云端仅做请求转发，业务数据仍保存在网页端本地数据库。
- 正式发布前需完成小程序类目、隐私协议和合法域名配置。
