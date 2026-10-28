import type { VocabWord } from '../data/dseWords'
import {
  buildMeaningChoices,
  localClozeGloss,
  normalizeGlossParts,
  type ClozeGloss,
  type MeaningChoice,
} from './mcq'

export const DEFAULT_QUIZ_LENGTH = 10

export type QuizQuestion = {
  word: VocabWord
  choices: MeaningChoice[]
  cloze: ClozeGloss
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Build one local question: ABCD + English sentence + Chinese cloze gloss. */
export function buildLocalQuizQuestion(
  target: VocabWord,
  pool: VocabWord[],
  sentenceEn?: string,
  glossParts?: ClozeGloss['parts'],
): QuizQuestion {
  const clozeBase = sentenceEn
    ? { sentenceEn, parts: normalizeGlossParts(glossParts, target, sentenceEn) }
    : localClozeGloss(target)
  return {
    word: target,
    choices: buildMeaningChoices(target, pool, 4),
    cloze: {
      sentenceEn: clozeBase.sentenceEn,
      parts: normalizeGlossParts(clozeBase.parts, target, clozeBase.sentenceEn),
    },
  }
}

/**
 * Prebuild a multi-question session from the DSE pack.
 * Each item uses a distinct word; options/distractors from the pack.
 */
export function buildQuizSession(
  words: VocabWord[],
  length = DEFAULT_QUIZ_LENGTH,
  excludeIds?: Set<string>,
): QuizQuestion[] {
  const usable = words.filter((w) => w.meaningZh?.trim() && w.example?.trim())
  const pool = excludeIds?.size
    ? usable.filter((w) => !excludeIds.has(w.id))
    : usable
  const source = pool.length >= 4 ? pool : usable
  if (source.length < 1) return []

  const n = Math.min(Math.max(1, length), source.length)
  const picked = shuffle(source).slice(0, n)
  return picked.map((w) => buildLocalQuizQuestion(w, usable))
}

/** Next brand-new question excluding ids already used this session (+ optional global exclude). */
export function nextFreshQuizQuestion(
  words: VocabWord[],
  usedIds: Set<string>,
  excludeIds?: Set<string>,
): QuizQuestion | null {
  const usable = words.filter((w) => w.meaningZh?.trim() && w.example?.trim())
  const notExcluded = excludeIds?.size
    ? usable.filter((w) => !excludeIds.has(w.id))
    : usable
  const base = notExcluded.length >= 1 ? notExcluded : usable
  const fresh = base.filter((w) => !usedIds.has(w.id))
  const source = fresh.length ? fresh : base
  if (!source.length) return null
  const target = shuffle(source)[0]
  return buildLocalQuizQuestion(target, usable)
}
