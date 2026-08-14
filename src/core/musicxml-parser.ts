import type { NoteSequence, NoteEvent } from '../types'

const STEP_TO_SEMITONE: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
}

/**
 * 音名/唱名查找表
 */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const SOLFEGE = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']

/**
 * MIDI 音高 → 音名 (如 "C4")
 */
export function midiToNoteName(midi: number): string {
  const name = NOTE_NAMES[midi % 12]
  const octave = Math.floor(midi / 12) - 1
  return `${name}${octave}`
}

/**
 * MIDI 音高 → 唱名 (如 "Do")
 */
export function midiToSolfege(midi: number): string {
  return SOLFEGE[midi % 12]
}

/**
 * MIDI 音高 → 音名+唱名 (如 "Do(C4)")
 */
export function midiToFullName(midi: number): string {
  const name = NOTE_NAMES[midi % 12]
  const octave = Math.floor(midi / 12) - 1
  const solfege = SOLFEGE[midi % 12]
  return `${solfege}(${name}${octave})`
}

/**
 * 频率 → MIDI 音高
 */
export function freqToMidi(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440))
}

/**
 * MIDI → 频率
 */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/**
 * step + alter + octave → MIDI 音高
 */
function stepToMidi(step: string | null, alter: number, octave: number): number {
  const base = STEP_TO_SEMITONE[step || 'C'] ?? 0
  return (octave + 1) * 12 + base + alter
}

/**
 * 解析 MusicXML 文本 → NoteSequence
 * 提取比对所需字段，忽略记谱细节
 */
export function parseMusicXML(xmlText: string, id: string, bpm: number, difficulty: 1 | 2 | 3 = 1): NoteSequence {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml')

  // 提取标题
  const titleEl = doc.querySelector('work-title') || doc.querySelector('movement-title')
  const title = titleEl?.textContent?.trim() || '未命名曲目'

  // 提取作曲家
  const composerEl = doc.querySelector('identification creator creator-name') || doc.querySelector('creator-name')
  const composer = composerEl?.textContent?.trim() || ''

  // 获取第一个 part（初学者曲目通常只有一个 part）
  const part = doc.querySelector('part')
  if (!part) {
    throw new Error('MusicXML 中未找到 <part> 元素')
  }

  // 解析 divisions（时值换算基准）
  const divisionsEl = part.querySelector('measure divisions') || part.querySelector('measure attributes divisions')
  const divisions = parseInt(divisionsEl?.textContent || '1', 10) || 1

  // 解析拍号
  const beatsEl = doc.querySelector('measure attributes time beats')
  const beatTypeEl = doc.querySelector('measure attributes time beat-type')
  const timeSig = beatsEl && beatTypeEl
    ? `${beatsEl.textContent}/${beatTypeEl.textContent}`
    : '4/4'

  const notes: NoteEvent[] = []
  let totalBeats = 0
  let totalMeasures = 0

  const measures = part.querySelectorAll(':scope > measure')
  measures.forEach((measure) => {
    totalMeasures++
    let currentBeat = 0
    let currentHand: 'L' | 'R' = 'R'

    measure.querySelectorAll(':scope > note').forEach((noteEl) => {
      // 休止符：跳过但占拍位
      if (noteEl.querySelector(':scope > rest')) {
        const dur = parseInt(noteEl.querySelector(':scope > duration')?.textContent || '0', 10)
        currentBeat += dur / divisions
        return
      }

      // 和弦标记（<chord/> 出现在非首音上）：初学者取根音，跳过后续和弦音
      if (noteEl.querySelector(':scope > chord')) {
        return
      }

      // 提取音高
      const stepEl = noteEl.querySelector(':scope > pitch step')
      const alterEl = noteEl.querySelector(':scope > pitch alter')
      const octaveEl = noteEl.querySelector(':scope > pitch octave')

      if (!stepEl || !octaveEl) return

      const step = stepEl.textContent || 'C'
      const alter = parseInt(alterEl?.textContent || '0', 10)
      const octave = parseInt(octaveEl.textContent, 10)
      const midi = stepToMidi(step, alter, octave)

      // 提取时值
      const durationEl = noteEl.querySelector(':scope > duration')
      const duration = parseInt(durationEl?.textContent || '0', 10)
      const beats = duration / divisions

      // 判定左右手
      const staffEl = noteEl.querySelector(':scope > staff')
      if (staffEl) {
        currentHand = staffEl.textContent === '2' ? 'L' : 'R'
      } else {
        // 启发式：低于 C4(60) 归左手
        currentHand = midi < 60 ? 'L' : 'R'
      }

      notes.push({
        midi,
        startBeat: totalBeats + currentBeat,
        beats,
        hand: currentHand,
        measure: totalMeasures,
      })

      currentBeat += beats
    })

    totalBeats += currentBeat
  })

  return {
    id,
    title,
    composer,
    bpm,
    difficulty,
    timeSignature: timeSig,
    totalBeats,
    totalMeasures,
    notes,
  }
}
