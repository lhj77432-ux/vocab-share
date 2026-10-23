import type { VocabWord } from '../data/dseWords'
import { chatCompletion } from './api'
import { recommendToday, scoreWord } from './srs'
import { todayStr } from './storage'
import type { ApiSettings, AppProgress } from './types'

export const DAILY_COUNT_KEY = 'vocab-share-daily-count-v1'
export const DAILY_RECOMMEND_CACHE_KEY = 'vocab-share-daily-ai-recommend-v2'
export const DEFAULT_DAILY_COUNT = 12
export const MIN_DAILY_COUNT = 1
export const MAX_DAILY_COUNT = 200

export type RecommendSource = 'ai' | 'local'

export type RecommendItem = {
  word: VocabWord
  reasons: string[]
  score?: number
}

export type DailyRecommendResult = {
  date: string
  count: number
  source: RecommendSource
  items: RecommendItem[]
  /** Raw typed count string as last applied (for display) */
  appliedCount: number
}

export type DailyRecommendCache = {
  date: string
  count: number
  source: RecommendSource
  /** Stored as word ids + reason text for rebuild */
  picks: { id: string; reason: string }[]
}

/** Clamp a numeric count for model / local recommend calls. */
export function clampDailyCount(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_DAILY_COUNT
  return Math.min(MAX_DAILY_COUNT, Math.max(MIN_DAILY_COUNT, Math.round(n)))
}

/** Persist last typed value as string (user may leave incomplete digits while typing). */
export function loadDailyCountInput(): string {
  try {
    const raw = localStorage.getItem(DAILY_COUNT_KEY)
    if (raw != null && raw !== '') return raw
  } catch { /* ignore */ }
  return String(DEFAULT_DAILY_COUNT)
}

export function saveDailyCountInput(raw: string) {
  try {
    localStorage.setItem(DAILY_COUNT_KEY, raw)
  } catch { /* ignore */ }
}

/** Parse typed input → clamped count; empty / invalid → default. */
export function parseDailyCountInput(raw: string): number {
  const t = raw.trim()
  if (!t) return DEFAULT_DAILY_COUNT
  const n = Number(t)
  if (!Number.isFinite(n)) return DEFAULT_DAILY_COUNT
  return clampDailyCount(n)
}

function loadCache(): DailyRecommendCache | null {
  try {
    const raw = localStorage.getItem(DAILY_RECOMMEND_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DailyRecommendCache
    if (!parsed?.date || !Array.isArray(parsed.picks)) return null
    return parsed
  } catch {
    return null
  }
}

function saveCache(cache: DailyRecommendCache) {
  try {
    localStorage.setItem(DAILY_RECOMMEND_CACHE_KEY, JSON.stringify(cache))
  } catch { /* ignore */ }
}

export function clearDailyRecommendCache() {
  try {
    localStorage.removeItem(DAILY_RECOMMEND_CACHE_KEY)
  } catch { /* ignore */ }
}

function rebuildFromCache(
  cache: DailyRecommendCache,
  words: VocabWord[],
): DailyRecommendResult | null {
  const byId = new Map(words.map((w) => [w.id, w]))
  const items: RecommendItem[] = []
  for (const p of cache.picks) {
    // Cache may only surface pack words — drop anything not exact in current DSE list
    const w = byId.get(p.id)
    if (!w) continue
    items.push({ word: w, reasons: [p.reason || '今日推荐'] })
  }
  if (!items.length) return null
  return {
    date: cache.date,
    count: cache.count,
    source: cache.source,
    items,
    appliedCount: cache.count,
  }
}

/** Build a compact DSE-only candidate pool for the model (~3N scored + some unseen). */
export function buildCandidatePool(
  words: VocabWord[],
  progress: AppProgress,
  count: number,
): { word: VocabWord; hint: string }[] {
  const n = clampDailyCount(count)
  const poolTarget = Math.min(words.length, Math.max(n * 3, n + 8))

  const scored = words
    .map((w) => ({ word: w, ...scoreWord(w, progress) }))
    .sort((a, b) => b.score - a.score)

  const picked = new Map<string, { word: VocabWord; hint: string }>()

  for (const row of scored) {
    if (picked.size >= poolTarget) break
    const hint = row.reasons.slice(0, 2).join('；') || '例行复习'
    picked.set(row.word.id, { word: row.word, hint })
  }

  // Sprinkle a few random unseen not already in pool
  const unseen = words.filter((w) => {
    const st = progress.byWord[w.id]
    return (!st || st.seen === 0) && !picked.has(w.id)
  })
  for (let i = unseen.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[unseen[i], unseen[j]] = [unseen[j], unseen[i]]
  }
  for (const w of unseen.slice(0, Math.min(8, Math.max(3, Math.floor(n / 2))))) {
    if (picked.size >= poolTarget) break
    picked.set(w.id, { word: w, hint: '尚未学习' })
  }

  // Ensure wrong-book words are present
  for (const id of progress.wrongIds) {
    if (picked.size >= poolTarget + 4) break
    if (picked.has(id)) continue
    const w = words.find((x) => x.id === id)
    if (w) picked.set(w.id, { word: w, hint: '在错词本中' })
  }

  return [...picked.values()]
}

function extractJsonArray(text: string): unknown[] | null {
  const trimmed = text.trim()
  const tryParse = (s: string): unknown[] | null => {
    try {
      const v = JSON.parse(s)
      if (Array.isArray(v)) return v
      if (v && typeof v === 'object' && Array.isArray((v as { words?: unknown }).words)) {
        return (v as { words: unknown[] }).words
      }
      if (v && typeof v === 'object' && Array.isArray((v as { picks?: unknown }).picks)) {
        return (v as { picks: unknown[] }).picks
      }
      return null
    } catch {
      return null
    }
  }

  const direct = tryParse(trimmed)
  if (direct) return direct

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) {
    const f = tryParse(fence[1].trim())
    if (f) return f
  }

  const start = trimmed.indexOf('[')
  const end = trimmed.lastIndexOf(']')
  if (start >= 0 && end > start) {
    const a = tryParse(trimmed.slice(start, end + 1))
    if (a) return a
  }
  return null
}

/**
 * Strict DSE-only gate: keep a pick only if id or exact spelling matches the
 * local pack. Invented / near-miss spellings are dropped — never shown.
 * Display always uses the VocabWord from the pack (never model-invented text).
 */
function mapModelPicksToDse(
  raw: unknown[],
  words: VocabWord[],
  count: number,
  allowedIds?: Set<string>,
): RecommendItem[] {
  const byWord = new Map(words.map((w) => [w.word.toLowerCase(), w]))
  const byId = new Map(words.map((w) => [w.id, w]))
  const items: RecommendItem[] = []
  const seen = new Set<string>()

  for (const row of raw) {
    if (items.length >= count) break
    if (!row || typeof row !== 'object') continue
    const obj = row as Record<string, unknown>
    const wordStr =
      (typeof obj.word === 'string' && obj.word.trim()) ||
      (typeof obj.headword === 'string' && obj.headword.trim()) ||
      (typeof obj.lemma === 'string' && obj.lemma.trim()) ||
      ''
    const idStr = typeof obj.id === 'string' ? obj.id.trim() : ''
    const reason =
      (typeof obj.reason === 'string' && obj.reason.trim()) ||
      (typeof obj.why === 'string' && obj.why.trim()) ||
      '模型推荐'

    let w: VocabWord | undefined

    // Prefer exact id from DSE pack (and preferably from the candidate pool)
    if (idStr && byId.has(idStr)) {
      const byIdWord = byId.get(idStr)!
      if (!allowedIds || allowedIds.has(idStr)) {
        w = byIdWord
      }
    }

    // Else exact spelling match only (case-insensitive, no fuzzy edit distance)
    if (!w && wordStr) {
      const key = wordStr.toLowerCase()
      const hit = byWord.get(key)
      if (hit && (!allowedIds || allowedIds.has(hit.id))) {
        w = hit
      }
    }

    // If both id + word given and disagree with pack, drop (do not trust invent)
    if (w && wordStr) {
      if (w.word.toLowerCase() !== wordStr.toLowerCase()) {
        // id won but model spelled a different word — still OK if id is valid pack entry
        // (we display pack spelling). If only word matched path, already exact.
      }
    }

    if (!w) continue // drop invented / unverified words — never show to user
    if (seen.has(w.id)) continue
    seen.add(w.id)
    items.push({ word: w, reasons: [reason.slice(0, 80)] })
  }
  return items
}

function localFallback(
  words: VocabWord[],
  progress: AppProgress,
  count: number,
): RecommendItem[] {
  return recommendToday(words, progress, count).map((x) => ({
    word: x.word,
    reasons: x.reasons,
    score: x.score,
  }))
}

/**
 * Primary: external model picks N words FROM the DSE candidate pool only.
 * Fallback: local SRS recommendToday. Always filters to pack words.
 */
export async function fetchDailyAiRecommend(opts: {
  words: VocabWord[]
  progress: AppProgress
  api: ApiSettings
  count: number
  signal?: AbortSignal
  forceRefresh?: boolean
}): Promise<DailyRecommendResult> {
  const { words, progress, api, signal, forceRefresh } = opts
  const count = clampDailyCount(opts.count)
  const date = todayStr()

  if (!forceRefresh) {
    const cached = loadCache()
    if (cached && cached.date === date && cached.count === count) {
      const rebuilt = rebuildFromCache(cached, words)
      if (rebuilt) return rebuilt
    }
  }

  if (!words.length) {
    return { date, count, source: 'local', items: [], appliedCount: count }
  }

  const candidates = buildCandidatePool(words, progress, count)
  const poolLines = candidates
    .map(
      (c, i) =>
        `${i + 1}. id=${c.word.id} | ${c.word.word} | ${c.word.pos} | ${c.word.meaningZh} | ${c.word.category} | hint=${c.hint}`,
    )
    .join('\n')

  const system = [
    '你是香港 DSE English 背单词助教。',
    'HARD RULE: 只能从用户提供的候选词表中挑选。word 必须与候选里的英文原词完全一致（可大小写不同），id 必须是候选里的 id。',
    '严禁编造、联想、近义词替换或输出候选列表之外的任何单词。若不确定，跳过，不要瞎编。',
    '只输出 JSON 数组，不要 markdown，不要其它说明。',
    '数组元素格式：{"id":"词条id","word":"与候选完全一致的英文原词","reason":"一句中文推荐理由"}',
    `恰好挑选 ${count} 个（若候选不足则能选几个选几个，宁可少也不要编造）。`,
    '优先：错词、生疏、久未复习、尚未学习；适当覆盖不同类别，避免全是同一类。',
  ].join('\n')

  const user = [
    `今日日期：${date}`,
    `需要推荐数量：${count}`,
    '候选词表（仅可从中选择，均为 DSE 范围）：',
    poolLines,
    '请输出 JSON 数组。',
  ].join('\n')

  try {
    const reply = await chatCompletion(api, 'analysis', user, {
      systemOverride: system,
      temperature: 0.2,
      signal,
    })
    const arr = extractJsonArray(reply)
    if (!arr) throw new Error('模型未返回可解析 JSON')
    const allowedIds = new Set(candidates.map((c) => c.word.id))
    // Strict: only exact id/spelling in DSE pack ∩ candidate pool; drop fakes
    let items = mapModelPicksToDse(arr, words, count, allowedIds)

    // If too few verified picks, refill from local recommendToday (pack-only)
    if (items.length < count) {
      const have = new Set(items.map((x) => x.word.id))
      for (const row of localFallback(words, progress, count * 2)) {
        if (items.length >= count) break
        if (have.has(row.word.id)) continue
        have.add(row.word.id)
        items.push({
          word: row.word,
          reasons: row.reasons.length ? row.reasons : ['本地补齐（过滤编造词后）'],
        })
      }
    }

    // Final safety: every item must exist in pack by id
    const packIds = new Set(words.map((w) => w.id))
    items = items.filter((x) => packIds.has(x.word.id))

    if (!items.length) throw new Error('模型挑选结果为空或均未通过 DSE 词表校验')

    items = items.slice(0, count)
    const result: DailyRecommendResult = {
      date,
      count,
      source: 'ai',
      items,
      appliedCount: count,
    }
    saveCache({
      date,
      count,
      source: 'ai',
      picks: items.map((x) => ({
        id: x.word.id,
        reason: x.reasons[0] ?? '模型推荐',
      })),
    })
    return result
  } catch (err) {
    if (signal?.aborted) throw err
    const items = localFallback(words, progress, count)
    const result: DailyRecommendResult = {
      date,
      count,
      source: 'local',
      items,
      appliedCount: count,
    }
    saveCache({
      date,
      count,
      source: 'local',
      picks: items.map((x) => ({
        id: x.word.id,
        reason: x.reasons.join('；') || '本地推荐',
      })),
    })
    return result
  }
}
