import { midiToNoteName, midiToSolfege } from './musicxml-parser'
import type { ComparisonResult, NoteSequence, PracticeIssue, MeasureStats, PracticeReport } from '../types'

// ==================== 键位提示数据 ====================

const KEY_POSITIONS: Record<number, string> = {
  // 中央区域（初学者最常用）
  60: '钢琴正中间，两个黑键左边的白键',
  61: '中央C 右边的黑键',
  62: '中央C 右边紧邻的白键',
  63: 'D 右边的黑键',
  64: '两个黑键右边的白键',
  65: 'E 右边紧邻的白键（三个黑键左边的白键）',
  66: 'F 右边的黑键',
  67: '三个黑键中间偏左的白键',
  68: 'G 右边的黑键',
  69: '三个黑键中间偏右的白键',
  70: 'A 右边的黑键',
  71: '三个黑键右边的白键',
  // 低八度
  48: '中央C 下方一个八度的 C，同样在两个黑键左边',
  50: '中央C 下方一个八度的 D',
  52: '中央C 下方一个八度的 E',
  53: '中央C 下方一个八度的 F',
  55: '中央C 下方一个八度的 G',
  57: '中央C 下方一个八度的 A',
  59: '中央C 下方一个八度的 B',
  // 高八度
  72: '中央C 上方一个八度的 C',
  74: '中央C 上方一个八度的 D',
  76: '中央C 上方一个八度的 E',
  77: '中央C 上方一个八度的 F',
  79: '中央C 上方一个八度的 G',
  81: '中央C 上方一个八度的 A',
  83: '中央C 上方一个八度的 B',
}

/**
 * 获取键位位置描述
 */
export function getKeyPosition(midi: number): string {
  return KEY_POSITIONS[midi] || `${midiToNoteName(midi)} 的位置`
}

// ==================== 指导语生成 ====================

/**
 * 根据比对结果生成指导语
 */
export function generateGuidance(
  result: ComparisonResult,
  score: NoteSequence
): string {
  const note = score.notes[result.scoreIndex]
  const measure = note?.measure ?? 0
  const beat = note ? Math.floor(note.startBeat % 4) + 1 : 0

  switch (result.status) {
    case 'wrong': {
      const expectedMidi = result.detail?.expected ?? 0
      const detectedMidi = result.detail?.detected ?? 0
      const expName = `${midiToSolfege(expectedMidi)}(${midiToNoteName(expectedMidi)})`
      const detName = `${midiToSolfege(detectedMidi)}(${midiToNoteName(detectedMidi)})`
      const keyPos = getKeyPosition(expectedMidi)
      return `第${measure}小节第${beat}拍：弹成了${detName}，应为${expName}。${expName}在${keyPos}。`
    }

    case 'octave': {
      const expectedMidi = result.detail?.expected ?? 0
      const detectedMidi = result.detail?.detected ?? 0
      const diff = (detectedMidi - expectedMidi) / 12
      const direction = diff > 0 ? '高' : '低'
      return `第${measure}小节第${beat}拍：${direction}了${Math.abs(diff)}个八度，注意手位移动。正确音是${midiToSolfege(expectedMidi)}(${midiToNoteName(expectedMidi)})。`
    }

    case 'missed': {
      const expectedMidi = result.detail?.expected ?? 0
      const expName = `${midiToSolfege(expectedMidi)}(${midiToNoteName(expectedMidi)})`
      return `第${measure}小节第${beat}拍：少弹了一个音（${expName}）。`
    }

    case 'extra': {
      const detectedMidi = result.detail?.detected ?? 0
      const detName = `${midiToSolfege(detectedMidi)}(${midiToNoteName(detectedMidi)})`
      return `第${measure}小节：多弹了一个音（${detName}），注意只弹谱子上的音。`
    }

    case 'rhythm': {
      const deviation = result.detail?.timeDeviation ?? 0
      if (deviation > 0) {
        return `第${measure}小节第${beat}拍：这个音弹得太晚了，注意节奏。`
      }
      return `第${measure}小节第${beat}拍：这个音弹得太早了，注意节奏。`
    }

    case 'correct':
      return ''

    default:
      return ''
  }
}

// ==================== 评分系统 ====================

export interface ScoringWeights {
  pitch: number
  rhythm: number
  tempo: number
  completeness: number
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  pitch: 0.40,
  rhythm: 0.25,
  tempo: 0.15,
  completeness: 0.20,
}

/**
 * 生成练习报告
 */
export function generateReport(
  score: NoteSequence,
  _detected: { midi: number; onsetTime: number; offsetTime: number }[],
  comparisons: ComparisonResult[],
  actualBpm: number,
  sessionId: string,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): PracticeReport {
  const totalNotes = score.notes.length

  // 1. 音准：正确音符数 / 总音符数（rhythm 状态音准正确但节奏有偏差）
  const correctCount = comparisons.filter((c) => c.status === 'correct' || c.status === 'rhythm').length
  const wrongCount = comparisons.filter((c) => c.status === 'wrong').length
  const octaveCount = comparisons.filter((c) => c.status === 'octave').length
  const missedCount = comparisons.filter((c) => c.status === 'missed').length
  void wrongCount; void octaveCount; void missedCount
  const pitchScore = totalNotes > 0 ? Math.round((correctCount / totalNotes) * 100) : 0

  // 2. 节奏：基于 rhythm 错误数和正确音符的时间偏差
  const rhythmErrors = comparisons.filter((c) => c.status === 'rhythm').length
  const rhythmScore = Math.max(0, Math.round(100 - (rhythmErrors / totalNotes) * 200))

  // 3. 速度：实测 BPM vs 目标 BPM
  const tempoDiff = Math.abs(actualBpm - score.bpm)
  const tempoScore = Math.max(0, Math.round(100 - (tempoDiff / score.bpm) * 100))

  // 4. 完整度：实际完成音符数 / 曲谱音符总数
  const playedCount = comparisons.filter((c) => c.status !== 'missed').length
  const completenessScore = Math.round((playedCount / totalNotes) * 100)

  // 总分
  const totalScore = Math.round(
    pitchScore * weights.pitch +
    rhythmScore * weights.rhythm +
    tempoScore * weights.tempo +
    completenessScore * weights.completeness
  )

  // 等级
  let grade: string, emoji: string
  if (totalScore >= 90) { grade = '优秀'; emoji = '🌟' }
  else if (totalScore >= 75) { grade = '良好'; emoji = '👍' }
  else if (totalScore >= 60) { grade = '合格'; emoji = '✅' }
  else { grade = '需继续练习'; emoji = '💪' }

  // 问题列表
  const issues: PracticeIssue[] = []
  for (const c of comparisons) {
    if (c.status === 'correct') continue
    const note = score.notes[c.scoreIndex]
    const measure = note?.measure ?? 0
    const beat = note ? Math.floor(note.startBeat % 4) + 1 : 0
    const message = generateGuidance(c, score)
    if (!message) continue

    const severity = c.status === 'wrong' || c.status === 'missed' ? 'high'
      : c.status === 'octave' || c.status === 'rhythm' ? 'medium'
      : 'low'

    issues.push({
      measure,
      beat,
      type: c.status === 'wrong' ? 'wrong_pitch'
        : c.status === 'octave' ? 'octave_error'
        : c.status === 'missed' ? 'missed_note'
        : c.status === 'extra' ? 'extra_note'
        : 'rhythm_error',
      message,
      severity: severity as 'high' | 'medium' | 'low',
    })
  }

  // 逐小节统计
  const measureMap: Map<number, { correct: number; total: number }> = new Map()
  for (const c of comparisons) {
    const note = score.notes[c.scoreIndex]
    if (!note) continue
    const m = note.measure
    if (!measureMap.has(m)) measureMap.set(m, { correct: 0, total: 0 })
    const stats = measureMap.get(m)!
    stats.total++
    if (c.status === 'correct' || c.status === 'rhythm') stats.correct++
  }
  const noteByMeasure: MeasureStats[] = Array.from(measureMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([measure, stats]) => ({
      measure,
      correct: stats.correct,
      total: stats.total,
      rate: stats.total > 0 ? stats.correct / stats.total : 0,
    }))

  // 练习建议
  const suggestion = generateSuggestion(noteByMeasure, comparisons, actualBpm, score.bpm)

  return {
    sessionId,
    scoreId: score.id,
    scoreTitle: score.title,
    totalScore,
    grade,
    emoji,
    dimensions: {
      pitch: { score: pitchScore, weight: weights.pitch },
      rhythm: { score: rhythmScore, weight: weights.rhythm },
      tempo: { score: tempoScore, weight: weights.tempo },
      completeness: { score: completenessScore, weight: weights.completeness },
    },
    issues,
    suggestion,
    noteByMeasure,
  }
}

/**
 * 根据错误分布自动生成练习建议
 */
function generateSuggestion(
  measureStats: MeasureStats[],
  comparisons: ComparisonResult[],
  actualBpm: number,
  targetBpm: number
): string {
  const suggestions: string[] = []

  // 某小节错误率 > 50%
  const weakMeasures = measureStats.filter((m) => m.rate < 0.5)
  if (weakMeasures.length > 0) {
    const measures = weakMeasures.map((m) => `第${m.measure}小节`).join('、')
    suggestions.push(`${measures}建议单独慢练 3 遍`)
  }

  // 速度不稳定
  const tempoDiff = Math.abs(actualBpm - targetBpm)
  if (tempoDiff > targetBpm * 0.15) {
    suggestions.push(`整体速度偏差较大，建议先用 ${Math.round(targetBpm * 0.7)} BPM 慢练`)
  }

  // 多次八度混淆
  const octaveErrors = comparisons.filter((c) => c.status === 'octave').length
  if (octaveErrors >= 2) {
    suggestions.push('注意看谱号，确认是在高音谱号还是低音谱号区域')
  }

  // 完整度高但音准低
  if (comparisons.length === 0) return '暂无练习数据。'
  const correctRate = comparisons.filter((c) => c.status === 'correct' || c.status === 'rhythm').length / comparisons.length
  const completenessRate = comparisons.filter((c) => c.status !== 'missed').length / comparisons.length
  if (completenessRate > 0.9 && correctRate < 0.7) {
    suggestions.push('识谱正确但弹错了键，建议先唱谱再弹')
  }

  // 如果没有特定建议
  if (suggestions.length === 0) {
    if (correctRate > 0.9) {
      return '弹得很好！可以尝试加快速度挑战下一阶段。'
    }
    return '继续练习，注意节奏稳定和音准。'
  }

  return suggestions.join('；') + '。'
}
