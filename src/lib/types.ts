import type { VocabWord } from '../data/dseWords'

export interface WordListPack {
  id: string
  title: string
  words: VocabWord[]
  createdAt: string
}

export interface WordProgress {
  wordId: string
  seen: number
  correct: number
  wrong: number
  lastSeen?: string
  ease: number // 0-5 familiarity, higher = better known
}

export interface DayLog {
  date: string // YYYY-MM-DD
  studied: number
  correct: number
  wrong: number
}

export interface AppProgress {
  byWord: Record<string, WordProgress>
  wrongIds: string[]
  dayLogs: DayLog[]
  sentences: { wordId: string; text: string; at: string }[]
}

export interface ApiSettings {
  baseUrl: string
  apiKey: string
  model: string
}

export type StudyMode = 'vocab' | 'analysis' | 'reasoning' | 'search'
