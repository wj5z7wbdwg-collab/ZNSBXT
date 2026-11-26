<template>
  <canvas ref="cv" class="spectrum" width="260" height="44" />
</template>

<script setup>
// 频谱可视化（§4.1 可选扩展）：MediaElementSource → AnalyserNode → canvas 柱状图
// 仅在用户点击播放后建立音频图（规避 AudioContext 自动播放策略）
import { ref, onBeforeUnmount } from 'vue'

const props = defineProps({ getAudio: { type: Function, required: true } })
const cv = ref(null)
let analyser = null, data = null, raf = null, ctx2d = null

function ensureGraph() {
  if (analyser) return true
  const el = props.getAudio()
  if (!el) return false
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return false
  const actx = new AC()
  const src = actx.createMediaElementSource(el)
  analyser = actx.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.82
  src.connect(analyser)
  analyser.connect(actx.destination)
  data = new Uint8Array(analyser.frequencyBinCount)
  ctx2d = cv.value.getContext('2d')
  return true
}

function draw() {
  raf = requestAnimationFrame(draw)
  analyser.getByteFrequencyData(data)
  const w = cv.value.width, h = cv.value.height
  ctx2d.clearRect(0, 0, w, h)
  const n = 34, bw = w / n
  for (let i = 0; i < n; i++) {
    const v = data[Math.floor(i * data.length / n)] / 255
    const bh = Math.max(2, v * (h - 4))
    ctx2d.fillStyle = `hsl(${36 + v * 12}, ${45 + v * 25}%, ${40 + v * 26}%)`
    ctx2d.fillRect(i * bw + 1, h - bh, bw - 2, bh)
  }
}

function start() {
  if (!ensureGraph() || raf) return
  draw()
}
function stop() {
  if (raf) { cancelAnimationFrame(raf); raf = null }
  if (ctx2d && cv.value) ctx2d.clearRect(0, 0, cv.value.width, cv.value.height)
}
onBeforeUnmount(stop)
defineExpose({ start, stop })
</script>

<style scoped>
.spectrum { display: block; width: 100%; height: 44px; margin-top: 12px; opacity: .9; }
</style>
