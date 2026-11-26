/**
 * 下载无版权本地曲库（决策点 D2）
 * 音源（2026-10-27 实测可达，经 jsdelivr CDN，境外直连源均超时已弃用）：
 *  A. uncle-sheepsky/duru-ai-cc0-bgm —— CC0 电子/像素风 BGM 17 首
 *  B. youya-boop/Commercial-Use-Original-Music-Collection —— CC BY-ND 4.0 原创曲 12 首
 * 成功后自动生成 public/data/library.json（含 v/a/bpm 情绪标注）
 * 运行：npm run fetch-music
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const CDN_A = 'https://cdn.jsdelivr.net/gh/uncle-sheepsky/duru-ai-cc0-bgm@main/mp3/'
const CDN_B = 'https://cdn.jsdelivr.net/gh/youya-boop/Commercial-Use-Original-Music-Collection@master/'

// v/a ∈[-1,1]（效价/唤醒），genre 覆盖 GENRE_PROFILE 全风格
const TRACKS = [
  // ---- A: DURU-AI (CC0) ----
  { url: CDN_A + 'duru-arcade-vibe.mp3', out: 'duru-arcade-vibe.mp3', title: 'Arcade Vibe', artist: 'DURU-AI', genre: 'electronic', v: 0.55, a: 0.55, bpm: 128, pop: 0.70, lic: 'CC0 1.0' },
  { url: CDN_A + 'duru-denparcade.mp3', out: 'duru-denparcade.mp3', title: 'Denpa Arcade', artist: 'DURU-AI', genre: 'electronic', v: 0.35, a: 0.70, bpm: 140, pop: 0.60, lic: 'CC0 1.0' },
  { url: CDN_A + 'duru-rhythm-fever.mp3', out: 'duru-rhythm-fever.mp3', title: 'Rhythm Fever', artist: 'DURU-AI', genre: 'dance', v: 0.50, a: 0.80, bpm: 150, pop: 0.75, lic: 'CC0 1.0' },
  { url: CDN_A + 'duru-rondo.mp3', out: 'duru-rondo.mp3', title: 'Rondo', artist: 'DURU-AI', genre: 'classical', v: 0.30, a: 0.30, bpm: 100, pop: 0.60, lic: 'CC0 1.0' },
  { url: CDN_A + 'duru-roomscene-lofi.mp3', out: 'duru-roomscene-lofi.mp3', title: 'Room Scene Lofi', artist: 'DURU-AI', genre: 'lofi', v: 0.20, a: -0.20, bpm: 82, pop: 0.70, lic: 'CC0 1.0' },
  { url: CDN_A + 'duru-winter-arcade.mp3', out: 'duru-winter-arcade.mp3', title: 'Winter Arcade', artist: 'DURU-AI', genre: 'ambient', v: -0.10, a: -0.10, bpm: 90, pop: 0.55, lic: 'CC0 1.0' },
  { url: CDN_A + 'duru-ai-ep2-music.mp3', out: 'duru-ep2.mp3', title: 'Ep.2 Theme', artist: 'DURU-AI', genre: 'pop', v: 0.40, a: 0.40, bpm: 112, pop: 0.60, lic: 'CC0 1.0' },
  { url: CDN_A + 'hyak-ep1-rhythm.mp3', out: 'hyak-ep1-rhythm.mp3', title: 'Rhythm Start', artist: 'DURU-AI', genre: 'dance', v: 0.45, a: 0.65, bpm: 132, pop: 0.65, lic: 'CC0 1.0' },
  { url: CDN_A + 'hyak-ep2-korobeiniki-tetris.mp3', out: 'hyak-ep2-tetris.mp3', title: 'Korobeiniki 8Bit', artist: 'DURU-AI', genre: 'electronic', v: 0.30, a: 0.85, bpm: 152, pop: 0.80, lic: 'CC0 1.0' },
  { url: CDN_A + 'hyak-ep3-suika.mp3', out: 'hyak-ep3-suika.mp3', title: 'Suika Melody', artist: 'DURU-AI', genre: 'folk', v: 0.50, a: 0.35, bpm: 104, pop: 0.60, lic: 'CC0 1.0' },
  { url: CDN_A + 'hyak-ep4-blackhole.mp3', out: 'hyak-ep4-blackhole.mp3', title: 'Black Hole', artist: 'DURU-AI', genre: 'ambient', v: -0.35, a: -0.15, bpm: 76, pop: 0.50, lic: 'CC0 1.0' },
  { url: CDN_A + 'hyak-ep5-2048.mp3', out: 'hyak-ep5-2048.mp3', title: '2048 Groove', artist: 'DURU-AI', genre: 'electronic', v: 0.40, a: 0.50, bpm: 124, pop: 0.60, lic: 'CC0 1.0' },
  { url: CDN_A + 'hyak-ep6-galaxy.mp3', out: 'hyak-ep6-galaxy.mp3', title: 'Galaxy Drift', artist: 'DURU-AI', genre: 'ambient', v: 0.10, a: -0.30, bpm: 70, pop: 0.55, lic: 'CC0 1.0' },
  { url: CDN_A + 'hyak-ep7-danmaku.mp3', out: 'hyak-ep7-danmaku.mp3', title: 'Danmaku Storm', artist: 'DURU-AI', genre: 'electronic', v: 0.20, a: 0.90, bpm: 160, pop: 0.60, lic: 'CC0 1.0' },
  { url: CDN_A + 'korobeiniki-arcade-fullver.mp3', out: 'koro-full.mp3', title: 'Korobeiniki Full', artist: 'DURU-AI', genre: 'folk', v: 0.35, a: 0.60, bpm: 128, pop: 0.70, lic: 'CC0 1.0' },
  { url: CDN_A + 'korobeiniki-boombap-loop.mp3', out: 'koro-boombap.mp3', title: 'BoomBap Loop', artist: 'DURU-AI', genre: 'jazz', v: 0.30, a: 0.45, bpm: 95, pop: 0.60, lic: 'CC0 1.0' },
  { url: CDN_A + 'mountainking-arcade-loop.mp3', out: 'mountainking.mp3', title: 'Mountain King', artist: 'DURU-AI', genre: 'classical', v: -0.20, a: 0.70, bpm: 120, pop: 0.65, lic: 'CC0 1.0' },
  // ---- B: 尤雅原创曲集 (CC BY-ND 4.0) ----
  { url: CDN_B + encodeURIComponent('啪嗒啪嗒.wav'), out: 'yy-pada.wav', title: '啪嗒啪嗒', artist: '尤雅原创音乐', genre: 'pop', v: 0.45, a: 0.40, bpm: 108, pop: 0.65, lic: 'CC BY-ND 4.0' },
  { url: CDN_B + encodeURIComponent('嗒嗒嗒.wav'), out: 'yy-dada.wav', title: '嗒嗒嗒', artist: '尤雅原创音乐', genre: 'lofi', v: 0.20, a: 0.10, bpm: 92, pop: 0.55, lic: 'CC BY-ND 4.0' },
  { url: CDN_B + encodeURIComponent('小乖乖.wav'), out: 'yy-guaiguai.wav', title: '小乖乖', artist: '尤雅原创音乐', genre: 'ballad', v: 0.50, a: 0.20, bpm: 88, pop: 0.60, lic: 'CC BY-ND 4.0' },
  { url: CDN_B + encodeURIComponent('小曲.wav'), out: 'yy-xiaoqu.wav', title: '小曲', artist: '尤雅原创音乐', genre: 'folk', v: 0.35, a: 0.25, bpm: 100, pop: 0.55, lic: 'CC BY-ND 4.0' },
  { url: CDN_B + encodeURIComponent('平和时光.wav'), out: 'yy-pinghe.wav', title: '平和时光', artist: '尤雅原创音乐', genre: 'ambient', v: 0.15, a: -0.35, bpm: 68, pop: 0.60, lic: 'CC BY-ND 4.0' },
  { url: CDN_B + encodeURIComponent('心动.wav'), out: 'yy-xindong.wav', title: '心动', artist: '尤雅原创音乐', genre: 'piano', v: 0.55, a: 0.30, bpm: 96, pop: 0.70, lic: 'CC BY-ND 4.0' },
  { url: CDN_B + encodeURIComponent('心跳心跳.wav'), out: 'yy-xintiao.wav', title: '心跳心跳', artist: '尤雅原创音乐', genre: 'electronic', v: 0.10, a: 0.70, bpm: 134, pop: 0.60, lic: 'CC BY-ND 4.0' },
  { url: CDN_B + encodeURIComponent('摆动舞姿.wav'), out: 'yy-baidong.wav', title: '摆动舞姿', artist: '尤雅原创音乐', genre: 'dance', v: 0.50, a: 0.65, bpm: 126, pop: 0.65, lic: 'CC BY-ND 4.0' },
  { url: CDN_B + encodeURIComponent('激昂准备时.wav'), out: 'yy-jiang.wav', title: '激昂准备时', artist: '尤雅原创音乐', genre: 'rock', v: 0.00, a: 0.80, bpm: 142, pop: 0.60, lic: 'CC BY-ND 4.0' },
  { url: CDN_B + encodeURIComponent('电子旋律.wav'), out: 'yy-dianzi.wav', title: '电子旋律', artist: '尤雅原创音乐', genre: 'electronic', v: 0.30, a: 0.60, bpm: 128, pop: 0.60, lic: 'CC BY-ND 4.0' },
  { url: CDN_B + encodeURIComponent('耍帅小曲.wav'), out: 'yy-shuaishuai.wav', title: '耍帅小曲', artist: '尤雅原创音乐', genre: 'funk', v: 0.40, a: 0.50, bpm: 116, pop: 0.65, lic: 'CC BY-ND 4.0' },
  { url: CDN_B + encodeURIComponent('风之声.wav'), out: 'yy-feng.wav', title: '风之声', artist: '尤雅原创音乐', genre: 'piano', v: 0.25, a: -0.25, bpm: 74, pop: 0.60, lic: 'CC BY-ND 4.0' }
]

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'

async function download(t) {
  const out = `public/music/${t.out}`
  if (existsSync(out)) { console.log(`= 已存在 ${t.out}`); return true }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(t.url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(60000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 200_000) throw new Error(`内容过小(${buf.length}B)`)
      await writeFile(out, buf)
      console.log(`✓ ${t.out} (${(buf.length / 1024 / 1024).toFixed(1)}MB)`)
      return true
    } catch (e) { if (attempt === 2) { console.log(`✗ ${t.out}: ${e.message}`); return false } }
  }
}

await mkdir('public/music', { recursive: true })
await mkdir('public/data', { recursive: true })

const ok = []
for (const t of TRACKS) { if (await download(t)) ok.push(t) }

if (!ok.length) { console.error('全部下载失败，保留原 library.json'); process.exit(1) }

const library = ok.map((t, i) => ({
  id: `L${String(i + 1).padStart(3, '0')}`,
  title: t.title,
  artist: t.artist,
  file: `/music/${t.out}`,
  v: t.v, a: t.a, bpm: t.bpm, genre: t.genre, lang: 'zh', pop: t.pop,
  source: 'local',
  license: `${t.lic} · ${t.artist === 'DURU-AI' ? 'github.com/uncle-sheepsky/duru-ai-cc0-bgm' : 'github.com/youya-boop/Commercial-Use-Original-Music-Collection'}`
}))

await writeFile('public/data/library.json', JSON.stringify(library, null, 2))
console.log(`\n曲库完成：${library.length}/${TRACKS.length} 首 → public/data/library.json`)
