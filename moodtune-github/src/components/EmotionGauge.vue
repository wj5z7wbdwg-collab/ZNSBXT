<template>
  <!-- 情绪仪表盘：7 色水平条形图，主情绪高亮（§7.6） -->
  <div class="gauge">
    <div v-for="e in rows" :key="e.key" class="row" :class="{ primary: e.key === primary }">
      <span class="label">{{ e.emoji }} {{ e.zh }}</span>
      <div class="bar"><div class="bar-fill" :style="{ width: (e.pct * 100) + '%', background: e.color }" /></div>
      <span class="pct">{{ Math.round(e.pct * 100) }}%</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ORDER, EMO_META } from '../services/recommender'

const props = defineProps({ probs: Object, primary: String })
const rows = computed(() =>
  ORDER.map(k => ({ key: k, pct: props.probs[k] ?? 0, ...EMO_META[k] }))
    .sort((a, b) => b.pct - a.pct)
)
</script>

<style scoped>
.gauge { display: flex; flex-direction: column; gap: 9px; }
.row { display: grid; grid-template-columns: 86px 1fr 42px; align-items: center; gap: 10px;
  opacity: .5; transition: opacity .3s; font-size: 13px; }
.row.primary { opacity: 1; font-weight: 600; }
.row.primary .label { color: var(--ink); }
.label { color: var(--ink-soft); white-space: nowrap; }
.bar { height: 8px; background: var(--surface-2); border-radius: 999px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 999px; }
.pct { text-align: right; color: var(--ink-soft); font-variant-numeric: tabular-nums; font-size: 12px; }
</style>
