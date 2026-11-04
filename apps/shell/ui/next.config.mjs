import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
// 桌面壳（Tauri 2）用 devUrl 指向本端口，生产构建产物由 sidecar 或 Tauri 作为静态资源提供。
const nextConfig = {
  reactStrictMode: true,
  // Turbopack 按「最近的 lockfile」猜项目根；仓库根也有 package-lock.json，实测它把根猜成
  // 仓库根并告警 multiple lockfiles。那等于让打包器守在整仓上（ADR 0007 的「事实不经过
  // 打包器」因此失守）。根是这次声明给出的事实，不让打包器去猜。
  turbopack: {
    root: fileURLToPath(new URL('.', import.meta.url)),
  },
};

export default nextConfig;