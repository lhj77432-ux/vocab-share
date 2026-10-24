import type { VocabWord } from '../data/dseWords'

export type MeaningChoice = {
  text: string
  correct: boolean
}

export type GlossPart = {
  /** Chinese text, or "____" when blank */
  text: string
  /** True = this slot is the blanked target-word meaning */
  blank?: boolean
}

export type ClozeGloss = {
  sentenceEn: string
  parts: GlossPart[]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Build multiple-choice Chinese meanings for one DSE word.
 * 1 correct (pack meaningZh) + distractors from other pack words (deduped).
 */
export function buildMeaningChoices(
  target: VocabWord,
  pool: VocabWord[],
  optionCount = 4,
): MeaningChoice[] {
  const correct = (target.meaningZh || '').trim()
  if (!correct) return []

  const n = Math.max(2, Math.min(6, optionCount))
  const seen = new Set<string>([correct])
  const distractors: string[] = []

  const others = shuffle(pool.filter((w) => w.id !== target.id))
  for (const w of others) {
    const m = (w.meaningZh || '').trim()
    if (!m || seen.has(m)) continue
    seen.add(m)
    distractors.push(m)
    if (distractors.length >= n - 1) break
  }

  if (distractors.length < 1) {
    return [{ text: correct, correct: true }]
  }

  return shuffle([
    { text: correct, correct: true },
    ...distractors.map((text) => ({ text, correct: false })),
  ])
}

/** Local fallback cloze when model gloss is missing. */
export function localClozeGloss(word: VocabWord, sentenceEn?: string): ClozeGloss {
  const en = (sentenceEn || word.example || '').trim() || `Please learn the word “${word.word}”.`
  return {
    sentenceEn: en,
    parts: [
      { text: '句意提示：' },
      { text: '____', blank: true },
      { text: '（请结合上方英文句推断该词中文意思）' },
    ],
  }
}

/** Normalize model/local gloss parts; ensure exactly one blank. */
export function normalizeGlossParts(
  parts: GlossPart[] | undefined,
  word: VocabWord,
  sentenceEn?: string,
): GlossPart[] {
  const cleaned = (parts ?? [])
    .map((p) => ({
      text: (p.text || '').trim(),
      blank: Boolean(p.blank),
    }))
    .filter((p) => p.text)
  const blanks = cleaned.filter((p) => p.blank)
  if (cleaned.length >= 2 && blanks.length === 1) {
    return cleaned.map((p) =>
      p.blank ? { text: p.text.includes('_') ? p.text : '____', blank: true } : p,
    )
  }
  return localClozeGloss(word, sentenceEn).parts
}

export function renderGlossPlain(parts: GlossPart[]): string {
  return parts.map((p) => (p.blank ? '____' : p.text)).join('')
}
