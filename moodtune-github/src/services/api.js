// API 基地址：本地开发为空（走 Vite /api 代理）；Pages 部署时由 VITE_API_BASE 指向独立 BFF
const BASE = String(import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '')

export function apiUrl(path) {
  return BASE && typeof path === 'string' && path.startsWith('/') ? BASE + path : path
}
