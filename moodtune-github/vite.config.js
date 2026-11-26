import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 项目站点：构建时注入 VITE_BASE=/<仓库名>/；本地与自定义域名默认 '/'
const base = process.env.VITE_BASE || '/'

// 开发期通过 Vite proxy 转发到本地 BFF（server/bff.js，端口 8787）
export default defineConfig({
  base,
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate', // 新版本 SW 安装后自动接管，无需用户手动刷新
      includeAssets: ['icon.svg', 'test-face.jpg', 'test-emoji.png'],
      manifest: {
        name: 'MoodTune · 智能识别点歌系统',
        short_name: 'MoodTune',
        description: '识别情绪，为你推荐此刻想听的歌',
        theme_color: '#0f1012',
        background_color: '#0f1012',
        display: 'standalone',
        // 相对 base，兼容 GitHub Pages 子路径
        start_url: './',
        scope: './',
        lang: 'zh-CN',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: `${base}index.html`,
        // face-api 模型分片等单文件可能超过 workbox 默认 2MB 预缓存上限
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            // 识别模型（~60MB）：首次加载后长期缓存，离线可用
            urlPattern: /\/models\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mt-models',
              expiration: { maxEntries: 30, maxAgeSeconds: 30 * 24 * 3600 }
            }
          },
          {
            // 曲库索引：网络优先，断网回退缓存
            urlPattern: /\/data\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mt-data',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 10, maxAgeSeconds: 7 * 24 * 3600 }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true
      }
    }
  }
})
