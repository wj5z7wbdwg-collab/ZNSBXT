/**
 * BFF（决策点 D1/D4）：直连网易云公开 Web API（搜索/外链/歌词）+ 音频流代理 + 缓存 + 限流
 * + 数据中枢：事件上报（识别/播放/收藏/跳过）、统计、偏好镜像，JSON 文件持久化
 * + 生产单端口：dist 存在时静态托管 + SPA fallback（npm run build && npm start）
 * 启动：npm run bff （端口 8787，Vite dev 已配 /api 代理）
 */
import express from 'express'
import { Readable } from 'node:stream'
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
app.use(express.json({ limit: '64kb' }))

// CORS：前端托管在 GitHub Pages，BFF 独立部署时必须放行跨域；
// ALLOWED_ORIGIN 建议设为 https://<用户名>.github.io，默认 * 便于快速联调
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*')
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type,Range')
  // 音频拖动进度条（Range/206）需要暴露这些响应头
  res.set('Access-Control-Expose-Headers', 'Content-Range,Content-Length,Accept-Ranges')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

const PORT = process.env.PORT || 8787
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---- 持久化 store（5s 防抖写盘，重启不丢）----
const STORE_PATH = path.join(__dirname, 'data', 'store.json')
const store = { events: [], plays: 0, finishes: 0, hot: {}, prefs: {} }
try {
  Object.assign(store, JSON.parse(readFileSync(STORE_PATH, 'utf8')))
} catch (e) {
  // 解析失败（文件损坏）：先备份再重建，避免历史数据被静默清零
  if (existsSync(STORE_PATH)) {
    try {
      copyFileSync(STORE_PATH, STORE_PATH + '.bak')
      console.error('[store] store.json 解析失败，已备份为 store.json.bak 并以空库重建:', e.message)
    } catch { /* 备份失败也继续空库启动 */ }
  }
}
let dirty = false, flushTimer = null
function persistSoon() {
  dirty = true
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    if (!dirty) return
    dirty = false
    try {
      mkdirSync(path.dirname(STORE_PATH), { recursive: true })
      writeFileSync(STORE_PATH, JSON.stringify(store))
    } catch (e) { console.error('[store] 写盘失败:', e.message) }
  }, 5000)
}

// 网易云公开接口需要浏览器身份，否则 467/空结果
const NETEASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Referer: 'https://music.163.com/',
  Cookie: 'appverid=8.9.70'
}

// 情绪 → 检索词（与前端 recommender.js ONLINE_KEYWORDS 同源）
const KEYWORDS = {
  happy: '欢快 流行', sad: '治愈 抒情', angry: '摇滚 燃',
  fearful: '轻音乐 放松', surprised: '电子 节奏', disgusted: '民谣 轻松',
  neutral: '流行 热歌'
}

// ---- 缓存（TTL 120s）+ 限流（每分钟 60 次/IP）----
const cache = new Map()
const hits = new Map()
function rateLimitOk(ip) {
  const min = Math.floor(Date.now() / 60000)
  const rec = hits.get(ip)
  if (!rec || rec.min !== min) { hits.set(ip, { min, n: 1 }); return true }
  rec.n++
  return rec.n <= 60
}

// 缓存清扫：每 10 分钟移除过期的搜索/歌词缓存与 1 小时未活跃的限流记录，避免长跑内存缓涨
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of cache) if (now - v.t > 300000) cache.delete(k)
  for (const [k, v] of lyricCache) if (now - v.t > 600000) lyricCache.delete(k)
  for (const [k, v] of hits) if (now - v.min * 60000 > 3600000) hits.delete(k)
}, 600000).unref()

// 1) 搜索：POST /api/search/get（/web 变体已被网易云收紧为 405，老接口仍可用）
async function neteaseSearch(kw, limit) {
  const body = new URLSearchParams({ s: kw, type: '1', offset: '0', limit: String(Math.min(limit * 6, 30)) })
  const r = await fetch('https://music.163.com/api/search/get', {
    method: 'POST',
    headers: { ...NETEASE_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!r.ok) throw new Error(`search http ${r.status}`)
  const j = await r.json()
  return j?.result?.songs || []
}

// 2) 可播外链：outer/url 302 到 *.music.126.net 才算可播（VIP/无版权会跳占位或 404）
async function neteasePlayUrl(id) {
  const r = await fetch(`https://music.163.com/song/media/outer/url?id=${id}.mp3`, {
    headers: NETEASE_HEADERS, redirect: 'manual'
  })
  if (r.status !== 302) return null
  const loc = r.headers.get('location') || ''
  return /music\.126\.net/i.test(loc) ? loc : null
}

// 3) 封面：老搜索接口常缺 picUrl，用 song/detail 补取
async function neteasePic(id) {
  const r = await fetch(`https://music.163.com/api/song/detail/?id=${id}&ids=[${id}]`, { headers: NETEASE_HEADERS })
  if (!r.ok) return ''
  const j = await r.json()
  return String(j?.songs?.[0]?.album?.picUrl || '').replace(/^http:/, 'https:')
}

// 4) 热歌榜池：公开榜单歌单（热歌榜/飙升榜）= 当前真实流行，10min 缓存 + 逐首可播校验
const TOP_LIST_IDS = [3779629, 19723756]
let topPool = { t: 0, tracks: [] }
async function neteaseTopPool() {
  if (Date.now() - topPool.t < 600000 && topPool.tracks.length) return topPool.tracks
  const seen = new Set()
  const raw = []
  for (const listId of TOP_LIST_IDS) {
    try {
      const r = await fetch(`https://music.163.com/api/playlist/detail?id=${listId}`, { headers: NETEASE_HEADERS })
      const j = await r.json()
      const pl = j.playlist || j.result
      for (const s of (pl?.tracks || [])) {
        if (raw.length >= 40) break
        if (seen.has(s.id)) continue
        seen.add(s.id)
        raw.push(s)
      }
    } catch { /* 单榜失败跳过 */ }
  }
  const checked = await Promise.allSettled(raw.map(async (s) => {
    const playUrl = await neteasePlayUrl(s.id)
    if (!playUrl) return null // VIP/无版权：外链不可播，剔除
    let cover = String(s.album?.picUrl || '').replace(/^http:/, 'https:')
    if (!cover) cover = await neteasePic(s.id).catch(() => '')
    return { id: s.id, name: s.name, artist: (s.artists || []).map(a => a.name).join('/'), playUrl, cover }
  }))
  topPool = { t: Date.now(), tracks: checked.map(c => (c.status === 'fulfilled' ? c.value : null)).filter(Boolean) }
  return topPool.tracks
}

// 5) 歌词：GET /api/song/lyric（公开接口，返回 LRC 文本）
async function neteaseLyric(id) {
  const r = await fetch(`https://music.163.com/api/song/lyric?id=${id}&lv=1&kv=1&tv=-1`, { headers: NETEASE_HEADERS })
  if (!r.ok) return ''
  const j = await r.json()
  return j?.lrc?.lyric || ''
}

app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()), store: 'ready' }))

// ---- 数据闭环：事件上报 / 统计 / 偏好镜像 ----
// finish=自然播完（完播率依据）, stop=中途切歌（含已播秒数）
const EVENT_TYPES = new Set(['emotion', 'play', 'fav', 'skip', 'finish', 'stop'])
const MAX_EVENTS = 1000

app.post('/api/event', (req, res) => {
  if (!rateLimitOk(req.ip)) return res.status(429).json({ ok: false })
  const { type, deviceId, payload, ts } = req.body || {}
  if (!EVENT_TYPES.has(type) || !deviceId || typeof payload !== 'object' || !payload) {
    return res.status(400).json({ ok: false, error: 'bad event' })
  }
  store.events.push({ type, deviceId, ts: Number(ts) || Date.now(), payload })
  if (store.events.length > MAX_EVENTS) store.events.splice(0, store.events.length - MAX_EVENTS)
  if (type === 'play') {
    const key = String(payload.id || payload.title)
    const h = store.hot[key] || (store.hot[key] = { title: payload.title || '未知曲目', artist: payload.artist || '', source: payload.source || 'local', count: 0 })
    h.count++
    store.plays++
  }
  if (type === 'finish') store.finishes++
  persistSoon()
  res.json({ ok: true }) // 前端 fire-and-forget，无需返回数据
})

app.get('/api/stats', (_req, res) => {
  const emotions = store.events.filter(e => e.type === 'emotion').slice(-30)
  const hot = Object.values(store.hot).sort((a, b) => b.count - a.count).slice(0, 5)
  res.json({ emotions, hot, totals: { events: store.events.length, plays: store.plays, finishes: store.finishes || 0 } })
})

// 偏好镜像：本地为准，服务端仅作跨设备/清缓存恢复
app.put('/api/pref', (req, res) => {
  const { deviceId, pref } = req.body || {}
  if (!deviceId || typeof pref !== 'object' || !pref) return res.status(400).json({ ok: false })
  store.prefs[deviceId] = { pref, updatedAt: Date.now() }
  persistSoon()
  res.json({ ok: true })
})

app.get('/api/pref', (req, res) => {
  const rec = store.prefs[String(req.query.deviceId || '')]
  res.json(rec || { pref: null, updatedAt: 0 })
})

// 单曲校验：外链可播才返回标准化曲目（VIP/无版权返回 null）
async function verifyTrack(s, hot = false) {
  try {
    // fee=1(VIP) 的歌外链会 302 到 404，由 neteasePlayUrl 统一拦截；fee=8 等为免费可播曲
    const playUrl = await neteasePlayUrl(s.id)
    if (!playUrl) return null
    let cover = String(s.album?.picUrl || '').replace(/^http:/, 'https:')
    if (!cover) cover = await neteasePic(s.id).catch(() => '')
    return {
      id: s.id,
      name: s.name,
      artist: (s.artists || []).map(a => a.name).join('/'),
      url: `/api/play?u=${encodeURIComponent(playUrl)}`, // 走本服务流代理，规避防盗链
      cover,
      ...(hot ? { hot: true } : {})
    }
  } catch { return null }
}

app.get('/api/search', async (req, res) => {
  if (!rateLimitOk(req.ip)) return res.status(429).json({ tracks: [], error: 'too many requests' })

  const emotion = String(req.query.emotion || 'neutral')
  const q = String(req.query.q || '').trim().slice(0, 60) // 手动点歌：按歌名/歌手直搜
  const limit = Math.min(parseInt(req.query.limit) || 3, 10)
  const kw = q || KEYWORDS[emotion] || emotion
  const key = (q ? 'q:' : 'e:') + kw + '|' + limit

  const hit = cache.get(key)
  if (hit && Date.now() - hit.t < 300000) return res.json(hit.data)

  try {
    // 直搜通道：用户主动点名，不做热榜混入、不做标题词过滤（命中歌名正是所需）
    if (q) {
      const songs = await neteaseSearch(kw, limit).catch(() => [])
      const checked = await Promise.all(songs.slice(0, 16).map(s => verifyTrack(s)))
      const data = { tracks: checked.filter(Boolean).slice(0, limit), kw }
      cache.set(key, { t: Date.now(), data })
      return res.json(data)
    }

    // 情绪通道：热榜池与关键词检索并行，压缩冷路径耗时（前端 9s 超时保护）
    const [pool, songs] = await Promise.all([
      neteaseTopPool().catch(() => []),
      neteaseSearch(kw, limit).catch(() => [])
    ])
    // 混合策略：一半来自热歌榜池（当前真实流行），一半按情绪关键词检索；按 id 去重
    const hotTracks = pool.slice(0, Math.ceil(limit / 2)).map(t => ({
      id: t.id, name: t.name, artist: t.artist,
      url: `/api/play?u=${encodeURIComponent(t.playUrl)}`, cover: t.cover, hot: true
    }))
    const usedIds = new Set(hotTracks.map(t => t.id))
    const kwTokens = kw.split(/\s+/)
    // 候选过滤后并行校验外链可播性，保持搜索相关度原序
    const cands = songs.filter(s => !usedIds.has(s.id) && !(s.name && kwTokens.some(tk => s.name.includes(tk)))).slice(0, 16)
    const checked = await Promise.all(cands.map(s => verifyTrack(s)))
    const tracks = [...hotTracks, ...checked.filter(Boolean)].slice(0, limit)
    const data = { tracks, kw }
    cache.set(key, { t: Date.now(), data })
    res.json(data)
  } catch (e) {
    res.json({ tracks: [], kw, error: String(e.message || e) })
  }
})

// 启动即预热热榜池，首个用户请求不必等榜单校验
setTimeout(() => { neteaseTopPool().then(p => console.log('[toppool] 预热完成:', p.length, '首')).catch(() => {}) }, 1500)

// 歌词：返回 { lyric } LRC 文本，缓存 10min
const lyricCache = new Map()
app.get('/api/lyric', async (req, res) => {
  const id = String(req.query.id || '')
  if (!/^\d+$/.test(id)) return res.json({ lyric: '' })
  const hit = lyricCache.get(id)
  if (hit && Date.now() - hit.t < 600000) return res.json(hit.data)
  try {
    const data = { lyric: await neteaseLyric(id) }
    lyricCache.set(id, { t: Date.now(), data })
    res.json(data)
  } catch {
    res.json({ lyric: '' })
  }
})

// 音频流代理：解决网易云 CDN 防盗链/Referer 问题；透传 Range 以支持在线曲目拖动进度条
app.get('/api/play', async (req, res) => {
  const u = String(req.query.u || '')
  if (!/^https?:\/\/(.*\.)?(music\.126\.net|163\.com|music\.163\.com)(\/.*)?$/i.test(u) && !/^https?:\/\/m\d+\.music\.126\.net/i.test(u)) {
    return res.status(400).end('bad upstream')
  }
  try {
    const headers = { ...NETEASE_HEADERS }
    if (req.headers.range) headers.Range = req.headers.range
    // 中止控制：连接阶段 8s 超时；客户端切歌/关页时立即断开上游，避免连接泄漏
    const ac = new AbortController()
    const connectTimer = setTimeout(() => ac.abort(), 8000)
    req.on('close', () => ac.abort())
    let upstream
    try {
      upstream = await fetch(u, { headers, signal: ac.signal })
    } finally {
      clearTimeout(connectTimer)
    }
    if (!upstream.ok && upstream.status !== 206 || !upstream.body) return res.status(502).end()
    res.set('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg')
    res.set('Accept-Ranges', 'bytes')
    const len = upstream.headers.get('content-length')
    if (len) res.set('Content-Length', len)
    if (upstream.status === 206) {
      res.status(206)
      const cr = upstream.headers.get('content-range')
      if (cr) res.set('Content-Range', cr)
    }
    const stream = Readable.fromWeb(upstream.body)
    stream.on('error', () => { ac.abort(); res.destroy() })
    res.on('close', () => { stream.destroy(); ac.abort() })
    stream.pipe(res)
  } catch {
    if (!res.headersSent) res.status(502).end()
    else res.destroy()
  }
})

// ---- 生产单端口：dist 存在时托管前端（npm run build && npm start）----
const DIST = path.join(__dirname, '..', 'dist')
if (existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(DIST, 'index.html'))
  })
}

app.listen(PORT, () => console.log(`[bff] mood-tune on http://localhost:${PORT} · netease direct api · store events=${store.events.length}${existsSync(DIST) ? ' · serving dist/' : ''}`))

// ---- 进程守护配套：崩溃前同步落盘，配合 scripts/start-prod.ps1 自动重启 ----
function flushStore() {
  try {
    mkdirSync(path.dirname(STORE_PATH), { recursive: true })
    writeFileSync(STORE_PATH, JSON.stringify(store))
    console.log('[store] 已同步落盘')
  } catch (e) { console.error('[store] 落盘失败:', e.message) }
}
process.on('unhandledRejection', (e) => console.error('[bff] unhandledRejection:', e?.message || e))
process.on('uncaughtException', (e) => {
  console.error('[bff] uncaughtException:', e)
  flushStore()
  process.exit(1) // 交由守护脚本重启，避免半死状态继续服务
})
process.on('SIGINT', () => { flushStore(); process.exit(0) })
process.on('SIGTERM', () => { flushStore(); process.exit(0) })
