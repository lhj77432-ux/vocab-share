import type { VocabWord } from '../data/dseWords'
import { freeAiMakeSentence } from './freeAi'
import type { ApiSettings } from './types'

/**
 * One-click AI sentence via free model
 * (Puter Gemini Flash-Lite → Pollinations fallback).
 */
export async function generateAiSentence(
  word: VocabWord,
  _api?: ApiSettings,
  signal?: AbortSignal,
): Promise<string> {
  return freeAiMakeSentence(word, signal)
}
