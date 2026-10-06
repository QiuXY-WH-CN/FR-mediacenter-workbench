# 冯如学媒 · 微信小程序

原生微信小程序，复用网页端的账户、日程、任务、模板、积分与 SOP 数据。

## 目录结构

```text
miniprogram/
├── app.js / app.json / app.wxss      小程序入口与全局配置
├── pages/                            页面（auth 为登录页）
├── services/                         工作台接口封装
├── utils/                            页面公共逻辑
├── cloudfunctions/workbenchGateway/  云函数转发
├── project.config.json               微信开发者工具项目配置
└── uploadCloudFunction.sh            云函数上传脚本
```

## 本地运行

1. 启动网页端服务：

```bash
cd ../web
启动本地工作台.cmd
```

2. 用微信开发者工具打开当前 `miniprogram/` 目录。

3. 默认连接 `https://fengrumedia.dpdns.org`；如需本机调试，可在“连接设置”中改为 `http://127.0.0.1:8766`。

4. 手机真机预览前，需在小程序后台把 `https://fengrumedia.dpdns.org` 加入“request 合法域名”，并在开发者工具中重新编译/预览。

## 公网访问

服务端使用 Cloudflare Tunnel 暴露到 `https://fengrumedia.dpdns.org`：

```bash
cd ../web
cloudflared tunnel create fengrumedia
cloudflared tunnel route dns fengrumedia fengrumedia.dpdns.org
```

然后把 `web/cloudflared-config.yml` 中的 `YOUR_TUNNEL_ID` 和 `credentials-file` 替换为实际值，运行根目录的 `启动全部云服务.cmd`。

## 云函数方式

正式跨网络使用时，也可选择“连接设置 → 微信云函数”，填写云开发环境 ID。云函数环境变量：

```text
MINI_APP_ID=小程序 AppID
LOCAL_API_ORIGIN=https://fengrumedia.dpdns.org
BRIDGE_SECRET=与 web/.local/mini-server.json 中 bridgeSecret 一致
```

## 注意

- 云端仅做请求转发，业务数据仍保存在网页端本地数据库。
- 正式发布前需完成小程序类目、隐私协议和合法域名配置。
## v1.0.1

APP 与网页共享部门模式、设置及任务优先级。设置入口位于个人中心；首页可切换部门，任务按截止日期与优先级排序。新增高优先级待办、层级日历、可拖动成员气泡与动态背景。多端配置版本 1.0.1，构建号 101。已有安装包需重新编译安装，本次不上传微信小程序。

## v1.0.2

同步双语界面、通用/外观设置、左下角个人中心及外部关闭、增强粒子与中性黑主题。原生版本 1.0.2，构建号 102；可运行网页目录 npm run test:mini:motion 验证界面逻辑。未上传微信小程序，已安装 APP 需重新编译安装。
