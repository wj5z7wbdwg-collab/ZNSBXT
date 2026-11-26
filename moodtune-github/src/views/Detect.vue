<template>
  <div class="page detect">
    <div class="head">
      <button class="btn ghost mini" @click="$router.push('/')">← 返回</button>
      <div class="head-txt">
        <p class="eyebrow">Emotion Detect · {{ mode }}</p>
        <h2>{{ modeTitle }}</h2>
      </div>
      <span class="status" :class="{ locked }">{{ statusText }}</span>
    </div>

    <div class="layout">
      <!-- 预览区：video / img + 人脸框 overlay + 雷达动画 -->
      <div class="stage card">
        <div class="frame" :class="{ droppable: mode === 'image' }"
          @dragover.prevent="dragOver = true" @dragleave="dragOver = false"
          @drop.prevent="dragOver = false; onDrop($event)">
          <video v-show="usesVideo" ref="videoEl" playsinline muted></video>
          <img v-show="mode === 'image'" ref="imgEl" alt="" />
          <canvas ref="overlayEl" class="overlay"></canvas>
          <div v-if="scanning" class="radar" />
          <div v-if="mode === 'image' && !pickedFile" class="drop-hint" :class="{ over: dragOver }">
            拖拽图片到这里，或 Ctrl+V 粘贴截图
          </div>
        </div>
        <div v-if="camError" class="cam-error">⚠️ {{ camError }}</div>
        <div class="controls">
          <template v-if="mode === 'image'">
            <label class="btn">{{ pickedFile ? '换一张' : '选择图片' }}
              <input type="file" accept="image/*" hidden @change="onPickImage" />
            </label>
          </template>
          <template v-else-if="mode === 'video'">
            <label class="btn">{{ pickedFile ? '换视频' : '选择视频' }}
              <input type="file" accept="video/*" hidden @change="onPickVideo" />
            </label>
            <button class="btn ghost" v-if="pickedFile && !running" @click="startLoop">开始识别</button>
            <button class="btn ghost" v-if="running" @click="stopLoop">暂停</button>
          </template>
          <template v-else>
            <button class="btn" v-if="!running && mode === 'camera'" @click="startCameraMode">打开摄像头</button>
            <button class="btn ghost" v-if="running && mode === 'camera'" @click="stopLoop">关闭摄像头</button>
            <button class="btn" v-if="mode === 'snapshot' && running && !locked" @click="doSnapshot">拍照识别</button>
          </template>
        </div>
      </div>

      <!-- 结果区：仪表盘 + 主情绪 -->
      <aside class="side card">
        <p class="nav-label">Emotion Readout · 情绪读数</p>
        <EmotionGauge v-if="probs" :probs="probs" :primary="primary" />
        <p v-else class="muted hint">等待人脸…（请正面、光线充足；多人脸时自动选取中心最大的一张）</p>
        <div v-if="locked" class="verdict">
          <div v-if="allFaces.length > 1" class="faces">
            <p class="muted faces-tip">检测到 {{ allFaces.length }} 张人脸，点击切换推荐目标：</p>
            <button v-for="(f, i) in allFaces" :key="i" class="face-chip" :class="{ on: i === selIdx }"
              @click="selectFace(i)">{{ EMO_META[faceTop(f)].emoji }} 脸 {{ i + 1 }}</button>
          </div>
          <div class="big">{{ EMO_META[primary].emoji }} {{ EMO_META[primary].zh }}
            <small class="tabular">{{ Math.round(conf * 100) }}%</small>
          </div>
          <p v-if="noFace" class="muted">未在图片中检测到人脸（face-api.js 对真人正面照效果最好，卡通/emoji/侧脸易漏检），已兜底日常歌单</p>
          <p v-else-if="cartoonMode" class="muted">卡通/表情符号模式 · 基于嘴型与脸盘形态特征识别（非真人脸，结果供参考）</p>
          <p v-else-if="coldStartWarn" class="muted">置信度偏低，已为你准备日常歌单，也可去播放页手动改选情绪</p>
          <button class="btn go" @click="toPlayer">去挑歌 →</button>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFaceInput } from '../composables/useFaceInput'
import { useEmotionDetect } from '../composables/useEmotionDetect'
import { useEmotionStore } from '../stores/emotion'
import { EMO_META } from '../services/recommender'
import { reportEvent } from '../services/track'
import EmotionGauge from '../components/EmotionGauge.vue'

const route = useRoute()
const router = useRouter()
const mode = route.params.mode // image | video | camera | snapshot
const usesVideo = mode !== 'image'

const videoEl = ref(null), imgEl = ref(null), overlayEl = ref(null)
const input = useFaceInput()
const detect = useEmotionDetect()
const store = useEmotionStore()

const probs = ref(null), primary = ref('neutral'), conf = ref(0)
const locked = ref(false), scanning = ref(false), running = ref(false)
const pickedFile = ref(false), dragOver = ref(false)
const noFace = ref(false) // 单帧模式未检测到人脸标记
const cartoonMode = ref(false) // 卡通/emoji 兜底识别模式
const allFaces = ref([]) // 单帧模式检出的全部人脸（多人脸切换推荐）
const selIdx = ref(0) // 当前选中的脸索引
let lastGeo = null // 最近一次单帧检测的 {faces, w, h, el}，供切换脸时重画框
const camError = input.camError
const coldStartWarn = computed(() => conf.value < 0.4)

const modeTitle = { image: '上传图片识别', video: '打开视频识别', camera: '实时摄像头识别', snapshot: '拍照识别' }[mode]
const statusText = computed(() => {
  if (locked.value) return '✓ 情绪已锁定'
  if (running.value) return '识别中…'
  if (mode === 'camera' || mode === 'snapshot') return '摄像头未开启'
  return pickedFile.value ? '待开始' : `请选择${mode === 'video' ? '视频' : '图片'}`
})

let timer = null

async function ensureModels() {
  if (detect.loadProgress.value < 3) await detect.loadModels()
  return detect.loadProgress.value >= 3
}

// 单帧推理 + 画人脸框（主脸高亮，其余置灰，§6.1.2a）
async function processFrame() {
  const el = mode === 'image' ? imgEl.value : videoEl.value
  if (!el || !el.videoWidth && mode !== 'image' && !el.naturalWidth) return
  const w = el.videoWidth || el.naturalWidth || el.width
  const h = el.videoHeight || el.naturalHeight || el.height
  const faces = await detect.detectAll(el)
  const main = faces.length ? detect.pickPrimary(faces, w, h) : null
  drawBoxes(faces, w, h, el, main)

  if (!main) { statusNoFace(); return }

  const fused = detect.fuse(main.expressions)
  probs.value = fused.probs
  primary.value = fused.primary
  conf.value = fused.conf
  if (fused.locked) finish()
}

// 单帧直出模式（图片/拍照）：SSD 高精度检测 + 主脸增广投票（useEmotionDetect.analyzeStill）
async function processSingle(el) {
  const { faces, main, w, h, fallback } = await detect.analyzeStill(el)
  lastGeo = { faces, w, h, el }
  allFaces.value = faces
  selIdx.value = main ? Math.max(0, faces.indexOf(main)) : 0
  drawBoxes(faces, w, h, el, main)
  noFace.value = !main
  cartoonMode.value = !!fallback
  if (!main) {
    probs.value = { neutral: 1 }; primary.value = 'neutral'; conf.value = 0.2
    locked.value = true; scanning.value = false
    return
  }
  applyFace(selIdx.value)
  locked.value = true; scanning.value = false
}

// 将第 i 张脸的表情读数应用到推荐结果
function applyFace(i) {
  const f = allFaces.value[i]
  if (!f) return
  probs.value = { ...f.expressions }
  primary.value = faceTop(f)
  conf.value = f.expressions[primary.value]
}

function faceTop(f) {
  return Object.keys(f.expressions).reduce((a, b) => f.expressions[a] > f.expressions[b] ? a : b)
}

// 多人脸切换：改选目标脸后重算读数并重画高亮框
function selectFace(i) {
  if (!allFaces.value[i] || i === selIdx.value) return
  selIdx.value = i
  applyFace(i)
  if (lastGeo) drawBoxes(lastGeo.faces, lastGeo.w, lastGeo.h, lastGeo.el, allFaces.value[i])
}

function statusNoFace() {
  if (!probs.value) return
  // 保持上一次读数，不闪断
}

function drawBoxes(faces, w, h, el, main) {
  const cv = overlayEl.value
  const dispW = el.clientWidth, dispH = el.clientHeight
  cv.width = dispW; cv.height = dispH
  cv.style.width = dispW + 'px'; cv.style.height = dispH + 'px'
  const ctx = cv.getContext('2d')
  ctx.clearRect(0, 0, dispW, dispH)
  const sx = dispW / w, sy = dispH / h
  for (const f of faces) {
    const isMain = f === main
    ctx.strokeStyle = isMain ? '#d8a35a' : '#666a72'
    ctx.lineWidth = isMain ? 3 : 1.5
    ctx.strokeRect(f.box.x * sx, f.box.y * sy, f.box.w * sx, f.box.h * sy)
    if (isMain) {
      ctx.fillStyle = '#d8a35a'
      ctx.font = '12px "Space Grotesk Variable", "PingFang SC", sans-serif'
      ctx.fillText(`${EMO_META[Object.keys(f.expressions).reduce((a, b) => f.expressions[a] > f.expressions[b] ? a : b)].zh}`, f.box.x * sx, f.box.y * sy - 6)
    }
  }
}

function startLoop() {
  running.value = true; scanning.value = true
  detect.resetFusion(); locked.value = false
  timer = setInterval(() => { if (!locked.value) processFrame() }, 500) // 500ms 节流（§6.1.3）
}

function stopLoop() {
  running.value = false; scanning.value = false
  if (timer) { clearInterval(timer); timer = null }
  if (mode === 'camera') input.stopCamera()
}

function finish() {
  locked.value = true
  stopLoop()
}

async function startCameraMode() {
  if (!(await ensureModels())) return
  detect.resetFusion(); locked.value = false
  const ok = await input.startCamera(videoEl.value)
  if (ok) startLoop()
}

async function handleImageFile(file) {
  if (!file || !/^image\//.test(file.type)) return
  pickedFile.value = true
  if (!(await ensureModels())) return
  detect.resetFusion(); locked.value = false; scanning.value = true
  try {
    await input.bindImage(file, imgEl.value)
  } catch {
    scanning.value = false
    input.camError.value = '图片加载失败，请换一张试试'
    return
  }
  await processSingle(imgEl.value)
}

function onPickImage(e) { handleImageFile(e.target.files[0]) }

// 拖拽 / 粘贴上传（image 模式）
function onDrop(e) { handleImageFile(e.dataTransfer?.files?.[0]) }
function onPaste(e) {
  const item = [...(e.clipboardData?.items || [])].find(x => x.type.startsWith('image/'))
  if (item) handleImageFile(item.getAsFile())
}

async function onPickVideo(e) {
  const file = e.target.files[0]
  if (!file) return
  pickedFile.value = true
  if (!(await ensureModels())) return
  input.bindVideoFile(file, videoEl.value)
  videoEl.value.play()
  startLoop()
}

async function doSnapshot() {
  if (!(await ensureModels())) return
  const canvas = document.createElement('canvas')
  input.snapshot(videoEl.value, canvas)
  detect.resetFusion(); locked.value = false
  await processSingle(canvas)
  stopLoop()
}

function toPlayer() {
  const result = {
    probs: probs.value || { neutral: 1 },
    primary: primary.value,
    conf: conf.value,
    coldStart: conf.value < 0.4,
    source: mode
  }
  store.setResult(result)
  // 数据闭环：识别结果上报 BFF（fire-and-forget）
  reportEvent('emotion', { primary: result.primary, conf: result.conf, source: result.source })
  router.push('/player')
}

onMounted(async () => {
  if (mode === 'image') document.addEventListener('paste', onPaste)
  await ensureModels()
  if (mode === 'camera' || mode === 'snapshot') {
    const ok = await input.startCamera(videoEl.value)
    if (ok && mode === 'camera') startLoop()
    if (ok) running.value = true
  }
})

// 评审补充：离开页面必须关流+清定时器
onBeforeUnmount(() => {
  document.removeEventListener('paste', onPaste)
  stopLoop()
})
</script>

<style scoped>
.head { display: flex; align-items: center; gap: 16px; margin-bottom: 22px; }
.head-txt { flex: 1; }
.head-txt .eyebrow { margin-bottom: 4px; }
.head h2 { font-size: 22px; font-weight: 600; }
.status {
  font-size: 12px; color: var(--ink-soft); letter-spacing: 0.04em;
  border: 1px solid var(--line); border-radius: 999px; padding: 5px 14px;
  background: var(--surface); font-variant-numeric: tabular-nums; white-space: nowrap;
}
.status.locked { color: var(--accent); border-color: rgba(216, 163, 90, 0.45); }
.layout { display: grid; grid-template-columns: 1.5fr 1fr; gap: 20px; }
@media (max-width: 860px) { .layout { grid-template-columns: 1fr; } }
.stage { padding: 14px; }
.frame {
  position: relative; border-radius: 10px; overflow: hidden; min-height: 340px;
  background-color: #0b0c0e;
  background-image:
    linear-gradient(rgba(236, 233, 226, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(236, 233, 226, 0.035) 1px, transparent 1px);
  background-size: 26px 26px;
}
.frame.droppable { border: 2px dashed transparent; transition: border-color .15s; }
.frame.droppable.over, .frame.droppable:active { border-color: var(--accent); }
.drop-hint {
  position: absolute; inset: 0; display: grid; place-items: center; color: #565b63;
  font-size: 13px; letter-spacing: 0.04em; pointer-events: none;
}
.drop-hint.over { color: var(--accent); }
.frame video, .frame img { width: 100%; display: block; max-height: 60vh; object-fit: contain; position: relative; }
.overlay { position: absolute; inset: 0; pointer-events: none; }
.cam-error {
  margin-top: 10px; font-size: 13px; color: #e08a6f;
  background: rgba(201, 103, 78, 0.12); border: 1px solid rgba(201, 103, 78, 0.3);
  padding: 8px 12px; border-radius: 10px;
}
.controls { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.side { padding: 22px; align-self: start; }
.side .nav-label { margin-bottom: 16px; }
.hint { font-size: 13px; line-height: 1.9; }
.verdict { margin-top: 20px; border-top: 1px solid var(--line); padding-top: 18px; }
.verdict .big { font-family: var(--font-display); font-size: 24px; font-weight: 700; }
.verdict .big small { font-size: 13px; color: var(--ink-soft); margin-left: 8px; font-weight: 500; }
.verdict p { font-size: 12px; margin: 10px 0; line-height: 1.7; }
.faces { margin-bottom: 14px; }
.faces-tip { font-size: 12px; margin: 0 0 8px; }
.face-chip {
  border: 1px solid var(--line); background: var(--surface-2); color: var(--ink-soft);
  border-radius: 999px; padding: 5px 12px; font-size: 12px; cursor: pointer;
  transition: all 0.15s; margin: 0 6px 6px 0;
}
.face-chip:hover { color: var(--accent); border-color: var(--accent); }
.face-chip.on { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); }
.go { margin-top: 14px; width: 100%; justify-content: center; }
</style>
