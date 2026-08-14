<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ScoreList from './components/ScoreList.vue'
import PracticeView from './components/PracticeView.vue'
import ReportView from './components/ReportView.vue'
import { useScoreLibrary, type ScoreItem } from './composables/useScoreLibrary'
import { usePractice } from './composables/usePractice'
import type { PracticeReport } from './types'

type Page = 'home' | 'practice' | 'report'

const page = ref<Page>('home')
const selectedScore = ref<ScoreItem | null>(null)
const practiceReport = ref<PracticeReport | null>(null)

const { scores, loading, loadScores } = useScoreLibrary()
const practice = usePractice()

onMounted(() => {
  loadScores()
})

function selectScore(score: ScoreItem) {
  selectedScore.value = score
  page.value = 'practice'
}

async function onReportReady(report: PracticeReport) {
  practiceReport.value = report
  page.value = 'report'
}

function backHome() {
  practice.cancelPractice()
  selectedScore.value = null
  practiceReport.value = null
  page.value = 'home'
}

function retry() {
  if (selectedScore.value) {
    practiceReport.value = null
    page.value = 'practice'
  }
}
</script>

<template>
  <div class="app">
    <header class="app-header">
      <div class="header-content">
        <h1 class="logo" @click="backHome">
          <span class="logo-icon">🎹</span>
          <span class="logo-text">琴伴</span>
        </h1>
        <span class="tagline">钢琴初学者智能陪练</span>
      </div>
    </header>

    <main class="app-main">
      <template v-if="page === 'home'">
        <ScoreList
          :scores="scores"
          :loading="loading"
          @select="selectScore"
        />
      </template>

      <template v-else-if="page === 'practice' && selectedScore">
        <PracticeView
          :score="selectedScore"
          :practice="practice"
          @complete="onReportReady"
          @back="backHome"
        />
      </template>

      <template v-else-if="page === 'report' && practiceReport">
        <ReportView
          :report="practiceReport"
          @retry="retry"
          @home="backHome"
        />
      </template>
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  padding: 12px 20px;
  flex-shrink: 0;
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.logo {
  font-size: 24px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  font-size: 28px;
}

.logo-text {
  background: linear-gradient(135deg, var(--accent), #f97316);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.tagline {
  color: var(--text-muted);
  font-size: 13px;
}

.app-main {
  flex: 1;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  padding: 20px;
}

@media (max-width: 600px) {
  .tagline { display: none; }
  .app-main { padding: 12px; }
}
</style>
