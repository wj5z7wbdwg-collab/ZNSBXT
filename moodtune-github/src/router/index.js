import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'home', component: () => import('../views/Home.vue') },
  { path: '/detect/:mode', name: 'detect', component: () => import('../views/Detect.vue') },
  { path: '/player', name: 'player', component: () => import('../views/Player.vue') },
  { path: '/favorites', name: 'favorites', component: () => import('../views/Favorites.vue') }
]

// hash 路由：GitHub Pages 无服务端重写，刷新子页面不会 404
export default createRouter({ history: createWebHashHistory(import.meta.env.BASE_URL), routes })
