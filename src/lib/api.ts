import type { ApiSettings, StudyMode } from './types'
import {
  DEFAULT_API,
  POLLINATIONS_FALLBACK,
  isPuterSettings,
} from './storage'

const MODE_PROMPTS: Record<StudyMode, string> = {
  vocab: '你是香港 DSE English 背单词助教。用简洁中文讲解词义、搭配与例句，必要时给简易英文例句。',
  analysis: '你是学习分析顾问。根据用户进度给出可执行的复习建议，简洁分点。',
  reasoning: '你是逻辑推理助教。先分步推理再给结论，服务 DSE 写作与阅读。',
  search: '你是可引用外部信息的助教。若无法真实联网，请明确说明，并基于常识给出可核查方向与可能来源类型（不要假装已搜索）。',
}

export type ChatOptions = {
  signal?: AbortSignal
  temperature?: number
  /** Replace the mode system prompt entirely */
  systemOverride?: string
  /** Skip Pollinations fallback (rare) */
  noFallback?: boolean
}

function extractPuterText(response: unknown): string {
  if (typeof response === 'string') return response.trim()
  if (!response || typeof response !== 'object') return ''
  const obj = response as {
    message?: { content?: unknown }
    toString?: () => string
  }
  const content = obj.message?.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && typeof (part as { text?: string }).text === 'string') {
          return (part as { text: string }).text
        }
        return ''
      })
      .join('')
      .trim()
  }
  if (typeof obj.toString === 'function') {
    const s = obj.toString()
    if (s && s !== '[object Object]') return s.trim()
  }
  return ''
}

async function waitForPuter(timeoutMs = 10000): Promise<PuterGlobal> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const p =
      (typeof window !== 'undefined' ? window.puter : undefined) ??
      (typeof puter !== 'undefined' ? puter : undefined)
    if (p?.ai?.chat) return p
    await new Promise((r) => setTimeout(r, 40))
  }
  throw new Error('Puter.js 未加载，请刷新页面后重试')
}

async function puterChat(
  model: string,
  system: string,
  userMessage: string,
  options?: ChatOptions,
): Promise<string> {
  const p = await waitForPuter()
  const response = await p.ai.chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: userMessage },
    ],
    {
      model,
      temperature: options?.temperature ?? 0.5,
      normalize: true,
      signal: options?.signal,
    },
  )
  const text = extractPuterText(response)
  if (!text) throw new Error('Puter 返回空内容')
  return text
}

async function openaiCompatibleChat(
  settings: ApiSettings,
  system: string,
  userMessage: string,
  options?: ChatOptions,
): Promise<string> {
  const base = (settings.baseUrl?.trim() || POLLINATIONS_FALLBACK.baseUrl).replace(/\/$/, '')
  const model = settings.model?.trim() || POLLINATIONS_FALLBACK.model
  const url = base + '/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    signal: options?.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(settings.apiKey?.trim() ? { Authorization: `Bearer ${settings.apiKey.trim()}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage },
      ],
      temperature: options?.temperature ?? 0.5,
    }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    if (res.status === 402) {
      throw new Error('免费备用通道稍忙，请约 30 秒后再试一次')
    }
    throw new Error(`API ${res.status}: ${t.slice(0, 200)}`)
  }
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('API 返回空内容')
  return text as string
}

/**
 * Default: Puter.js (google/gemini-3.1-flash-lite) — no developer API key.
 * On Puter failure, silently falls back to Pollinations gpt-oss-20b.
 */
export async function chatCompletion(
  settings: ApiSettings,
  mode: StudyMode,
  userMessage: string,
  options?: ChatOptions,
): Promise<string> {
  const system = options?.systemOverride ?? MODE_PROMPTS[mode]
  const model = settings.model?.trim() || DEFAULT_API.model

  if (isPuterSettings(settings)) {
    try {
      return await puterChat(model, system, userMessage, options)
    } catch (err) {
      if (options?.signal?.aborted) throw err
      if (options?.noFallback) throw err
      // Silent resilience: Pollinations anonymous free endpoint
      try {
        return await openaiCompatibleChat(POLLINATIONS_FALLBACK, system, userMessage, options)
      } catch {
        const msg = err instanceof Error ? err.message : String(err)
        throw new Error(
          msg.includes('auth') || msg.includes('Auth') || msg.includes('sign')
            ? '请先完成 Puter 登录窗口（开发者无需 API 密钥），或稍后再试'
            : msg || 'AI 暂时不可用，请稍后再试',
        )
      }
    }
  }

  return openaiCompatibleChat(settings, system, userMessage, options)
}
