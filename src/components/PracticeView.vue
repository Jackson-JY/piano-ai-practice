<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import type { ScoreItem } from '../composables/useScoreLibrary'
import type { PracticeReport, PracticeMode, InputType } from '../types'
import { ScoreRenderer } from '../core/score-renderer'
import { MidiInput } from '../core/midi-input'
import { MicInput } from '../core/mic-input'

const props = defineProps<{
  score: ScoreItem
  practice: ReturnType<typeof import('../composables/usePractice')['usePractice']>
}>()

const emit = defineEmits<{
  complete: [report: PracticeReport]
  back: []
}>()

const scoreContainer = ref<HTMLDivElement | null>(null)
const inputType = ref<InputType>('midi')
const practiceMode = ref<PracticeMode>('report')
const bpm = ref(props.score.bpm)
const countdown = ref(0)
const isCountingDown = ref(false)

let renderer: ScoreRenderer | null = null

const midiSupported = MidiInput.isSupported()
const micSupported = MicInput.isSupported()

const isPracticing = computed(() => props.practice.isPracticing.value)
const isAnalyzing = computed(() => props.practice.isAnalyzing.value)
const elapsedTime = computed(() => props.practice.elapsedTime.value)
const activePitch = computed(() => props.practice.activePitch.value)
const realtimeVersion = computed(() => props.practice.realtimeVersion.value)

const showSetup = computed(() => !isPracticing.value && !isCountingDown.value && !isAnalyzing.value)
const showScore = computed(() => !isCountingDown.value)

// 练习开始时显示光标，结束时隐藏
watch(isPracticing, (practicing) => {
  if (!renderer) return
  if (practicing) {
    renderer.setCursor(0)
  } else {
    renderer.hideCursor()
  }
})

// 实时跟踪弹奏位置：高亮已弹音符 + 移动光标
watch(realtimeVersion, () => {
  if (!renderer || !isPracticing.value) return
  const results = [...props.practice.realtimeResults]
  if (results.length > 0) {
    renderer.highlightNotes(results)
  }
  const idx = props.practice.currentNoteIndex.value
  const totalNotes = props.score.noteSequence.notes.length
  if (idx < totalNotes) {
    renderer.setCursor(idx)
  }
})

onMounted(async () => {
  // 等待 DOM 渲染后再初始化
  requestAnimationFrame(async () => {
    if (scoreContainer.value) {
      renderer = new ScoreRenderer(scoreContainer.value)
      try {
        await renderer.render(props.score.musicXml)
      } catch (e) {
        console.error('曲谱渲染失败', e)
      }
    }
  })
})

onUnmounted(() => {
  renderer?.destroy()
  props.practice.cancelPractice()
})

async function startPractice() {
  if (!midiSupported && inputType.value === 'midi') {
    alert('当前浏览器不支持 MIDI，请切换到麦克风模式')
    return
  }

  isCountingDown.value = true
  countdown.value = 3
  const timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(timer)
      isCountingDown.value = false
      doStart()
    }
  }, 1000)
}

async function doStart() {
  await props.practice.startPractice(
    props.score.noteSequence,
    props.score.musicXml,
    practiceMode.value,
    inputType.value,
    bpm.value
  )
}

async function finishPractice() {
  const report = await props.practice.stopPractice()
  if (report) {
    emit('complete', report)
  }
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="practice-view">
    <div class="practice-header">
      <button class="secondary-btn back-btn" @click="emit('back')">← 返回</button>
      <h2 class="practice-title">{{ score.title }}</h2>
    </div>

    <!-- 设置面板 -->
    <div v-if="showSetup" class="setup-panel card">
      <div class="setup-row">
        <label class="setup-label">输入方式</label>
        <div class="input-options">
          <button
            class="option-btn"
            :class="{ active: inputType === 'midi' }"
            :disabled="!midiSupported"
            @click="inputType = 'midi'"
          >
            🔌 MIDI 电钢琴
            <span v-if="!midiSupported" class="unsupported">不支持</span>
          </button>
          <button
            class="option-btn"
            :class="{ active: inputType === 'mic' }"
            :disabled="!micSupported"
            @click="inputType = 'mic'"
          >
            🎤 麦克风
            <span v-if="!micSupported" class="unsupported">不支持</span>
          </button>
        </div>
      </div>

      <div v-if="inputType === 'mic'" class="mic-hint">
        💡 请将设备放在钢琴附近，确保环境安静。关闭回声消除和降噪以保留原始琴音。
      </div>
      <div v-else class="mic-hint">
        💡 请连接电钢琴的 MIDI 接口。MIDI 模式下音符识别零误差。
      </div>

      <div class="setup-row">
        <label class="setup-label">练习速度 (BPM)</label>
        <div class="bpm-control">
          <button class="bpm-btn" @click="bpm = Math.max(40, bpm - 5)">−</button>
          <span class="bpm-value">{{ bpm }}</span>
          <button class="bpm-btn" @click="bpm = Math.min(200, bpm + 5)">+</button>
          <span class="bpm-hint">建议初学者用 {{ Math.round(score.bpm * 0.7) }} BPM</span>
        </div>
      </div>

      <button class="primary-btn start-btn" @click="startPractice">
        ▶ 开始练习
      </button>
    </div>

    <!-- 倒计时 -->
    <div v-if="isCountingDown" class="countdown-overlay">
      <div class="countdown-number">{{ countdown > 0 ? countdown : '开始!' }}</div>
    </div>

    <!-- 弹奏控制栏 -->
    <div v-if="isPracticing || isAnalyzing" class="playing-controls">
      <div class="playing-info">
        <span class="info-item">⏱ {{ formatTime(elapsedTime) }}</span>
        <span v-if="activePitch !== null" class="info-item active-pitch">
          ♪ {{ activePitch }}
        </span>
      </div>
      <button
        v-if="isPracticing"
        class="primary-btn finish-btn"
        @click="finishPractice"
      >
        ✓ 完成
      </button>
      <div v-else class="analyzing">
        <span class="spinner"></span>
        <span>正在分析...</span>
      </div>
    </div>

    <!-- 曲谱（始终保留 DOM，避免 v-if 销毁后 OSMD 渲染丢失） -->
    <div v-show="showScore" class="score-wrapper">
      <div
        ref="scoreContainer"
        class="score-container"
        :class="{ playing: isPracticing }"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.practice-view {
  max-width: 900px;
  margin: 0 auto;
}

.practice-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.back-btn {
  flex-shrink: 0;
}

.practice-title {
  font-size: 20px;
}

.setup-panel {
  padding: 24px;
  margin-bottom: 20px;
}

.setup-row {
  margin-bottom: 20px;
}

.setup-label {
  display: block;
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.input-options {
  display: flex;
  gap: 8px;
}

.option-btn {
  flex: 1;
  padding: 12px 16px;
  background: var(--bg-hover);
  border: 2px solid transparent;
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  text-align: center;
  transition: all 0.2s;
}

.option-btn.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.option-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.unsupported {
  font-size: 11px;
  color: var(--error);
  margin-left: 4px;
}

.mic-hint {
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px 12px;
  background: var(--bg-primary);
  border-radius: 6px;
  margin-top: 8px;
}

.bpm-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bpm-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-hover);
  font-size: 18px;
  color: var(--text-primary);
}

.bpm-value {
  font-size: 24px;
  font-weight: 700;
  min-width: 50px;
  text-align: center;
}

.bpm-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.start-btn {
  width: 100%;
  padding: 16px;
  font-size: 18px;
}

.countdown-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.countdown-number {
  font-size: 80px;
  font-weight: 700;
  color: var(--accent);
  animation: pulse 1s ease-in-out;
}

@keyframes pulse {
  0% { transform: scale(0.5); opacity: 0; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

.playing-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-card);
  border-radius: 8px;
  margin-bottom: 16px;
}

.playing-info {
  display: flex;
  gap: 16px;
}

.info-item {
  font-size: 16px;
  font-weight: 600;
}

.active-pitch {
  color: var(--accent);
}

.finish-btn {
  background: var(--success);
  font-size: 14px;
  padding: 8px 20px;
}

.analyzing {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 14px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.score-wrapper {
  margin-top: 8px;
}

.score-container {
  background: white;
  border-radius: 8px;
  padding: 16px;
  min-height: 200px;
  overflow-x: auto;
  transition: border 0.3s;
}

.score-container.playing {
  border: 2px solid var(--accent);
}
</style>
