<template>
  <div class="page player">
    <div class="head">
      <button class="btn ghost mini" @click="$router.push('/')">← 重新识别</button>
      <div class="head-txt">
        <p class="eyebrow">Now Playing · {{ EMO_META[emotion.primary].zh }}</p>
        <h2>{{ EMO_META[emotion.primary].emoji }} 这样的时刻，为你选了这些歌</h2>
      </div>
    </div>

    <!-- 控制条：共情/调节开关 + 嗨/静滑杆 + 换一批 + 手动改情绪（§6.2.5/§6.2.6） -->
    <div class="ctrls card">
      <div class="switch-wrap">
        <span>陪我难过</span>
        <div class="switch" :class="{ on: strategy === 'regulate' }" @click="toggleStrategy" />
        <span>让我开心</span>
      </div>
      <label class="slider">想安静一点
        <input type="range" min="-0.5" max="0.5" step="0.1" v-model.number="arousalShift" />
      想嗨一点</label>
      <button class="btn mini ghost" @click="shuffle">换一批</button>
      <button class="btn mini ghost" @click="cycleMode" :title="'点击切换播放模式'">{{ modeLabel }}</button>
      <label class="slider">定时停播
        <select v-model="sleepMin" @change="setSleep(sleepMin)" class="sleepsel" aria-label="定时停播">
          <option value="0">关</option>
          <option value="15">15 分钟</option>
          <option value="30">30 分钟</option>
          <option value="45">45 分钟</option>
        </select>
      </label>
      <div class="chips">
        <span class="chips-label">不准？手动选</span>
        <button v-for="e in chipList" :key="e.k" class="chip" :class="{ on: manual === e.k }"
          :style="{ borderColor: e.color }" @click="setManual(e.k)">{{ e.emoji }}</button>
      </div>
    </div>

    <div class="layout">
      <section class="list">
        <!-- 手动点歌：歌名/歌手直搜（P1-5） -->
        <form class="search" @submit.prevent="doSearch">
          <input v-model.trim="q" placeholder="搜索歌名 / 歌手，直接点歌…" aria-label="搜索歌曲" />
          <button class="btn mini" :disabled="searching">{{ searching ? '搜索中…' : '点歌' }}</button>
          <button type="button" v-if="searchActive" class="btn mini ghost" @click="backToRec">返回推荐</button>
        </form>
        <p class="nav-label">{{ searchActive ? 'Search Results · 点歌结果' : 'Up Next · 推荐队列' }}</p>
        <SongCard v-for="(s, i) in queue" :key="s.id" :song="s" :index="i"
          :active="current && current.id === s.id" :fav="pref.favIds.includes(s.id)"
          @play="playSong(s)" @fav="onFav(s)" @skip="onSkip(s)" />
        <p v-if="!queue.length && !onlineFailed" class="muted">歌曲加载中…</p>
        <p v-if="!queue.length && onlineFailed" class="muted tip">在线曲库不可用：请确认 BFF 已部署，并在仓库变量 VITE_API_BASE 中配置其地址</p>
        <p v-if="libFailed" class="muted tip">本地曲库不可用，已切换纯在线推荐</p>
        <section v-if="pref.history.length" class="history">
          <p class="nav-label">Recently Played · 最近播放</p>
          <div class="hchips">
            <span v-for="h in pref.history.slice(0, 12)" :key="h.key" class="hchip">{{ h.title }}</span>
          </div>
        </section>
      </section>

      <!-- 播放器：原生 <audio>（§4.1） -->
      <aside class="deck card" :style="{ '--glow': EMO_META[manual].color }">
        <div class="glow" aria-hidden="true" />
        <div class="disc" :class="{ 'disc-spin': playing }">
          <img v-if="current && current.cover" :src="current.cover" referrerpolicy="no-referrer" alt="" />
          <span v-else class="ph">♪</span>
        </div>
        <h3>{{ current ? current.title : '尚未播放' }}</h3>
        <p class="muted">{{ current ? current.artist : '从左侧队列点一首开始' }}</p>
        <div class="seek" :style="{ '--pct': seekPct + '%' }">
          <span class="tabular">{{ fmt(audio.currentTime) }}</span>
          <input type="range" min="0" :max="audio.duration || 0" step="0.1" v-model.number="seekPos"
            @change="seekTo" aria-label="进度" />
          <span class="tabular">{{ fmt(audio.duration) }}</span>
        </div>
        <div class="pbtns">
          <button class="pbtn" @click="prev" aria-label="上一首">⏮</button>
          <button class="pbtn main" @click="toggle" :aria-label="playing ? '暂停' : '播放'">{{ playing ? '❚❚' : '▶' }}</button>
          <button class="pbtn" @click="next" aria-label="下一首">⏭</button>
          <span class="vol"><span class="vlabel">音量</span><input type="range" min="0" max="1" step="0.05" v-model.number="volume" /></span>
        </div>
        <AudioSpectrum ref="spectrum" :get-audio="() => audioEl" />
        <!-- 同步歌词（在线曲目，LRC） -->
        <div class="lyrics" ref="lyricBox">
          <p v-if="!current" class="muted ltip">—</p>
          <template v-else-if="lyricLines.length">
            <p v-for="(l, i) in lyricLines" :key="i" :class="{ cur: i === lyricIdx }">{{ l.txt }}</p>
          </template>
          <p v-else class="muted ltip">该曲目暂无歌词</p>
        </div>
        <p class="lic muted">曲目来自网易云音乐公开接口，仅作试听</p>
      </aside>
    </div>

    <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
    <!-- crossOrigin：在线曲目走跨域 BFF 代理时，频谱才能取到音频数据 -->
    <audio ref="audioEl" crossorigin="anonymous" @timeupdate="onTick" @ended="onEnded" @error="onAudioError"></audio>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useEmotionStore } from '../stores/emotion'
import { usePreferenceStore } from '../stores/preference'
import { loadLibrary } from '../services/library'
import { recommend, ORDER, EMO_META } from '../services/recommender'
import { searchOnline, searchOnlineText, fetchLyric } from '../services/online'
import { reportEvent } from '../services/track'
import SongCard from '../components/SongCard.vue'
import AudioSpectrum from '../components/AudioSpectrum.vue'

const router = useRouter()
const emotion = useEmotionStore()
const pref = usePreferenceStore()

const queue = ref([])
const current = ref(null)
const playing = ref(false)
const strategy = ref('auto')
const arousalShift = ref(0)
const manual = ref(emotion.primary)
const onlineFailed = ref(false)
const libFailed = ref(false)
const toastMsg = ref('')
const seekPos = ref(0)
const volume = ref(0.8)
const audioEl = ref(null)
const spectrum = ref(null)
const lyricBox = ref(null)
const lyricLines = ref([])
const lyricIdx = ref(-1)
const audio = reactive({ currentTime: 0, duration: 0 })
// 播放模式（P1-7）：顺序 → 随机 → 单曲循环
const MODES = ['order', 'shuffle', 'single']
const MODE_ZH = { order: '顺序', shuffle: '随机', single: '单曲循环' }
const mode = ref('order')
const modeLabel = computed(() => MODE_ZH[mode.value])
// 定时停播（P1-10）
const sleepMin = ref('0')
// 手动点歌（P1-5）
const q = ref('')
const searching = ref(false)
const searchActive = ref(false)
// 波形进度条已播放比例（CSS 变量驱动）
const seekPct = computed(() => audio.duration ? Math.min(100, (seekPos.value / audio.duration) * 100) : 0)
let library = []
let excludeIds = []
let failStreak = 0
let sleepTimer = null, fadeTimer = null, pendingSeek = 0

// ---- 队列持久化（P1-9）：刷新/跳转后恢复上次的点歌队列 ----
const QKEY = 'moodtune.queue.v1'
function saveQueue(extra = {}) {
  try {
    localStorage.setItem(QKEY, JSON.stringify({
      queue: queue.value, currentId: current.value?.id || null,
      pos: Math.round(audio.currentTime || 0), ts: Date.now(),
      searchActive: searchActive.value, q: q.value, ...extra
    }))
  } catch { /* 超出配额则放弃持久化，不影响播放 */ }
}
function loadSavedQueue() {
  try {
    const s = JSON.parse(localStorage.getItem(QKEY))
    if (!s || !Array.isArray(s.queue) || !s.queue.length) return null
    if (Date.now() - (s.ts || 0) > 24 * 3600 * 1000) return null // 超过一天视为过期
    // 纯在线模式：本地曲目文件已移除，丢弃历史队列中的本地条目
    s.queue = s.queue.filter(t => t && t.source !== 'local')
    if (!s.queue.length) return null
    // 切换部署路径（根路径 ↔ GitHub Pages 子路径）后，旧队列里的 /music/xx 需补齐当前 base
    const base = import.meta.env.BASE_URL
    s.queue = s.queue.map(t => {
      const m = t && t.source === 'local' && typeof t.file === 'string' && t.file.match(/music\/[^/]+$/)
      return m && !t.file.startsWith(base) ? { ...t, file: base + m[0] } : t
    })
    return s
  } catch { return null }
}

// LRC 文本 → [{ t, txt }]（支持一行多时间戳），按时间排序
function parseLRC(text) {
  const out = []
  for (const line of String(text).split(/\r?\n/)) {
    const times = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    if (!times.length) continue
    const txt = line.replace(/\[[^\]]*\]/g, '').trim()
    if (!txt) continue
    for (const m of times) {
      const frac = m[3] ? Number(('' + m[3]).padEnd(3, '0')) / 1000 : 0
      out.push({ t: Number(m[1]) * 60 + Number(m[2]) + frac, txt })
    }
  }
  return out.sort((a, b) => a.t - b.t).slice(0, 400)
}

async function loadLyric(s) {
  lyricLines.value = []; lyricIdx.value = -1
  if (!s || s.source !== 'online') return
  const lrc = await fetchLyric(s.mid)
  if (current.value === s) lyricLines.value = parseLRC(lrc)
}
watch(current, s => loadLyric(s))

const chipList = computed(() => ORDER.map(k => ({ k, ...EMO_META[k] })))

function toast(msg) { toastMsg.value = msg; setTimeout(() => (toastMsg.value = ''), 2200) }

// 无情绪时冷启动兜底也走 neutral（§6.1.2）
function effectiveProbs() {
  if (manual.value === emotion.primary) return emotion.probs
  const onehot = {}; for (const e of ORDER) onehot[e] = 0
  onehot[manual.value] = 1
  return onehot
}

async function build() {
  const rec = recommend(effectiveProbs(), library, {
    strategy: strategy.value,
    arousalShift: arousalShift.value,
    genreWeights: pref.genreWeights,
    recentIds: pref.recentIds,
    skipIds: pref.skipIds, // 历史跳过的歌跨会话软降权（P0-1）
    excludeIds
  })
  let online = []
  onlineFailed.value = false // 每次重建都重试在线源，失败标记不永久化
  online = await searchOnline(manual.value, 8)
  if (!online.length && !excludeIds.length) onlineFailed.value = true
  // 双轨混排：本地/在线交替（§6.2.4）
  const merged = []
  const L = rec.list, O = online
  for (let i = 0; i < Math.max(L.length, O.length) && merged.length < 8; i++) {
    if (L[i]) merged.push(L[i])
    if (O[i]) merged.push(O[i])
  }
  queue.value = merged
  searchActive.value = false
  saveQueue()
}

onMounted(async () => {
  try {
    library = await loadLibrary()
  } catch {
    library = []
    libFailed.value = true
  }
  // 优先恢复上次的队列（含从收藏页「播放全部」跳转来的 autoplay）
  const saved = loadSavedQueue()
  if (saved) {
    queue.value = saved.queue
    if (saved.searchActive) { searchActive.value = true; q.value = saved.q || '' }
    const cur = saved.queue.find(s => s.id === saved.currentId)
    if (cur) {
      current.value = cur
      audioEl.value.src = cur.file
      pendingSeek = saved.pos || 0
      if (saved.autoplay) playSong(cur)
      else toast('已恢复上次的点歌队列')
    }
  } else {
    await build()
  }
  window.addEventListener('keydown', onKey)
  setupMediaSession()
})

onBeforeUnmount(() => {
  saveQueue()
  window.removeEventListener('keydown', onKey)
  clearTimeout(sleepTimer)
  clearInterval(fadeTimer)
})

watch([strategy, arousalShift, manual], build)

function shuffle() {
  excludeIds = [...excludeIds, ...queue.value.map(s => s.id)]
  build().then(() => toast('已为你换一批'))
}

function toggleStrategy() {
  strategy.value = strategy.value === 'regulate' ? 'congruent' : 'regulate'
}
function setManual(k) { manual.value = k }

function cycleMode() {
  mode.value = MODES[(MODES.indexOf(mode.value) + 1) % MODES.length]
  toast(`已切换为${MODE_ZH[mode.value]}模式`)
}

// ---- 手动点歌（P1-5） ----
async function doSearch() {
  const kw = q.value
  if (!kw || searching.value) return
  searching.value = true
  const res = await searchOnlineText(kw, 8)
  searching.value = false
  if (!res.length) { toast('没有找到可播放的结果，换个关键词试试'); return }
  queue.value = res
  searchActive.value = true
  saveQueue()
  toast(`找到 ${res.length} 首，点击即可点歌`)
}
function backToRec() { build() }

// ---- 定时停播（P1-10） ----
function setSleep(v) {
  clearTimeout(sleepTimer); clearInterval(fadeTimer)
  const min = Number(v)
  if (!min) { toast('已取消定时停播'); return }
  sleepTimer = setTimeout(fadeOut, min * 60000)
  toast(`${min} 分钟后将淡出停止播放`)
}
function fadeOut() {
  fadeTimer = setInterval(() => {
    volume.value = Math.max(0, +(volume.value - 0.05).toFixed(2))
    if (volume.value <= 0) {
      clearInterval(fadeTimer)
      if (audioEl.value) { audioEl.value.pause(); playing.value = false; spectrum.value?.stop() }
      volume.value = 0.8
      sleepMin.value = '0'
      toast('定时停播已结束')
    }
  }, 250)
}

function playSong(s) {
  // 数据闭环（P0-4）：中途切走且已播超过 5s → 上报 stop（含进度），供完播率统计
  const prevSong = current.value
  if (prevSong && prevSong.id !== s.id && audio.currentTime > 5) {
    reportEvent('stop', { id: prevSong.id, title: prevSong.title, at: Math.round(audio.currentTime), total: Math.round(audio.duration || 0) })
  }
  current.value = s
  pref.remember(s.id)
  pref.pushHistory(s)
  // 数据闭环：播放事件上报（热榜统计）
  reportEvent('play', { id: s.id, title: s.title, artist: s.artist, source: s.source, emotion: manual.value })
  const el = audioEl.value
  el.src = s.file
  el.play().then(() => { playing.value = true; spectrum.value?.start() }).catch(() => {
    playing.value = false
    toast('该曲目暂时无法播放，已跳过')
    failStreak++
    if (failStreak >= 3) { onlineFailed.value = true; failStreak = 0 }
    next()
  })
  saveQueue()
}

function toggle() {
  const el = audioEl.value
  if (!current.value && queue.value.length) return playSong(queue.value[0])
  if (el.paused) { el.play().then(() => spectrum.value?.start()); playing.value = true }
  else { el.pause(); playing.value = false; spectrum.value?.stop() }
}
function idx() { return queue.value.findIndex(s => current.value && s.id === current.value.id) }
function next() {
  const i = idx()
  let s
  if (mode.value === 'shuffle' && queue.value.length > 1) {
    do { s = queue.value[Math.floor(Math.random() * queue.value.length)] } while (s === current.value)
  } else {
    s = queue.value[(i + 1 + queue.value.length) % queue.value.length]
  }
  if (s) playSong(s)
}
// 自然播完：上报 finish；单曲循环则重播，否则按模式切下一首
function onEnded() {
  const s = current.value
  if (s) reportEvent('finish', { id: s.id, title: s.title, source: s.source })
  if (mode.value === 'single' && s && audioEl.value) {
    audioEl.value.currentTime = 0
    audioEl.value.play().catch(() => {})
    return
  }
  next()
}
function prev() {
  const i = idx()
  const s = queue.value[(i - 1 + queue.value.length) % queue.value.length]
  if (s) playSong(s)
}
function onTick() {
  const el = audioEl.value
  if (!el) return // 组件卸载后迟到的 timeupdate
  if (pendingSeek && el.duration > 0) { // 恢复队列后从上次位置续播（P1-9）
    el.currentTime = Math.min(pendingSeek, el.duration - 1)
    pendingSeek = 0
  }
  audio.currentTime = el.currentTime; audio.duration = el.duration || 0; seekPos.value = audio.currentTime
  syncLyric()
}
// 歌词逐行高亮 + 容器内自动滚动
function syncLyric() {
  const ls = lyricLines.value
  if (!ls.length) return
  let i = ls.length - 1
  while (i > 0 && ls[i].t > audio.currentTime) i--
  if (i === lyricIdx.value) return
  lyricIdx.value = i
  const box = lyricBox.value, el = box && box.children[i]
  if (el) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight, behavior: 'smooth' })
}
function seekTo() { audioEl.value.currentTime = seekPos.value }
watch(volume, v => { if (audioEl.value) audioEl.value.volume = v })

function onAudioError() {
  // §7.5：音频加载失败自动跳过
  toast('网络波动，已跳过该曲')
  failStreak++
  if (failStreak >= 3) { onlineFailed.value = true; failStreak = 0 }
  const i = idx()
  if (queue.value.length > 1) playSong(queue.value[(i + 1) % queue.value.length])
}

function onFav(s) {
  const added = pref.toggleFav(s)
  if (added) {
    reportEvent('fav', { id: s.id, title: s.title, genre: s.genre })
    toast('已收藏，可在「我的收藏」页回听，之后会更爱推这类风格')
  } else {
    toast('已取消收藏')
  }
}
function onSkip(s) {
  pref.skip(s)
  reportEvent('skip', { id: s.id, title: s.title, genre: s.genre })
  excludeIds.push(s.id)
  toast('已减少该风格推荐')
  build()
}

// ---- 键盘快捷键（P1-8）：空格播放/暂停，←上一首，→下一首 ----
function onKey(e) {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return
  if (e.code === 'Space') { e.preventDefault(); toggle() }
  else if (e.key === 'ArrowRight') next()
  else if (e.key === 'ArrowLeft') prev()
}

// ---- Media Session（P1-8）：系统媒体键 / 锁屏与浮窗控制 ----
function setupMediaSession() {
  if (!('mediaSession' in navigator)) return
  const ms = navigator.mediaSession
  try {
    ms.setActionHandler('play', () => toggle())
    ms.setActionHandler('pause', () => toggle())
    ms.setActionHandler('previoustrack', prev)
    ms.setActionHandler('nexttrack', () => next())
  } catch { /* 老浏览器不支持则忽略 */ }
}
watch(current, s => {
  if (!('mediaSession' in navigator) || !s) return
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: s.artist || '未知歌手', album: 'MoodTune' })
  } catch { /* MediaMetadata 不可用则跳过 */ }
})
watch(playing, p => {
  if ('mediaSession' in navigator) { try { navigator.mediaSession.playbackState = p ? 'playing' : 'paused' } catch {} }
})

function fmt(sec) {
  if (!sec || isNaN(sec)) return '0:00'
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
</script>

<style scoped>
.head { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; }
.head-txt { flex: 1; }
.head-txt .eyebrow { margin-bottom: 4px; }
.head h2 { font-size: 22px; font-weight: 600; }
.ctrls { display: flex; align-items: center; gap: 26px; padding: 14px 20px; margin-bottom: 24px; flex-wrap: wrap; }
.slider { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ink-soft); }
.slider input { width: 130px; }
.chips { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.chips-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-soft); margin-right: 4px; }
.chip { border: 2px solid; background: var(--surface-2); border-radius: 50%; width: 34px; height: 34px; font-size: 16px; cursor: pointer; opacity: 0.5; transition: all 0.15s; }
.chip.on, .chip:hover { opacity: 1; transform: scale(1.12); }
.layout { display: grid; grid-template-columns: 1.5fr 1fr; gap: 22px; align-items: start; }
@media (max-width: 860px) { .layout { grid-template-columns: 1fr; } }
.list { display: flex; flex-direction: column; gap: 10px; }
.list .nav-label { margin-bottom: 4px; }
.search { display: flex; gap: 8px; margin-bottom: 6px; }
.search input {
  flex: 1; background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px;
  color: var(--ink); padding: 9px 14px; font-size: 13px; outline: none; transition: border-color 0.15s;
}
.search input:focus { border-color: var(--accent); }
.sleepsel {
  background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px;
  color: var(--ink); padding: 5px 8px; font-size: 12px; outline: none; cursor: pointer;
}
.tip { font-size: 12px; }
.history { margin-top: 18px; }
.history .nav-label { margin-bottom: 10px; }

.deck { padding: 30px 22px 22px; text-align: center; position: sticky; top: 24px; overflow: hidden; }
.glow {
  position: absolute; top: 12px; left: 50%; width: 260px; height: 260px;
  transform: translateX(-50%); border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle, var(--glow), transparent 68%);
  filter: blur(70px); opacity: 0.22;
}
.disc {
  position: relative; width: 168px; height: 168px; margin: 0 auto 18px; border-radius: 50%;
  background: radial-gradient(circle at center, #3a3d44 15%, #141518 17%, #1c1e22 55%, #141518 80%, #1c1e22);
  display: grid; place-items: center; color: var(--ink-soft); font-size: 34px; overflow: hidden;
  border: 1px solid var(--line); box-shadow: 0 14px 44px rgba(0, 0, 0, 0.5);
}
.disc img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.disc .ph { font-family: var(--font-display); }
.deck h3 { font-size: 19px; font-weight: 600; }
.deck > .muted { font-size: 13px; margin-top: 4px; }

/* 波形样式进度：刻度线 + 已播放段染 accent */
.seek { display: flex; align-items: center; gap: 12px; margin: 20px 0 6px; font-size: 11px; color: var(--ink-soft); }
.seek input[type="range"] { flex: 1; -webkit-appearance: none; appearance: none; height: 20px; background: transparent; }
.seek input[type="range"]::-webkit-slider-runnable-track {
  height: 14px; border-radius: 2px;
  background-image:
    repeating-linear-gradient(90deg, var(--accent) 0 2px, transparent 2px 7px),
    repeating-linear-gradient(90deg, #3a3e46 0 2px, transparent 2px 7px);
  background-size: var(--pct, 0%) 100%, 100% 100%;
  background-repeat: no-repeat, no-repeat;
}
.seek input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 10px; height: 10px; border-radius: 50%;
  background: var(--ink); margin-top: 2px; box-shadow: 0 0 0 3px rgba(15, 16, 18, 0.9);
}
.seek input[type="range"]::-moz-range-track {
  height: 14px; border-radius: 2px;
  background-image:
    repeating-linear-gradient(90deg, var(--accent) 0 2px, transparent 2px 7px),
    repeating-linear-gradient(90deg, #3a3e46 0 2px, transparent 2px 7px);
  background-size: var(--pct, 0%) 100%, 100% 100%;
  background-repeat: no-repeat, no-repeat;
}
.seek input[type="range"]::-moz-range-thumb { width: 10px; height: 10px; border: none; border-radius: 50%; background: var(--ink); }

.pbtns { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px; }
.pbtn { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); width: 40px; height: 40px; border-radius: 50%; font-size: 13px; cursor: pointer; transition: border-color 0.15s, transform 0.15s; }
.pbtn:hover { border-color: var(--accent); transform: translateY(-1px); }
.pbtn.main { width: 54px; height: 54px; font-size: 16px; background: var(--accent); color: var(--accent-ink); border: none; letter-spacing: -0.08em; }
.vol { display: flex; align-items: center; gap: 8px; margin-left: 12px; }
.vlabel { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-soft); }
.vol input { width: 76px; }
.lic { margin-top: 18px; font-size: 11px; line-height: 1.7; }
.lyrics { position: relative; margin-top: 14px; max-height: 156px; overflow-y: auto; text-align: center;
  border-top: 1px solid var(--line); padding: 12px 4px; scroll-behavior: smooth; }
.lyrics p { font-size: 13px; line-height: 2; color: #61656d; transition: color 0.2s; }
.lyrics p.cur { color: var(--accent); font-weight: 600; }
.lyrics .ltip { font-size: 12px; }
</style>
