/**
 * YIN 音高检测算法
 * 改进的自相关法，适用于单音检测
 */

export interface PitchResult {
  /** 检测到的频率 Hz，-1 表示未检测到 */
  pitch: number
  /** 置信度 0~1 */
  confidence: number
}

/**
 * YIN 算法核心实现
 * @param buffer 音频采样缓冲区 (Float32Array)
 * @param sampleRate 采样率
 * @returns { pitch, confidence }
 */
export function yinPitchDetection(buffer: Float32Array, sampleRate: number): PitchResult {
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

  // 未找到谷底
  if (tau === halfSize || yinBuffer[tau] >= threshold) {
    return { pitch: -1, confidence: 0 }
  }

  // Step 4: 抛物线插值精确化
  let betterTau: number
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

  // 钢琴音域过滤 (A0=27.5Hz ~ C8=4186Hz)
  if (pitch < 27.5 || pitch > 4186) {
    return { pitch: -1, confidence: 0 }
  }

  return { pitch, confidence }
}

/**
 * 频率 → MIDI 音高
 */
export function freqToMidi(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440))
}

/**
 * 检测音频帧的能量（RMS）
 */
export function calculateRMS(buffer: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i]
  }
  return Math.sqrt(sum / buffer.length)
}

/**
 * 判断是否为静音帧
 */
export function isSilent(buffer: Float32Array, threshold = 0.01): boolean {
  return calculateRMS(buffer) < threshold
}
