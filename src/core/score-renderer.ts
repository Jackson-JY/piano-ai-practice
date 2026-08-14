import type { ComparisonStatus } from '../types'

const STATUS_COLORS: Record<ComparisonStatus, string> = {
  correct: '#22c55e',
  wrong: '#ef4444',
  octave: '#f59e0b',
  missed: '#6b7280',
  extra: '#a855f7',
  rhythm: '#eab308',
}

/**
 * 曲谱渲染管理器
 * 封装 OSMD，提供渲染和高亮能力
 */
export class ScoreRenderer {
  private osmd: any = null
  private container: HTMLElement
  private noteElements: Map<number, any> = new Map()

  constructor(container: HTMLElement) {
    this.container = container
  }

  /**
   * 加载并渲染 MusicXML
   */
  async render(musicXml: string) {
    // 动态导入 OSMD（体积较大，按需加载）
    const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay')

    this.osmd = new OpenSheetMusicDisplay(this.container, {
      autoResize: true,
      backend: 'svg',
      drawTitle: true,
      drawSubtitle: true,
      drawComposer: true,
    })

    await this.osmd.load(musicXml)
    this.osmd.render()
    this.indexNotes()
  }

  /**
   * 索引所有音符，建立 scoreIndex → 渲染元素的映射
   */
  private indexNotes() {
    this.noteElements.clear()
    if (!this.osmd?.GraphicSheet) return

    let noteIndex = 0
    const measures = this.osmd.GraphicSheet.measureList
    for (const measure of measures) {
      for (const staffEntry of measure) {
        if (!staffEntry?.graphicalVoiceEntries) continue
        for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
          for (const note of voiceEntry.notes) {
            this.noteElements.set(noteIndex, note)
            noteIndex++
          }
        }
      }
    }
  }

  /**
   * 设置单个音符颜色（不触发渲染）
   */
  private setNoteColor(noteIndex: number, status: ComparisonStatus) {
    const note = this.noteElements.get(noteIndex)
    if (!note) return

    const color = STATUS_COLORS[status]
    try {
      if (note.sourceNote) {
        note.sourceNote.NoteheadColor = color
      }
    } catch {
      // OSMD API 差异，尝试其他方式
    }
  }

  /**
   * 高亮单个音符
   */
  highlightNote(noteIndex: number, status: ComparisonStatus) {
    this.setNoteColor(noteIndex, status)
    this.osmd?.render()
  }

  /**
   * 批量高亮（只渲染一次）
   */
  highlightNotes(results: { index: number; status: ComparisonStatus }[]) {
    // 先重置所有
    this.clearNoteColors()

    for (const { index, status } of results) {
      this.setNoteColor(index, status)
    }
    this.osmd?.render()
  }

  /**
   * 清除所有高亮颜色（不触发渲染）
   */
  private clearNoteColors() {
    this.noteElements.forEach((note) => {
      try {
        if (note.sourceNote) {
          note.sourceNote.NoteheadColor = undefined
        }
      } catch {
        // ignore
      }
    })
  }

  /**
   * 清除所有高亮
   */
  clearHighlights() {
    this.clearNoteColors()
    this.osmd?.render()
  }

  /**
   * 设置光标位置
   */
  setCursor(noteIndex: number) {
    if (!this.osmd?.cursor) return
    this.osmd.cursor.show()
    // 重置到起点后再移动到目标位置
    this.osmd.cursor.reset()
    for (let i = 0; i < noteIndex; i++) {
      this.osmd.cursor.next()
    }
  }

  /**
   * 隐藏光标
   */
  hideCursor() {
    this.osmd?.cursor?.hide()
  }

  /**
   * 清理
   */
  destroy() {
    this.osmd = null
    this.noteElements.clear()
    this.container.innerHTML = ''
  }
}
