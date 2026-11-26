<template>
  <div class="page home">
    <p class="eyebrow">MoodTune · Face to Playlist</p>
    <h1 class="display">让歌<br />来找你</h1>
    <p class="lede">上传一张照片，或打开摄像头。本地识别你的即时情绪，按效价—唤醒模型为你挑一份刚好的歌单。人脸数据不出浏览器。</p>

    <div class="model-state" :class="{ ok: ready }">
      <span class="dot" />
      <template v-if="ready">识别模型已就绪（face-api.js · 全程本地推理）</template>
      <template v-else-if="detect.loadError.value">{{ detect.loadError.value }}</template>
      <template v-else>模型预热中 {{ detect.loadProgress.value }}/3 …</template>
    </div>
    <div class="model-state svc" :class="{ ok: bffOk === true, off: bffOk === false }">
      <span class="dot" />
      <template v-if="bffOk === null">在线源服务检测中…</template>
      <template v-else-if="bffOk">在线源已连通（网易云直连 · BFF 数据中枢在线）</template>
      <template v-else>在线源不可用 · 本地识别与曲库功能不受影响</template>
    </div>

    <section class="entries">
      <button v-for="(e, i) in entries" :key="e.mode" class="entry" @click="go(e.mode)">
        <span class="no">{{ String(i + 1).padStart(2, '0') }}</span>
        <span class="body">
          <span class="t">{{ e.title }}</span>
          <span class="d muted">{{ e.desc }}</span>
        </span>
        <span class="arrow" aria-hidden="true">→</span>
      </button>
    </section>

    <section v-if="stats" class="loop">
      <p class="nav-label">Your Data Loop · 数据闭环</p>
      <div class="loop-grid">
        <div class="card loop-card">
          <p class="loop-title">心情曲线 <span class="muted">最近 {{ stats.emotions.length }} 次识别 · 纵轴为情绪效价</span></p>
          <MoodTrend v-if="stats.emotions.length" :records="stats.emotions" />
          <p v-else class="loop-empty muted">完成一次识别后，这里会出现你的情绪轨迹</p>
        </div>
        <div class="card loop-card">
          <p class="loop-title">热榜 <span class="muted">服务端播放统计 · Top 5</span></p>
          <ol v-if="stats.hot.length" class="hot">
            <li v-for="(h, i) in stats.hot" :key="h.title" @click="$router.push('/player')">
              <span class="no tabular">{{ String(i + 1).padStart(2, '0') }}</span>
              <span class="ht">{{ h.title }}</span>
              <span class="hc muted">{{ h.artist }}</span>
              <span class="cnt tabular">{{ h.count }} 次</span>
            </li>
          </ol>
          <p v-else class="loop-empty muted">去播放几首歌，榜单会自动积累</p>
        </div>
      </div>
      <p class="totals muted">BFF 已收录 {{ stats.totals.events }} 条事件 · 累计播放 {{ stats.totals.plays }} 次 · 完播 {{ stats.totals.finishes ?? 0 }} 次 · 偏好已云端镜像</p>
    </section>

    <section v-if="pref.history.length" class="recent">
      <p class="nav-label">Recently Played · 最近播放</p>
      <div class="hchips">
        <span v-for="h in pref.history.slice(0, 12)" :key="h.key" class="hchip">{{ h.title }}</span>
      </div>
    </section>

    <footer class="foot muted">
      Vue3 · face-api.js 本地情绪识别 · Russell 效价-唤醒推荐 · 本地 CC0 曲库 + 在线试听双源
    </footer>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useEmotionDetect } from '../composables/useEmotionDetect'
import { usePreferenceStore } from '../stores/preference'
import { checkHealth, fetchStats } from '../services/track'
import MoodTrend from '../components/MoodTrend.vue'

const router = useRouter()
const detect = useEmotionDetect()
const pref = usePreferenceStore()
const ready = detect.loadProgress
const bffOk = ref(null)
const stats = ref(null)

// 首页 onMounted：静默预热模型 + 探测 BFF + 拉取统计 + 偏好云端恢复（§6.1.1a）
onMounted(async () => {
  detect.loadModels()
  await pref.restoreFromServer()
  bffOk.value = await checkHealth()
  if (bffOk.value) stats.value = await fetchStats()
})

const entries = [
  { mode: 'image',    title: '上传图片', desc: '选一张有正脸的照片，即刻读出情绪' },
  { mode: 'video',    title: '打开视频', desc: '播放本地视频，逐帧捕捉表情变化' },
  { mode: 'camera',   title: '实时摄像头', desc: '对准镜头，看七维情绪概率实时流动' },
  { mode: 'snapshot', title: '拍照识别', desc: '拍一张，三秒给你一份心情歌单' }
]

function go(mode) { router.push(`/detect/${mode}`) }
</script>

<style scoped>
.home { padding-top: 6vh; max-width: 900px; }
.display {
  font-family: var(--font-display); font-weight: 700; line-height: 0.98;
  font-size: clamp(56px, 9vw, 96px); letter-spacing: -0.02em; margin: 18px 0 26px;
}
.lede { font-size: 16px; line-height: 1.8; color: var(--ink-soft); max-width: 560px; }
.model-state {
  display: inline-flex; align-items: center; gap: 8px; margin-top: 26px;
  font-size: 13px; color: var(--ink-soft); font-variant-numeric: tabular-nums;
}
.model-state .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ink-soft); }
.model-state.ok { color: var(--accent); }
.model-state.ok .dot { background: var(--accent); box-shadow: 0 0 0 4px rgba(216,163,90,.15); }
.model-state.svc { margin-left: 18px; }
.model-state.svc.off { color: #e08a6f; }
.model-state.svc.off .dot { background: #e08a6f; }

.entries { display: flex; flex-direction: column; margin: 54px 0 40px; border-top: 1px solid var(--line); }
.entry {
  display: grid; grid-template-columns: 44px 1fr auto; align-items: center; gap: 20px;
  text-align: left; width: 100%; cursor: pointer; font: inherit; color: var(--ink);
  background: transparent; border: none; border-bottom: 1px solid var(--line);
  border-radius: 0; padding: 22px 8px; transition: padding .22s ease, background .22s ease;
}
.entry:hover { padding-left: 18px; background: var(--surface); }
.entry .no { font-family: var(--font-display); font-size: 13px; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.entry .body { display: flex; flex-direction: column; gap: 4px; }
.entry .t { font-size: 20px; font-weight: 600; }
.entry .d { font-size: 13px; }
.entry .arrow { font-size: 20px; color: var(--ink-soft); transition: transform .22s ease, color .22s ease; }
.entry:hover .arrow { color: var(--accent); transform: translateX(6px); }

.loop { margin: 40px 0; }
.loop .nav-label { margin-bottom: 14px; }
.loop-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 720px) { .loop-grid { grid-template-columns: 1fr; } }
.loop-card { padding: 18px; }
.loop-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; }
.loop-empty { font-size: 13px; padding: 24px 0; text-align: center; }
.hot { list-style: none; margin: 0; padding: 0; }
.hot li {
  display: grid; grid-template-columns: 28px 1fr 1fr auto; align-items: center; gap: 10px;
  padding: 9px 6px; border-bottom: 1px solid var(--line); cursor: pointer; font-size: 13px;
  transition: color .18s ease, background .18s ease;
}
.hot li:last-child { border-bottom: none; }
.hot li:hover { background: var(--surface); color: var(--accent); }
.hot .no { color: var(--ink-soft); font-size: 12px; }
.hot .ht { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hot .hc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.hot .cnt { text-align: right; font-size: 12px; color: var(--ink-soft); }
.totals { margin-top: 12px; font-size: 12px; }

.recent { margin-bottom: 40px; }
.recent .nav-label { margin-bottom: 12px; }
.foot { font-size: 12px; line-height: 1.8; }
</style>
