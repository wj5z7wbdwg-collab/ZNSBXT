import { defineStore } from 'pinia'

// 识别结果跨页共享
export const useEmotionStore = defineStore('emotion', {
  state: () => ({
    probs: { neutral: 1 },   // 7 维概率
    primary: 'neutral',
    conf: 1,
    coldStart: false,        // 低置信度兜底标记
    source: null             // image | video | camera | snapshot
  }),
  actions: {
    setResult({ probs, primary, conf, coldStart, source }) {
      this.probs = probs
      this.primary = primary
      this.conf = conf
      this.coldStart = coldStart
      this.source = source
    }
  }
})
