/**
 * 歌曲推荐引擎 —— 总体设计文档 §6.2 的直接实现
 * 情绪(7维概率) → Russell V-A 目标坐标 → 本地曲库打分 → 多样性打散 → Top-N
 */

// face-api.js 输出顺序（FER2013 七类）
export const ORDER = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised']

// 情绪元信息（中文名/emoji/主题色）
export const EMO_META = {
  happy:     { zh: '开心', emoji: '😊', color: 'var(--c-happy)' },
  sad:       { zh: '低落', emoji: '😢', color: 'var(--c-sad)' },
  surprised: { zh: '惊讶', emoji: '😲', color: 'var(--c-surprised)' },
  fearful:   { zh: '紧张', emoji: '😨', color: 'var(--c-fearful)' },
  angry:     { zh: '愤怒', emoji: '😠', color: 'var(--c-angry)' },
  disgusted: { zh: '厌烦', emoji: '🙁', color: 'var(--c-disgusted)' },
  neutral:   { zh: '平静', emoji: '😌', color: 'var(--c-neutral)' }
}

// §6.2.2 情绪 → 目标 V-A 坐标映射表
export const EMOTION_VA = {
  happy:     { v: 0.8,  a: 0.5 },
  sad:       { v: -0.6, a: -0.4 },
  angry:     { v: -0.5, a: 0.7 },
  fearful:   { v: -0.5, a: 0.5 },
  surprised: { v: 0.3,  a: 0.8 },
  disgusted: { v: -0.4, a: 0.0 },
  neutral:   { v: 0.2,  a: 0.0 }
}

// 风格画像命中表（GenreBoost 依据）
const GENRE_PROFILE = {
  happy:     ['pop', 'dance', 'funk', 'folk'],
  sad:       ['piano', 'ambient', 'classical', 'ballad'],
  angry:     ['rock', 'electronic', 'funk'],
  fearful:   ['ambient', 'piano', 'classical'],
  surprised: ['electronic', 'dance', 'pop'],
  disgusted: ['jazz', 'folk', 'pop'],
  neutral:   ['pop', 'jazz', 'lofi', 'folk']
}

// 情绪 → 在线检索词映射（§6.2.4）
export const ONLINE_KEYWORDS = {
  happy: '欢快 流行', sad: '治愈 抒情', angry: '摇滚 燃',
  fearful: '轻音乐 放松', surprised: '电子 节奏', disgusted: '民谣 轻松',
  neutral: '流行 热歌'
}

const NEGATIVE = ['sad', 'angry', 'fearful', 'disgusted']
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))
const D_MAX = Math.sqrt(8) // V-A 空间最大距离 2√2

/** 概率向量 → 目标 V-A 坐标（加权插值，天然支持混合情绪） */
export function probsToTarget(probs) {
  let v = 0, a = 0, s = 0
  for (const e of ORDER) {
    const p = probs[e] ?? 0
    v += p * EMOTION_VA[e].v
    a += p * EMOTION_VA[e].a
    s += p
  }
  return s > 0 ? { v: v / s, a: a / s } : { ...EMOTION_VA.neutral }
}

/** 单曲打分：0.55·sim + 0.25·GenreBoost + 0.10·pop + 0.10·Novelty + 个性化权重 */
function scoreSong(song, target, primary, ctx) {
  const sim = 1 - Math.hypot(song.v - target.v, song.a - target.a) / D_MAX
  const genreBoost = (GENRE_PROFILE[primary] || []).includes(song.genre) ? 1 : 0
  const novelty = ctx.recentIds.includes(song.id) ? 0 : 1
  const pref = clamp(ctx.genreWeights[song.genre] ?? 0, -0.2, 0.2)
  // BPM 联动（评审补充）：拉"嗨"时过滤低节奏，拉"静"时过滤高节奏
  let bpmPenalty = 0
  if (ctx.arousalShift > 0.25 && song.bpm != null && song.bpm < 115) bpmPenalty = 0.3
  if (ctx.arousalShift < -0.25 && song.bpm != null && song.bpm > 120) bpmPenalty = 0.2
  // 历史跳过软降权：跨会话生效但不硬排除，曲库极小时仍能出结果
  const skipPenalty = ctx.skipIds.includes(song.id) ? 0.6 : 0
  return 0.55 * sim + 0.25 * genreBoost + 0.10 * (song.pop ?? 0.5) + 0.10 * novelty + pref - bpmPenalty - skipPenalty
}

/** 多样性打散：同一歌手 ≤3、同一风格 ≤4 */
function diversify(sorted, limit) {
  const byArtist = {}, byGenre = {}
  const picked = [], deferred = []
  for (const s of sorted) {
    const rec = deferred.length ? deferred.find(x => x.song === s) : null
    const song = rec ? rec.song : s
    if ((byArtist[song.artist] || 0) >= 3 || (byGenre[song.genre] || 0) >= 4) {
      if (!rec) deferred.push({ song, score: s.__score })
      continue
    }
    byArtist[song.artist] = (byArtist[song.artist] || 0) + 1
    byGenre[song.genre] = (byGenre[song.genre] || 0) + 1
    picked.push(song)
    if (picked.length >= limit) break
  }
  // 名额未满时回填被顺延的候选：优先补未超歌手上限的，仍不足才放开上限
  const rest = []
  for (const d of deferred) {
    if (picked.length >= limit) { rest.push(d); continue }
    if ((byArtist[d.song.artist] || 0) < 3) {
      byArtist[d.song.artist] = (byArtist[d.song.artist] || 0) + 1
      picked.push(d.song)
    } else rest.push(d)
  }
  for (const d of rest) {
    if (picked.length >= limit) break
    picked.push(d.song)
  }
  return picked
}

/**
 * 主入口
 * @param probs    7 维情绪概率 {happy:0.78,...}
 * @param library  本地曲库数组（含 v/a/bpm/genre/pop）
 * @param opts     { strategy:'auto'|'congruent'|'regulate', arousalShift, genreWeights, recentIds, excludeIds, skipIds, limit }
 */
export function recommend(probs, library, opts = {}) {
  const {
    strategy = 'auto', arousalShift = 0, genreWeights = {},
    recentIds = [], excludeIds = [], skipIds = [], limit = 8
  } = opts

  // 主情绪与置信度；c<0.4 冷启动兜底 → 按 Neutral 出"日常歌单"（§6.1.2）
  let primary = ORDER[0], conf = -1
  for (const e of ORDER) if ((probs[e] ?? 0) > conf) { conf = probs[e] ?? 0; primary = e }
  const coldStart = conf < 0.4
  if (coldStart) primary = 'neutral'

  let target = probsToTarget(coldStart ? { neutral: 1 } : probs)
  const effective = strategy === 'auto'
    ? (NEGATIVE.includes(primary) ? 'regulate' : 'congruent')
    : strategy
  if (effective === 'regulate' && NEGATIVE.includes(primary)) {
    target = { v: clamp(target.v + 0.3, -1, 1), a: target.a } // 向积极牵引
  }
  target = { v: target.v, a: clamp(target.a + arousalShift, -1, 1) }

  const ctx = { genreWeights, recentIds, arousalShift, skipIds }
  const pool = library.filter(s => !excludeIds.includes(s.id))
  const scored = pool
    .map(s => { const o = { ...s, __score: scoreSong(s, target, primary, ctx) }; return o })
    .sort((a, b) => b.__score - a.__score)

  const list = diversify(scored, limit).map(s => ({
    ...s,
    score: +s.__score.toFixed(3),
    reason: coldStart
      ? '未捕捉到清晰情绪，先来一份日常歌单'
      : `检测到 ${Math.round((probs[primary] ?? conf) * 100)}% ${EMO_META[primary].zh} → ${
          effective === 'regulate' ? '向积极情绪调节' : '顺应此刻心情'
        } · ${s.bpm ? `${s.bpm} BPM` : s.genre}`
  }))

  return { list, primary, conf, coldStart, target, strategy: effective }
}
