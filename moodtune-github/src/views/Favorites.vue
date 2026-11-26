<template>
  <div class="page favs">
    <div class="head">
      <button class="btn ghost mini" @click="$router.push('/')">← 返回</button>
      <div class="head-txt">
        <p class="eyebrow">Favorites · 我的收藏</p>
        <h2>已收藏 {{ pref.favSongs.length }} 首</h2>
      </div>
      <button v-if="pref.favSongs.length" class="btn mini" @click="playAll">播放全部</button>
    </div>

    <p v-if="!pref.favSongs.length" class="muted empty">
      还没有收藏。在歌单播放页点 ♥ 即可收藏，收藏越多、推荐越合口味。
    </p>
    <section v-else class="list">
      <SongCard v-for="(s, i) in pref.favSongs" :key="s.id" :song="s" :index="i"
        :active="false" :fav="true" @play="playOne(s)" @fav="onUnfav(s)" />
    </section>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { usePreferenceStore } from '../stores/preference'
import { reportEvent } from '../services/track'
import SongCard from '../components/SongCard.vue'

const router = useRouter()
const pref = usePreferenceStore()

// 与 Player.vue 的队列持久化共用同一 localStorage 键，写入后跳转播放页自动恢复并播放
const QKEY = 'moodtune.queue.v1'
function handoff(queue, currentId) {
  try {
    localStorage.setItem(QKEY, JSON.stringify({ queue, currentId, pos: 0, ts: Date.now(), searchActive: false, q: '', autoplay: true }))
  } catch { /* 配额溢出则不跳转播放 */ }
  router.push('/player')
}
function playAll() { handoff(pref.favSongs, pref.favSongs[0]?.id || null) }
function playOne(s) { handoff(pref.favSongs, s.id) }

function onUnfav(s) {
  pref.toggleFav(s)
  reportEvent('skip', { id: s.id, title: s.title, genre: s.genre })
}
</script>

<style scoped>
.favs { max-width: 760px; }
.head { display: flex; align-items: center; gap: 16px; margin-bottom: 22px; }
.head-txt { flex: 1; }
.head-txt .eyebrow { margin-bottom: 4px; }
.head h2 { font-size: 22px; font-weight: 600; }
.empty { padding: 40px 0; }
.list { display: flex; flex-direction: column; gap: 10px; }
</style>
