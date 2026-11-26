// 本地曲库加载（单例缓存）；纯在线模式下曲库为空数组，属正常状态
const BASE = import.meta.env.BASE_URL

// 曲库里的 file 以站点根路径记录，构建到 GitHub Pages 子路径时需补齐 base
function withBase(file) {
  if (!file || /^https?:/i.test(file)) return file
  return BASE + String(file).replace(/^\//, '')
}

let cache = null

export async function loadLibrary() {
  if (cache) return cache
  const res = await fetch(`${BASE}data/library.json`)
  if (!res.ok) throw new Error(`曲库 HTTP ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('曲库格式错误')
  cache = data.map(t => ({ ...t, file: withBase(t.file) }))
  return cache
}
