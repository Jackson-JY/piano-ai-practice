/**
 * 曲谱音符事件 - 比对引擎消费的最小单元
 */
export interface NoteEvent {
  /** MIDI 音高 (60 = 中央C) */
  midi: number
  /** 起始拍位 */
  startBeat: number
  /** 时值（拍数） */
  beats: number
  /** 左右手 */
  hand: 'L' | 'R'
  /** 小节号 */
  measure: number
}

/**
 * 运行时曲谱格式 - 从 MusicXML 解析而来
 */
export interface NoteSequence {
  id: string
  title: string
  composer: string
  bpm: number
  difficulty: 1 | 2 | 3
  timeSignature: string
  totalBeats: number
  totalMeasures: number
  notes: NoteEvent[]
}

/**
 * 检测到的音符（来自 MIDI 或麦克风 YIN 检测）
 */
export interface DetectedNote {
  midi: number
  /** 频率 Hz（MIDI 路径无此字段） */
  frequency: number | null
  /** onset 时间 ms（相对开始时间） */
  onsetTime: number
  /** offset 时间 ms */
  offsetTime: number
  /** YIN 置信度（MIDI 路径恒为 1） */
  confidence: number
  /** MIDI 力度（麦克风路径无此字段） */
  velocity: number | null
}

/**
 * 比对结果状态
 */
export type ComparisonStatus = 'correct' | 'wrong' | 'octave' | 'missed' | 'extra' | 'rhythm'

/**
 * 单个音符比对结果
 */
export interface ComparisonResult {
  scoreIndex: number
  detectedIndex: number | null
  status: ComparisonStatus
  detail: {
    expected?: number
    detected?: number
    expectedName?: string
    detectedName?: string
    timeDeviation?: number
  } | null
}

/**
 * 评分维度
 */
export interface ScoreDimension {
  score: number
  weight: number
}

/**
 * 评分报告
 */
export interface PracticeReport {
  sessionId: string
  scoreId: string
  scoreTitle: string
  totalScore: number
  grade: string
  emoji: string
  dimensions: {
    pitch: ScoreDimension
    rhythm: ScoreDimension
    tempo: ScoreDimension
    completeness: ScoreDimension
  }
  issues: PracticeIssue[]
  suggestion: string
  noteByMeasure: MeasureStats[]
}

export interface PracticeIssue {
  measure: number
  beat: number
  type: string
  message: string
  severity: 'high' | 'medium' | 'low'
}

export interface MeasureStats {
  measure: number
  correct: number
  total: number
  rate: number
}

/**
 * 练习会话
 */
export interface PracticeSession {
  sessionId: string
  scoreId: string
  scoreTitle: string
  mode: 'report' | 'realtime'
  inputType: 'mic' | 'midi'
  bpm: number
  startedAt: number
  duration: number
  detectedNotes: DetectedNote[]
  comparisons: ComparisonResult[]
  report: PracticeReport | null
}

/**
 * 输入设备类型
 */
export type InputType = 'mic' | 'midi'

/**
 * 练习模式
 */
export type PracticeMode = 'report' | 'realtime'
