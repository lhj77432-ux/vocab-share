/** Free Dictionary API (no API key): https://dictionaryapi.dev/ */

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
}

export type DictLookupOk = { ok: true; entries: DictEntry[] }
export type DictLookupFail = {
  ok: false
  reason: 'empty' | 'not_english' | 'not_found' | 'network'
  message: string
}
export type DictLookupResult = DictLookupOk | DictLookupFail

const API = 'https://api.dictionaryapi.dev/api/v2/entries/en'

function hasCjk(s: string) {
  return /[\u3400-\u9fff]/.test(s)
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

function parseEntry(raw: Record<string, unknown>): DictEntry | null {
  const word = typeof raw.word === 'string' ? raw.word : ''
  if (!word) return null
  const meanings: DictSense[] = []
  const meaningList = Array.isArray(raw.meanings) ? raw.meanings : []
  for (const m of meaningList) {
    if (!m || typeof m !== 'object') continue
    const pos = typeof (m as { partOfSpeech?: string }).partOfSpeech === 'string'
      ? (m as { partOfSpeech: string }).partOfSpeech
      : ''
    const defs = Array.isArray((m as { definitions?: unknown[] }).definitions)
      ? (m as { definitions: unknown[] }).definitions
      : []
    for (const d of defs) {
      if (!d || typeof d !== 'object') continue
      const definition = typeof (d as { definition?: string }).definition === 'string'
        ? (d as { definition: string }).definition
        : ''
      if (!definition) continue
      const example = typeof (d as { example?: string }).example === 'string'
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
  }
}

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

  try {
    const res = await fetch(`${API}/${encodeURIComponent(q)}`, { signal })
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
      return {
        ok: false,
        reason: 'not_found',
        message: `网上词典未找到「${q}」。`,
      }
    }
    const entries = data
      .map((item) => (item && typeof item === 'object' ? parseEntry(item as Record<string, unknown>) : null))
      .filter((x): x is DictEntry => !!x)
    if (!entries.length) {
      return {
        ok: false,
        reason: 'not_found',
        message: `网上词典未找到可用释义「${q}」。`,
      }
    }
    return { ok: true, entries }
  } catch (err) {
    if (signal?.aborted) {
      return { ok: false, reason: 'network', message: '已取消查询。' }
    }
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    return {
      ok: false,
      reason: 'network',
      message: offline
        ? '当前似乎离线，无法查询网上词典。可先看下方本地词表。'
        : `网络查询失败：${err instanceof Error ? err.message : '未知错误'}。可先看下方本地词表。`,
    }
  }
}
