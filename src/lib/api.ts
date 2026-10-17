import type { ApiSettings, StudyMode } from './types'
import { DEFAULT_API } from './storage'

const MODE_PROMPTS: Record<StudyMode, string> = {
  vocab: '你是香港 DSE English 背单词助教。用简洁中文讲解词义、搭配与例句，必要时给简易英文例句。',
  analysis: '你是学习分析顾问。根据用户进度给出可执行的复习建议，简洁分点。',
  reasoning: '你是逻辑推理助教。先分步推理再给结论，服务 DSE 写作与阅读。',
  search: '你是可引用外部信息的助教。若无法真实联网，请明确说明，并基于常识给出可核查方向与可能来源类型（不要假装已搜索）。',
}

export async function chatCompletion(
  settings: ApiSettings,
  mode: StudyMode,
  userMessage: string,
): Promise<string> {
  const base = (settings.baseUrl?.trim() || DEFAULT_API.baseUrl).replace(/\/$/, '')
  const model = settings.model?.trim() || DEFAULT_API.model
  const url = base + '/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.apiKey?.trim() ? { Authorization: `Bearer ${settings.apiKey.trim()}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: MODE_PROMPTS[mode] },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.5,
    }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    if (res.status === 402) {
      throw new Error('免费额度稍忙，请约 30 秒后再试一次（匿名约每 30 秒 1 次）')
    }
    throw new Error(`API ${res.status}: ${t.slice(0, 200)}`)
  }
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('API 返回空内容')
  return text as string
}
