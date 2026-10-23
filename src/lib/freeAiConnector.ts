/**
 * Website-side MCP-style free AI connector.
 *
 * Auto-connects Puter.js `google/gemini-3.1-flash-lite` (no user API key).
 * On failure, chatCompletion silently falls back to Pollinations gpt-oss-20b.
 * Callers never ask the user to pick a model or paste a key.
 */

import type { VocabWord } from '../data/dseWords'
import { chatCompletion, type ChatOptions } from './api'
import { DEFAULT_API, isPuterSettings, loadApiSettings } from './storage'
import type { ApiSettings, StudyMode } from './types'

export const FREE_CONNECTOR_ID = 'vocab-share-free-ai-v1'
export const FREE_CONNECTOR_MODEL = DEFAULT_API.model
export const FREE_CONNECTOR_LABEL = 'Puter · Gemini Flash-Lite（免费自动）'

/** Resolved settings for the free connector (Puter default; legacy free → migrate). */
export function getFreeConnectorSettings(): ApiSettings {
  const saved = typeof localStorage !== 'undefined' ? loadApiSettings() : { ...DEFAULT_API }
  // Prefer Puter free path whenever user has not set a custom paid endpoint+key
  if (isPuterSettings(saved) || !saved.apiKey?.trim()) {
    return { ...DEFAULT_API }
  }
  return saved
}

export type ConnectorChatArgs = {
  mode?: StudyMode
  user: string
  system?: string
  temperature?: number
  signal?: AbortSignal
  /** Override only when a feature must use a specific saved endpoint */
  api?: ApiSettings
}

/** Low-level: send a prompt through the free connector. */
export async function connectorChat(args: ConnectorChatArgs): Promise<string> {
  const api = args.api ?? getFreeConnectorSettings()
  const options: ChatOptions = {
    signal: args.signal,
    temperature: args.temperature ?? 0.4,
    systemOverride: args.system,
  }
  return chatCompletion(api, args.mode ?? 'vocab', args.user, options)
}

export type ConnectorLexResult = {
  word: string
  meaningZh: string
  meaningEn: string
  pos?: string
  sentence: string
  phonetic?: string
}

/**
 * Arbitrary user input → free model thinks → 生词 + 中译 + 英译 + 造句.
 * Used by search / quick-think surfaces. Does not invent DSE-pack membership.
 */
export async function connectorLexAndSentence(
  rawInput: string,
  signal?: AbortSignal,
): Promise<ConnectorLexResult> {
  const q = rawInput.trim()
  if (!q) throw new Error('请输入任意英文或中文内容')

  const system = [
    '你是香港 DSE English 词汇助教，通过网站免费连接器实时思考。',
    '用户可能输入英文单词、短语或中文意思。',
    '只输出一个 JSON 对象，不要 markdown，不要其它说明。',
    '格式：{"word":"英文原词","pos":"n./v./adj.","zh":"中文意思","en":"English gloss","sentence":"一句含该词的英文造句","phonetic":"IPA或空字符串"}',
    'sentence 必须包含 word（可变形），贴近校园／社会／环境话题，难度适中。',
    '释义要准确；不要编造不存在的单词拼写。',
  ].join('\n')

  const text = await connectorChat({
    mode: 'vocab',
    user: `输入：${q}\n请生成生词、中文意思、英译与造句。`,
    system,
    temperature: 0.35,
    signal,
  })

  const obj = extractJsonObject(text)
  if (!obj) throw new Error('模型未返回可解析结果，请再试一次')

  const word = str(obj.word) || str(obj.headword) || q
  const meaningZh = str(obj.zh) || str(obj.meaningZh) || str(obj.chinese) || ''
  const meaningEn = str(obj.en) || str(obj.meaningEn) || str(obj.english) || str(obj.definition) || ''
  const sentence = str(obj.sentence) || str(obj.example) || ''
  const pos = str(obj.pos) || str(obj.partOfSpeech) || undefined
  const phonetic = str(obj.phonetic) || undefined

  if (!meaningZh && !meaningEn) throw new Error('模型未给出可用释义')
  if (!sentence) throw new Error('模型未给出造句')

  return { word, meaningZh, meaningEn, pos, sentence, phonetic }
}

/** One-click sentence for a pack word via the same free connector. */
export async function connectorMakeSentence(
  word: VocabWord,
  signal?: AbortSignal,
): Promise<string> {
  const system = [
    '你是香港 DSE English 造句助教（网站免费连接器）。',
    '写「一句」地道英文句子，必须原样包含目标词（可变形），不要换近义词。',
    '只输出这一句英文，不要引号、不要中文、不要解释。',
  ].join('\n')

  const user = [
    `目标词：${word.word}`,
    `词性：${word.pos}`,
    `中文意思：${word.meaningZh}`,
    word.theme ? `主题：${word.theme}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const reply = await connectorChat({
    mode: 'vocab',
    user,
    system,
    temperature: 0.7,
    signal,
  })

  let s = reply.trim()
  const fence = s.match(/```(?:\w+)?\s*([\s\S]*?)```/)
  if (fence?.[1]) s = fence[1].trim()
  s = s.replace(/^["'“‘]|["'”’]$/g, '').trim()
  const line = s
    .split(/\n+/)
    .map((l) => l.replace(/^\s*\d+[\).、]\s*/, '').trim())
    .find((l) => /[A-Za-z]/.test(l))
  if (line) s = line
  s = s.replace(/^Sentence\s*:\s*/i, '').trim()
  if (!s) throw new Error('模型未返回可用造句')

  const key = word.word.toLowerCase().split(/\s+/)[0]?.replace(/[^a-z\-']/gi, '') ?? ''
  if (key && !s.toLowerCase().includes(key)) {
    throw new Error('造句未包含目标词，请再点一次 AI 造句')
  }
  if (s.length > 280) s = s.slice(0, 277).trimEnd() + '…'
  return s
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s)
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
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
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return tryParse(trimmed.slice(start, end + 1))
  return null
}
