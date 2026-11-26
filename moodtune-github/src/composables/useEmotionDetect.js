// 情绪识别引擎（§6.1）：模型加载/预热 → 多人脸检测 → 主脸选取 → EMA+突变检测时序融合
import { ref } from 'vue'
import { ORDER } from '../services/recommender'
import { emojiFeatures, classifyEmoji } from '../services/emojiClassify'

// face-api.js（639KB）动态导入：不进首屏 bundle，预热时按需加载
let faceapi = null

// 跟随 Vite base，兼容 GitHub Pages 项目站点子路径
const MODEL_URL = `${import.meta.env.BASE_URL}models`
const ALPHA = 0.3        // EMA 平滑系数
const SPIKE = 0.85       // 突变旁路阈值
const WINDOW = 6         // 稳定性投票窗口
const AGREE = 0.6        // Top1 一致率门槛

let loaded = false

export function useEmotionDetect() {
  const loading = ref(false)
  const loadProgress = ref(0) // 0~3（三个模型）
  const loadError = ref('')

  // §6.1.1a 并行加载 + 预热推理
  async function loadModels() {
    if (loaded) { loadProgress.value = 3; return true }
    loading.value = true
    loadError.value = ''
    try {
      if (!faceapi) {
        const mod = await import('face-api.js')
        faceapi = mod.default || mod
      }
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL).then(() => loadProgress.value++),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL).then(() => loadProgress.value++),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL).then(() => loadProgress.value++)
      ])
      // 预热：空白 canvas 推理一遍，初始化 WebGL 后端
      const warm = document.createElement('canvas')
      warm.width = warm.height = 128
      await faceapi.detectAllFaces(warm, detectorOpts()).catch(() => {})
      loaded = true
      return true
    } catch (e) {
      // 模型加载失败自动重试 1 次（§7.5）
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
        ])
        loaded = true
        return true
      } catch {
        loadError.value = '识别模型加载失败，请检查网络后刷新页面'
        return false
      }
    } finally {
      loading.value = false
    }
  }

  // 实时 320 保帧率；单帧（图片/拍照）416 提精度（官方建议静态大图用更高 inputSize）
  const detectorOpts = (inputSize = 320) =>
    new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.5 })

  // 检测全部人脸（含 68 点对齐 + 表情），返回 [{ box, expressions }]
  async function detectAll(inputEl, inputSize = 320) {
    const results = await faceapi
      .detectAllFaces(inputEl, detectorOpts(inputSize))
      .withFaceLandmarks(true)
      .withFaceExpressions()
    return results.map(r => ({
      box: { x: r.detection.box.x, y: r.detection.box.y, w: r.detection.box.width, h: r.detection.box.height },
      score: r.detection.score,
      expressions: r.expressions // FaceExpressions 对象 {neutral,happy,...}
    }))
  }

  // ---- 单帧（图片/拍照）高精度路径 ----
  // SSD MobileNetV1 按需加载（5.4MB）：静态图检测精度显著高于 Tiny，实时视频仍用 Tiny 保帧率
  let ssdLoaded = false
  async function ensureSsd() {
    if (ssdLoaded || !faceapi) return
    try {
      await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL)
      ssdLoaded = true
    } catch { /* SSD 加载失败回退 Tiny */ }
  }

  /**
   * 单帧分析：预处理 → SSD 检测全脸（Tiny 兜底）→ 主脸裁剪（25% padding）→ 原图+水平翻转双路表情推理取均值
   * 增广投票可显著抑制单帧随机误差与对齐偏差
   */
  async function analyzeStill(el) {
    await ensureSsd()
    // 预处理：透明 PNG 的 alpha 通道会让 face-api 读到纯黑背景致漏检，统一铺白底并限制最大边 640
    const src = await normalizeToCanvas(el)
    const opts = ssdLoaded
      ? new faceapi.SsdMobilenetv1Options({ minConfidence: 0.15, maxResults: 10 })
      : detectorOpts(416)
    let results = await faceapi
      .detectAllFaces(src, opts)
      .withFaceLandmarks(true)
      .withFaceExpressions()
    // 后备检测链：SSD 漏检时用 Tiny 重试（两种架构对卡通/低分辨率脸的检出能力互补）
    if (!results.length) {
      results = await faceapi
        .detectAllFaces(src, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.2 }))
        .withFaceLandmarks(true)
        .withFaceExpressions()
    }
    const faces = results.map(r => ({
      box: { x: r.detection.box.x, y: r.detection.box.y, w: r.detection.box.width, h: r.detection.box.height },
      score: r.detection.score,
      expressions: r.expressions
    }))
    const w = src.width
    const h = src.height
    const main = faces.length ? pickPrimary(faces, w, h) : null
    if (!main) {
      // 自动分流：真人脸检测失败 → 卡通/emoji 兜底（裁剪画面主体连通区，直接跑表情网络）
      const cb = await cartoonFallback(src).catch(() => null)
      if (cb) return { faces: [cb], main: cb, w, h, fallback: true }
      return { faces, main: null, w, h }
    }

    const pad = 0.25
    const bx = Math.max(0, main.box.x - main.box.w * pad)
    const by = Math.max(0, main.box.y - main.box.h * pad)
    const bw = Math.min(w - bx, main.box.w * (1 + pad * 2))
    const bh = Math.min(h - by, main.box.h * (1 + pad * 2))
    if (bw < 24 || bh < 24) return { faces, main, w, h }

    const crop = document.createElement('canvas')
    crop.width = Math.round(bw); crop.height = Math.round(bh)
    crop.getContext('2d').drawImage(src, bx, by, bw, bh, 0, 0, crop.width, crop.height)
    const flip = document.createElement('canvas')
    flip.width = crop.width; flip.height = crop.height
    const fctx = flip.getContext('2d')
    fctx.translate(flip.width, 0); fctx.scale(-1, 1)
    fctx.drawImage(crop, 0, 0)

    const infer = async (cv) => {
      try {
        const r = await faceapi.detectSingleFace(cv, detectorOpts(320)).withFaceExpressions()
        return r ? r.expressions : null
      } catch { return null }
    }
    const votes = (await Promise.all([infer(crop), infer(flip)])).filter(Boolean)
    if (votes.length) {
      const avg = {}
      for (const e of ORDER) avg[e] = votes.reduce((s, ex) => s + (ex[e] ?? 0), 0) / votes.length
      main.expressions = avg
    }
    return { faces, main, w, h }
  }

  // 将 img/canvas/video 统一绘制到白底 canvas：消除透明通道干扰，长边缩放到 640 以内
  async function normalizeToCanvas(el) {
    const sw = el.videoWidth || el.naturalWidth || el.width
    const sh = el.videoHeight || el.naturalHeight || el.height
    const scale = Math.min(1, 640 / Math.max(sw, sh))
    const cw = Math.round(sw * scale), ch = Math.round(sh * scale)
    const cv = document.createElement('canvas')
    cv.width = cw; cv.height = ch
    const ctx = cv.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, cw, ch)
    ctx.drawImage(el, 0, 0, sw, sh, 0, 0, cw, ch)
    return cv
  }

  // 卡通/emoji 兜底：白底图中定位最大非白连通区（主体），形态特征分类
  // face-api 表情网络只认识真人脸（实测大笑 emoji 被读成平静），故 emoji 支路改用形态启发式：
  // 黄色脸盘 + 嘴区暗部占比（张开的大嘴）+ 舌头红色占比 + 嘴部弧线上下曲率
  async function cartoonFallback(src) {
    const w = src.width, h = src.height
    const d = src.getContext('2d').getImageData(0, 0, w, h).data
    let minX = w, minY = h, maxX = -1, maxY = -1
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4
        if (d[i] < 246 || d[i + 1] < 246 || d[i + 2] < 246) { // 非白像素
          if (x < minX) minX = x; if (x > maxX) maxX = x
          if (y < minY) minY = y; if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) return null
    const pad = 0.12, bw = maxX - minX, bh = maxY - minY
    const bx = Math.max(0, minX - bw * pad), by = Math.max(0, minY - bh * pad)
    const cw = Math.min(w - bx, bw * (1 + 2 * pad)), ch = Math.min(h - by, bh * (1 + 2 * pad))
    if (cw < 24 || ch < 24) return null
    const crop = document.createElement('canvas')
    crop.width = Math.round(cw); crop.height = Math.round(ch)
    crop.getContext('2d').drawImage(src, bx, by, cw, ch, 0, 0, crop.width, crop.height)

    const f = emojiFeatures(crop)
    if (!f || f.yellow < 0.04) return null // 不像 emoji 脸（真人照片漏检等）→ 如实报"未检测到人脸"
    return { box: { x: bx, y: by, w: cw, h: ch }, score: 0, expressions: classifyEmoji(f) }
  }

  // §6.1.2a 主脸选取：0.6·面积归一 + 0.4·中心度
  function pickPrimary(faces, elW, elH) {
    if (!faces.length) return null
    const maxArea = Math.max(...faces.map(f => f.box.w * f.box.h)) || 1
    let best = null, bestRank = -1
    for (const f of faces) {
      const area = (f.box.w * f.box.h) / maxArea
      const cx = f.box.x + f.box.w / 2, cy = f.box.y + f.box.h / 2
      const center = 1 - Math.hypot(cx - elW / 2, cy - elH / 2) / Math.hypot(elW / 2, elH / 2)
      const rank = 0.6 * area + 0.4 * center
      if (rank > bestRank) { bestRank = rank; best = f }
    }
    return best
  }

  // ---- 时序融合状态（§6.1.3）----
  let smoothed = null
  let votes = []

  function resetFusion() { smoothed = null; votes = [] }

  /**
   * 输入单帧 7 维概率，输出融合后的概率 + 是否锁定
   * 突变旁路：max(p_t) ≥ 0.85 → 打断 EMA 直接采用并重置窗口
   */
  function fuse(expressions) {
    const p = {}
    for (const e of ORDER) p[e] = expressions[e] ?? 0
    const maxP = Math.max(...Object.values(p))

    if (maxP >= SPIKE) { smoothed = { ...p }; votes = [argmax(p)] }
    else if (!smoothed) smoothed = { ...p }
    else {
      for (const e of ORDER) smoothed[e] = ALPHA * p[e] + (1 - ALPHA) * smoothed[e]
    }

    const top = argmax(smoothed)
    votes.push(top)
    if (votes.length > WINDOW) votes.shift()
    const agree = votes.filter(x => x === top).length / votes.length
    const conf = smoothed[top]
    return { probs: { ...smoothed }, primary: top, conf, locked: votes.length >= WINDOW && agree >= AGREE && conf >= 0.55 }
  }

  function argmax(obj) {
    let k = ORDER[0], v = -1
    for (const e of ORDER) if (obj[e] > v) { v = obj[e]; k = e }
    return k
  }

  return { loading, loadProgress, loadError, loadModels, detectAll, analyzeStill, pickPrimary, fuse, resetFusion }
}
