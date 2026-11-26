<template>
  <div class="app-shell">
    <nav class="side-nav">
      <router-link to="/" class="logo">Mood<span>Tune</span></router-link>
      <p class="nav-label">Navigate</p>
      <router-link v-for="n in navs" :key="n.to" :to="n.to" class="nav-item" :class="{ on: active(n) }">
        <span class="ni">{{ n.no }}</span><span>{{ n.label }}</span>
      </router-link>
      <div class="nav-foot">本地推理 · 人脸不出浏览器<br />face-api.js + Russell V-A 推荐</div>
    </nav>
    <main class="main"><router-view /></main>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'
const route = useRoute()
const navs = [
  { no: '01', to: '/', label: '首页', test: p => p === '/' },
  { no: '02', to: '/detect/image', label: '情绪识别', test: p => p.startsWith('/detect') },
  { no: '03', to: '/player', label: '歌单播放', test: p => p === '/player' },
  { no: '04', to: '/favorites', label: '我的收藏', test: p => p === '/favorites' }
]
function active(n) { return n.test(route.path) }
</script>

<style scoped>
.side-nav {
  width: 216px; flex: none; position: sticky; top: 0; height: 100vh;
  display: flex; flex-direction: column; gap: 4px;
  padding: 26px 16px; background: var(--surface); border-right: 1px solid var(--line);
}
.logo {
  font-family: var(--font-display); font-size: 21px; font-weight: 700;
  color: var(--ink); text-decoration: none; letter-spacing: 0.01em; margin-bottom: 22px;
}
.logo span { color: var(--accent); }
.side-nav .nav-label { margin: 0 0 6px 10px; }
.nav-item {
  display: flex; align-items: center; gap: 12px; padding: 9px 12px;
  border-radius: 10px; color: var(--ink-soft); text-decoration: none;
  font-size: 14px; font-weight: 500; transition: background 0.15s, color 0.15s;
}
.nav-item:hover { background: var(--surface-2); color: var(--ink); }
.nav-item.on { background: var(--surface-2); color: var(--ink); }
.nav-item .ni {
  font-family: var(--font-display); font-size: 11px; color: var(--accent);
  opacity: 0.85; font-variant-numeric: tabular-nums;
}
.nav-foot { margin-top: auto; font-size: 11px; line-height: 1.9; color: var(--ink-soft); padding: 0 10px; }
@media (max-width: 760px) {
  .app-shell { flex-direction: column; }
  .side-nav {
    width: auto; height: auto; position: static; flex-direction: row; align-items: center;
    gap: 6px; padding: 12px 16px; border-right: none; border-bottom: 1px solid var(--line);
  }
  .logo { margin: 0 14px 0 0; }
  .side-nav .nav-label, .nav-foot { display: none; }
}
</style>
