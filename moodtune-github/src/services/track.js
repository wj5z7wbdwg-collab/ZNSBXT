// 数据闭环上报（前端 → BFF）：全部 fire-and-forget，失败静默降级（K1 原则）
import axios from 'axios'
import { apiUrl } from './api'

const KEY = 'moodtune.device.v1'

// 匿名设备 ID：localStorage 生成一次，作为服务端事件/偏好的归属键
export function getDeviceId() {
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = 'd-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
    localStorage.setItem(KEY, id)
  }
  return id
}

export function reportEvent(type, payload) {
  axios.post(apiUrl('/api/event'), { deviceId: getDeviceId(), type, payload, ts: Date.now() }, { timeout: 3000 })
    .catch(() => { /* 后端不可达不影响功能 */ })
}

export async function fetchStats() {
  try {
    const { data } = await axios.get(apiUrl('/api/stats'), { timeout: 4000 })
    return data || null
  } catch { return null }
}

export async function checkHealth() {
  try {
    const { data } = await axios.get(apiUrl('/api/health'), { timeout: 3000 })
    return !!data?.ok
  } catch { return false }
}

export function syncPref(pref) {
  axios.put(apiUrl('/api/pref'), { deviceId: getDeviceId(), pref }, { timeout: 3000 }).catch(() => {})
}

export async function restorePref() {
  try {
    const { data } = await axios.get(apiUrl('/api/pref'), { params: { deviceId: getDeviceId() }, timeout: 4000 })
    return data?.pref || null
  } catch { return null }
}
