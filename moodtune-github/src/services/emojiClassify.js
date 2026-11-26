// emoji/卡通形态分类器（从 useEmotionDetect 抽出，classifyEmoji 为纯函数可单测）
// face-api 表情网络只认识真人脸（实测大笑 emoji 被读成平静），emoji 支路改用形态启发式：
// 黄色脸盘 + 嘴区暗部占比（张开的大嘴）+ 舌头红色占比 + 嘴部弧线上下曲率
import { ORDER } from './recommender'

// emoji 形态特征：黄色脸盘占比、嘴区暗部/红色占比、嘴弧曲率（暗像素偏上=微笑∪，偏下=悲伤∩）、眼区暗部占比
export function emojiFeatures(cv) {
  const w = cv.width, h = cv.height
  const d = cv.getContext('2d').getImageData(0, 0, w, h).data
  let yellow = 0, total = 0
  for (let i = 0; i < d.length; i += 4) {
    total++
    const r = d[i], g = d[i + 1], b = d[i + 2]
    if (r > 170 && g > 110 && b < 130) yellow++
  }
  const zone = (x0, x1, y0, y1) => {
    let dark = 0, red = 0, area = 0, darkTop = 0
    const my = (y0 + y1) / 2
    for (let y = Math.floor(y0 * h); y < Math.floor(y1 * h); y++) {
      for (let x = Math.floor(x0 * w); x < Math.floor(x1 * w); x++) {
        const i = (y * w + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2]
        area++
        const luma = 0.299 * r + 0.587 * g + 0.114 * b
        if (luma < 90) { dark++; if (y < my * h) darkTop++ } // 暗像素位于区域上半 → 微笑弧线特征
        if (r > 120 && r - g > 50 && r - b > 40) red++
      }
    }
    return { dark: dark / area, red: red / area, topFrac: dark ? darkTop / dark : 0.5 }
  }
  const mz = zone(0.28, 0.72, 0.5, 0.92)
  const ez = zone(0.2, 0.8, 0.25, 0.55)
  return { yellow: yellow / total, mouthDark: mz.dark, mouthRed: mz.red, mouthTopFrac: mz.topFrac, eyeDark: ez.dark }
}

// 阈值基于实测标定：大笑 emoji mouthDark=0.66/mouthRed=0.17/yellow=0.11，真人脸 mouthDark=0.02/yellow=0.03
export function classifyEmoji(f) {
  const p = { neutral: 0.05, happy: 0.05, sad: 0.05, angry: 0.03, fearful: 0.03, disgusted: 0.03, surprised: 0.03 }
  if (f.mouthDark >= 0.28) { p.happy = f.mouthRed > 0.1 ? 0.92 : 0.85; p.surprised = 0.05 }      // 大笑/吐舌
  else if (f.mouthDark >= 0.12) {
    if (f.eyeDark > 0.45 && f.mouthRed < 0.06) { p.surprised = 0.7; p.happy = 0.15 }              // O 型嘴+大眼
    else { p.happy = 0.65; p.neutral = 0.2 }                                                      // 中等开口笑
  } else if (f.mouthTopFrac >= 0.55) { p.happy = 0.6; p.neutral = 0.25 }                          // 嘴角上扬弧线
  else if (f.mouthTopFrac <= 0.45) { p.sad = 0.6; p.neutral = 0.25 }                              // 嘴角下垂弧线
  else { p.neutral = 0.7 }
  const s = ORDER.reduce((a, e) => a + p[e], 0)
  const out = {}
  for (const e of ORDER) out[e] = p[e] / s
  return out
}
