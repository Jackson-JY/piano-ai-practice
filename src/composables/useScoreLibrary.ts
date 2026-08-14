import { ref, reactive } from 'vue'
import { parseMusicXML } from '../core/musicxml-parser'
import type { NoteSequence } from '../types'

export interface ScoreItem {
  id: string
  title: string
  composer: string
  difficulty: 1 | 2 | 3
  bpm: number
  musicXml: string
  noteSequence: NoteSequence
}

/**
 * 曲谱库管理
 */
export function useScoreLibrary() {
  const scores = reactive<ScoreItem[]>([])
  const loading = ref(false)

  /**
   * 加载曲谱库
   */
  async function loadScores() {
    loading.value = true
    try {
      // 尝试加载外部曲谱文件
      const modules = import.meta.glob('../assets/scores/*.musicxml', { query: '?raw', import: 'default', eager: true })
      const moduleKeys = Object.keys(modules)

      if (moduleKeys.length > 0) {
        for (const path of moduleKeys) {
          const content = (modules[path] as string) || ''
          const filename = path.split('/').pop()!.replace('.musicxml', '')

          const ns = parseMusicXML(content, filename, 70, 1)
          scores.push({
            id: filename,
            title: ns.title,
            composer: ns.composer || '未知',
            difficulty: 1,
            bpm: 70,
            musicXml: content,
            noteSequence: ns,
          })
        }
      } else {
        // 没有外部曲谱文件，使用内嵌曲谱
        await loadEmbeddedScores()
      }
    } catch (e) {
      console.warn('加载曲谱文件失败，使用内嵌曲谱', e)
      await loadEmbeddedScores()
    }
    loading.value = false
  }

  /**
   * 加载内嵌曲谱（无需外部文件，保证 MVP 可用）
   */
  async function loadEmbeddedScores() {
    const { EMBEDDED_SCORES } = await import('./embedded-scores')
    for (const item of EMBEDDED_SCORES) {
      const ns = parseMusicXML(item.musicXml, item.id, item.bpm, item.difficulty)
      scores.push({
        id: item.id,
        title: ns.title,
        composer: ns.composer || '未知',
        difficulty: item.difficulty,
        bpm: item.bpm,
        musicXml: item.musicXml,
        noteSequence: ns,
      })
    }
  }

  return {
    scores,
    loading,
    loadScores,
  }
}
