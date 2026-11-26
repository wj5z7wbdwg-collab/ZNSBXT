<template>
  <div class="song" :class="{ active }" @click="$emit('play')">
    <span class="no tabular">{{ String(index + 1).padStart(2, '0') }}</span>
    <div class="cover" :class="{ 'disc-spin': active }">
      <img v-if="song.cover" :src="song.cover" alt="" referrerpolicy="no-referrer" />
      <span v-else class="ph">{{ song.source === 'online' ? '◍' : '♪' }}</span>
    </div>
    <div class="meta">
      <div class="title">{{ song.title }}
        <span class="tag" :class="{ online: song.source === 'online' }">{{ song.source === 'online' ? '在线' : '本地' }}</span>
      </div>
      <div class="sub muted">
        <span class="artist">{{ song.artist }}</span>
        <span class="reason">{{ song.reason }}</span>
      </div>
    </div>
    <div class="acts" @click.stop>
      <button class="mini-btn" :class="{ fav }" :title="fav ? '已收藏' : '收藏（越用越懂你）'" @click="$emit('fav')">♥</button>
      <button class="mini-btn" title="跳过（降低该风格权重）" @click="$emit('skip')">⏭</button>
    </div>
  </div>
</template>

<script setup>
defineProps({ song: Object, active: Boolean, fav: Boolean, index: { type: Number, default: 0 } })
defineEmits(['play', 'fav', 'skip'])
</script>

<style scoped>
.song {
  display: flex; align-items: center; gap: 14px; padding: 11px 14px; cursor: pointer;
  background: var(--surface); border: 1px solid var(--line); border-radius: 12px;
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
}
.song:hover { border-color: #3a3e46; transform: translateX(4px); }
.song:hover .acts { opacity: 1; }
.song.active { border-color: var(--accent); background: var(--surface-2); }
.song.active .title { color: var(--accent); }
.song.active .acts { opacity: 1; }
.no { font-family: var(--font-display); font-size: 11px; color: var(--ink-soft); opacity: 0.6; flex: none; width: 18px; }
.cover { width: 46px; height: 46px; border-radius: 50%; overflow: hidden; flex: none;
  background: radial-gradient(circle at center, #3a3d44 16%, #1c1e22 18%, #141518 70%);
  display: grid; place-items: center; border: 1px solid var(--line); }
.cover img { width: 100%; height: 100%; object-fit: cover; }
.cover .ph { font-size: 17px; color: var(--ink-soft); }
.meta { flex: 1; min-width: 0; }
.title { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 8px; }
.sub { display: flex; gap: 10px; font-size: 12px; margin-top: 3px; min-width: 0; }
.artist { flex: none; max-width: 45%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.reason { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.7; }
.acts { display: flex; gap: 6px; opacity: 0; transition: opacity 0.15s; flex: none; }
.mini-btn { border: 1px solid var(--line); background: var(--surface-2); width: 30px; height: 30px;
  border-radius: 50%; cursor: pointer; font-size: 13px; color: var(--ink-soft); transition: all 0.15s; }
.mini-btn:hover { color: var(--accent); border-color: var(--accent); }
.mini-btn.fav { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); }
</style>
