// 中文注释：Node 适配器——把运行时无关的 Hono app（app.mjs）跑在 node:http 上（@hono/node-server）。
// 迁移别的 JS 运行时只换这一层，app.mjs 不动。对外 API 保持稳定：listen/close/address/decisions。
import { serve } from '@hono/node-server';

import { createGatewayApp } from './app.mjs';

export function createPassthroughGateway(options = {}) {
  const { port = 0, host = '127.0.0.1', ...appOptions } = options;
  const { app, decisions } = createGatewayApp(appOptions);
  let server = null;

  return Object.freeze({
    decisions,
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