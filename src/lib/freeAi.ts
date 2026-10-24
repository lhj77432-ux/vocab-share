/**
 * Direct free-model helpers for the vocab-share site.
 * The website itself is the pipe: page → Puter google/gemini-3.1-flash-lite
 * (silent Pollinations gpt-oss-20b fallback) → page.
 * No separate connector / plugin layer.
 */

import type { VocabWord } from '../data/dseWords'
import { chatCompletion, type ChatOptions } from './api'
import { DEFAULT_API, isPuterSettings, loadApiSettings } from './storage'
import type { ApiSettings, StudyMode } from './types'

export const FREE_AI_MODEL = DEFAULT_API.model
export const FREE_AI_LABEL = '本站服务'

/** Always prefer Puter free path unless user saved a custom keyed endpoint. */
export function getFreeAiSettings(): ApiSettings {
  const saved = typeof localStorage !== 'undefined' ? loadApiSettings() : { ...DEFAULT_API }
  if (isPuterSettings(saved) || !saved.apiKey?.trim()) {
    return { ...DEFAULT_API }
  }
  return saved
}

export type FreeAiChatArgs = {
  mode?: StudyMode
  user: string
  system?: string
  temperature?: number
  signal?: AbortSignal
  api?: ApiSettings
}

export async function freeAiChat(args: FreeAiChatArgs): Promise<string> {
  const api = args.api ?? getFreeAiSettings()
  const options: ChatOptions = {
    signal: args.signal,
    temperature: args.temperature ?? 0.4,
    systemOverride: args.system,
  }
  return chatCompletion(api, args.mode ?? 'vocab', args.user, options)
}

export type LexResult = {
  word: string
  meaningZh: string
  meaningEn: string
  pos?: string
  sentence: string
  phonetic?: string
}

/** Search: English/Chinese → English + Chinese + example sentence in one shot. */
export async function freeAiLex(
  rawInput: string,
  signal?: AbortSignal,
): Promise<LexResult> {
  const q = rawInput.trim()
  if (!q) throw new Error('请输入英文单词或中文意思')

  const system = [
    '你是香港 DSE English 词汇助教。页面直接调用免费模型。',
    '用户可能输入英文单词、短语或中文意思。',
    '只输出一个 JSON 对象，不要 markdown，不要其它说明。',
    '格式：{"word":"英文原词","pos":"n./v./adj.","zh":"中文意思","en":"English gloss","sentence":"一句含该词的英文例句","phonetic":"IPA或空字符串"}',
    'sentence 必须包含 word（可变形），贴近校园／社会／环境话题。',
    '释义要准确；不要编造不存在的单词拼写。',
  ].join('\n')

  const text = await freeAiChat({
    mode: 'vocab',
    user: `输入：${q}\n请一次返回：英文词、中文意思、英译、例句。`,
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
  if (!sentence) throw new Error('模型未给出例句')

  return { word, meaningZh, meaningEn, pos, sentence, phonetic }
}

/** One-click sentence for a pack word via free model. */
export async function freeAiMakeSentence(
  word: VocabWord,
  signal?: AbortSignal,
): Promise<string> {
  const system = [
    '你是香港 DSE English 造句助教（页面直连免费模型）。',
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

  const reply = await freeAiChat({
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
    throw new Error('造句未包含目标词，请再试一次')
  }
  if (s.length > 280) s = s.slice(0, 277).trimEnd() + '…'
  return s
}

/** Learn / recommend card: enrich a DSE word with a fresh example sentence. */
export async function freeAiEnrichWord(
  word: VocabWord,
  signal?: AbortSignal,
): Promise<{ sentence: string; tip?: string }> {
  const system = [
    '你是香港 DSE 背单词助教。只输出 JSON：{"sentence":"英文例句","tip":"一句中文记忆提示"}。',
    'sentence 必须包含目标词（可变形）。不要编造站外单词。',
  ].join('\n')
  const text = await freeAiChat({
    mode: 'vocab',
    user: `词：${word.word}（${word.pos}）中文：${word.meaningZh}`,
    system,
    temperature: 0.55,
    signal,
  })
  const obj = extractJsonObject(text)
  const sentence = str(obj?.sentence) || str(obj?.example) || (await freeAiMakeSentence(word, signal))
  const tip = str(obj?.tip) || undefined
  return { sentence, tip }
}

/** Quiz: free model generates one MCQ from allowed DSE words. */
export type AiQuizItem = {
  word: string
  questionZh: string
  options: string[]
  answerIndex: number
  explainZh: string
}

export async function freeAiQuizItem(
  candidates: VocabWord[],
  signal?: AbortSignal,
): Promise<AiQuizItem> {
  const pool = candidates.slice(0, 40)
  if (pool.length < 4) throw new Error('词表太少，无法出题')
  const catalog = pool.map((w) => `${w.word}|${w.meaningZh}`).join('\n')
  const system = [
    '你是 DSE 词汇测验出题器。只从用户给出的词表出题。',
    '只输出 JSON：{"word":"目标英文词","questionZh":"中文题干","options":["选项A","选项B","选项C","选项D"],"answerIndex":0,"explainZh":"简短讲解"}',
    'options 必须是四个中文释义；answerIndex 为正确选项下标 0-3。',
    '不要出现词表以外的英文词。',
  ].join('\n')
  const text = await freeAiChat({
    mode: 'vocab',
    user: `从下列词表出 1 道选择题：\n${catalog}`,
    system,
    temperature: 0.5,
    signal,
  })
  const obj = extractJsonObject(text)
  if (!obj) throw new Error('模型未返回可解析题目')
  const options = Array.isArray(obj.options) ? obj.options.map((x) => String(x).trim()).filter(Boolean) : []
  const answerIndex = Number(obj.answerIndex)
  if (options.length < 4 || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) {
    throw new Error('题目格式不完整，请再试')
  }
  return {
    word: str(obj.word) || pool[0].word,
    questionZh: str(obj.questionZh) || '选出正确中文意思',
    options: options.slice(0, 4),
    answerIndex,
    explainZh: str(obj.explainZh) || '',
  }
}

/** Categorize: free model suggests DSE category for free text / word. */
export async function freeAiCategorize(
  raw: string,
  allowedCategories: string[],
  signal?: AbortSignal,
): Promise<{ category: string; reason: string; word?: string; meaningZh?: string; sentence?: string }> {
  const q = raw.trim()
  if (!q) throw new Error('请输入要归类的内容')
  const system = [
    '你是 DSE 词汇归类助教。只输出 JSON：',
    '{"word":"英文词","meaningZh":"中文","sentence":"英文例句","category":"必须是给定类别之一","reason":"一句中文理由"}',
    `可选类别：${allowedCategories.join('、')}`,
    'category 必须精确匹配其中一个；不要编造词表外假词作为推荐词库成员。',
  ].join('\n')
  const text = await freeAiChat({
    mode: 'vocab',
    user: `请归类：${q}`,
    system,
    temperature: 0.3,
    signal,
  })
  const obj = extractJsonObject(text)
  if (!obj) throw new Error('模型未返回可解析归类结果')
  let category = str(obj.category)
  if (!allowedCategories.includes(category)) {
    category = allowedCategories.find((c) => category.includes(c) || c.includes(category)) || allowedCategories[0]
  }
  return {
    category,
    reason: str(obj.reason) || '',
    word: str(obj.word) || undefined,
    meaningZh: str(obj.meaningZh) || undefined,
    sentence: str(obj.sentence) || undefined,
  }
}


/** Learn / 今日推荐: English example + Chinese gloss with target meaning blanked. */
export type ClozeGlossResult = {
  sentenceEn: string
  parts: { text: string; blank?: boolean }[]
}

export async function freeAiClozeForWord(
  word: VocabWord,
  signal?: AbortSignal,
  baseSentence?: string,
): Promise<ClozeGlossResult> {
  const system = [
    '你是香港 DSE 背单词助教。为学生做「挖空中译」练习。',
    '只输出 JSON，不要 markdown：',
    '{"sentenceEn":"含目标词的英文例句","gloss":[{"t":"中文片段","blank":false},{"t":"____","blank":true},...]}',
    '规则：',
    '1) sentenceEn 必须包含目标英文词（可变形），地道、贴近校园／社会／环境。',
    '2) gloss 是对该英文句的中文逐段意译，按阅读顺序排列。',
    '3) 恰好有一段 blank:true，代表目标词的中文意思，text 用 "____"；其它词语／短语的中文照常写出且 blank:false。',
    '4) 不要在非 blank 段里出现目标词的中文释义。',
    '5) 不要编造站外单词。',
  ].join('\n')
  const user = [
    `目标词：${word.word}`,
    `词性：${word.pos}`,
    `正确中文意思（仅供你内部对齐 blank，不要写进非 blank 段）：${word.meaningZh}`,
    baseSentence ? `可参考／改写此例句：${baseSentence}` : '',
    '请输出 JSON。',
  ]
    .filter(Boolean)
    .join('\n')

  const text = await freeAiChat({
    mode: 'vocab',
    user,
    system,
    temperature: 0.45,
    signal,
  })
  const obj = extractJsonObject(text)
  const sentenceEn =
    str(obj?.sentenceEn) || str(obj?.sentence) || str(obj?.example) || baseSentence || word.example
  const raw = obj?.gloss ?? obj?.glossParts ?? obj?.parts
  const parts: { text: string; blank?: boolean }[] = []
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      const t = str(r.t) || str(r.text) || str(r.zh)
      if (!t) continue
      const blank = Boolean(r.blank) || t.replace(/\s/g, '').includes('____') || t === '…' || t === '...'
      parts.push({ text: blank ? '____' : t, blank })
    }
  }
  const blankCount = parts.filter((p) => p.blank).length
  if (!sentenceEn || parts.length < 2 || blankCount !== 1) {
    throw new Error('挖空中译格式不完整')
  }
  // Safety: non-blank parts must not contain the pack meaning string
  const meaning = word.meaningZh.trim()
  const leaked = parts.some(
    (p) => !p.blank && meaning && p.text.includes(meaning.split(/[；;、]/)[0] ?? meaning),
  )
  if (leaked) {
    // Soft fail → caller can use local fallback
    throw new Error('挖空中译泄露了目标词释义')
  }
  return { sentenceEn, parts }
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
