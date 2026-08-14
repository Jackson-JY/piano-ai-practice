import type { DetectedNote } from '../types'

export interface MidiInputOptions {
  onNoteOn: (midi: number, velocity: number, time: number) => void
  onNoteOff: (midi: number, time: number) => void
}

/**
 * MIDI 输入管理器
 * 通过 Web MIDI API 连接电钢琴，获取精确的音符事件
 */
export class MidiInput {
  private midiAccess: MIDIAccess | null = null
  private activeNotes: Map<number, number> = new Map() // midi -> onsetTime
  private options: MidiInputOptions
  private startTime: number = 0

  constructor(options: MidiInputOptions) {
    this.options = options
  }

  /**
   * 检查浏览器是否支持 Web MIDI API
   */
  static isSupported(): boolean {
    return 'requestMIDIAccess' in navigator
  }

  /**
   * 连接 MIDI 设备
   */
  async connect(): Promise<void> {
    if (!MidiInput.isSupported()) {
      throw new Error('当前浏览器不支持 Web MIDI API（iPhone Safari 不支持，请使用 Chrome / Edge / Safari(macOS) 或 iPad）')
    }

    this.midiAccess = await navigator.requestMIDIAccess()

    // 监听所有输入设备
    this.midiAccess.inputs.forEach((input) => {
      input.onmidimessage = (e: MIDIMessageEvent) => this.handleMessage(e)
    })

    // 监听设备热插拔
    this.midiAccess.onstatechange = () => {
      this.midiAccess?.inputs.forEach((input) => {
        input.onmidimessage = (e: MIDIMessageEvent) => this.handleMessage(e)
      })
    }
  }

  /**
   * 设置起始时间（用于计算相对时间）
   */
  setStartTime(time: number) {
    this.startTime = time
  }

  private handleMessage(e: MIDIMessageEvent) {
    const data = e.data
    if (!data) return
    const [status, note, velocity] = data

    // Note On (status 144-159)
    if (status >= 144 && status <= 159 && velocity > 0) {
      const time = performance.now() - this.startTime
      this.activeNotes.set(note, time)
      this.options.onNoteOn(note, velocity, time)
    }
    // Note Off (status 128-143, 或 Note On velocity=0)
    else if ((status >= 128 && status <= 143) || (status >= 144 && status <= 159 && velocity === 0)) {
      const time = performance.now() - this.startTime
      this.activeNotes.delete(note)
      this.options.onNoteOff(note, time)
    }
  }

  /**
   * 获取当前活跃的音符（用于实时显示）
   */
  getActiveNotes(): number[] {
    return Array.from(this.activeNotes.keys())
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.midiAccess) {
      this.midiAccess.inputs.forEach((input) => {
        input.onmidimessage = null
      })
      this.midiAccess.onstatechange = null
      this.midiAccess = null
    }
    this.activeNotes.clear()
  }
}

/**
 * 将 MIDI 音符事件流转换为检测到的音符列表
 */
export function midiEventsToDetectedNotes(
  events: { note: number; velocity: number; time: number; type: 'on' | 'off' }[]
): DetectedNote[] {
  const notes: DetectedNote[] = []
  const activeMap: Map<number, number> = new Map() // midi -> onsetTime

  for (const evt of events) {
    if (evt.type === 'on') {
      activeMap.set(evt.note, evt.time)
    } else {
      const onset = activeMap.get(evt.note)
      if (onset !== undefined) {
        notes.push({
          midi: evt.note,
          frequency: null,
          onsetTime: onset,
          offsetTime: evt.time,
          confidence: 1,
          velocity: evt.velocity,
        })
        activeMap.delete(evt.note)
      }
    }
  }

  // 处理未关闭的音符（弹奏中途结束）
  activeMap.forEach((onset, midi) => {
    notes.push({
      midi,
      frequency: null,
      onsetTime: onset,
      offsetTime: onset + 500, // 默认 500ms 时值
      confidence: 1,
      velocity: 64,
    })
  })

  return notes.sort((a, b) => a.onsetTime - b.onsetTime)
}
