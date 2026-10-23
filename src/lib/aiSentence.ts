import type { VocabWord } from '../data/dseWords'
import { connectorMakeSentence } from './freeAiConnector'
import type { ApiSettings } from './types'

/**
 * One-click AI sentence via the website free AI connector
 * (Puter Gemini Flash-Lite → Pollinations fallback).
 */
export async function generateAiSentence(
  word: VocabWord,
  _api?: ApiSettings,
  signal?: AbortSignal,
): Promise<string> {
  return connectorMakeSentence(word, signal)
}
