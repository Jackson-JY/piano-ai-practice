<script setup lang="ts">
import type { ScoreItem } from '../composables/useScoreLibrary'

defineProps<{
  scores: ScoreItem[]
  loading: boolean
}>()

const emit = defineEmits<{
  select: [score: ScoreItem]
}>()

const difficultyLabels: Record<number, string> = {
  1: '入门',
  2: '初级',
  3: '中级',
}

const difficultyColors: Record<number, string> = {
  1: '#22c55e',
  2: '#f59e0b',
  3: '#ef4444',
}
</script>

<template>
  <div class="score-list">
    <div class="page-title">
      <h2>选择曲目</h2>
      <p class="subtitle">选择一首曲目开始练习</p>
    </div>

    <div v-if="loading" class="loading">
      <span>正在加载曲谱库...</span>
    </div>

    <div v-else-if="scores.length === 0" class="empty">
      <span>暂无曲目</span>
    </div>

    <div v-else class="scores-grid">
      <div
        v-for="score in scores"
        :key="score.id"
        class="score-card card"
        @click="emit('select', score)"
      >
        <div class="card-header">
          <h3 class="card-title">{{ score.title }}</h3>
          <span
            class="badge"
            :style="{ background: difficultyColors[score.difficulty] + '20', color: difficultyColors[score.difficulty] }"
          >
            {{ difficultyLabels[score.difficulty] }}
          </span>
        </div>
        <p class="card-composer">{{ score.composer }}</p>
        <div class="card-meta">
          <span class="meta-item">♪ {{ score.bpm }} BPM</span>
          <span class="meta-item">{{ score.noteSequence.totalMeasures }} 小节</span>
          <span class="meta-item">{{ score.noteSequence.notes.length }} 音符</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.score-list {
  max-width: 800px;
  margin: 0 auto;
}

.page-title {
  margin-bottom: 24px;
}

.page-title h2 {
  font-size: 22px;
  margin-bottom: 4px;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 14px;
}

.loading, .empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}

.scores-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.score-card {
  padding: 20px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.score-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(233, 69, 96, 0.15);
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
}

.badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
  font-weight: 500;
}

.card-composer {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 12px;
}

.card-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.meta-item {
  font-size: 12px;
  color: var(--text-muted);
}
</style>
