/**
 * AudioWorklet 处理器 - YIN 音高检测
 * 运行在独立音频线程，不阻塞主线程 UI
 *
 * 注意：此文件必须为独立 JS 文件，不能使用 ES module import
 * YIN 算法直接内联在此文件中
 */

class PitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.bufferSize = 2048
    this.buffer = new Float32Array(this.bufferSize)
    this.bufferIndex = 0
    this.threshold = 0.1
    this.silenceThreshold = 0.01
    this.lastPitch = -1
    this.lastConfidence = 0
    this.smoothCount = 0
    this.minConfidence = 0.1
  }

  process(inputs) {
    const input = inputs[0][0]
    if (!input) return true

    for (let i = 0; i < input.length; i++) {
      this.buffer[this.bufferIndex++] = input[i]

      if (this.bufferIndex >= this.bufferSize) {
        this.bufferIndex = 0
        this.processBuffer()
      }
    }

    return true
  }

  processBuffer() {
    // 静音检测
    const rms = this.calculateRMS(this.buffer)
    if (rms < this.silenceThreshold) {
      // 如果之前有音高，发送结束信号
      if (this.lastPitch > 0) {
        this.port.postMessage({ pitch: -1, confidence: 0, time: currentTime })
        this.lastPitch = -1
        this.smoothCount = 0
      }
      return
    }

    const result = this.yinPitchDetection(this.buffer, sampleRate)

    if (result.confidence > this.minConfidence && result.pitch > 0) {
      // 平滑处理：连续 2 帧检测到相同音高才确认
      const midi = Math.round(69 + 12 * Math.log2(result.pitch / 440))

      if (midi === this.lastPitch) {
        this.smoothCount++
        if (this.smoothCount >= 2) {
          this.port.postMessage({
            pitch: result.pitch,
            midi: midi,
            confidence: result.confidence,
            time: currentTime,
          })
        }
      } else {
        this.lastPitch = midi
        this.smoothCount = 0
        // 新音高，立即发送（onset 检测）
        this.port.postMessage({
          pitch: result.pitch,
          midi: midi,
          confidence: result.confidence,
          time: currentTime,
        })
      }
    } else {
      this.lastPitch = -1
      this.smoothCount = 0
    }
  }

  calculateRMS(buffer) {
    let sum = 0
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i]
    }
    return Math.sqrt(sum / buffer.length)
  }

  yinPitchDetection(buffer, sampleRate) {
    const bufferSize = buffer.length
    const halfSize = Math.floor(bufferSize / 2)
    const yinBuffer = new Float32Array(halfSize)

    // Step 1: 差分函数
    for (let tau = 0; tau < halfSize; tau++) {
      let sum = 0
      for (let i = 0; i < halfSize; i++) {
        const delta = buffer[i] - buffer[i + tau]
        sum += delta * delta
      }
      yinBuffer[tau] = sum
    }

    // Step 2: 累积均值归一化
    yinBuffer[0] = 1
    let runningSum = 0
    for (let tau = 1; tau < halfSize; tau++) {
      runningSum += yinBuffer[tau]
      yinBuffer[tau] = yinBuffer[tau] * tau / runningSum
    }

    // Step 3: 绝对阈值法找谷底
    const threshold = 0.1
    let tau = 2
    while (tau < halfSize) {
      if (yinBuffer[tau] < threshold) {
        while (tau + 1 < halfSize && yinBuffer[tau + 1] < yinBuffer[tau]) {
          tau++
        }
        break
      }
      tau++
    }

    if (tau === halfSize || yinBuffer[tau] >= threshold) {
      return { pitch: -1, confidence: 0 }
    }

    // Step 4: 抛物线插值
    let betterTau
    const x0 = tau < 1 ? tau : tau - 1
    const x2 = tau + 1 < halfSize ? tau + 1 : tau

    if (x0 === tau) {
      betterTau = yinBuffer[tau] <= yinBuffer[x2] ? tau : x2
    } else if (x2 === tau) {
      betterTau = yinBuffer[tau] <= yinBuffer[x0] ? tau : x0
    } else {
      const s0 = yinBuffer[x0]
      const s1 = yinBuffer[tau]
      const s2 = yinBuffer[x2]
      betterTau = tau + (s2 - s0) / (2 * (2 * s1 - s2 - s0))
    }

    const pitch = sampleRate / betterTau
    const confidence = 1 - yinBuffer[tau]

    if (pitch < 27.5 || pitch > 4186) {
      return { pitch: -1, confidence: 0 }
    }

    return { pitch, confidence }
  }
}

registerProcessor('pitch-processor', PitchProcessor)
