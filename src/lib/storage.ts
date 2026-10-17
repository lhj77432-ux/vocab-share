import type { AppProgress, ApiSettings, WordListPack } from './types'
import { DEMO_LIST_ID, DEMO_LIST_TITLE, demoWords } from '../data/dseWords'

const PROGRESS_KEY = 'vocab-share-progress-v1'
const API_KEY = 'vocab-share-api-v1'
const CUSTOM_LISTS_KEY = 'vocab-share-lists-v1'

/** Default free OpenAI-compatible endpoint (no signup / no key). */
export const DEFAULT_API: ApiSettings = {
  baseUrl: 'https://text.pollinations.ai/v1',
  apiKey: '',
  model: 'gpt-oss-20b',
}

export function demoPack(): WordListPack {
  return {
    id: DEMO_LIST_ID,
    title: DEMO_LIST_TITLE,
    words: demoWords,
    createdAt: '2026-01-01T00:00:00+08:00',
  }
}

export function loadProgress(): AppProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (raw) return JSON.parse(raw) as AppProgress
  } catch { /* ignore */ }
  return { byWord: {}, wrongIds: [], dayLogs: [], sentences: [] }
}

export function saveProgress(p: AppProgress) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(p))
}

export function loadApiSettings(): ApiSettings {
  try {
    const raw = localStorage.getItem(API_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ApiSettings
      // Empty baseUrl = unset → use free default (existing installs without manual clear)
      if (!parsed.baseUrl?.trim()) {
        return { ...DEFAULT_API }
      }
      return {
        baseUrl: parsed.baseUrl,
        apiKey: parsed.apiKey ?? '',
        model: parsed.model?.trim() || DEFAULT_API.model,
      }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_API }
}

export function saveApiSettings(s: ApiSettings) {
  localStorage.setItem(API_KEY, JSON.stringify(s))
}

export function loadCustomLists(): WordListPack[] {
  try {
    const raw = localStorage.getItem(CUSTOM_LISTS_KEY)
    if (raw) return JSON.parse(raw) as WordListPack[]
  } catch { /* ignore */ }
  return []
}

export function saveCustomLists(lists: WordListPack[]) {
  localStorage.setItem(CUSTOM_LISTS_KEY, JSON.stringify(lists))
}

export function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
