/** Online dictionary lookup optimized for ~1s response.
 * Primary: Free Dictionary API (rich examples/audio).
 * Fallback: Wiktionary REST (fast, CORS-open) when Free Dict is slow/down.
 * Cache: in-memory + localStorage for repeat lookups.
 */

export type DictSense = {
  partOfSpeech: string
  definition: string
  example?: string
  synonyms: string[]
}

export type DictEntry = {
  word: string
  phonetic?: string
  audio?: string
  meanings: DictSense[]
  sourceUrls: string[]
  /** Which upstream provided this entry */
  provider?: 'free-dictionary' | 'wiktionary' | 'cache'
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
const CACHE_KEY = 'vocab-share-dict-cache-v1'
const CACHE_MAX = 80
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** Soft budget for Free Dictionary before we prefer Wiktionary if ready */
const FREE_DICT_SOFT_MS = 750
/** Hard overall network budget */
const TOTAL_BUDGET_MS = 1100

type CacheRecord = { at: number; entries: DictEntry[] }

const memoryCache = new Map<string, CacheRecord>()

function hasCjk(s: string) {
  return /[\u3400-\u9fff]/.test(s)
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
    entries: entries.map((e) => ({ ...e, provider: e.provider ?? 'cache' })),
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
      meanings.push({ partOfSpeech: pos, definition, example, synonyms: [] })
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

/**
 * Look up an English word. Prefer Free Dictionary when it answers quickly;
 * otherwise use Wiktionary so the UI stays near ~1s. Results are cached.
 */
export async function lookupEnglishWord(
  rawQuery: string,
  signal?: AbortSignal,
): Promise<DictLookupResult> {
  const q = rawQuery.trim().toLowerCase()
  if (!q) {
    return { ok: false, reason: 'empty', message: '请输入要查询的英文单词。' }
  }
  if (hasCjk(q) || !/^[a-z][a-z'\-]*$/i.test(q)) {
    return {
      ok: false,
      reason: 'not_english',
      message: '网络词典支持英文单词查询（如 sustainable）。中文可先看下方本地词表匹配。',
    }
  }

  if (signal?.aborted) {
    return { ok: false, reason: 'aborted', message: '已取消查询。' }
  }

  const cached = getCached(q)
  if (cached) {
    return { ok: true, entries: cached, cached: true }
  }

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
    // Soft wait: if Free Dictionary wins within soft budget, use it.
    const soft = await Promise.race([
      freePromise.then((result) => ({ kind: 'free' as const, result })),
      sleep(FREE_DICT_SOFT_MS, signal).then(() => ({ kind: 'timeout' as const })),
    ])

    if (soft.kind === 'free' && soft.result.ok) {
      wikiLink.abort()
      putCache(q, soft.result.entries)
      return soft.result
    }

    // Soft timed out (or Free Dict failed quickly). Prefer any ready success.
    const remaining = Math.max(100, TOTAL_BUDGET_MS - FREE_DICT_SOFT_MS)
    const winner = await Promise.race([
      firstOk,
      sleep(remaining, signal).then(() => null),
    ])

    if (winner?.result.ok) {
      // Prefer Free Dictionary if it also finished ok (richer examples)
      if (winner.source === 'wiki') {
        const freeDone = await Promise.race([
          freePromise,
          sleep(80).then(() => null),
        ])
        if (freeDone && freeDone.ok) {
          wikiLink.abort()
          putCache(q, freeDone.entries)
          return freeDone
        }
      } else {
        wikiLink.abort()
      }
      putCache(q, winner.result.entries)
      return winner.result
    }

    // Last chance: await whichever finishes within a short grace, then abort rest.
    const grace = await Promise.race([
      firstOk,
      freePromise.then((result) => ({ source: 'free' as const, result })),
      wikiPromise.then((result) => ({ source: 'wiki' as const, result })),
      sleep(200, signal).then(() => null),
    ])

    freeLink.abort()
    wikiLink.abort()

    if (grace && 'result' in grace && grace.result.ok) {
      putCache(q, grace.result.entries)
      return grace.result
    }

    // Surface the most useful failure
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

    if (freeRes.ok) {
      putCache(q, freeRes.entries)
      return freeRes
    }
    if (wikiRes.ok) {
      putCache(q, wikiRes.entries)
      return wikiRes
    }
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
