/**
 * Plugin-style free AI connector panel.
 * Flow: 输入 → 连接器 → 免费模型 → 显现站上已有功能（生词／中译／英译／造句／收藏／学习入口）
 * Not a free-chat surface.
 */
import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  FREE_CONNECTOR_LABEL,
  connectorPluginAsk,
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

function speakWord(word: string) {
  if (!word || typeof window === 'undefined' || !window.speechSynthesis) return
  const u = new SpeechSynthesisUtterance(word)
  u.lang = 'en-US'
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

async function copyText(label: string, text: string) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast(`已复制${label}`)
  } catch {
    toast('复制失败，请手动选中')
  }
}

export type AiConnectorPanelProps = {
  /** home embed | full connector | play = minimal one-input plugin */
  variant?: 'home' | 'full' | 'play'
  initialQuery?: string
}

export function AiConnectorPanel({ variant = 'home', initialQuery = '' }: AiConnectorPanelProps) {
  const [q, setQ] = useState(initialQuery)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<ConnectorLexResult | null>(null)
  const [favorites, setFavorites] = useState<FavoriteWord[]>(() => loadFavorites())
  const abortRef = useRef<AbortController | null>(null)
  const isPlay = variant === 'play'

  useEffect(() => {
    if (initialQuery.trim()) setQ(initialQuery)
  }, [initialQuery])

  const run = async (raw?: string) => {
    const input = (raw ?? q).trim()
    if (!input) {
      setErr('请输入英文单词、短语或中文意思')
      return
    }
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setBusy(true)
    setErr(null)
    setResult(null)
    try {
      const r = await connectorPluginAsk(input, ac.signal)
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

  const title =
    variant === 'play' ? '玩 · 插件' : variant === 'full' ? '免费 AI 连接器' : '免费 AI 连接器（主入口）'

  return (
    <section
      className={`connector-panel ${variant === 'full' || isPlay ? 'connector-panel--full' : ''} ${isPlay ? 'connector-panel--play' : ''}`}
    >
      <div className="connector-head">
        <div className="connector-title-row">
          <span className="connector-plugin-badge" title="输入 → 连接器 → 免费模型 → 站上功能">
            🔌 插件 · 连接器
          </span>
          <span className="connector-status-chip" aria-live="polite">
            {busy ? '连接中…' : '自动已接入'}
          </span>
        </div>
        <h2>{title}</h2>
        <p className="muted">
          {isPlay
            ? '一个输入框：经连接器自动接免费模型，结果直接显现站上功能（生词／中译／英译／造句／收藏／学习）。'
            : <>像插件一样：输入 → 连接器 → 免费模型 → 显现<strong>生词</strong>、<strong>中文意思</strong>、<strong>英译</strong>、<strong>造句</strong>。链路：{FREE_CONNECTOR_LABEL}（失败静默回退 Pollinations）。</>}
        </p>
      </div>

      <form
        className="connector-form"
        onSubmit={(e) => {
          e.preventDefault()
          void run()
        }}
      >
        <label className="sr-only" htmlFor={`ai-connector-input-${variant}`}>
          连接器输入
        </label>
        <textarea
          id={`ai-connector-input-${variant}`}
          className="connector-input"
          rows={isPlay ? 3 : variant === 'full' ? 3 : 2}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="输入一个：sustainable / 可持续发展 / climate change …"
          disabled={busy}
          autoFocus={isPlay}
        />
        <div className="connector-actions">
          <button className="btn btn-primary" type="submit" disabled={busy || !q.trim()}>
            {busy ? '模型处理中…' : isPlay ? '显现功能' : '一键生成'}
          </button>
          {result ? (
            <button className="btn" type="button" disabled={busy} onClick={() => void run(q)}>
              再生成
            </button>
          ) : null}
          {variant === 'home' ? (
            <NavLink className="btn" to="/play">打开玩页</NavLink>
          ) : variant === 'full' ? (
            <NavLink className="btn" to="/play">极简玩页</NavLink>
          ) : (
            <NavLink className="btn" to="/favorites">我的收藏</NavLink>
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
              <button className="btn" type="button" onClick={() => speakWord(result.word)}>发音</button>
              <button className="btn" type="button" onClick={onToggleFavorite}>
                {favorited ? '★ 已收藏' : '☆ 收藏'}
              </button>
              {result.sentence ? (
                <button className="btn" type="button" onClick={() => void copyText('造句', result.sentence)}>
                  复制造句
                </button>
              ) : null}
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

          <div className="connector-feature-links row" style={{ marginTop: 12 }}>
            <NavLink className="btn btn-primary" to={`/learn?word=${encodeURIComponent(result.word)}`}>
              去学习
            </NavLink>
            <NavLink className="btn" to={`/sentence?q=${encodeURIComponent(result.word)}`}>
              造句练习
            </NavLink>
            <NavLink className="btn" to={`/search?q=${encodeURIComponent(result.word)}`}>
              搜索此词
            </NavLink>
            <NavLink className="btn" to="/favorites">收藏夹</NavLink>
            <NavLink className="btn" to="/quiz">测验</NavLink>
          </div>

          <p className="muted" style={{ marginTop: 8, fontSize: '0.8rem' }}>
            经免费 AI 连接器生成后显现站上功能（非聊天回复）
          </p>
        </div>
      ) : (
        !busy && !err && (
          <p className="muted connector-hint">
            {isPlay
              ? '流程：输入 → 连接器 → 免费模型 → 显现生词／中译／造句等站上功能。今日推荐仍只从站内 DSE 词表选。'
              : '连接器路径不限本地词表条数；今日推荐仍只从站内 DSE 词表选、不编假词。'}
          </p>
        )
      )}
    </section>
  )
}
