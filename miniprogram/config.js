// 默认通过 Cloudflare 公网域名访问工作台服务。
module.exports = {
  releaseVersion: 'v1.0.5',
  transport: 'direct',
  directBaseUrl: 'https://fengrumedia.dpdns.org',
  cloudEnv: 'cloud1-d2g2evpezc387666b',
  cloudFunction: 'workbenchGateway',
  pollMs: 30000
};
