import type { NoteSequence, DetectedNote, ComparisonResult } from '../types'
import { midiToNoteName, midiToSolfege } from './musicxml-parser'

export interface CompareOptions {
  /** 时间窗容差（ms），默认按 BPM 计算 ±1.5 拍 */
  timeWindowMs: number
  /** 是否启用八度混淆判定 */
  enableOctaveCheck: boolean
  /** 用户练习 BPM（默认使用曲谱 BPM） */
  practiceBpm: number
}

/**
 * 比对引擎
 * 将检测到的音符流与曲谱期望音符序列逐音对齐
 */
export class ComparisonEngine {
  private score: NoteSequence
  private options: CompareOptions

  constructor(score: NoteSequence, options?: Partial<CompareOptions>) {
    this.score = score
    const practiceBpm = options?.practiceBpm ?? score.bpm
    const beatMs = 60000 / practiceBpm // 一拍的毫秒数（按练习 BPM）
    this.options = {
      timeWindowMs: options?.timeWindowMs ?? beatMs * 1.5, // 初学者宽松容错：1.5 拍
      enableOctaveCheck: options?.enableOctaveCheck ?? true,
      practiceBpm,
    }
  }

  /**
   * 执行比对
   * @param detected 检测到的音符列表（按时间排序）
   * @returns 比对结果列表
   */
  compare(detected: DetectedNote[]): ComparisonResult[] {
    const results: ComparisonResult[] = []
    const beatMs = 60000 / this.options.practiceBpm

    let scoreCursor = 0
    let detectedCursor = 0
    const usedDetected = new Set<number>()

    while (scoreCursor < this.score.notes.length) {
      const expectedNote = this.score.notes[scoreCursor]
      // 期望时间 = 起始拍 × 每拍毫秒数
      const expectedTime = expectedNote.startBeat * beatMs
      const windowStart = expectedTime - this.options.timeWindowMs
      const windowEnd = expectedTime + this.options.timeWindowMs

      // 在时间窗内查找最近的匹配音符
      let bestMatch: { index: number; note: DetectedNote } | null = null
      let bestDistance = Infinity

      for (let i = detectedCursor; i < detected.length; i++) {
        if (usedDetected.has(i)) continue
        const d = detected[i]
        if (d.onsetTime < windowStart) continue
        if (d.onsetTime > windowEnd) break

        const dist = Math.abs(d.onsetTime - expectedTime)
        if (dist < bestDistance) {
          bestDistance = dist
          bestMatch = { index: i, note: d }
        }
      }

      if (bestMatch) {
        // 找到了时间窗内的音符，判定音高
        const detectedMidi = bestMatch.note.midi
        const expectedMidi = expectedNote.midi

        if (detectedMidi === expectedMidi) {
          // 正确
          results.push({
            scoreIndex: scoreCursor,
            detectedIndex: bestMatch.index,
            status: 'correct',
            detail: null,
          })
        } else if (
          this.options.enableOctaveCheck &&
          Math.abs(detectedMidi - expectedMidi) % 12 === 0 &&
          detectedMidi !== expectedMidi
        ) {
          // 八度混淆
          results.push({
            scoreIndex: scoreCursor,
            detectedIndex: bestMatch.index,
            status: 'octave',
            detail: {
              expected: expectedMidi,
              detected: detectedMidi,
              expectedName: midiToFullName(expectedMidi),
              detectedName: midiToFullName(detectedMidi),
            },
          })
        } else {
          // 错音
          results.push({
            scoreIndex: scoreCursor,
            detectedIndex: bestMatch.index,
            status: 'wrong',
            detail: {
              expected: expectedMidi,
              detected: detectedMidi,
              expectedName: midiToFullName(expectedMidi),
              detectedName: midiToFullName(detectedMidi),
            },
          })
        }

        usedDetected.add(bestMatch.index)
        detectedCursor = bestMatch.index + 1
      } else {
        // 时间窗内没有音符 → 漏音
        results.push({
          scoreIndex: scoreCursor,
          detectedIndex: null,
          status: 'missed',
          detail: {
            expected: expectedNote.midi,
            expectedName: midiToFullName(expectedNote.midi),
          },
        })
      }

      scoreCursor++
    }

    // 检测多音（时间窗内弹出谱面之外的音）
    for (let i = 0; i < detected.length; i++) {
      if (!usedDetected.has(i)) {
        // 找到最近的 scoreIndex
        const detectedTime = detected[i].onsetTime
        let nearestScoreIndex = 0
        let nearestDist = Infinity
        for (let j = 0; j < this.score.notes.length; j++) {
          const expectedTime = this.score.notes[j].startBeat * beatMs
          const dist = Math.abs(detectedTime - expectedTime)
          if (dist < nearestDist) {
            nearestDist = dist
            nearestScoreIndex = j
          }
        }
        results.push({
          scoreIndex: nearestScoreIndex,
          detectedIndex: i,
          status: 'extra',
          detail: {
            detected: detected[i].midi,
            detectedName: midiToFullName(detected[i].midi),
          },
        })
      }
    }

    // 节奏判定：检查正确音符的时间偏差
    for (const result of results) {
      if (result.status === 'correct' && result.detectedIndex !== null) {
        const expectedNote = this.score.notes[result.scoreIndex]
        const detectedNote = detected[result.detectedIndex]
        const expectedTime = expectedNote.startBeat * beatMs
        const deviation = detectedNote.onsetTime - expectedTime
        const halfBeat = beatMs * 0.5

        if (Math.abs(deviation) > halfBeat) {
          result.status = 'rhythm'
          result.detail = {
            ...result.detail,
            timeDeviation: deviation,
          }
        }
      }
    }

    return results.sort((a, b) => a.scoreIndex - b.scoreIndex)
  }
}

function midiToFullName(midi: number): string {
  return `${midiToSolfege(midi)}(${midiToNoteName(midi)})`
}
