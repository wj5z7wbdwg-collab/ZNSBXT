// 四种人脸输入源统一抽象（§7.1）：图片 / 视频文件 / 实时摄像头 / 抓拍
// 调用方只需拿到一个"可推理元素"（<img>|<video>|<canvas>）
import { ref, onBeforeUnmount } from 'vue'

export function useFaceInput() {
  const stream = ref(null)
  const camError = ref('') // 权限被拒等异常文案（§7.5）

  async function startCamera(videoEl) {
    camError.value = ''
    try {
      stream.value = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      })
      videoEl.srcObject = stream.value
      await videoEl.play()
      return true
    } catch (e) {
      camError.value = e && e.name === 'NotAllowedError'
        ? '摄像头权限被拒绝：请在浏览器地址栏左侧允许权限，或改用「上传图片」方式'
        : '未检测到可用摄像头，可改用「上传图片 / 打开视频」方式'
      return false
    }
  }

  // 评审补充：组件销毁必须关流，否则摄像头指示灯常亮
  function stopCamera() {
    if (stream.value) {
      stream.value.getTracks().forEach(t => t.stop())
      stream.value = null
    }
  }

  // 图片文件 → <img> 元素可推理源
  function bindImage(file, imgEl) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      imgEl.onload = () => resolve(url)
      imgEl.onerror = () => reject(new Error('图片加载失败'))
      imgEl.src = url
    })
  }

  // 视频文件 → <video> 元素可推理源
  function bindVideoFile(file, videoEl) {
    const url = URL.createObjectURL(file)
    videoEl.src = url
    videoEl.loop = true
    return url
  }

  // 抓拍：video 当前帧 → canvas
  function snapshot(videoEl, canvasEl) {
    canvasEl.width = videoEl.videoWidth
    canvasEl.height = videoEl.videoHeight
    canvasEl.getContext('2d').drawImage(videoEl, 0, 0)
    return canvasEl
  }

  onBeforeUnmount(stopCamera)
  return { stream, camError, startCamera, stopCamera, bindImage, bindVideoFile, snapshot }
}
