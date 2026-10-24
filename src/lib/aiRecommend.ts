import type { VocabWord } from '../data/dseWords'
import { freeAiChat, getFreeAiSettings } from './freeAi'
import {
  buildMeaningChoices,
  localClozeGloss,
  normalizeGlossParts,
  type ClozeGloss,
  type GlossPart,
  type MeaningChoice,
} from './mcq'
import { recommendToday, scoreWord } from './srs'
import { loadFavorites, todayStr } from './storage'
import type { ApiSettings, AppProgress } from './types'

export const DAILY_COUNT_KEY = 'vocab-share-daily-count-v1'
export const DAILY_RECOMMEND_CACHE_KEY = 'vocab-share-daily-ai-recommend-v3'
export const SEEN_RECOMMENDED_KEY = 'vocab-share-seen-recommended-v1'
export const DEFAULT_DAILY_COUNT = 5
export const MIN_DAILY_COUNT = 1
export const MAX_DAILY_COUNT = 100

export type RecommendSource = 'ai' | 'local'

export type RecommendItem = {
  word: VocabWord
  reasons: string[]
  sentence?: string
  cloze?: ClozeGloss
  choices?: MeaningChoice[]
  score?: number
}

export type DailyRecommendResult = {
  date: string
  count: number
  source: RecommendSource
  items: RecommendItem[]
  appliedCount: number
  /** True when remaining unseen pool could not fill N */
  exhausted?: boolean
  remainingUnseen?: number
}

type DailyRecommendCache = {
  date: string
  count: number
  source: RecommendSource
  picks: {
    id: string
    reason: string
    sentence?: string
    gloss?: GlossPart[]
  }[]
  exhausted?: boolean
  remainingUnseen?: number
}

export function clampDailyCount(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_DAILY_COUNT
  return Math.min(MAX_DAILY_COUNT, Math.max(MIN_DAILY_COUNT, Math.round(n)))
}

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

export function parseDailyCountInput(raw: string): number {
  const t = raw.trim()
  if (!t) return DEFAULT_DAILY_COUNT
  const n = Number(t)
  if (!Number.isFinite(n)) return DEFAULT_DAILY_COUNT
  return clampDailyCount(n)
}

export function loadSeenRecommended(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_RECOMMENDED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string' && !!x))
  } catch {
    return new Set()
  }
}

export function saveSeenRecommended(ids: Set<string>) {
  try {
    localStorage.setItem(SEEN_RECOMMENDED_KEY, JSON.stringify([...ids]))
  } catch { /* ignore */ }
}

export function markRecommendedSeen(ids: string[]) {
  if (!ids.length) return
  const set = loadSeenRecommended()
  for (const id of ids) set.add(id)
  saveSeenRecommended(set)
}

export function clearSeenRecommended() {
  try {
    localStorage.removeItem(SEEN_RECOMMENDED_KEY)
  } catch { /* ignore */ }
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

/** Ids to skip: historically recommended + favorites + already practiced. */
export function getExcludeRecommendIds(
  words: VocabWord[],
  progress: AppProgress,
): Set<string> {
  const exclude = loadSeenRecommended()
  for (const [id, st] of Object.entries(progress.byWord)) {
    if (st && st.seen > 0) exclude.add(id)
  }
  const fav = new Set(loadFavorites().map((f) => f.word.toLowerCase()))
  for (const w of words) {
    if (fav.has(w.word.toLowerCase())) exclude.add(w.id)
  }
  return exclude
}

function attachPracticeFields(
  word: VocabWord,
  pool: VocabWord[],
  reason: string,
  sentence?: string,
  gloss?: GlossPart[],
): RecommendItem {
  const en = (sentence || word.example || '').trim() || word.example
  const cloze: ClozeGloss = {
    sentenceEn: en,
    parts: normalizeGlossParts(gloss, word, en),
  }
  if (!gloss?.length) {
    const local = localClozeGloss(word, en)
    cloze.sentenceEn = local.sentenceEn
    cloze.parts = local.parts
  }
  return {
    word,
    reasons: [reason || '今日推荐'],
    sentence: cloze.sentenceEn,
    cloze,
    choices: buildMeaningChoices(word, pool, 4),
  }
}

function rebuildFromCache(
  cache: DailyRecommendCache,
  words: VocabWord[],
): DailyRecommendResult | null {
  const byId = new Map(words.map((w) => [w.id, w]))
  const items: RecommendItem[] = []
  for (const p of cache.picks) {
    const w = byId.get(p.id)
    if (!w) continue
    items.push(attachPracticeFields(w, words, p.reason, p.sentence, p.gloss))
  }
  if (!items.length) return null
  return {
    date: cache.date,
    count: cache.count,
    source: cache.source,
    items,
    appliedCount: cache.count,
    exhausted: cache.exhausted,
    remainingUnseen: cache.remainingUnseen,
  }
}

export function buildCandidatePool(
  words: VocabWord[],
  progress: AppProgress,
  count: number,
  excludeIds?: Set<string>,
): { word: VocabWord; hint: string }[] {
  const n = clampDailyCount(count)
  const available = excludeIds?.size
    ? words.filter((w) => !excludeIds.has(w.id))
    : words
  const poolTarget = Math.min(available.length, Math.max(n * 3, n + 8))

  const scored = available
    .map((w) => ({ word: w, ...scoreWord(w, progress) }))
    .sort((a, b) => b.score - a.score)

  const picked = new Map<string, { word: VocabWord; hint: string }>()

  for (const row of scored) {
    if (picked.size >= poolTarget) break
    const hint = row.reasons.slice(0, 2).join('；') || '例行复习'
    picked.set(row.word.id, { word: row.word, hint })
  }

  const unseen = available.filter((w) => {
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

function parseGloss(raw: unknown): GlossPart[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const parts: GlossPart[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const obj = row as Record<string, unknown>
    const text =
      (typeof obj.t === 'string' && obj.t.trim()) ||
      (typeof obj.text === 'string' && obj.text.trim()) ||
      (typeof obj.zh === 'string' && obj.zh.trim()) ||
      ''
    if (!text) continue
    const blank =
      Boolean(obj.blank) ||
      text.replace(/\s/g, '').includes('____') ||
      text === '…' ||
      text === '...'
    parts.push({ text: blank ? '____' : text, blank })
  }
  return parts.length ? parts : undefined
}

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
    const sentence =
      (typeof obj.sentence === 'string' && obj.sentence.trim()) ||
      (typeof obj.sentenceEn === 'string' && obj.sentenceEn.trim()) ||
      ''
    const gloss = parseGloss(obj.gloss ?? obj.glossParts ?? obj.parts)

    let w: VocabWord | undefined
    if (idStr && byId.has(idStr)) {
      const byIdWord = byId.get(idStr)!
      if (!allowedIds || allowedIds.has(idStr)) w = byIdWord
    }
    if (!w && wordStr) {
      const hit = byWord.get(wordStr.toLowerCase())
      if (hit && (!allowedIds || allowedIds.has(hit.id))) w = hit
    }
    if (!w) continue
    if (seen.has(w.id)) continue
    seen.add(w.id)
    items.push(
      attachPracticeFields(w, words, reason.slice(0, 80), sentence || w.example, gloss),
    )
  }
  return items
}

function localFallback(
  words: VocabWord[],
  progress: AppProgress,
  count: number,
  excludeIds?: Set<string>,
): RecommendItem[] {
  const available = excludeIds?.size
    ? words.filter((w) => !excludeIds.has(w.id))
    : words
  return recommendToday(available, progress, count).map((x) =>
    attachPracticeFields(
      x.word,
      words,
      x.reasons.join('；') || '本地推荐',
      x.word.example,
    ),
  )
}

/**
 * Primary: model picks N NEW words FROM DSE candidate pool only.
 * Excludes historically recommended / favorites / already practiced.
 * Each item includes ABCD choices + cloze Chinese gloss (target blanked).
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
  const exclude = getExcludeRecommendIds(words, progress)
  const remainingUnseen = words.filter((w) => !exclude.has(w.id)).length

  if (!forceRefresh) {
    const cached = loadCache()
    if (cached && cached.date === date && cached.count === count) {
      const rebuilt = rebuildFromCache(cached, words)
      if (rebuilt) return rebuilt
    }
  }

  if (!words.length) {
    return {
      date,
      count,
      source: 'local',
      items: [],
      appliedCount: count,
      exhausted: true,
      remainingUnseen: 0,
    }
  }

  if (remainingUnseen === 0) {
    return {
      date,
      count,
      source: 'local',
      items: [],
      appliedCount: count,
      exhausted: true,
      remainingUnseen: 0,
    }
  }

  const take = Math.min(count, remainingUnseen)
  const candidates = buildCandidatePool(words, progress, take, exclude)
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
    '数组元素格式：{"id":"词条id","word":"与候选完全一致的英文原词","reason":"一句中文推荐理由","sentence":"一句含该词的英文例句","gloss":[{"t":"中文片段","blank":false},{"t":"____","blank":true}]}',
    'gloss：对该英文句的中文逐段意译；恰好一段 blank:true 代表目标词中文意思（用 ____）；其它词中文照常；非 blank 段不要出现目标词中文释义。',
    `恰好挑选 ${take} 个（若候选不足则能选几个选几个，宁可少也不要编造）。`,
    '优先：尚未学习、生疏；适当覆盖不同类别。',
  ].join('\n')

  const user = [
    `今日日期：${date}`,
    `需要推荐数量：${take}`,
    '候选词表（仅可从中选择，均为尚未推荐过的 DSE 词）：',
    poolLines,
    '请输出 JSON 数组。',
  ].join('\n')

  const finish = (
    items: RecommendItem[],
    source: RecommendSource,
  ): DailyRecommendResult => {
    const sliced = items.slice(0, take)
    markRecommendedSeen(sliced.map((x) => x.word.id))
    const left = words.filter((w) => {
      const ex = getExcludeRecommendIds(words, progress)
      return !ex.has(w.id)
    }).length
    const exhausted = sliced.length < count || left === 0
    const result: DailyRecommendResult = {
      date,
      count,
      source,
      items: sliced,
      appliedCount: count,
      exhausted,
      remainingUnseen: left,
    }
    saveCache({
      date,
      count,
      source,
      exhausted,
      remainingUnseen: left,
      picks: sliced.map((x) => ({
        id: x.word.id,
        reason: x.reasons[0] ?? '推荐',
        sentence: x.sentence || x.cloze?.sentenceEn,
        gloss: x.cloze?.parts,
      })),
    })
    return result
  }

  try {
    const reply = await freeAiChat({
      mode: 'analysis',
      user,
      system,
      temperature: 0.2,
      signal,
      api: api?.apiKey?.trim() ? api : getFreeAiSettings(),
    })
    const arr = extractJsonArray(reply)
    if (!arr) throw new Error('模型未返回可解析 JSON')
    const allowedIds = new Set(candidates.map((c) => c.word.id))
    let items = mapModelPicksToDse(arr, words, take, allowedIds)

    if (items.length < take) {
      const have = new Set(items.map((x) => x.word.id))
      for (const row of localFallback(words, progress, take * 2, exclude)) {
        if (items.length >= take) break
        if (have.has(row.word.id)) continue
        have.add(row.word.id)
        items.push(row)
      }
    }

    const packIds = new Set(words.map((w) => w.id))
    items = items.filter((x) => packIds.has(x.word.id) && !exclude.has(x.word.id))
    if (!items.length) throw new Error('模型挑选结果为空或均未通过 DSE 词表校验')
    return finish(items, 'ai')
  } catch (err) {
    if (signal?.aborted) throw err
    const items = localFallback(words, progress, take, exclude)
    return finish(items, 'local')
  }
}
