// 中文注释：网关的 Node 服务适配器——把运行时无关的路由网关 Hono app（proxy.mjs）跑成常驻 HTTP 服务。
// 这是网关的生产入口落点：CLI `model-router gateway` 调它起服务。换 JS 运行时只换这一层。
// 只绑 127.0.0.1（信任边界）；优雅停机由 close() 负责。密钥/路由事实都在 app 层，本层不持有。
import { serve } from '@hono/node-server';

import { createRoutingGatewayApp } from './proxy.mjs';
import { createGatewayApp } from './app.mjs';

// mode='routing'（默认，按矩阵路由+翻译）| 'passthrough'（P0 纯透传，不路由）。
export function createGatewayServer(options = {}) {
  const { mode = 'routing', port = 0, host = '127.0.0.1', ...appOptions } = options;
  const built = mode === 'passthrough' ? createGatewayApp(appOptions) : createRoutingGatewayApp(appOptions);
  const { app, decisions } = built;
  let server = null;

  return Object.freeze({
    decisions,
    mode,
    listen() {
      return new Promise((resolve, reject) => {
        server = serve({ fetch: app.fetch, port, hostname: host }, () => resolve(server.address()));
        server.once('error', reject);
      });
    },
    close() {
      return new Promise((resolve) => {
        if (!server) return resolve();
        server.close(() => resolve());
      });
    },
    address() {
      return server ? server.address() : null;
    },
  });
}