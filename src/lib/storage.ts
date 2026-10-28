import type { AppProgress, ApiSettings, WordListPack } from './types'
import { DEMO_LIST_ID, DEMO_LIST_TITLE, demoWords } from '../data/dseWords'

const PROGRESS_KEY = 'vocab-share-progress-v1'
const API_KEY = 'vocab-share-api-v1'
const CUSTOM_LISTS_KEY = 'vocab-share-lists-v1'

/** Sentinel baseUrl: use Puter.js in-browser (User-Pays, no developer API key). */
export const PUTER_BASE = 'puter'

/** Default free path via Puter.js when already signed in; otherwise silent Pollinations (never prompt login). */
export const DEFAULT_API: ApiSettings = {
  baseUrl: PUTER_BASE,
  apiKey: '',
  model: 'google/gemini-3.1-flash-lite',
}

/** Silent OpenAI-compatible fallback when Puter is unavailable. */
export const POLLINATIONS_FALLBACK: ApiSettings = {
  baseUrl: 'https://text.pollinations.ai/v1',
  apiKey: '',
  model: 'gpt-oss-20b',
}

export function isPuterSettings(s: ApiSettings): boolean {
  const base = (s.baseUrl ?? '').trim().toLowerCase()
  return !base || base === PUTER_BASE || base === 'puter://' || base.startsWith('puter:')
}

function isLegacyFreePollinations(s: ApiSettings): boolean {
  const base = (s.baseUrl ?? '').trim().toLowerCase()
  const model = (s.model ?? '').trim()
  const key = (s.apiKey ?? '').trim()
  if (key) return false
  if (!base.includes('pollinations.ai')) return false
  return !model || model === 'gpt-oss-20b'
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
      // Empty / legacy free Pollinations → migrate to Puter default
      if (!parsed.baseUrl?.trim() || isLegacyFreePollinations(parsed)) {
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

/** Favorites of online-searched dictionary words (local only). */
const FAVORITES_KEY = 'vocab-share-favorites-v1'

export type FavoriteSense = {
  partOfSpeech: string
  definition: string
  definitionZh?: string
  definitionEn?: string
  example?: string
}

export type FavoriteWord = {
  /** lowercase key */
  word: string
  displayWord: string
  phonetic?: string
  audio?: string
  meanings: FavoriteSense[]
  sourceUrls: string[]
  favoritedAt: string
}

export function loadFavorites(): FavoriteWord[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as FavoriteWord[]
      if (Array.isArray(arr)) return arr
    }
  } catch { /* ignore */ }
  return []
}

export function saveFavorites(list: FavoriteWord[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(list))
}

export function isFavoriteWord(list: FavoriteWord[], word: string) {
  const key = word.trim().toLowerCase()
  return list.some((f) => f.word === key)
}

export function entryToFavorite(entry: {
  word: string
  phonetic?: string
  audio?: string
  meanings: {
    partOfSpeech: string
    definition: string
    definitionZh?: string
    definitionEn?: string
    example?: string
  }[]
  sourceUrls: string[]
}): FavoriteWord {
  return {
    word: entry.word.trim().toLowerCase(),
    displayWord: entry.word.trim(),
    phonetic: entry.phonetic,
    audio: entry.audio,
    meanings: entry.meanings.slice(0, 12).map((m) => ({
      partOfSpeech: m.partOfSpeech,
      definition: m.definition,
      definitionZh: (m as { definitionZh?: string }).definitionZh,
      definitionEn: (m as { definitionEn?: string }).definitionEn,
      example: m.example,
    })),
    sourceUrls: entry.sourceUrls.slice(0, 4),
    favoritedAt: new Date().toISOString(),
  }
}

export function toggleFavorite(list: FavoriteWord[], entry: Parameters<typeof entryToFavorite>[0]): FavoriteWord[] {
  const key = entry.word.trim().toLowerCase()
  if (list.some((f) => f.word === key)) {
    return list.filter((f) => f.word !== key)
  }
  return [entryToFavorite(entry), ...list]
}

export function removeFavorite(list: FavoriteWord[], word: string): FavoriteWord[] {
  const key = word.trim().toLowerCase()
  return list.filter((f) => f.word !== key)
}
