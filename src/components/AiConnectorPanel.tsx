/**
 * Plugin-style free AI connector panel (website MCP vibe).
 * Any input → auto Puter/Pollinations → 生词 / 中译 / 英译 / 造句.
 * No model picker, no API key.
 */
import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  FREE_CONNECTOR_LABEL,
  connectorLexAndSentence,
  type ConnectorLexResult,
} from '../lib/freeAiConnector'
import {
  isFavoriteWord,
  loadFavorites,
  saveFavorites,
  toggleFavorite,
  type FavoriteWord,
} from '../lib/storage'

function toast(msg: string) {
  let el = document.getElementById('vs-toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'vs-toast'
    el.className = 'toast'
    document.body.appendChild(el)
  }
  el.textContent = msg
  el.classList.add('show')
  window.clearTimeout((el as HTMLElement & { _t?: number })._t)
  ;(el as HTMLElement & { _t?: number })._t = window.setTimeout(() => el!.classList.remove('show'), 2200)
}

function resultToFavoriteEntry(r: ConnectorLexResult) {
  return {
    word: r.word,
    phonetic: r.phonetic,
    meanings: [
      {
        partOfSpeech: r.pos || '',
        definition: r.meaningEn || r.meaningZh,
        definitionZh: r.meaningZh || undefined,
        definitionEn: r.meaningEn || undefined,
        example: r.sentence || undefined,
      },
    ],
    sourceUrls: ['vocab-share://free-ai-connector'],
  }
}

export type AiConnectorPanelProps = {
  /** Compact = home embed; full = dedicated /connector page */
  variant?: 'home' | 'full'
  initialQuery?: string
}

export function AiConnectorPanel({ variant = 'home', initialQuery = '' }: AiConnectorPanelProps) {
  const [q, setQ] = useState(initialQuery)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<ConnectorLexResult | null>(null)
  const [favorites, setFavorites] = useState<FavoriteWord[]>(() => loadFavorites())
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (initialQuery.trim()) setQ(initialQuery)
  }, [initialQuery])

  const run = async (raw?: string) => {
    const input = (raw ?? q).trim()
    if (!input) {
      setErr('请输入任意英文单词、短语或中文意思')
      return
    }
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setBusy(true)
    setErr(null)
    setResult(null)
    try {
      const r = await connectorLexAndSentence(input, ac.signal)
      if (ac.signal.aborted) return
      setResult(r)
      setQ(input)
    } catch (e) {
      if (ac.signal.aborted) return
      const msg = e instanceof Error ? e.message : '连接器调用失败，请稍后再试'
      if (/abort/i.test(msg)) return
      setErr(msg)
    } finally {
      if (!ac.signal.aborted) setBusy(false)
    }
  }

  useEffect(() => () => abortRef.current?.abort(), [])

  const favorited = result ? isFavoriteWord(favorites, result.word) : false

  const onToggleFavorite = () => {
    if (!result) return
    const next = toggleFavorite(favorites, resultToFavoriteEntry(result))
    saveFavorites(next)
    setFavorites(next)
    toast(isFavoriteWord(next, result.word) ? `已收藏「${result.word}」` : `已取消收藏「${result.word}」`)
  }

  return (
    <section className={`connector-panel ${variant === 'full' ? 'connector-panel--full' : ''}`}>
      <div className="connector-head">
        <div className="connector-title-row">
          <span className="connector-plugin-badge" title="网站式免费 AI 连接器（自动）">
            🔌 插件 · 连接器
          </span>
          <span className="connector-status-chip" aria-live="polite">
            {busy ? '连接中…' : '自动已接入'}
          </span>
        </div>
        <h2>{variant === 'full' ? '免费 AI 连接器' : '免费 AI 连接器（主入口）'}</h2>
        <p className="muted">
          像插件一样：任意输入 → 自动接免费大模型思考 → 返回<strong>生词</strong>、<strong>中文意思</strong>、<strong>英译</strong>、<strong>造句</strong>。
          无需选手动模型／填 key。链路：{FREE_CONNECTOR_LABEL}（失败静默回退 Pollinations）。词库／可学生成不封顶。
        </p>
      </div>

      <form
        className="connector-form"
        onSubmit={(e) => {
          e.preventDefault()
          void run()
        }}
      >
        <label className="sr-only" htmlFor="ai-connector-input">
          连接器输入
        </label>
        <textarea
          id="ai-connector-input"
          className="connector-input"
          rows={variant === 'full' ? 3 : 2}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="随便输入：sustainable / 可持续发展 / climate change …"
          disabled={busy}
        />
        <div className="connector-actions">
          <button className="btn btn-primary" type="submit" disabled={busy || !q.trim()}>
            {busy ? '模型思考中…' : '一键生成'}
          </button>
          {result ? (
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => void run(q)}
            >
              再生成
            </button>
          ) : null}
          {variant === 'home' ? (
            <NavLink className="btn" to="/connector">
              打开完整连接器
            </NavLink>
          ) : (
            <NavLink className="btn" to="/search">
              去搜索页
            </NavLink>
          )}
        </div>
      </form>

      {err ? <p className="connector-error" role="alert">{err}</p> : null}

      {result ? (
        <div className="connector-result" aria-live="polite">
          <div className="connector-result-top">
            <div>
              <b className="connector-word">{result.word}</b>
              {result.pos ? <span className="chip">{result.pos}</span> : null}
              {result.phonetic ? <span className="muted">/{result.phonetic}/</span> : null}
            </div>
            <div className="row">
              <button className="btn" type="button" onClick={onToggleFavorite}>
                {favorited ? '★ 已收藏' : '☆ 收藏'}
              </button>
              <NavLink className="btn" to={`/sentence?q=${encodeURIComponent(result.word)}`}>
                去造句页
              </NavLink>
            </div>
          </div>
          <dl className="connector-dl">
            <div>
              <dt>中文意思</dt>
              <dd>{result.meaningZh || '—'}</dd>
            </div>
            <div>
              <dt>英译</dt>
              <dd>{result.meaningEn || '—'}</dd>
            </div>
            <div>
              <dt>造句</dt>
              <dd className="connector-sentence">{result.sentence}</dd>
            </div>
          </dl>
          <p className="muted" style={{ marginTop: 8, fontSize: '0.8rem' }}>
            来源：网站免费 AI 连接器（非本地词表硬编码；可任意扩展学习）
          </p>
        </div>
      ) : (
        !busy && !err && (
          <p className="muted connector-hint">
            提示：这是连接器路径，不是「只能翻本地约 N 个词」。本地 DSE 词表仍用于学习／今日推荐（推荐只从站内词选、不编假词）。
          </p>
        )
      )}
    </section>
  )
}
