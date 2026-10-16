import type { AppProgress } from './types'
import { saveProgress, todayStr } from './storage'

export function bumpDay(p: AppProgress, kind: 'studied' | 'correct' | 'wrong') {
  const date = todayStr()
  let log = p.dayLogs.find((x) => x.date === date)
  if (!log) {
    log = { date, studied: 0, correct: 0, wrong: 0 }
    p.dayLogs.push(log)
  }
  log[kind] += 1
  if (kind === 'correct' || kind === 'wrong') log.studied += 1
}

export function recordSeen(p: AppProgress, wordId: string) {
  const st = p.byWord[wordId] ?? { wordId, seen: 0, correct: 0, wrong: 0, ease: 0 }
  st.seen += 1
  st.lastSeen = new Date().toISOString()
  p.byWord[wordId] = st
  bumpDay(p, 'studied')
  saveProgress(p)
  return p
}

export function recordQuiz(p: AppProgress, wordId: string, ok: boolean) {
  const st = p.byWord[wordId] ?? { wordId, seen: 0, correct: 0, wrong: 0, ease: 0 }
  st.seen += 1
  st.lastSeen = new Date().toISOString()
  if (ok) {
    st.correct += 1
    st.ease = Math.min(5, (st.ease ?? 0) + 1)
    p.wrongIds = p.wrongIds.filter((id) => id !== wordId)
    bumpDay(p, 'correct')
  } else {
    st.wrong += 1
    st.ease = Math.max(0, (st.ease ?? 0) - 1)
    if (!p.wrongIds.includes(wordId)) p.wrongIds.push(wordId)
    bumpDay(p, 'wrong')
  }
  p.byWord[wordId] = st
  saveProgress(p)
  return p
}

export function addSentence(p: AppProgress, wordId: string, text: string) {
  p.sentences.unshift({ wordId, text, at: new Date().toISOString() })
  p.sentences = p.sentences.slice(0, 200)
  saveProgress(p)
  return p
}

export function clearWrong(p: AppProgress, wordId: string) {
  p.wrongIds = p.wrongIds.filter((id) => id !== wordId)
  saveProgress(p)
  return p
}
