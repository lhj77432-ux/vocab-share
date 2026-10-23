import type { VocabWord } from '../data/dseWords'
import { chatCompletion } from './api'
import type { ApiSettings } from './types'

/**
 * One-click AI sentence for a DSE pack word via the same free Puter/Pollinations path.
 * Returns a single English sentence that must contain the target word.
 */
export async function generateAiSentence(
  word: VocabWord,
  api: ApiSettings,
  signal?: AbortSignal,
): Promise<string> {
  const system = [
    '你是香港 DSE English 造句助教。',
    '根据目标词写「一句」地道、适合 DSE 写作／口语话题的英文句子。',
    'HARD RULE: 句子必须原样包含目标英文词（可变形：时态／单复数），不要换成近义词。',
    '主题贴近校园、社会、环境或科技；难度适中，避免生僻词堆砌。',
    '只输出这一句英文，不要引号、不要中文、不要解释、不要编号。',
  ].join('\n')

  const user = [
    `目标词：${word.word}`,
    `词性：${word.pos}`,
    `中文意思：${word.meaningZh}`,
    word.theme ? `主题提示：${word.theme}` : '',
    word.category ? `类别：${word.category}` : '',
    '请直接输出一句英文句子。',
  ]
    .filter(Boolean)
    .join('\n')

  const reply = await chatCompletion(api, 'vocab', user, {
    systemOverride: system,
    temperature: 0.7,
    signal,
  })

  const sentence = cleanSentence(reply, word.word)
  if (!sentence) throw new Error('模型未返回可用造句，请再试一次')
  return sentence
}

function cleanSentence(raw: string, target: string): string {
  let s = raw.trim()
  // Drop common wrappers / fences
  const fence = s.match(/```(?:\w+)?\s*([\s\S]*?)```/)
  if (fence?.[1]) s = fence[1].trim()
  s = s.replace(/^["'“‘]|["'”’]$/g, '').trim()
  // Take first non-empty line if model added commentary
  const firstLine = s
    .split(/\n+/)
    .map((l) => l.replace(/^\s*\d+[\).、]\s*/, '').trim())
    .find((l) => /[A-Za-z]/.test(l))
  if (firstLine) s = firstLine
  s = s.replace(/^Sentence\s*:\s*/i, '').trim()
  if (!s) return ''

  // Soft check: lemma / first token of multiword appears (case-insensitive)
  const key = target.toLowerCase().split(/\s+/)[0]?.replace(/[^a-z\-']/gi, '') ?? ''
  if (key && !s.toLowerCase().includes(key.toLowerCase())) {
    // Still return — UI can show; caller may retry. Prefer not invent.
    // Require presence for safety against synonym swap.
    return ''
  }
  // Cap length to keep UI tidy
  if (s.length > 280) s = s.slice(0, 277).trimEnd() + '…'
  return s
}
