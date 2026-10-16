import type { VocabWord } from '../data/dseWords'
import type { AppProgress, WordProgress } from './types'

function daysSince(iso?: string) {
  if (!iso) return 99
  const t = (Date.now() - new Date(iso).getTime()) / 86400000
  return Math.max(0, t)
}

export function scoreWord(w: VocabWord, p: AppProgress): { score: number; reasons: string[] } {
  const st: WordProgress | undefined = p.byWord[w.id]
  const reasons: string[] = []
  let score = 0

  if (!st || st.seen === 0) {
    score += 40
    reasons.push('尚未学习')
  } else {
    const rate = st.correct / Math.max(1, st.correct + st.wrong)
    if (rate < 0.6) {
      score += 35
      reasons.push(`正确率偏低（${Math.round(rate * 100)}%）`)
    }
    const ease = st.ease ?? 0
    score += Math.max(0, 25 - ease * 5)
    if (ease <= 2) reasons.push('熟悉度较低')
    const gap = daysSince(st.lastSeen)
    if (gap >= 3) {
      score += Math.min(30, gap * 4)
      reasons.push(`${Math.floor(gap)} 天未复习`)
    }
  }
  if (p.wrongIds.includes(w.id)) {
    score += 25
    reasons.push('在错词本中')
  }
  if (!reasons.length) reasons.push('例行复习')
  return { score, reasons }
}

export function recommendToday(words: VocabWord[], p: AppProgress, limit = 12) {
  return words
    .map((w) => ({ word: w, ...scoreWord(w, p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function weekStats(p: AppProgress) {
  const days: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    days.push(`${y}-${m}-${day}`)
  }
  const logs = days.map((date) => {
    const log = p.dayLogs.find((x) => x.date === date)
    return {
      date,
      studied: log?.studied ?? 0,
      correct: log?.correct ?? 0,
      wrong: log?.wrong ?? 0,
    }
  })
  const studied = logs.reduce((s, x) => s + x.studied, 0)
  const correct = logs.reduce((s, x) => s + x.correct, 0)
  const wrong = logs.reduce((s, x) => s + x.wrong, 0)
  const known = Object.values(p.byWord).filter((x) => (x.ease ?? 0) >= 3).length
  const weak = Object.entries(p.byWord)
    .filter(([, v]) => v.wrong > v.correct)
    .map(([id]) => id)
  return { logs, studied, correct, wrong, known, weak, wrongBook: p.wrongIds.length }
}

export function weeklySummaryText(stats: ReturnType<typeof weekStats>, totalWords: number) {
  const rate = stats.correct + stats.wrong === 0
    ? null
    : Math.round((stats.correct / (stats.correct + stats.wrong)) * 100)
  const lines = [
    `本周共学习/测验 ${stats.studied} 次，答对 ${stats.correct}，答错 ${stats.wrong}${rate != null ? `（正确率 ${rate}%）` : ''}。`,
    `词表共 ${totalWords} 词，较熟悉约 ${stats.known} 个；错词本 ${stats.wrongBook} 个。`,
  ]
  if (stats.studied === 0) lines.push('本周几乎没有学习记录，建议每天完成「今日推荐」里的 8–12 个词。')
  else if ((rate ?? 0) < 60) lines.push('正确率偏低，优先复习错词本，并用造句巩固。')
  else lines.push('节奏不错，可按归类专题强化薄弱类别，并做造句练习。')
  return lines.join('\n')
}
