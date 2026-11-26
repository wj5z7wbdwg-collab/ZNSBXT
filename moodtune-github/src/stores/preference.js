import { defineStore } from 'pinia'
import { syncPref, restorePref } from '../services/track'

// §6.2.6 个性化（评审确认做减法）：收藏 +0.1 / 跳过 -0.05 风格权重
// 本地 localStorage 为准，服务端（BFF /api/pref）做防丢镜像
const LS_KEY = 'moodtune.pref.v1'

let syncTimer = null

function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {} } catch { return {} }
}

export const usePreferenceStore = defineStore('preference', {
  state: () => {
    const saved = load()
    return {
      genreWeights: saved.genreWeights || {},
      favIds: saved.favIds || [],
      favSongs: saved.favSongs || [],
      skipIds: saved.skipIds || [],
      recentIds: saved.recentIds || [],
      history: saved.history || []
    }
  },
  actions: {
    persist() {
      localStorage.setItem(LS_KEY, JSON.stringify({
        genreWeights: this.genreWeights, favIds: this.favIds, favSongs: this.favSongs,
        skipIds: this.skipIds, recentIds: this.recentIds, history: this.history
      }))
      // 防抖 1.5s 同步到服务端镜像
      clearTimeout(syncTimer)
      syncTimer = setTimeout(() => syncPref({
        genreWeights: this.genreWeights, favIds: this.favIds, favSongs: this.favSongs,
        skipIds: this.skipIds, recentIds: this.recentIds, history: this.history
      }), 1500)
    },
    // 本地为空（清缓存/换设备）时从服务端恢复
    async restoreFromServer() {
      if (this.favIds.length || this.history.length) return false
      const p = await restorePref()
      if (!p) return false
      this.genreWeights = p.genreWeights || {}
      this.favIds = p.favIds || []
      this.favSongs = p.favSongs || []
      this.skipIds = p.skipIds || []
      this.recentIds = p.recentIds || []
      this.history = p.history || []
      localStorage.setItem(LS_KEY, JSON.stringify(p))
      return true
    },
    // 播放历史（P1）：按曲目去重，最多保留 24 条
    pushHistory(song) {
      this.history = [{ key: song.id, title: song.title, artist: song.artist, source: song.source },
        ...this.history.filter(h => h.key !== song.id)].slice(0, 24)
      this.persist()
    },
    // 收藏开关：存曲目详情供「我的收藏」页展示播放；返回切换后状态（true=已收藏）
    toggleFav(song) {
      const i = this.favIds.indexOf(song.id)
      if (i >= 0) {
        this.favIds.splice(i, 1)
        this.favSongs = this.favSongs.filter(x => x.id !== song.id)
        this.genreWeights[song.genre] = (this.genreWeights[song.genre] || 0) - 0.1
        this.persist()
        return false
      }
      this.favIds.push(song.id)
      this.favSongs.unshift({
        id: song.id, title: song.title, artist: song.artist,
        source: song.source, file: song.file, cover: song.cover || '',
        mid: song.mid ?? null, genre: song.genre
      })
      this.genreWeights[song.genre] = (this.genreWeights[song.genre] || 0) + 0.1
      this.remember(song.id)
      this.persist()
      return true
    },
    skip(song) {
      if (!this.skipIds.includes(song.id)) this.skipIds.push(song.id)
      this.genreWeights[song.genre] = (this.genreWeights[song.genre] || 0) - 0.05
      this.persist()
    },
    remember(id) {
      this.recentIds = [id, ...this.recentIds.filter(x => x !== id)].slice(0, 12)
      this.persist()
    }
  }
})
