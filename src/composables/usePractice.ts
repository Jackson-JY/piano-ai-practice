import { ref, reactive } from 'vue'
import type { NoteSequence, DetectedNote, ComparisonResult, PracticeReport, PracticeMode, InputType, ComparisonStatus } from '../types'
import { ComparisonEngine } from '../core/comparison-engine'
import { generateReport } from '../core/guidance'
import { MidiInput, midiEventsToDetectedNotes } from '../core/midi-input'
import { MicInput } from '../core/mic-input'

export function usePractice() {
  const isPracticing = ref(false)
  const isAnalyzing = ref(false)
  const practiceMode = ref<PracticeMode>('report')
  const inputType = ref<InputType>('midi')
  const currentScore = ref<NoteSequence | null>(null)
  const currentMusicXml = ref<string>('')
  const detectedNotes = reactive<DetectedNote[]>([])
  const comparisons = reactive<ComparisonResult[]>([])
  const report = ref<PracticeReport | null>(null)
  const activePitch = ref<number | null>(null)
  const elapsedTime = ref(0)
  const bpm = ref(60)
  const currentNoteIndex = ref(0)
  const realtimeResults = reactive<{ index: number; status: ComparisonStatus }[]>([])
  const realtimeVersion = ref(0)

  let midiInput: MidiInput | null = null
  let micInput: MicInput | null = null
  let midiEvents: { note: number; velocity: number; time: number; type: 'on' | 'off' }[] = []
  let sessionStartTime = 0
  let timer: number | null = null
  let lastProcessTime = 0

  /**
   * 实时比对：将弹奏的音符与当前期望音符比较，推进光标
   */
  function processRealtimeNote(midi: number) {
    if (!currentScore.value) return
    if (currentNoteIndex.value >= currentScore.value.notes.length) return

    // 麦克风模式：防抖过滤起音瞬态产生的连续假音
    if (inputType.value === 'mic') {
      const now = performance.now()
      if (now - lastProcessTime < 100) return
      lastProcessTime = now
    }

    const expected = currentScore.value.notes[currentNoteIndex.value]
    let status: ComparisonStatus
    if (midi === expected.midi) {
      status = 'correct'
    } else if (Math.abs(midi - expected.midi) % 12 === 0) {
      status = 'octave'
    } else {
      status = 'wrong'
    }

    realtimeResults.push({ index: currentNoteIndex.value, status })
    currentNoteIndex.value++
    realtimeVersion.value++
  }

  /**
   * 开始练习
   */
  async function startPractice(score: NoteSequence, musicXml: string, mode: PracticeMode, input: InputType, practiceBpm: number) {
    currentScore.value = score
    currentMusicXml.value = musicXml
    practiceMode.value = mode
    inputType.value = input
    bpm.value = practiceBpm
    detectedNotes.length = 0
    comparisons.length = 0
    report.value = null
    activePitch.value = null
    elapsedTime.value = 0
    currentNoteIndex.value = 0
    realtimeResults.length = 0
    realtimeVersion.value = 0
    midiEvents = []
    sessionStartTime = performance.now()
    lastProcessTime = 0

    if (input === 'midi') {
      midiInput = new MidiInput({
        onNoteOn: (note, velocity, time) => {
          midiEvents.push({ note, velocity, time, type: 'on' })
          activePitch.value = note
          processRealtimeNote(note)
        },
        onNoteOff: (note, time) => {
          midiEvents.push({ note, velocity: 0, time, type: 'off' })
          // 和弦场景：仅当没有其他活跃音符时才清除显示
          const active = midiInput?.getActiveNotes() ?? []
          activePitch.value = active.length > 0 ? active[active.length - 1] : null
        },
      })
      midiInput.setStartTime(sessionStartTime)
      await midiInput.connect()
    } else {
      micInput = new MicInput({
        onNoteDetected: (note) => {
          detectedNotes.push(note)
          activePitch.value = note.midi
          processRealtimeNote(note.midi)
          setTimeout(() => {
            if (activePitch.value === note.midi) activePitch.value = null
          }, 200)
        },
        onPitchUpdate: (midi) => {
          activePitch.value = midi
        },
      })
      await micInput.start()
    }

    isPracticing.value = true

    // 计时器
    timer = window.setInterval(() => {
      elapsedTime.value = performance.now() - sessionStartTime
    }, 100)
  }

  /**
   * 停止练习并生成报告
   */
  async function stopPractice(): Promise<PracticeReport | null> {
    if (!isPracticing.value || !currentScore.value) return null

    isPracticing.value = false
    isAnalyzing.value = true

    if (timer) {
      clearInterval(timer)
      timer = null
    }

    // 收集音符
    let allNotes: DetectedNote[]
    if (inputType.value === 'midi') {
      midiInput?.disconnect()
      allNotes = midiEventsToDetectedNotes(midiEvents)
    } else {
      micInput?.stop()
      allNotes = [...detectedNotes]
    }

    // 计算实际 BPM：用实际弹奏时长估算
    const playDuration = allNotes.length > 1
      ? (allNotes[allNotes.length - 1].offsetTime - allNotes[0].onsetTime)
      : 0
    const beatsPerNote = currentScore.value.notes.length > 0
      ? currentScore.value.totalBeats / currentScore.value.notes.length
      : 1
    const estimatedBeats = allNotes.length * beatsPerNote
    const actualBpm = playDuration > 0
      ? Math.round(estimatedBeats / (playDuration / 60000))
      : bpm.value

    // 比对（使用练习 BPM 计算时间窗）
    const engine = new ComparisonEngine(currentScore.value, { practiceBpm: bpm.value })
    const results = engine.compare(allNotes)
    comparisons.length = 0
    comparisons.push(...results)

    // 生成报告
    const sessionId = `session-${Date.now()}`
    const rep = generateReport(
      currentScore.value,
      allNotes,
      results,
      actualBpm,
      sessionId
    )
    report.value = rep

    isAnalyzing.value = false
    return rep
  }

  /**
   * 取消练习（不生成报告）
   */
  function cancelPractice() {
    if (!isPracticing.value) return

    isPracticing.value = false
    if (timer) {
      clearInterval(timer)
      timer = null
    }

    midiInput?.disconnect()
    micInput?.stop()
    midiInput = null
    micInput = null
  }

  return {
    isPracticing,
    isAnalyzing,
    practiceMode,
    inputType,
    currentScore,
    currentMusicXml,
    detectedNotes,
    comparisons,
    report,
    activePitch,
    elapsedTime,
    bpm,
    currentNoteIndex,
    realtimeResults,
    realtimeVersion,
    startPractice,
    stopPractice,
    cancelPractice,
  }
}
