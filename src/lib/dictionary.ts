/** Word lookup via free model (site → Puter) (Puter Gemini Flash-Lite →
 * Pollinations), then Free Dictionary / Wiktionary for English.
 * Cache: in-memory + localStorage for repeat lookups (~instant).
 */

import { freeAiChat } from './freeAi'

export type DictSense = {
  partOfSpeech: string
  /** Primary gloss (usually English) — kept for favorites / older cache */
  definition: string
  /** 中译 */
  definitionZh?: string
  /** 英译 */
  definitionEn?: string
  example?: string
  synonyms: string[]
}

export type DictEntry = {
  word: string
  /** Original user query when it differs (e.g. Chinese → English headword) */
  query?: string
  phonetic?: string
  audio?: string
  meanings: DictSense[]
  sourceUrls: string[]
  provider?: 'llm' | 'free-dictionary' | 'wiktionary' | 'cache'
}

export type DictLookupOk = { ok: true; entries: DictEntry[]; cached?: boolean }
export type DictLookupFail = {
  ok: false
  reason: 'empty' | 'not_english' | 'not_found' | 'network' | 'aborted'
  message: string
}
export type DictLookupResult = DictLookupOk | DictLookupFail

const FREE_DICT = 'https://api.dictionaryapi.dev/api/v2/entries/en'
const WIKTIONARY = 'https://en.wiktionary.org/api/rest_v1/page/definition'
const CACHE_KEY = 'vocab-share-dict-cache-v2'
const CACHE_MAX = 100
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const FREE_DICT_SOFT_MS = 750
const TOTAL_BUDGET_MS = 1100
const LLM_TIMEOUT_MS = 22000

type CacheRecord = { at: number; entries: DictEntry[] }

const memoryCache = new Map<string, CacheRecord>()

function hasCjk(s: string) {
  return /[\u3400-\u9fff]/.test(s)
}

function isEnglishWord(s: string) {
  return /^[a-z][a-z'\-]*$/i.test(s)
}

function stripHtml(s: string) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeCacheKey(raw: string) {
  return raw.trim().toLowerCase()
}

function loadDiskCache(): Record<string, CacheRecord> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, CacheRecord>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveDiskCache(map: Record<string, CacheRecord>) {
  try {
    const entries = Object.entries(map)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, CACHE_MAX)
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    /* quota / private mode */
  }
}

function getCached(q: string): DictEntry[] | null {
  const now = Date.now()
  const mem = memoryCache.get(q)
  if (mem && now - mem.at < CACHE_TTL_MS && mem.entries.length) return mem.entries

  const disk = loadDiskCache()
  const hit = disk[q]
  if (hit && now - hit.at < CACHE_TTL_MS && Array.isArray(hit.entries) && hit.entries.length) {
    memoryCache.set(q, hit)
    return hit.entries
  }
  return null
}

function putCache(q: string, entries: DictEntry[]) {
  const rec: CacheRecord = {
    at: Date.now(),
    entries: entries.map((e) => ({ ...e, provider: e.provider === 'llm' ? 'llm' : e.provider ?? 'cache' })),
  }
  memoryCache.set(q, rec)
  const disk = loadDiskCache()
  disk[q] = rec
  saveDiskCache(disk)
}

function pickPhonetic(raw: Record<string, unknown>): string | undefined {
  const direct = typeof raw.phonetic === 'string' ? raw.phonetic.trim() : ''
  if (direct) return direct
  const list = Array.isArray(raw.phonetics) ? raw.phonetics : []
  for (const p of list) {
    if (p && typeof p === 'object' && typeof (p as { text?: string }).text === 'string') {
      const t = (p as { text: string }).text.trim()
      if (t) return t
    }
  }
  return undefined
}

function pickAudio(raw: Record<string, unknown>): string | undefined {
  const list = Array.isArray(raw.phonetics) ? raw.phonetics : []
  for (const p of list) {
    if (p && typeof p === 'object') {
      const a = (p as { audio?: string }).audio
      if (typeof a === 'string' && a.startsWith('http')) return a
    }
  }
  return undefined
}

function parseFreeDictEntry(raw: Record<string, unknown>): DictEntry | null {
  const word = typeof raw.word === 'string' ? raw.word : ''
  if (!word) return null
  const meanings: DictSense[] = []
  const meaningList = Array.isArray(raw.meanings) ? raw.meanings : []
  for (const m of meaningList) {
    if (!m || typeof m !== 'object') continue
    const pos =
      typeof (m as { partOfSpeech?: string }).partOfSpeech === 'string'
        ? (m as { partOfSpeech: string }).partOfSpeech
        : ''
    const defs = Array.isArray((m as { definitions?: unknown[] }).definitions)
      ? (m as { definitions: unknown[] }).definitions
      : []
    for (const d of defs) {
      if (!d || typeof d !== 'object') continue
      const definition =
        typeof (d as { definition?: string }).definition === 'string'
          ? (d as { definition: string }).definition
          : ''
      if (!definition) continue
      const example =
        typeof (d as { example?: string }).example === 'string'
          ? (d as { example: string }).example
          : undefined
      const syns = Array.isArray((d as { synonyms?: unknown[] }).synonyms)
        ? (d as { synonyms: unknown[] }).synonyms.filter((x): x is string => typeof x === 'string')
        : []
      meanings.push({
        partOfSpeech: pos,
        definition,
        definitionEn: definition,
        example,
        synonyms: syns.slice(0, 6),
      })
    }
  }
  if (!meanings.length) return null
  const sourceUrls = Array.isArray(raw.sourceUrls)
    ? raw.sourceUrls.filter((x): x is string => typeof x === 'string')
    : []
  return {
    word,
    phonetic: pickPhonetic(raw),
    audio: pickAudio(raw),
    meanings: meanings.slice(0, 12),
    sourceUrls,
    provider: 'free-dictionary',
  }
}

function parseWiktionary(word: string, data: unknown): DictEntry | null {
  if (!data || typeof data !== 'object') return null
  const en = (data as { en?: unknown }).en
  if (!Array.isArray(en) || !en.length) return null
  const meanings: DictSense[] = []
  for (const block of en) {
    if (!block || typeof block !== 'object') continue
    const pos =
      typeof (block as { partOfSpeech?: string }).partOfSpeech === 'string'
        ? (block as { partOfSpeech: string }).partOfSpeech
        : ''
    const defs = Array.isArray((block as { definitions?: unknown[] }).definitions)
      ? (block as { definitions: unknown[] }).definitions
      : []
    for (const d of defs) {
      if (!d || typeof d !== 'object') continue
      const rawDef =
        typeof (d as { definition?: string }).definition === 'string'
          ? (d as { definition: string }).definition
          : ''
      const definition = stripHtml(rawDef)
      if (!definition) continue
      let example: string | undefined
      const exs = (d as { examples?: unknown }).examples
      if (Array.isArray(exs) && typeof exs[0] === 'string') {
        example = stripHtml(exs[0]) || undefined
      }
      meanings.push({
        partOfSpeech: pos,
        definition,
        definitionEn: definition,
        example,
        synonyms: [],
      })
    }
  }
  if (!meanings.length) return null
  return {
    word,
    meanings: meanings.slice(0, 12),
    sourceUrls: [`https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`],
    provider: 'wiktionary',
  }
}

function linkSignals(parent?: AbortSignal): { signal: AbortSignal; abort: () => void } {
  const ctrl = new AbortController()
  const onParent = () => ctrl.abort()
  if (parent) {
    if (parent.aborted) ctrl.abort()
    else parent.addEventListener('abort', onParent, { once: true })
  }
  return {
    signal: ctrl.signal,
    abort: () => {
      parent?.removeEventListener('abort', onParent)
      ctrl.abort()
    },
  }
}

async function fetchFreeDictionary(
  q: string,
  signal: AbortSignal,
): Promise<DictLookupResult> {
  try {
    const res = await fetch(`${FREE_DICT}/${encodeURIComponent(q)}`, { signal })
    if (res.status === 404) {
      return {
        ok: false,
        reason: 'not_found',
        message: `网上词典未找到「${q}」。可检查拼写，或查看下方本地词表。`,
      }
    }
    if (!res.ok) {
      return {
        ok: false,
        reason: 'network',
        message: `词典服务暂时不可用（HTTP ${res.status}）。请稍后再试。`,
      }
    }
    const data = await res.json()
    if (!Array.isArray(data) || !data.length) {
      return { ok: false, reason: 'not_found', message: `网上词典未找到「${q}」。` }
    }
    const entries = data
      .map((item) =>
        item && typeof item === 'object' ? parseFreeDictEntry(item as Record<string, unknown>) : null,
      )
      .filter((x): x is DictEntry => !!x)
    if (!entries.length) {
      return { ok: false, reason: 'not_found', message: `网上词典未找到可用释义「${q}」。` }
    }
    return { ok: true, entries }
  } catch (err) {
    if (signal.aborted) {
      return { ok: false, reason: 'aborted', message: '已取消查询。' }
    }
    return {
      ok: false,
      reason: 'network',
      message: `网络查询失败：${err instanceof Error ? err.message : '未知错误'}。`,
    }
  }
}

async function fetchWiktionary(q: string, signal: AbortSignal): Promise<DictLookupResult> {
  try {
    const res = await fetch(`${WIKTIONARY}/${encodeURIComponent(q)}`, {
      signal,
      headers: { Accept: 'application/json' },
    })
    if (res.status === 404) {
      return {
        ok: false,
        reason: 'not_found',
        message: `网上词典未找到「${q}」。可检查拼写，或查看下方本地词表。`,
      }
    }
    if (!res.ok) {
      return {
        ok: false,
        reason: 'network',
        message: `Wiktionary 暂时不可用（HTTP ${res.status}）。`,
      }
    }
    const data = await res.json()
    const entry = parseWiktionary(q, data)
    if (!entry) {
      return { ok: false, reason: 'not_found', message: `网上词典未找到可用释义「${q}」。` }
    }
    return { ok: true, entries: [entry] }
  } catch (err) {
    if (signal.aborted) {
      return { ok: false, reason: 'aborted', message: '已取消查询。' }
    }
    return {
      ok: false,
      reason: 'network',
      message: `Wiktionary 查询失败：${err instanceof Error ? err.message : '未知错误'}。`,
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const t = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** English-only Free Dict / Wiktionary race (~1s). */
async function lookupDictionaryRace(
  q: string,
  signal?: AbortSignal,
): Promise<DictLookupResult> {
  const freeLink = linkSignals(signal)
  const wikiLink = linkSignals(signal)

  const freePromise = fetchFreeDictionary(q, freeLink.signal)
  const wikiPromise = fetchWiktionary(q, wikiLink.signal)

  type Settled = { source: 'free' | 'wiki'; result: DictLookupResult }
  const firstOk = new Promise<Settled>((resolve) => {
    freePromise.then((result) => {
      if (result.ok) resolve({ source: 'free', result })
    })
    wikiPromise.then((result) => {
      if (result.ok) resolve({ source: 'wiki', result })
    })
  })

  try {
    const soft = await Promise.race([
      freePromise.then((result) => ({ kind: 'free' as const, result })),
      sleep(FREE_DICT_SOFT_MS, signal).then(() => ({ kind: 'timeout' as const })),
    ])

    if (soft.kind === 'free' && soft.result.ok) {
      wikiLink.abort()
      return soft.result
    }

    const remaining = Math.max(100, TOTAL_BUDGET_MS - FREE_DICT_SOFT_MS)
    const winner = await Promise.race([
      firstOk,
      sleep(remaining, signal).then(() => null),
    ])

    if (winner?.result.ok) {
      if (winner.source === 'wiki') {
        const freeDone = await Promise.race([
          freePromise,
          sleep(80).then(() => null),
        ])
        if (freeDone && freeDone.ok) {
          wikiLink.abort()
          return freeDone
        }
      } else {
        wikiLink.abort()
      }
      return winner.result
    }

    const grace = await Promise.race([
      firstOk,
      freePromise.then((result) => ({ source: 'free' as const, result })),
      wikiPromise.then((result) => ({ source: 'wiki' as const, result })),
      sleep(200, signal).then(() => null),
    ])

    freeLink.abort()
    wikiLink.abort()

    if (grace && 'result' in grace && grace.result.ok) {
      return grace.result
    }

    const freeRes = await freePromise.catch(
      (): DictLookupResult => ({
        ok: false,
        reason: 'network',
        message: '网络查询失败。',
      }),
    )
    const wikiRes = await wikiPromise.catch(
      (): DictLookupResult => ({
        ok: false,
        reason: 'network',
        message: '网络查询失败。',
      }),
    )

    if (freeRes.ok) return freeRes
    if (wikiRes.ok) return wikiRes
    if (freeRes.reason === 'not_found' || wikiRes.reason === 'not_found') {
      return {
        ok: false,
        reason: 'not_found',
        message: `网上词典未找到「${q}」。可检查拼写，或查看下方本地词表。`,
      }
    }
    if (signal?.aborted || freeRes.reason === 'aborted' || wikiRes.reason === 'aborted') {
      return { ok: false, reason: 'aborted', message: '已取消查询。' }
    }
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    return {
      ok: false,
      reason: 'network',
      message: offline
        ? '当前似乎离线，无法查询网上词典。可先看下方本地词表。'
        : '词典服务响应较慢或暂时不可用，请稍后再试。可先看下方本地词表。',
    }
  } catch (err) {
    freeLink.abort()
    wikiLink.abort()
    if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      return { ok: false, reason: 'aborted', message: '已取消查询。' }
    }
    return {
      ok: false,
      reason: 'network',
      message: `网络查询失败：${err instanceof Error ? err.message : '未知错误'}。可先看下方本地词表。`,
    }
  }
}

function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    /* try fenced / embedded */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim())
    } catch {
      /* continue */
    }
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      return null
    }
  }
  return null
}

function parseLlmEntry(query: string, data: unknown): DictEntry | null {
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>
  const word =
    (typeof obj.word === 'string' && obj.word.trim()) ||
    (typeof obj.headword === 'string' && obj.headword.trim()) ||
    ''
  if (!word) return null

  const phonetic =
    typeof obj.phonetic === 'string' && obj.phonetic.trim() ? obj.phonetic.trim() : undefined

  const rawMeanings = Array.isArray(obj.meanings) ? obj.meanings : []
  const meanings: DictSense[] = []
  for (const m of rawMeanings) {
    if (!m || typeof m !== 'object') continue
    const row = m as Record<string, unknown>
    const pos =
      (typeof row.pos === 'string' && row.pos) ||
      (typeof row.partOfSpeech === 'string' && row.partOfSpeech) ||
      ''
    const zh =
      (typeof row.zh === 'string' && row.zh.trim()) ||
      (typeof row.definitionZh === 'string' && row.definitionZh.trim()) ||
      (typeof row.chinese === 'string' && row.chinese.trim()) ||
      ''
    const en =
      (typeof row.en === 'string' && row.en.trim()) ||
      (typeof row.definitionEn === 'string' && row.definitionEn.trim()) ||
      (typeof row.english === 'string' && row.english.trim()) ||
      (typeof row.definition === 'string' && row.definition.trim()) ||
      ''
    if (!zh && !en) continue
    const example =
      typeof row.example === 'string' && row.example.trim() ? row.example.trim() : undefined
    meanings.push({
      partOfSpeech: pos,
      definition: en || zh,
      definitionZh: zh || undefined,
      definitionEn: en || undefined,
      example,
      synonyms: [],
    })
  }
  if (!meanings.length) return null

  const qTrim = query.trim()
  return {
    word,
    query: qTrim && qTrim.toLowerCase() !== word.toLowerCase() ? qTrim : undefined,
    phonetic,
    meanings: meanings.slice(0, 8),
    sourceUrls: [],
    provider: 'llm',
  }
}

async function fetchLlmLookup(query: string, signal: AbortSignal): Promise<DictLookupResult> {
  const system = [
    'You are a bilingual English–Chinese dictionary for DSE / school learners.',
    'Reply with a single JSON object only. No markdown, no commentary.',
    'Schema:',
    '{"word":"English headword","phonetic":"IPA or empty string","meanings":[{"pos":"n./v./adj.","zh":"中文释义","en":"English definition","example":"One short English example sentence."}]}',
    'Rules:',
    '- Accept Chinese OR English query.',
    '- word must be the English lemma (for Chinese input, give the best English equivalent).',
    '- Always fill both zh and en for each meaning (1–3 meanings).',
    '- Keep definitions concise and accurate; one natural example per meaning when possible.',
  ].join('\n')

  const user = `Lookup query: ${query}`

  const timeoutLink = linkSignals(signal)
  const timer = setTimeout(() => timeoutLink.abort(), LLM_TIMEOUT_MS)

  try {
    const text = await freeAiChat({
      mode: 'vocab',
      user,
      system,
      temperature: 0.2,
      signal: timeoutLink.signal,
    })
    if (typeof text !== 'string' || !text.trim()) {
      return { ok: false, reason: 'not_found', message: `AI 未返回「${query}」的可用释义。` }
    }
    const parsed = extractJsonObject(text)
    const entry = parseLlmEntry(query, parsed)
    if (!entry) {
      return { ok: false, reason: 'not_found', message: `AI 返回格式异常，未能解析「${query}」。` }
    }
    return { ok: true, entries: [entry] }
  } catch (err) {
    if (signal?.aborted) {
      return { ok: false, reason: 'aborted', message: '已取消查询。' }
    }
    if (timeoutLink.signal.aborted && !signal?.aborted) {
      return {
        ok: false,
        reason: 'network',
        message: 'AI 释义超时，将尝试词典备用（仅英文查询）。',
      }
    }
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      reason: 'network',
      message: `AI 查询失败：${msg || '未知错误'}。`,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Look up a word/phrase in English OR Chinese via Puter.js free AI
 * (returns 中译 + 英译; Pollinations as silent AI fallback). On LLM failure,
 * English queries fall back to Free Dictionary / Wiktionary. Results are cached locally.
 */
export async function lookupWord(
  rawQuery: string,
  signal?: AbortSignal,
): Promise<DictLookupResult> {
  const trimmed = rawQuery.trim()
  if (!trimmed) {
    return { ok: false, reason: 'empty', message: '请输入要查询的英文单词或中文词。' }
  }

  const cacheKey = normalizeCacheKey(trimmed)
  if (signal?.aborted) {
    return { ok: false, reason: 'aborted', message: '已取消查询。' }
  }

  const cached = getCached(cacheKey)
  if (cached) {
    return { ok: true, entries: cached, cached: true }
  }

  const llm = await fetchLlmLookup(trimmed, signal ?? new AbortController().signal)
  if (signal?.aborted) {
    return { ok: false, reason: 'aborted', message: '已取消查询。' }
  }
  if (llm.ok) {
    putCache(cacheKey, llm.entries)
    // Also cache under English headword for faster re-search
    const head = llm.entries[0]?.word?.trim().toLowerCase()
    if (head && head !== cacheKey) putCache(head, llm.entries)
    return llm
  }

  // Optional dictionary fallback for English-looking queries
  const enKey = trimmed.toLowerCase()
  if (isEnglishWord(enKey) && !hasCjk(trimmed) && llm.reason !== 'aborted') {
    const dict = await lookupDictionaryRace(enKey, signal)
    if (dict.ok) {
      putCache(cacheKey, dict.entries)
      return dict
    }
    if (dict.reason === 'aborted') return dict
    // Prefer LLM’s message if dict also failed, but surface not_found from dict
    if (dict.reason === 'not_found') return dict
  }

  if (llm.reason === 'aborted') return llm

  if (hasCjk(trimmed) || !isEnglishWord(enKey)) {
    return {
      ok: false,
      reason: llm.reason === 'not_found' ? 'not_found' : 'network',
      message:
        llm.message ||
        `暂时无法生成「${trimmed}」的中英释义。请稍后再试，或改搜英文单词。`,
    }
  }

  return llm
}

/** @deprecated Prefer lookupWord — kept for compatibility */
export async function lookupEnglishWord(
  rawQuery: string,
  signal?: AbortSignal,
): Promise<DictLookupResult> {
  return lookupWord(rawQuery, signal)
}
