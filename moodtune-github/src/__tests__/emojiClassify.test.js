// emoji 形态分类器单测：锁住实测标定的阈值分支（特征值来自探针实测）
import { describe, it, expect } from 'vitest'
import { classifyEmoji } from '../services/emojiClassify'
import { ORDER } from '../services/recommender'

const argmax = p => ORDER.reduce((a, b) => (p[a] > p[b] ? a : b))

describe('classifyEmoji', () => {
  it('大笑 emoji（实测标定值）→ happy 占优', () => {
    const p = classifyEmoji({ yellow: 0.113, mouthDark: 0.661, mouthRed: 0.174, mouthTopFrac: 0.3, eyeDark: 0.2 })
    expect(argmax(p)).toBe('happy')
    expect(p.happy).toBeGreaterThan(0.7)
  })

  it('大嘴但不吐舌 → 仍是 happy', () => {
    const p = classifyEmoji({ yellow: 0.11, mouthDark: 0.4, mouthRed: 0.02, mouthTopFrac: 0.3, eyeDark: 0.2 })
    expect(argmax(p)).toBe('happy')
  })

  it('O 型嘴 + 大眼 → surprised', () => {
    const p = classifyEmoji({ yellow: 0.11, mouthDark: 0.2, mouthRed: 0.02, mouthTopFrac: 0.5, eyeDark: 0.5 })
    expect(argmax(p)).toBe('surprised')
  })

  it('中等开口 → happy', () => {
    const p = classifyEmoji({ yellow: 0.11, mouthDark: 0.15, mouthRed: 0.02, mouthTopFrac: 0.5, eyeDark: 0.2 })
    expect(argmax(p)).toBe('happy')
  })

  it('闭嘴 + 嘴角上扬弧线 → happy', () => {
    const p = classifyEmoji({ yellow: 0.11, mouthDark: 0.05, mouthRed: 0.01, mouthTopFrac: 0.7, eyeDark: 0.2 })
    expect(argmax(p)).toBe('happy')
  })

  it('闭嘴 + 嘴角下垂弧线 → sad', () => {
    const p = classifyEmoji({ yellow: 0.11, mouthDark: 0.05, mouthRed: 0.01, mouthTopFrac: 0.3, eyeDark: 0.2 })
    expect(argmax(p)).toBe('sad')
  })

  it('输出恒为归一化概率分布', () => {
    const p = classifyEmoji({ yellow: 0.1, mouthDark: 0.3, mouthRed: 0.1, mouthTopFrac: 0.5, eyeDark: 0.3 })
    const s = ORDER.reduce((a, e) => a + p[e], 0)
    expect(s).toBeCloseTo(1, 6)
  })
})
