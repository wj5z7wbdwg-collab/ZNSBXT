/**
 * 下载 face-api.js 预训练模型到 public/models（§4.2，本地托管）
 * 从 GitHub justadudewhohacks/face-api.js/weights 拉取 manifest + 分片
 * 运行：node scripts/fetch-models.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const BASE = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'
const MANIFESTS = [
  'tiny_face_detector_model-weights_manifest.json',
  'face_landmark_68_tiny_model-weights_manifest.json',
  'face_expression_model-weights_manifest.json'
]

const UA = { headers: { 'User-Agent': 'Mozilla/5.0' } }
await mkdir('public/models', { recursive: true })

async function get(url) {
  const res = await fetch(url, { ...UA, signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res
}

for (const m of MANIFESTS) {
  const out = `public/models/${m}`
  if (existsSync(out)) { console.log(`= ${m}`); continue }
  const json = await (await get(`${BASE}/${m}`)).json()
  await writeFile(out, JSON.stringify(json))
  console.log(`✓ ${m}`)
  for (const shard of json) {
    for (const p of shard.paths || []) {
      const bin = `public/models/${p}`
      if (existsSync(bin)) continue
      const buf = Buffer.from(await (await get(`${BASE}/${p}`)).arrayBuffer())
      await writeFile(bin, buf)
      console.log(`✓ ${p} (${(buf.length / 1024 / 1024).toFixed(2)}MB)`)
    }
  }
}
console.log('模型就绪：public/models')
