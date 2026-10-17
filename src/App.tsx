import { useCallback, useEffect, useMemo, useState } from 'react'
import { HashRouter, NavLink, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { ALL_CATEGORIES, type VocabWord, type WordCategory } from './data/dseWords'
import { chatCompletion } from './lib/api'
import { lookupEnglishWord, type DictEntry } from './lib/dictionary'
import { exportDocx, exportExcel, exportPdf } from './lib/export'
import { addSentence, clearWrong, recordQuiz, recordSeen } from './lib/progressActions'
import { recommendToday, weekStats, weeklySummaryText } from './lib/srs'
import { buildShareUrl, decodeSharePack, shareCodeFromId } from './lib/share'
import {
  demoPack,
  isFavoriteWord,
  loadApiSettings,
  loadFavorites,
  loadProgress,
  removeFavorite,
  saveFavorites,
  saveProgress,
  toggleFavorite,
  type FavoriteWord,
} from './lib/storage'
import type { ApiSettings, AppProgress, WordListPack } from './lib/types'
import './index.css'

const THEME_KEY = 'vocab-share-theme-v1'

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

function useTheme() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) === 'dark' } catch { return false }
  })
  useEffect(() => {
    document.body.classList.toggle('dark', dark)
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light') } catch { /* ignore */ }
  }, [dark])
  return [dark, setDark] as const
}


function usePack(): [WordListPack, (p: WordListPack) => void, boolean] {
  const [pack, setPack] = useState<WordListPack>(() => demoPack())
  const [shared, setShared] = useState(false)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('share')
    const hash = window.location.hash
    let token = q
    if (!token && hash.startsWith('#share=')) token = hash.slice(7).split('&')[0]
    const m = hash.match(/[#&]share=([^&]+)/)
    if (!token && m) token = decodeURIComponent(m[1])
    if (token) {
      const decoded = decodeSharePack(token)
      if (decoded) {
        setPack(decoded)
        setShared(true)
      }
    }
  }, [])

  return [pack, setPack, shared]
}

function Shell({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useTheme()
  return (
    <>
      <header className="site-header">
        <div className="nav-bar">
          <NavLink to="/" end className={() => 'logo'} style={{ textDecoration: 'none' }}>
            <i>V</i>
            <span>VocabShare</span>
          </NavLink>
          <div className="nav-spacer" />
          <button
            type="button"
            className="icon-btn"
            aria-label="切换深色模式"
            onClick={() => setDark((d) => !d)}
            title="切换主题"
          >
            {dark ? '☀️' : '🌙'}
          </button>
          <nav className="nav">
            <NavLink to="/" end>首页</NavLink>
            <NavLink to="/search">搜索</NavLink>
            <NavLink to="/favorites">收藏</NavLink>
            <NavLink to="/learn">学习</NavLink>
            <NavLink to="/quiz">测验</NavLink>
            <NavLink to="/sentence">造句</NavLink>
            <NavLink to="/categories">归类</NavLink>
            <NavLink to="/recommend">今日推荐</NavLink>
            <NavLink to="/wrong">错词本</NavLink>
            <NavLink to="/week">本周分析</NavLink>
            <NavLink to="/export">导出</NavLink>
            <NavLink to="/share">分享</NavLink>
            <NavLink to="/settings">设置</NavLink>
          </nav>
        </div>
      </header>
      <div className="app-shell">
        {children}
        <p className="footer-note">实用优先 · 香港 DSE English 词表 · 进度仅保存在本机浏览器</p>
      </div>
    </>
  )
}

function Home({ pack, shared, progress }: { pack: WordListPack; shared: boolean; progress: AppProgress }) {
  const known = Object.values(progress.byWord).filter((x) => (x.ease ?? 0) >= 3).length
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  return (
    <>
      {shared && <div className="banner">正在查看分享词表（只读词表；你的进度仍保存在本机）</div>}
      <section className="hero">
        <div>
          <h1>{pack.title}</h1>
          <p>面向香港 DSE English 的示范词表与练习。点下方入口开始。</p>
        </div>
        <div className="stats">
          <div className="stat"><b>{pack.words.length}</b><span>词条</span></div>
          <div className="stat"><b>{known}</b><span>较熟悉</span></div>
          <div className="stat"><b>{progress.wrongIds.length}</b><span>错词</span></div>
          <div className="stat"><b>{progress.sentences.length}</b><span>造句</span></div>
        </div>
      </section>
      <div className="card">
        <h3>搜索单词</h3>
        <p className="muted">查网上英文词典释义；也可用中文在本地词表里筛。</p>
        <form
          className="toolbar"
          style={{ marginTop: 10 }}
          onSubmit={(e) => {
            e.preventDefault()
            const t = q.trim()
            navigate(t ? `/search?q=${encodeURIComponent(t)}` : '/search')
          }}
        >
          <div className="search-bar">
            <span aria-hidden>🔍</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="例如 sustainable（网上词典）"
              aria-label="搜索单词"
            />
          </div>
          <button className="btn btn-primary" type="submit">搜索</button>
        </form>
      </div>
      <div className="card">
        <h3>快速入口</h3>
        <div className="row" style={{ marginTop: 8 }}>
          <NavLink className="btn btn-primary" to="/recommend">今日推荐</NavLink>
          <NavLink className="btn" to="/search">单词搜索</NavLink>
          <NavLink className="btn" to="/favorites">我的收藏</NavLink>
          <NavLink className="btn" to="/learn">开始学习</NavLink>
          <NavLink className="btn" to="/quiz">测验</NavLink>
          <NavLink className="btn" to="/sentence">造句练习</NavLink>
          <NavLink className="btn" to="/categories">单词归类</NavLink>
        </div>
      </div>
    </>
  )
}
function Learn({
  words,
  progress,
  setProgress,
}: {
  words: VocabWord[]
  progress: AppProgress
  setProgress: (p: AppProgress) => void
}) {
  const [params] = useSearchParams()
  const wordParam = params.get('word')
  const startIdx = useMemo(() => {
    if (!wordParam) return 0
    const found = words.findIndex((x) => x.id === wordParam || x.word.toLowerCase() === wordParam.toLowerCase())
    return found >= 0 ? found : 0
  }, [wordParam, words])
  const [i, setI] = useState(startIdx)
  const [show, setShow] = useState(false)
  useEffect(() => {
    setI(startIdx)
    setShow(false)
  }, [startIdx])
  const w = words[i % words.length]
  if (!w) return <div className="card">词表为空</div>

  const reveal = () => {
    if (!show) {
      setShow(true)
      const next = recordSeen({ ...progress, byWord: { ...progress.byWord }, wrongIds: [...progress.wrongIds], dayLogs: progress.dayLogs.map((d) => ({ ...d })), sentences: [...progress.sentences] }, w.id)
      setProgress(next)
    } else {
      setShow(false)
    }
  }

  const speak = () => {
    if (!('speechSynthesis' in window)) {
      toast('浏览器不支持发音')
      return
    }
    const u = new SpeechSynthesisUtterance(w.word)
    u.lang = 'en-US'
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  }

  return (
    <div className="card">
      <h2>学习 · {i + 1}/{words.length}</h2>
      <span className="tag">{w.category}</span>
      <div className="flip-wrap">
        <div
          className={`flip-card${show ? ' flipped' : ''}`}
          onClick={reveal}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal() } }}
          aria-label={show ? '查看正面' : '揭晓词义'}
        >
          <div className="flip-face front">
            <div className="word-big">{w.word}</div>
            <p className="muted">{w.pos}</p>
            <p className="flip-hint">点击卡片揭晓词义</p>
          </div>
          <div className="flip-face back">
            <div><b style={{ fontSize: '1.25rem' }}>{w.meaningZh}</b></div>
            <p className="muted" style={{ marginTop: 8 }}>{w.example}</p>
          </div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 12, justifyContent: 'center' }}>
        <button className="btn" type="button" onClick={() => { setShow(false); setI((x) => (x - 1 + words.length) % words.length) }}>上一个</button>
        <button className="btn" type="button" onClick={speak}>🔊 发音</button>
        {!show ? (
          <button className="btn btn-primary" type="button" onClick={reveal}>揭晓</button>
        ) : (
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setShow(false)
              setI((x) => (x + 1) % words.length)
            }}
          >
            下一个
          </button>
        )}
      </div>
    </div>
  )
}
function Quiz({
  words,
  progress,
  setProgress,
}: {
  words: VocabWord[]
  progress: AppProgress
  setProgress: (p: AppProgress) => void
}) {
  const [queue, setQueue] = useState(() => [...words].sort(() => Math.random() - 0.5))
  const [choice, setChoice] = useState<string | null>(null)
  const cur = queue[0]
  const options = useMemo(() => {
    if (!cur) return []
    const others = words.filter((x) => x.id !== cur.id).sort(() => Math.random() - 0.5).slice(0, 3)
    return [...others, cur].sort(() => Math.random() - 0.5)
  }, [cur, words])

  if (!cur) {
    return (
      <div className="card">
        <h2>本轮测验完成</h2>
        <button className="btn btn-primary" type="button" onClick={() => setQueue([...words].sort(() => Math.random() - 0.5))}>再来一轮</button>
      </div>
    )
  }

  return (
    <div className="card">
      <h2>测验 · 剩余 {queue.length}</h2>
      <div className="word-big">{cur.word}</div>
      <p className="muted">选出正确中文意思</p>
      <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        {options.map((o) => {
          const selected = choice === o.id
          const correct = choice && o.id === cur.id
          const wrong = selected && o.id !== cur.id
          return (
            <button
              key={o.id}
              type="button"
              className={`btn quiz-opt${correct ? ' correct' : ''}${wrong ? ' wrong' : ''}`}
              style={{
                borderColor: correct ? 'var(--ok)' : wrong ? 'var(--bad)' : undefined,
              }}
              disabled={!!choice}
              onClick={() => {
                setChoice(o.id)
                const ok = o.id === cur.id
                const next = recordQuiz(
                  { ...progress, byWord: { ...progress.byWord }, wrongIds: [...progress.wrongIds], dayLogs: progress.dayLogs.map((d) => ({ ...d })), sentences: [...progress.sentences] },
                  cur.id,
                  ok,
                )
                setProgress(next)
                setTimeout(() => {
                  setChoice(null)
                  setQueue((q) => q.slice(1))
                }, 650)
              }}
            >
              {o.meaningZh}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Sentence({
  words,
  progress,
  setProgress,
  api,
}: {
  words: VocabWord[]
  progress: AppProgress
  setProgress: (p: AppProgress) => void
  api: ApiSettings
}) {
  const [idx, setIdx] = useState(0)
  const [text, setText] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const w = words[idx % words.length]
  if (!w) return null

  return (
    <div className="card">
      <h2>造句练习（DSE）</h2>
      <p className="muted">用目标词写一句与校园／社会话题相关的英文句子，可请免费 AI 点评（默认已接 Pollinations）。</p>
      <span className="tag">{w.category}</span>
      <div className="word-big">{w.word}</div>
      <p><b>{w.meaningZh}</b> · 参考：{w.example}</p>
      <label>你的句子</label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={`Write one sentence using “${w.word}”…`} />
      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => {
            if (!text.trim()) return
            const next = addSentence(
              { ...progress, byWord: { ...progress.byWord }, wrongIds: [...progress.wrongIds], dayLogs: progress.dayLogs.map((d) => ({ ...d })), sentences: [...progress.sentences] },
              w.id,
              text.trim(),
            )
            setProgress(next)
            setFeedback('已保存到本机。')
            setText('')
            setIdx((i) => i + 1)
          }}
        >
          保存造句
        </button>
        <button
          className="btn"
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!text.trim()) return
            setBusy(true)
            setFeedback('请求模型中…')
            try {
              const reply = await chatCompletion(
                api,
                'vocab',
                `DSE 造句点评。目标词：${w.word}（${w.meaningZh}）。学生句子：${text}\n请指出语法/搭配问题，给1个更好的改写，中文讲解。`,
              )
              setFeedback(reply)
            } catch (e) {
              setFeedback(e instanceof Error ? e.message : String(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          AI 点评
        </button>
        <button className="btn" type="button" onClick={() => { setIdx((i) => i + 1); setText(''); setFeedback('') }}>换词</button>
      </div>
      {feedback && <pre style={{ whiteSpace: 'pre-wrap', marginTop: 12, font: 'inherit' }}>{feedback}</pre>}
      {progress.sentences.length > 0 && (
        <>
          <h3 style={{ marginTop: 16 }}>最近造句</h3>
          <ul>
            {progress.sentences.slice(0, 8).map((s, i) => {
              const ww = words.find((x) => x.id === s.wordId)
              return <li key={i}><b>{ww?.word ?? s.wordId}</b>：{s.text}</li>
            })}
          </ul>
        </>
      )}
    </div>
  )
}

function normalizeQuery(q: string) {
  return q.trim().toLowerCase()
}

function matchWord(w: VocabWord, q: string) {
  if (!q) return false
  const n = normalizeQuery(q)
  return (
    w.word.toLowerCase().includes(n) ||
    w.meaningZh.toLowerCase().includes(n) ||
    (w.theme ? w.theme.toLowerCase().includes(n) : false) ||
    w.category.toLowerCase().includes(n)
  )
}

function SearchWords({ words }: { words: VocabWord[] }) {
  const [params, setParams] = useSearchParams()
  const initial = params.get('q') ?? ''
  const [q, setQ] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [onlineEntries, setOnlineEntries] = useState<DictEntry[] | null>(null)
  const [onlineMsg, setOnlineMsg] = useState<string | null>(null)
  const [lastLookedUp, setLastLookedUp] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [favorites, setFavorites] = useState<FavoriteWord[]>(() => loadFavorites())

  useEffect(() => {
    setQ(params.get('q') ?? '')
  }, [params])

  const localResults = useMemo(() => {
    const n = normalizeQuery(q)
    if (!n) return []
    return words.filter((w) => matchWord(w, n))
  }, [words, q])

  useEffect(() => {
    const term = (params.get('q') ?? '').trim()
    if (!term) {
      setOnlineEntries(null)
      setOnlineMsg(null)
      setLastLookedUp('')
      setModalOpen(false)
      setLoading(false)
      return
    }
    const ac = new AbortController()
    // Open modal + loading immediately so the search feels instant.
    setLoading(true)
    setModalOpen(true)
    setOnlineMsg(null)
    setOnlineEntries(null)
    setLastLookedUp(term)
    ;(async () => {
      const result = await lookupEnglishWord(term, ac.signal)
      if (ac.signal.aborted) return
      if (result.ok) {
        setOnlineEntries(result.entries)
        setOnlineMsg(null)
      } else if (result.reason !== 'aborted') {
        setOnlineEntries(null)
        setOnlineMsg(result.message)
      }
      setLoading(false)
    })()
    return () => {
      ac.abort()
    }
  }, [params])

  const applyQuery = (next: string) => {
    setQ(next)
    const t = next.trim()
    if (t) setParams({ q: t })
    else {
      setParams({})
      setModalOpen(false)
    }
  }

  const closeModal = () => setModalOpen(false)

  const playAudio = (url?: string, word?: string) => {
    if (url) {
      const a = new Audio(url)
      a.play().catch(() => {
        if (word && 'speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance(word)
          u.lang = 'en-US'
          speechSynthesis.cancel()
          speechSynthesis.speak(u)
        }
      })
      return
    }
    if (word && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(word)
      u.lang = 'en-US'
      speechSynthesis.cancel()
      speechSynthesis.speak(u)
    }
  }

  const persistFavorites = (next: FavoriteWord[]) => {
    saveFavorites(next)
    setFavorites(next)
  }

  const entry = onlineEntries?.[0]
  const examples = entry
    ? entry.meanings.filter((m) => m.example).slice(0, 6)
    : []
  const favorited = entry ? isFavoriteWord(favorites, entry.word) : false

  const onToggleFavorite = () => {
    if (!entry) return
    const next = toggleFavorite(favorites, entry)
    const nowOn = isFavoriteWord(next, entry.word)
    persistFavorites(next)
    toast(nowOn ? `已收藏「${entry.word}」` : `已取消收藏「${entry.word}」`)
  }

  return (
    <>
      <div className="card">
        <h2>单词搜索</h2>
        <p className="muted">输入英文单词后搜索，会弹出网上词典的音标、释义与例句；可收藏搜索过的词，本地词表作补充。</p>
        <form
          className="row"
          style={{ marginTop: 8 }}
          onSubmit={(e) => {
            e.preventDefault()
            applyQuery(q)
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="输入英文单词，例如 recycle / sustainable"
            aria-label="搜索单词"
            autoFocus
            style={{ flex: 1, minWidth: 180 }}
          />
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? '查询中…' : '搜索'}
          </button>
          {q ? (
            <button className="btn" type="button" onClick={() => applyQuery('')}>清空</button>
          ) : null}
          <NavLink className="btn" to="/favorites">我的收藏{favorites.length ? ` · ${favorites.length}` : ''}</NavLink>
        </form>
        {lastLookedUp && !modalOpen && !loading ? (
          <p className="muted" style={{ marginTop: 10 }}>
            最近查询：<b>{lastLookedUp}</b>
            {' · '}
            <button className="btn" type="button" onClick={() => setModalOpen(true)}>再看释义</button>
          </p>
        ) : null}
      </div>

      <div className="card">
        <h3>本地词表{normalizeQuery(q) ? ` · ${localResults.length} 个` : ''}</h3>
        {!normalizeQuery(q) ? (
          <p className="muted">共 {words.length} 个示范词条可筛选；支持英文或中文关键词。</p>
        ) : localResults.length === 0 ? (
          <p className="muted">本地词表没有匹配「{q.trim()}」。</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>单词</th>
                <th>词性</th>
                <th>中文</th>
                <th>归类</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {localResults.map((w) => (
                <tr key={w.id}>
                  <td><b>{w.word}</b></td>
                  <td>{w.pos}</td>
                  <td>{w.meaningZh}</td>
                  <td>{w.category}</td>
                  <td>
                    <NavLink className="btn" to={`/learn?word=${encodeURIComponent(w.id)}`}>去学习</NavLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen ? (
        <div
          className="mask show"
          role="dialog"
          aria-modal="true"
          aria-label="网上词典释义"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div className="modal dict-modal">
            <div className="modal-top">
              <h3>网上词典</h3>
              <button className="icon-btn" type="button" aria-label="关闭" onClick={closeModal}>✕</button>
            </div>

            {loading ? (
              <p className="muted">正在查询「{lastLookedUp || q.trim()}」…（约 1 秒）</p>
            ) : entry ? (
              <>
                <div className="dict-head">
                  <div>
                    <span className="dict-word">{entry.word}</span>
                    {entry.phonetic ? <span className="dict-phon">{entry.phonetic}</span> : null}
                  </div>
                  <div className="dict-head-actions">
                    <button
                      className="btn"
                      type="button"
                      onClick={() => playAudio(entry.audio, entry.word)}
                    >
                      发音
                    </button>
                    <button
                      className={`btn fav-btn${favorited ? ' fav-on' : ''}`}
                      type="button"
                      onClick={onToggleFavorite}
                      aria-pressed={favorited}
                    >
                      {favorited ? '★ 已收藏' : '☆ 收藏'}
                    </button>
                  </div>
                </div>

                <h4 className="dict-section">释义</h4>
                <ul className="dict-meanings">
                  {entry.meanings.slice(0, 8).map((m, mi) => (
                    <li key={mi}>
                      {m.partOfSpeech ? <span className="dict-pos">{m.partOfSpeech}</span> : null}
                      <span>{m.definition}</span>
                    </li>
                  ))}
                </ul>

                <h4 className="dict-section">例句</h4>
                {examples.length > 0 ? (
                  <ul className="dict-examples">
                    {examples.map((m, mi) => (
                      <li key={mi}>
                        {m.partOfSpeech ? <span className="dict-pos">{m.partOfSpeech}</span> : null}
                        <span className="dict-ex-line">“{m.example}”</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">该词条暂无例句，可参考上方释义。</p>
                )}

                <p className="muted" style={{ fontSize: '0.8rem', marginTop: 12 }}>
                  {entry.provider === 'wiktionary' ? (
                    <>
                      来源：
                      <a
                        href={entry.sourceUrls[0] ?? `https://en.wiktionary.org/wiki/${encodeURIComponent(entry.word)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Wiktionary
                      </a>
                      （快速备用）
                    </>
                  ) : entry.sourceUrls[0] ? (
                    <>
                      来源：
                      <a href={entry.sourceUrls[0]} target="_blank" rel="noreferrer">
                        {entry.sourceUrls[0].includes('wiktionary') ? 'Wiktionary' : '词典'}
                      </a>
                      {' · '}Free Dictionary API
                    </>
                  ) : (
                    <>数据来自 Free Dictionary API（无需密钥）</>
                  )}
                </p>
              </>
            ) : (
              <div className="dict-fail">
                <p className="warn" style={{ marginBottom: 0 }}>
                  {onlineMsg ?? (lastLookedUp ? `暂无「${lastLookedUp}」的网上结果。` : '暂无结果。')}
                </p>
                <p className="muted" style={{ marginTop: 10 }}>
                  可检查拼写后重试，或查看页面下方的本地词表匹配。
                </p>
              </div>
            )}

            <div className="modal-actions">
              {entry ? (
                <button
                  className={`btn fav-btn${favorited ? ' fav-on' : ''}`}
                  type="button"
                  onClick={onToggleFavorite}
                  aria-pressed={favorited}
                >
                  {favorited ? '★ 已收藏' : '☆ 收藏'}
                </button>
              ) : null}
              <button className="btn btn-primary" type="button" onClick={closeModal}>知道了</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteWord[]>(() => loadFavorites())
  const [detail, setDetail] = useState<FavoriteWord | null>(null)

  const persist = (next: FavoriteWord[]) => {
    saveFavorites(next)
    setFavorites(next)
  }

  const unfavorite = (word: string) => {
    const next = removeFavorite(favorites, word)
    persist(next)
    if (detail && detail.word === word.trim().toLowerCase()) setDetail(null)
    toast(`已取消收藏「${word}」`)
  }

  const playAudio = (url?: string, word?: string) => {
    if (url) {
      const a = new Audio(url)
      a.play().catch(() => {
        if (word && 'speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance(word)
          u.lang = 'en-US'
          speechSynthesis.cancel()
          speechSynthesis.speak(u)
        }
      })
      return
    }
    if (word && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(word)
      u.lang = 'en-US'
      speechSynthesis.cancel()
      speechSynthesis.speak(u)
    }
  }

  return (
    <>
      <div className="card">
        <h2>搜索收藏</h2>
        <p className="muted">这里保存你从网上词典搜索并收藏的单词（仅本机浏览器）。</p>
        <div className="row" style={{ marginTop: 10 }}>
          <NavLink className="btn btn-primary" to="/search">去搜索单词</NavLink>
          {favorites.length > 0 ? (
            <button
              className="btn"
              type="button"
              onClick={() => {
                if (!confirm(`确定清空全部 ${favorites.length} 个收藏？`)) return
                persist([])
                setDetail(null)
                toast('已清空收藏')
              }}
            >
              清空全部
            </button>
          ) : null}
        </div>
      </div>

      {!favorites.length ? (
        <div className="card">
          <p className="muted">还没有收藏。在「搜索」里查到网上释义后，点「收藏」即可。</p>
        </div>
      ) : (
        <div className="fav-grid">
          {favorites.map((f) => {
            const preview = f.meanings[0]
            const ex = f.meanings.find((m) => m.example)?.example
            return (
              <article key={f.word} className="card fav-card">
                <div className="dict-head">
                  <div>
                    <span className="dict-word">{f.displayWord}</span>
                    {f.phonetic ? <span className="dict-phon">{f.phonetic}</span> : null}
                  </div>
                  <button className="btn" type="button" onClick={() => playAudio(f.audio, f.displayWord)}>发音</button>
                </div>
                {preview ? (
                  <p style={{ marginTop: 6 }}>
                    {preview.partOfSpeech ? <span className="dict-pos">{preview.partOfSpeech}</span> : null}
                    {preview.definition}
                  </p>
                ) : null}
                {ex ? <p className="dict-ex-line" style={{ marginTop: 8 }}>“{ex}”</p> : null}
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn" type="button" onClick={() => setDetail(f)}>查看</button>
                  <NavLink className="btn" to={`/search?q=${encodeURIComponent(f.displayWord)}`}>再搜一次</NavLink>
                  <button className="btn fav-btn fav-on" type="button" onClick={() => unfavorite(f.displayWord)}>
                    ★ 取消收藏
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {detail ? (
        <div
          className="mask show"
          role="dialog"
          aria-modal="true"
          aria-label="收藏详情"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetail(null)
          }}
        >
          <div className="modal dict-modal">
            <div className="modal-top">
              <h3>收藏 · {detail.displayWord}</h3>
              <button className="icon-btn" type="button" aria-label="关闭" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="dict-head">
              <div>
                <span className="dict-word">{detail.displayWord}</span>
                {detail.phonetic ? <span className="dict-phon">{detail.phonetic}</span> : null}
              </div>
              <button className="btn" type="button" onClick={() => playAudio(detail.audio, detail.displayWord)}>发音</button>
            </div>
            <h4 className="dict-section">释义</h4>
            <ul className="dict-meanings">
              {detail.meanings.slice(0, 8).map((m, mi) => (
                <li key={mi}>
                  {m.partOfSpeech ? <span className="dict-pos">{m.partOfSpeech}</span> : null}
                  <span>{m.definition}</span>
                </li>
              ))}
            </ul>
            <h4 className="dict-section">例句</h4>
            {detail.meanings.some((m) => m.example) ? (
              <ul className="dict-examples">
                {detail.meanings.filter((m) => m.example).slice(0, 6).map((m, mi) => (
                  <li key={mi}>
                    {m.partOfSpeech ? <span className="dict-pos">{m.partOfSpeech}</span> : null}
                    <span className="dict-ex-line">“{m.example}”</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">该词条暂无例句。</p>
            )}
            <div className="modal-actions">
              <button
                className="btn fav-btn fav-on"
                type="button"
                onClick={() => unfavorite(detail.displayWord)}
              >
                ★ 取消收藏
              </button>
              <button className="btn btn-primary" type="button" onClick={() => setDetail(null)}>关闭</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function Categories({ words }: { words: VocabWord[] }) {
  const [cat, setCat] = useState<WordCategory | '全部'>('全部')
  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of ALL_CATEGORIES) m[c] = 0
    for (const w of words) m[w.category] = (m[w.category] ?? 0) + 1
    return m
  }, [words])
  const filtered = cat === '全部' ? words : words.filter((w) => w.category === cat)

  return (
    <>
      <div className="card">
        <h2>单词归类</h2>
        <p className="muted">按 DSE 常见主题归类浏览，方便专题复习。</p>
        <div className="cat-grid">
          <button type="button" className={`cat-card ${cat === '全部' ? 'on' : ''}`} onClick={() => setCat('全部')}>
            <b>全部</b><div className="muted">{words.length} 词</div>
          </button>
          {ALL_CATEGORIES.map((c) => (
            <button key={c} type="button" className={`cat-card ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>
              <b>{c}</b><div className="muted">{counts[c] ?? 0} 词</div>
            </button>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>{cat} · {filtered.length} 词</h3>
        <table className="table">
          <thead><tr><th>单词</th><th>词性</th><th>中文</th><th>主题</th></tr></thead>
          <tbody>
            {filtered.map((w) => (
              <tr key={w.id}>
                <td><b>{w.word}</b></td>
                <td>{w.pos}</td>
                <td>{w.meaningZh}</td>
                <td>{w.theme ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Recommend({
  words,
  progress,
  api,
}: {
  words: VocabWord[]
  progress: AppProgress
  api: ApiSettings
}) {
  const list = useMemo(() => recommendToday(words, progress, 12), [words, progress])
  const [explain, setExplain] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="card">
      <h2>今日推荐</h2>
      <p className="muted">按生疏度、错词、间隔复习规则排序（可再请模型解释）。</p>
      <table className="table">
        <thead><tr><th>#</th><th>单词</th><th>意思</th><th>为何推荐</th></tr></thead>
        <tbody>
          {list.map((item, i) => (
            <tr key={item.word.id}>
              <td>{i + 1}</td>
              <td><b>{item.word.word}</b></td>
              <td>{item.word.meaningZh}</td>
              <td>{item.reasons.join('；')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 10 }}>
        <NavLink className="btn btn-primary" to="/learn">去学习</NavLink>
        <button
          className="btn"
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              const payload = list.map((x) => `${x.word.word}: ${x.reasons.join(',')}`).join('\n')
              const reply = await chatCompletion(api, 'analysis', `根据今日推荐列表，用中文给学习计划（今日重点与复习顺序）：\n${payload}`)
              setExplain(reply)
            } catch (e) {
              setExplain(e instanceof Error ? e.message : String(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          AI 解释为何这样排
        </button>
      </div>
      {explain && <pre style={{ whiteSpace: 'pre-wrap', marginTop: 12, font: 'inherit' }}>{explain}</pre>}
    </div>
  )
}

function WrongBook({
  words,
  progress,
  setProgress,
}: {
  words: VocabWord[]
  progress: AppProgress
  setProgress: (p: AppProgress) => void
}) {
  const list = words.filter((w) => progress.wrongIds.includes(w.id))
  return (
    <div className="card">
      <h2>错词本 · {list.length}</h2>
      {list.length === 0 ? <p className="muted">暂无错词，去测验练练。</p> : (
        <table className="table">
          <thead><tr><th>单词</th><th>意思</th><th>类别</th><th></th></tr></thead>
          <tbody>
            {list.map((w) => (
              <tr key={w.id}>
                <td><b>{w.word}</b></td>
                <td>{w.meaningZh}</td>
                <td>{w.category}</td>
                <td>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      const next = clearWrong(
                        { ...progress, byWord: { ...progress.byWord }, wrongIds: [...progress.wrongIds], dayLogs: progress.dayLogs.map((d) => ({ ...d })), sentences: [...progress.sentences] },
                        w.id,
                      )
                      setProgress(next)
                    }}
                  >
                    移出
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Week({
  words,
  progress,
  api,
}: {
  words: VocabWord[]
  progress: AppProgress
  api: ApiSettings
}) {
  const stats = useMemo(() => weekStats(progress), [progress])
  const summary = weeklySummaryText(stats, words.length)
  const [extra, setExtra] = useState('')
  const [busy, setBusy] = useState(false)
  const weakWords = stats.weak.map((id) => words.find((w) => w.id === id)?.word).filter(Boolean)

  return (
    <div className="card">
      <h2>本周学习进度</h2>
      <div className="grid2">
        <div className="stat"><b>{stats.studied}</b>学习次数</div>
        <div className="stat"><b>{stats.correct}</b>答对</div>
        <div className="stat"><b>{stats.wrong}</b>答错</div>
        <div className="stat"><b>{stats.known}</b>较熟悉词</div>
      </div>
      <h3 style={{ marginTop: 14 }}>近 7 天</h3>
      <table className="table">
        <thead><tr><th>日期</th><th>学习</th><th>对</th><th>错</th></tr></thead>
        <tbody>
          {stats.logs.map((l) => (
            <tr key={l.date}><td>{l.date}</td><td>{l.studied}</td><td className="ok">{l.correct}</td><td className="bad">{l.wrong}</td></tr>
          ))}
        </tbody>
      </table>
      <h3>规则分析</h3>
      <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit' }}>{summary}</pre>
      {weakWords.length > 0 && <p className="muted">薄弱词：{weakWords.join('、')}</p>}
      <button
        className="btn"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            const reply = await chatCompletion(
              api,
              'analysis',
              `DSE 背单词周报。数据：${JSON.stringify(stats)}\n规则摘要：${summary}\n请给下周可执行计划（中文分点）。`,
            )
            setExtra(reply)
          } catch (e) {
            setExtra(e instanceof Error ? e.message : String(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        AI 加深分析
      </button>
      {extra && <pre style={{ whiteSpace: 'pre-wrap', marginTop: 12, font: 'inherit' }}>{extra}</pre>}
    </div>
  )
}

function ExportPage({ words, progress, title }: { words: VocabWord[]; progress: AppProgress; title: string }) {
  return (
    <div className="card">
      <h2>导出</h2>
      <p className="muted">进度 / 错词 / 词表可导出。PDF 默认字体对中文支持有限，完整中文请用 Excel 或 Word。</p>
      <div className="row">
        <button className="btn btn-primary" type="button" onClick={() => exportExcel(words, progress, 'dse-vocab.xlsx')}>Excel (.xlsx)</button>
        <button className="btn" type="button" onClick={() => exportDocx(words, progress, title, 'dse-vocab.docx')}>Word (.docx)</button>
        <button className="btn" type="button" onClick={() => exportPdf(words, progress, title, 'dse-vocab.pdf')}>PDF</button>
      </div>
    </div>
  )
}

function SharePage({ pack }: { pack: WordListPack }) {
  const [url, setUrl] = useState('')
  const code = shareCodeFromId(pack.id)
  useEffect(() => {
    try {
      const u = buildShareUrl(pack)
      // Prefer query param for HashRouter compatibility
      const token = u.split('#share=')[1] || ''
      const shareUrl = `${location.origin}${location.pathname}?share=${token}`
      setUrl(shareUrl)
    } catch {
      setUrl('')
    }
  }, [pack])

  return (
    <div className="card">
      <h2>分享词表</h2>
      <p className="muted">生成公开链接，别人打开即可学习同一词表（进度各自保存在自己浏览器）。</p>
      <p>分享码：<b>{code}</b>（示意；完整内容在链接内）</p>
      <label>分享链接</label>
      <textarea readOnly value={url} />
      <div className="row" style={{ marginTop: 8 }}>
        <button
          className="btn btn-primary"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url)
              toast('已复制链接')
            } catch {
              toast('请手动复制链接')
            }
          }}
        >
          复制链接
        </button>
      </div>
    </div>
  )
}

function Settings() {
  const [dark, setDark] = useTheme()
  return (
    <div className="card">
      <h2>设置</h2>
      <p className="muted">学习进度保存在本机浏览器，无需登录。</p>
      <div className="row" style={{ marginTop: 12, marginBottom: 12 }}>
        <button type="button" className="btn" onClick={() => setDark((d) => !d)}>
          {dark ? '切换为浅色模式 ☀️' : '切换为深色模式 🌙'}
        </button>
      </div>
      <p style={{ marginTop: 8 }}>
        <b>当前：免费 Pollinations</b>
        <span className="muted">（gpt-oss-20b · 无需密钥）</span>
      </p>
      <p className="muted" style={{ marginTop: 6 }}>
        默认已接免费模型 Pollinations；小模型训好后再换。匿名约每 30 秒可请求 1 次，遇限流稍候再试。
      </p>
      <p className="muted">现有学习／测验／造句／归类／搜索／收藏／导出／分享流程不受影响。</p>
    </div>
  )
}

function AppInner() {
  const [pack, , shared] = usePack()
  const [progress, setProgress] = useState<AppProgress>(() => loadProgress())
  const [api] = useState<ApiSettings>(() => loadApiSettings())

  const persist = useCallback((p: AppProgress) => {
    saveProgress(p)
    setProgress(p)
  }, [])

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Home pack={pack} shared={shared} progress={progress} />} />
        <Route path="/search" element={<SearchWords words={pack.words} />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/learn" element={<Learn words={pack.words} progress={progress} setProgress={persist} />} />
        <Route path="/quiz" element={<Quiz words={pack.words} progress={progress} setProgress={persist} />} />
        <Route path="/sentence" element={<Sentence words={pack.words} progress={progress} setProgress={persist} api={api} />} />
        <Route path="/categories" element={<Categories words={pack.words} />} />
        <Route path="/recommend" element={<Recommend words={pack.words} progress={progress} api={api} />} />
        <Route path="/wrong" element={<WrongBook words={pack.words} progress={progress} setProgress={persist} />} />
        <Route path="/week" element={<Week words={pack.words} progress={progress} api={api} />} />
        <Route path="/export" element={<ExportPage words={pack.words} progress={progress} title={pack.title} />} />
        <Route path="/share" element={<SharePage pack={pack} />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Shell>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppInner />
    </HashRouter>
  )
}
