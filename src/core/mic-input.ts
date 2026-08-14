import type { DetectedNote } from '../types'

export interface MicInputOptions {
  onNoteDetected: (note: DetectedNote) => void
  onPitchUpdate?: (midi: number | null, confidence: number) => void
  onError?: (error: Error) => void
}

/**
 * 麦克风输入管理器
 * getUserMedia + AudioWorklet + YIN 检测
 */
export class MicInput {
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private workletNode: AudioWorkletNode | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private options: MicInputOptions
  private startTime: number = 0
  private activePitch: number | null = null
  private activeOnsetTime: number = 0
  private activeConfidence: number = 0
  private activeFrequency: number | null = null
  /** 最短音符时长（ms），短于此值的检测视为瞬态假音并丢弃 */
  private readonly MIN_NOTE_DURATION = 100

  constructor(options: MicInputOptions) {
    this.options = options
  }

  /**
   * 检查浏览器是否支持
   */
  static isSupported(): boolean {
    return 'getUserMedia' in navigator && 'AudioContext' in window
  }

  /**
   * 结束当前活跃音符：时长 >= MIN_NOTE_DURATION 才发射，否则丢弃
   */
  private emitNote(endTime: number) {
    if (this.activePitch === null) return
    const duration = endTime - this.activeOnsetTime
    if (duration >= this.MIN_NOTE_DURATION) {
      const note: DetectedNote = {
        midi: this.activePitch,
        frequency: this.activeFrequency,
        onsetTime: this.activeOnsetTime,
        offsetTime: endTime,
        confidence: this.activeConfidence,
        velocity: null,
      }
      this.options.onNoteDetected(note)
    }
    this.activePitch = null
  }

  /**
   * 启动麦克风采集
   */
  async start(): Promise<void> {
    if (!MicInput.isSupported()) {
      throw new Error('当前浏览器不支持麦克风采集')
    }

    // 1. 申请麦克风权限（关闭浏览器内置处理以保留原始琴音）
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })

    // 2. 创建 AudioContext
    this.audioContext = new AudioContext({ sampleRate: 44100 })

    // 3. 加载 AudioWorklet
    await this.audioContext.audioWorklet.addModule(
      new URL('../core/pitch-processor.js', import.meta.url)
    )

    // 4. 连接音频图
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream)
    this.workletNode = new AudioWorkletNode(this.audioContext, 'pitch-processor')

    this.sourceNode.connect(this.workletNode)
    // 不连接到 destination（避免回声）

    // 5. 接收检测结果
    this.workletNode.port.onmessage = (e: MessageEvent) => {
      this.handlePitchResult(e.data)
    }

    this.startTime = performance.now()
  }

  private handlePitchResult(data: { pitch: number; midi?: number; confidence: number; time: number }) {
    const time = performance.now() - this.startTime

    if (data.pitch < 0 || data.midi === undefined) {
      // 音高结束 → 生成音符
      this.emitNote(time)
      this.options.onPitchUpdate?.(null, 0)
      return
    }

    // 新的音高 → onset 检测
    if (this.activePitch !== data.midi) {
      // 先结束之前的音
      this.emitNote(time)

      this.activePitch = data.midi
      this.activeOnsetTime = time
      this.activeConfidence = data.confidence
      this.activeFrequency = data.pitch
    }

    this.options.onPitchUpdate?.(data.midi, data.confidence)
  }

  /**
   * 停止采集
   */
  stop() {
    // 结束当前活跃音符
    if (this.activePitch !== null) {
      const time = performance.now() - this.startTime
      this.emitNote(time)
    }

    if (this.workletNode) {
      this.workletNode.port.onmessage = null
      this.workletNode.disconnect()
      this.workletNode = null
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect()
      this.sourceNode = null
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop())
      this.mediaStream = null
    }
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }
}
