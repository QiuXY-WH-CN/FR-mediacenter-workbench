// 默认连接微信开发者工具所在电脑的本地工作台服务。
// 手机真机调试时，请进入“连接设置”填写电脑局域网地址；
// 正式跨网络使用时，可切换为 workbenchGateway 云函数。
module.exports = {
  transport: 'direct',
  directBaseUrl: 'http://127.0.0.1:8766',
  cloudEnv: 'cloud1-d2g2evpezc387666b',
  cloudFunction: 'workbenchGateway',
  pollMs: 30000
};
