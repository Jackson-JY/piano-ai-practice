<script setup lang="ts">
import type { PracticeReport } from '../types'

defineProps<{
  report: PracticeReport
}>()

const emit = defineEmits<{
  retry: []
  home: []
}>()

const severityColors: Record<string, string> = {
  high: 'var(--error)',
  medium: 'var(--warning)',
  low: 'var(--info)',
}

const severityLabels: Record<string, string> = {
  high: '严重',
  medium: '中等',
  low: '轻微',
}

const typeIcons: Record<string, string> = {
  wrong_pitch: '❌',
  octave_error: '⚠️',
  missed_note: '○',
  extra_note: '✚',
  rhythm_error: '🎵',
  tempo_unstable: '⏱',
}

function rateColor(rate: number): string {
  if (rate >= 0.8) return 'var(--success)'
  if (rate >= 0.5) return 'var(--warning)'
  return 'var(--error)'
}
</script>

<template>
  <div class="report-view">
    <!-- 总分卡片 -->
    <div class="total-card card">
      <div class="total-score">
        <span class="score-number">{{ report.totalScore }}</span>
        <span class="score-grade">{{ report.emoji }} {{ report.grade }}</span>
      </div>
      <h2 class="score-title">{{ report.scoreTitle }}</h2>

      <div class="dimensions">
        <div class="dim-item">
          <div class="dim-header">
            <span class="dim-label">音准</span>
            <span class="dim-score">{{ report.dimensions.pitch.score }}</span>
          </div>
          <div class="dim-bar">
            <div class="dim-fill" :style="{ width: report.dimensions.pitch.score + '%', background: 'var(--success)' }"></div>
          </div>
        </div>
        <div class="dim-item">
          <div class="dim-header">
            <span class="dim-label">节奏</span>
            <span class="dim-score">{{ report.dimensions.rhythm.score }}</span>
          </div>
          <div class="dim-bar">
            <div class="dim-fill" :style="{ width: report.dimensions.rhythm.score + '%', background: 'var(--info)' }"></div>
          </div>
        </div>
        <div class="dim-item">
          <div class="dim-header">
            <span class="dim-label">速度</span>
            <span class="dim-score">{{ report.dimensions.tempo.score }}</span>
          </div>
          <div class="dim-bar">
            <div class="dim-fill" :style="{ width: report.dimensions.tempo.score + '%', background: 'var(--purple)' }"></div>
          </div>
        </div>
        <div class="dim-item">
          <div class="dim-header">
            <span class="dim-label">完整度</span>
            <span class="dim-score">{{ report.dimensions.completeness.score }}</span>
          </div>
          <div class="dim-bar">
            <div class="dim-fill" :style="{ width: report.dimensions.completeness.score + '%', background: 'var(--warning)' }"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 逐小节正确率 -->
    <div class="section card">
      <h3 class="section-title">📊 逐小节正确率</h3>
      <div class="measure-bars">
        <div v-for="m in report.noteByMeasure" :key="m.measure" class="measure-bar">
          <div class="measure-bar-fill" :style="{ height: (m.rate * 100) + '%', background: rateColor(m.rate) }"></div>
          <span class="measure-label">M{{ m.measure }}</span>
          <span class="measure-rate">{{ Math.round(m.rate * 100) }}%</span>
        </div>
      </div>
    </div>

    <!-- 问题列表 -->
    <div class="section card">
      <h3 class="section-title">🔍 问题分析</h3>
      <div v-if="report.issues.length === 0" class="no-issues">
        🎉 没有发现问题，弹得非常好！
      </div>
      <div v-else class="issues-list">
        <div v-for="(issue, i) in report.issues" :key="i" class="issue-item">
          <span class="issue-icon">{{ typeIcons[issue.type] || '•' }}</span>
          <div class="issue-content">
            <p class="issue-message">{{ issue.message }}</p>
            <span class="issue-severity" :style="{ color: severityColors[issue.severity] }">
              {{ severityLabels[issue.severity] }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 练习建议 -->
    <div class="section card suggestion-card">
      <h3 class="section-title">💡 练习建议</h3>
      <p class="suggestion-text">{{ report.suggestion }}</p>
    </div>

    <!-- 操作按钮 -->
    <div class="actions">
      <button class="primary-btn" @click="emit('retry')">🔄 再练一次</button>
      <button class="secondary-btn" @click="emit('home')">🏠 返回首页</button>
    </div>
  </div>
</template>

<style scoped>
.report-view {
  max-width: 700px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.total-card {
  padding: 28px;
  text-align: center;
}

.total-score {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
}

.score-number {
  font-size: 56px;
  font-weight: 800;
  background: linear-gradient(135deg, var(--accent), #f97316);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.score-grade {
  font-size: 20px;
  font-weight: 600;
}

.score-title {
  font-size: 16px;
  color: var(--text-secondary);
  margin-bottom: 24px;
}

.dimensions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.dim-item {
  text-align: left;
}

.dim-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.dim-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.dim-score {
  font-size: 14px;
  font-weight: 600;
}

.dim-bar {
  height: 8px;
  background: var(--bg-primary);
  border-radius: 4px;
  overflow: hidden;
}

.dim-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.section {
  padding: 20px;
}

.section-title {
  font-size: 16px;
  margin-bottom: 16px;
}

.measure-bars {
  display: flex;
  gap: 8px;
  height: 120px;
  align-items: flex-end;
  padding: 8px 0;
}

.measure-bar {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  position: relative;
  height: 100%;
  justify-content: flex-end;
}

.measure-bar-fill {
  width: 100%;
  max-width: 40px;
  border-radius: 4px 4px 0 0;
  min-height: 2px;
  transition: height 0.5s ease;
}

.measure-label {
  font-size: 11px;
  color: var(--text-muted);
}

.measure-rate {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.issues-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.issue-item {
  display: flex;
  gap: 12px;
  padding: 10px;
  background: var(--bg-primary);
  border-radius: 8px;
}

.issue-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.issue-content {
  flex: 1;
}

.issue-message {
  font-size: 14px;
  margin-bottom: 2px;
}

.issue-severity {
  font-size: 12px;
}

.no-issues {
  text-align: center;
  padding: 20px;
  color: var(--success);
  font-size: 16px;
}

.suggestion-card {
  background: linear-gradient(135deg, var(--bg-card), #1a2a4a);
  border: 1px solid var(--accent);
}

.suggestion-text {
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-primary);
}

.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding: 8px 0 24px;
}

@media (max-width: 500px) {
  .dimensions { grid-template-columns: 1fr; }
}
</style>
