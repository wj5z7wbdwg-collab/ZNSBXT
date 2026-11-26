// 在线歌曲检索（§6.2.4）：情绪 → 检索词 → BFF(/api/search) → 标准化曲目
// 9s 超时静默降级返回 []（K1 对策：在线失败不影响系统可用；BFF 冷路径需校验外链可播性）
import axios from 'axios'
import { ONLINE_KEYWORDS } from './recommender'
import { apiUrl } from './api'

export async function searchOnline(emotion, limit = 4) {
  return requestSearch({ emotion, limit }, t =>
    t.hot ? '当前热榜 · 网易云飙升/热歌榜单' : `在线检索 · 关键词「${ONLINE_KEYWORDS[emotion] || emotion}」`)
}

// 手动点歌：按歌名/歌手直搜（BFF /api/search?q= 通道）
export async function searchOnlineText(q, limit = 8) {
  return requestSearch({ q, limit }, () => `手动点歌 ·「${q}」`)
}

// 统一请求 + 曲目标准化
async function requestSearch(params, reasonFn) {
  try {
    const { data } = await axios.get(apiUrl('/api/search'), { params, timeout: 9000 })
    const tracks = Array.isArray(data?.tracks) ? data.tracks : []
    return tracks.map((t, i) => ({
      id: `O${t.id ?? i}`,
      mid: t.id, // 原始平台 ID，供 /api/lyric 取歌词
      title: t.name || t.title || '未知曲目',
      artist: t.artist || '未知歌手',
      // BFF 返回的音频是本站 /api/play 代理路径，跨域部署时补全为绝对地址
      file: t.url && /^https?:/i.test(t.url) ? t.url : apiUrl(t.url),
      cover: t.cover || '',
      lyric: t.lrc || '',
      v: null, a: null, bpm: null,
      genre: 'online',
      lang: 'zh',
      pop: 0.6,
      source: 'online',
      hot: !!t.hot,
      reason: reasonFn(t)
    })).filter(t => t.file)
  } catch {
    return [] // 降级：静默返回空，列表由本地结果补位
  }
}

// 拉取在线曲目 LRC 歌词（BFF /api/lyric），失败返回 ''
export async function fetchLyric(mid) {
  if (mid == null || mid === '') return ''
  try {
    const { data } = await axios.get(apiUrl('/api/lyric'), { params: { id: mid }, timeout: 4000 })
    return data?.lyric || ''
  } catch {
    return ''
  }
}
