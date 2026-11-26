// 推荐引擎单测：锁住 V-A 打分、多样性打散、冷启动兜底、跳过降权等核心行为
import { describe, it, expect } from 'vitest'
import { recommend, probsToTarget, ORDER } from '../services/recommender'

const mk = (id, over = {}) => ({
  id, title: 't' + id, artist: 'A' + id, genre: 'pop', bpm: 120,
  v: 0.2, a: 0.0, pop: 0.5, ...over
})
const onehot = e => { const p = {}; for (const x of ORDER) p[x] = 0; p[e] = 1; return p }

describe('recommend 主流程', () => {
  it('开心情绪返回非空队列且主情绪为 happy', () => {
    const r = recommend(onehot('happy'), [mk(1), mk(2, { genre: 'dance', v: 0.8, a: 0.5 })])
    expect(r.list.length).toBeGreaterThan(0)
    expect(r.primary).toBe('happy')
    expect(r.coldStart).toBe(false)
  })

  it('低置信度触发冷启动兜底（neutral 日常歌单）', () => {
    const p = {}; for (const e of ORDER) p[e] = 1 / 7
    const r = recommend(p, [mk(1)])
    expect(r.coldStart).toBe(true)
    expect(r.primary).toBe('neutral')
    expect(r.list.length).toBe(1)
  })

  it('负向情绪 auto 策略走调节：目标效价被上牵引', () => {
    const raw = probsToTarget(onehot('sad'))
    const r = recommend(onehot('sad'), [mk(1)], { strategy: 'auto' })
    expect(r.strategy).toBe('regulate')
    expect(r.target.v).toBeGreaterThan(raw.v)
  })

  it('excludeIds 硬排除、skipIds 软降权（同分时被跳过者排后）', () => {
    const lib = [mk(1), mk(2)]
    expect(recommend(onehot('happy'), lib, { excludeIds: [1] }).list.map(s => s.id)).not.toContain(1)
    const r = recommend(onehot('happy'), lib, { skipIds: [1] })
    expect(r.list.find(s => s.id === 1).score).toBeLessThan(r.list.find(s => s.id === 2).score)
  })

  it('多样性打散：同一歌手在 Top8 中最多 3 首（其余名额由他人补位）', () => {
    const lib = [
      ...Array.from({ length: 6 }, (_, i) => mk(i + 1, { artist: 'Same' })),
      ...Array.from({ length: 10 }, (_, i) => mk(i + 100, { artist: 'Other' + i }))
    ]
    const r = recommend(onehot('happy'), lib, { limit: 8 })
    expect(r.list.length).toBe(8)
    expect(r.list.filter(s => s.artist === 'Same').length).toBeLessThanOrEqual(3)
  })

  it('recentIds 命中时 novelty 项为 0（降权但不排除）', () => {
    const lib = [mk(1), mk(2)]
    const r = recommend(onehot('happy'), lib, { recentIds: [1] })
    expect(r.list.find(s => s.id === 1).score).toBeLessThan(r.list.find(s => s.id === 2).score)
  })
})
