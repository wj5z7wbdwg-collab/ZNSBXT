<template>
  <!-- 心情曲线：情绪记录 → Russell 效价(v) 纵轴，SVG 折线+色点 -->
  <svg class="trend" :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="情绪效价曲线">
    <line :x1="PAD" :y1="H / 2" :x2="W - PAD" :y2="H / 2" stroke="var(--line)" stroke-dasharray="3 5" />
    <text :x="W - PAD" :y="H / 2 - 6" text-anchor="end" class="axis">愉悦</text>
    <text :x="W - PAD" :y="H / 2 + 12" text-anchor="end" class="axis">低落</text>
    <polyline v-if="pts.length > 1" :points="linePts" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.7" />
    <circle v-for="(p, i) in pts" :key="i" :cx="p.x" :cy="p.y" :r="pts.length === 1 ? 5 : 4" :style="{ fill: p.color }">
      <title>{{ p.label }}</title>
    </circle>
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import { EMOTION_VA, EMO_META } from '../services/recommender'

const props = defineProps({ records: { type: Array, required: true } })
const W = 340, H = 96, PAD = 10

const pts = computed(() => {
  const rs = props.records
  const n = Math.max(rs.length - 1, 1)
  return rs.map((r, i) => {
    const key = r.payload?.primary || 'neutral'
    const meta = EMO_META[key] || EMO_META.neutral
    const v = EMOTION_VA[key]?.v ?? 0
    return {
      x: PAD + (i / n) * (W - PAD * 2),
      y: H / 2 - v * (H / 2 - 14),
      color: meta.color,
      label: `${new Date(r.ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${meta.zh} ${Math.round((r.payload?.conf || 0) * 100)}%`
    }
  })
})
const linePts = computed(() => pts.value.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '))
</script>

<style scoped>
.trend { display: block; width: 100%; height: 96px; }
.axis { font-size: 9px; fill: var(--ink-soft); letter-spacing: 0.08em; }
circle { cursor: default; transition: r 0.15s; }
circle:hover { r: 6; }
</style>
