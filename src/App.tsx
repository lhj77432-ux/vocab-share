import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import { ALL_CATEGORIES, type VocabWord, type WordCategory } from './data/dseWords'
import { mergeCategoryBrowseWords, wordExams } from './data/examLevels'
import {
  TREE_ROOTS,
  level2Nodes,
  collectThemes,
  wordsAtPath,
  breadcrumbLabels,
  themeLabel,
  type BrowsePath,
  type TreeRootId,
} from './data/categoryTree'
import { chatCompletion } from './lib/api'
import { generateAiSentence } from './lib/aiSentence'
import {
  freeAiCategorize,
  freeAiEnrichWord,
  freeAiClozeForWord,
  getFreeAiSettings,
} from './lib/freeAi'
import { SensePracticeCard, ClozeBlock, AbcdChoices } from './components/SensePractice'
import {
  buildQuizSession,
  nextFreshQuizQuestion,
  DEFAULT_QUIZ_LENGTH,
  type QuizQuestion,
} from './lib/quizSession'
import { lookupWord, type DictEntry } from './lib/dictionary'
import { exportDocx, exportExcel, exportPdf } from './lib/export'
import { addSentence, clearWrong, recordQuiz, recordSeen } from './lib/progressActions'
import { weekStats, weeklySummaryText } from './lib/srs'
import {
  DEFAULT_DAILY_COUNT,
  clearSeenRecommended,
  clearDailyRecommendCache,
  fetchDailyAiRecommend,
  loadDailyCountInput,
  loadSeenRecommended,
  parseDailyCountInput,
  saveDailyCountInput,
  type DailyRecommendResult,
  type RecommendItem,
} from './lib/aiRecommend'
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

const NAV_GROUPS = [
  {
    label: '学习',
    links: [
      { to: '/', label: '首页总览', end: true },
      { to: '/search', label: '查单词' },
      { to: '/recommend', label: '今日新词' },
      { to: '/learn', label: '翻转学习卡' },
      { to: '/quiz', label: '连续词义测验' },
      { to: '/sentence', label: '造句与点评' },
    ],
  },
  {
    label: '我的词库',
    links: [
      { to: '/favorites', label: '我的收藏' },
      { to: '/categories', label: '主题归类' },
      { to: '/wrong', label: '错词本' },
    ],
  },
  {
    label: '记录与工具',
    links: [
      { to: '/week', label: '本周学习分析' },
      { to: '/export', label: '导出词表' },
      { to: '/share', label: '分享当前词表' },
      { to: '/settings', label: '设置与数据说明' },
    ],
  },
]

const ROUTE_META: Record<string, { title: string; description: string }> = {
  '/': { title: '学习总览', description: '查看词表规模、学习记录，并前往需要的功能。' },
  '/search': { title: '查单词', description: '搜索英文或中文，获取双语释义、例句并收藏。' },
  '/favorites': { title: '我的收藏', description: '查看你在搜索页保存的单词与双语释义。' },
  '/learn': { title: '翻转学习卡', description: '先看英文，再揭晓中文词义与记忆提示。' },
  '/quiz': { title: '连续词义测验', description: '结合例句挖空选择中文释义，作答后自动进入下一题。' },
  '/sentence': { title: '造句与点评', description: '围绕目标词写英文句子，可生成、保存或请求点评。' },
  '/categories': { title: '主题归类', description: '三层分类浏览：大分类 → 小分类 → 再一层；也可智能归类。' },
  '/recommend': { title: '今日新词', description: '设定每日新词数量，完成挖空与词义练习。' },
  '/wrong': { title: '错词本', description: '集中查看测验中答错的词，掌握后可手动移出。' },
  '/week': { title: '本周学习分析', description: '查看近七天的学习次数、答题表现与薄弱词。' },
  '/export': { title: '导出词表', description: '勾选词条，导出为 PDF、Excel 或 Word 文件。' },
  '/share': { title: '分享当前词表', description: '生成包含完整词表的公开链接并复制给他人。' },
  '/settings': { title: '设置与数据说明', description: '切换外观，了解生成服务与本机数据存储方式。' },
}

const ROUTE_ORDER = Object.keys(ROUTE_META)

function Shell({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const meta = ROUTE_META[location.pathname] ?? ROUTE_META['/']
  const chapter = Math.max(0, ROUTE_ORDER.indexOf(location.pathname))
  const previousChapter = useRef(chapter)
  const direction = chapter >= previousChapter.current ? 'forward' : 'backward'
  const chapterNumber = String(chapter + 1).padStart(2, '0')
  useEffect(() => setMenuOpen(false), [location.pathname])
  useEffect(() => {
    previousChapter.current = chapter
  }, [chapter])
  return (
    <div className="workspace">
      <div
        className={`route-transition is-${direction}`}
        key={`transition-${location.pathname}`}
        aria-hidden="true"
      >
        <div className="transition-wash" />
        <div className="transition-panels">
          {[0, 1, 2, 3, 4].map((panel) => (
            <i
              className="transition-panel"
              key={panel}
              style={{ '--order': direction === 'forward' ? panel : 4 - panel } as React.CSSProperties}
            />
          ))}
        </div>
        <div className="transition-grid" />
        <div className="transition-copy">
          <div className="transition-kicker"><span>VOCABSHARE / CHAPTER {chapterNumber}</span><span>{chapterNumber} — 13</span></div>
          <div className="transition-title" data-text={meta.title}><span>{meta.title}</span></div>
          <div className="transition-caption"><span>{meta.description}</span><i /></div>
        </div>
        <div className="transition-counter">{chapterNumber}</div>
        <div className="transition-edge">DSE VOCABULARY WORKSPACE · NEXT PAGE</div>
      </div>
      {menuOpen ? <button className="sidebar-scrim" type="button" aria-label="关闭功能菜单" onClick={() => setMenuOpen(false)} /> : null}
      <aside className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="功能导航">
        <NavLink to="/" end className="logo">
          <i>V</i>
          <span>VocabShare<small>DSE 词汇工作台</small></span>
        </NavLink>
        <nav className="nav">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.links.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.end} onClick={() => setMenuOpen(false)}>{link.label}</NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-note"><b>本机学习档案</b><span>进度、收藏与设置仅保存在当前浏览器。</span></div>
      </aside>
      <div className="workspace-main">
        <header className="site-header">
          <div className="nav-bar">
            <button className="mobile-menu" type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen}>{menuOpen ? '关闭' : '功能菜单'}</button>
            <div className="topbar-title">
              <span>VocabShare / {meta.title}</span>
              <h1>{meta.title}</h1>
              <p>{meta.description}</p>
            </div>
            <button type="button" className="theme-toggle" aria-label={dark ? '切换为浅色模式' : '切换为深色模式'} onClick={() => setDark((d) => !d)}>
              <span aria-hidden="true">{dark ? '☀' : '◐'}</span>{dark ? '浅色模式' : '深色模式'}
            </button>
          </div>
        </header>
        <main className="app-shell">
          {children}
          <p className="footer-note">VocabShare · 香港 DSE English 核心词表 · 学习数据仅保存在本机浏览器</p>
        </main>
      </div>
    </div>
  )
}

function Home({ pack, shared, progress }: { pack: WordListPack; shared: boolean; progress: AppProgress }) {
  const known = Object.values(progress.byWord).filter((x) => (x.ease ?? 0) >= 3).length
  return (
    <>
      {shared && <div className="banner">正在查看分享词表（只读词表；你的进度仍保存在本机）</div>}
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">DSE VOCABULARY WORKSPACE</span>
          <h2>{pack.title}</h2>
          <p>查词、学习、测验与复习都在同一工作台。学习记录保存在本机；当前词表共 {pack.words.length} 个词条。</p>
          <div className="hero-actions"><NavLink className="btn btn-primary" to="/quiz">开始连续测验</NavLink><NavLink className="btn" to="/recommend">查看今日新词</NavLink></div>
        </div>
        <div className="stats" aria-label="学习数据总览">
          <div className="stat"><b>{pack.words.length}</b><span>词表词条</span></div>
          <div className="stat"><b>{known}</b><span>较熟悉词</span></div>
          <div className="stat"><b>{progress.wrongIds.length}</b><span>待复习错词</span></div>
          <div className="stat"><b>{progress.sentences.length}</b><span>已保存造句</span></div>
        </div>
      </section>

      <section className="quick-section" aria-labelledby="quick-title">
        <div className="section-heading"><div><span className="eyebrow">CHOOSE A TASK</span><h3 id="quick-title">你现在想做什么？</h3></div><p>每个入口对应一项独立功能，学习记录会自动保存。</p></div>
        <div className="quick-grid">
          <NavLink className="quick-link" to="/search"><span>01 / 查词</span><b>查找双语释义</b><p>英文或中文搜索，查看例句并收藏。</p></NavLink>
          <NavLink className="quick-link" to="/recommend"><span>02 / 新词</span><b>生成今日推荐</b><p>按设定数量学习尚未推荐过的新词。</p></NavLink>
          <NavLink className="quick-link" to="/learn"><span>03 / 学习</span><b>使用翻转学习卡</b><p>先回忆词义，再查看答案与记忆提示。</p></NavLink>
          <NavLink className="quick-link" to="/quiz"><span>04 / 测验</span><b>检验词义掌握</b><p>结合例句挖空作答，自动连续出题。</p></NavLink>
          <NavLink className="quick-link" to="/sentence"><span>05 / 输出</span><b>练习英文造句</b><p>生成句子、保存作品或获取点评。</p></NavLink>
          <NavLink className="quick-link" to="/wrong"><span>06 / 复习</span><b>清理错词本</b><p>回顾答错词汇，掌握后手动移出。</p></NavLink>
        </div>
      </section>
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
  const [items, setItems] = useState<{ word: VocabWord; sentence: string; tip?: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [i, setI] = useState(0)
  const [show, setShow] = useState(false)

  const loadAi = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchDailyAiRecommend({
        words,
        progress,
        api: getFreeAiSettings(),
        count: 8,
        forceRefresh: true,
      })
      const enriched: { word: VocabWord; sentence: string; tip?: string }[] = []
      for (const it of res.items.slice(0, 8)) {
        try {
          const e = await freeAiEnrichWord(it.word)
          enriched.push({ word: it.word, sentence: e.sentence || it.sentence || it.word.example, tip: e.tip })
        } catch {
          enriched.push({ word: it.word, sentence: it.sentence || it.word.example })
        }
      }
      if (!enriched.length) throw new Error('暂无推荐，请稍后再试')
      setItems(enriched)
      setI(0)
      setShow(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [words, progress])

  useEffect(() => {
    if (wordParam) {
      const found = words.find((x) => x.id === wordParam || x.word.toLowerCase() === wordParam.toLowerCase())
      if (found) {
        setItems([{ word: found, sentence: found.example }])
        setI(0)
        ;(async () => {
          try {
            const e = await freeAiEnrichWord(found)
            setItems([{ word: found, sentence: e.sentence || found.example, tip: e.tip }])
          } catch { /* keep pack example */ }
        })()
        return
      }
    }
    void loadAi()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordParam, words])

  const cur = items[i]
  if (loading && !cur) {
    return <div className="card"><h2>学习</h2><p className="muted">正在生成今日学习推荐…</p></div>
  }
  if (!cur) {
    return (
      <div className="card">
        <h2>学习</h2>
        {error ? <p className="warn">{error}</p> : <p className="muted">暂无内容</p>}
        <button className="btn btn-primary" type="button" onClick={() => void loadAi()}>生成推荐</button>
      </div>
    )
  }
  const w = cur.word

  const reveal = () => {
    if (!show) {
      setShow(true)
      const next = recordSeen({ ...progress, byWord: { ...progress.byWord }, wrongIds: [...progress.wrongIds], dayLogs: progress.dayLogs.map((d) => ({ ...d })), sentences: [...progress.sentences] }, w.id)
      setProgress(next)
    } else setShow(false)
  }

  const speak = () => {
    if (!('speechSynthesis' in window)) { toast('浏览器不支持发音'); return }
    const u = new SpeechSynthesisUtterance(w.word)
    u.lang = 'en-US'
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  }

  return (
    <div className="card">
      <h2>翻转学习卡 · 第 {i + 1} / {items.length} 词</h2>
      <p className="muted">点击卡片或「揭晓词义」查看中文；翻面后点击「学习下一词」继续。换一批会重新生成推荐。</p>
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="btn" type="button" disabled={loading} onClick={() => void loadAi()}>
          {loading ? '推荐中…' : '换一批推荐'}
        </button>
      </div>
      {error ? <p className="warn">{error}</p> : null}
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
            {cur.tip ? <p className="muted" style={{ marginTop: 8 }}>{cur.tip}</p> : null}
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 12, background: 'var(--bg)' }}>
        <h3 style={{ marginTop: 0 }}>造句</h3>
        <p style={{ marginBottom: 0 }}>{cur.sentence}</p>
      </div>
      <div className="row" style={{ marginTop: 12, justifyContent: 'center' }}>
        <button className="btn" type="button" onClick={() => { setShow(false); setI((x) => (x - 1 + items.length) % items.length) }}>上一词</button>
        <button className="btn" type="button" onClick={speak}>播放发音</button>
        {!show ? (
          <button className="btn btn-primary" type="button" onClick={reveal}>揭晓词义</button>
        ) : (
          <button className="btn btn-primary" type="button" onClick={() => { setShow(false); setI((x) => (x + 1) % items.length) }}>学习下一词</button>
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
  const [queue, setQueue] = useState<QuizQuestion[]>([])
  const [idx, setIdx] = useState(0)
  const [usedIds, setUsedIds] = useState<Set<string>>(() => new Set())
  const [picked, setPicked] = useState<number | null>(null)
  const [score, setScore] = useState({ ok: 0, total: 0 })
  const [err, setErr] = useState('')
  const [enriching, setEnriching] = useState(false)
  const [activeWordId, setActiveWordId] = useState<string | null>(null)

  const startSession = useCallback(() => {
    setErr('')
    setPicked(null)
    setScore({ ok: 0, total: 0 })
    const session = buildQuizSession(words, DEFAULT_QUIZ_LENGTH)
    if (!session.length) {
      setErr('词表不足，无法出题')
      setQueue([])
      setUsedIds(new Set())
      setIdx(0)
      setActiveWordId(null)
      return
    }
    setQueue(session)
    setUsedIds(new Set(session.map((q) => q.word.id)))
    setIdx(0)
    setActiveWordId(session[0].word.id)
  }, [words])

  useEffect(() => {
    startSession()
  }, [startSession])

  const item = queue[idx] ?? null

  useEffect(() => {
    if (!item) return
    const wid = item.word.id
    let cancelled = false
    ;(async () => {
      setEnriching(true)
      try {
        const cloze = await freeAiClozeForWord(item.word, undefined, item.cloze.sentenceEn)
        if (cancelled) return
        setQueue((prev) =>
          prev.map((q) =>
            q.word.id === wid
              ? { ...q, cloze: { sentenceEn: cloze.sentenceEn, parts: cloze.parts } }
              : q,
          ),
        )
      } catch {
        /* keep local cloze */
      } finally {
        if (!cancelled) setEnriching(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeWordId])

  const advance = useCallback(() => {
    setPicked(null)
    setQueue((prev) => {
      const at = idx
      if (at + 1 < prev.length) {
        const nextItem = prev[at + 1]
        setIdx(at + 1)
        setActiveWordId(nextItem.word.id)
        return prev
      }
      const fresh = nextFreshQuizQuestion(words, usedIds)
      if (!fresh) {
        // wrap: rebuild a new session continuously
        const session = buildQuizSession(words, DEFAULT_QUIZ_LENGTH)
        if (!session.length) return prev
        setUsedIds(new Set(session.map((q) => q.word.id)))
        setIdx(0)
        setActiveWordId(session[0].word.id)
        return session
      }
      setUsedIds((u) => {
        const n = new Set(u)
        n.add(fresh.word.id)
        return n
      })
      setIdx(at + 1)
      setActiveWordId(fresh.word.id)
      return [...prev, fresh]
    })
  }, [idx, usedIds, words])

  const cloneProgress = () => ({
    ...progress,
    byWord: { ...progress.byWord },
    wrongIds: [...progress.wrongIds],
    dayLogs: progress.dayLogs.map((d) => ({ ...d })),
    sentences: [...progress.sentences],
  })

  return (
    <div className="card quiz-card">
      <div className="quiz-heading">
        <div><span className="eyebrow">CONTINUOUS QUIZ</span><h2>选择目标词的中文释义</h2><p className="muted">先读英文例句与中译挖空，再选择 A—D。作答后约 1 秒自动进入新题。</p></div>
        <div className="quiz-score"><span>本轮答对 / 已作答</span><b>{score.ok}<small> / {score.total}</small></b></div>
      </div>
      <div className="quiz-status"><span>当前进度：第 {idx + 1} 题</span><span>{enriching ? '正在润色例句挖空…' : picked === null ? '等待你选择答案' : '已记录答案，即将进入下一题'}</span></div>
      {err ? <p className="warn">{err}</p> : null}
      {!item && !err ? <p className="muted">正在出题…</p> : null}
      {item ? (
        <>
          <div className={`quiz-word-stage${picked !== null ? item.choices[picked]?.correct ? ' is-correct' : ' is-wrong' : ''}`}>
            <span className="stage-label">目标单词 / TARGET WORD</span>
            <div className="word-big">{item.word.word}</div>
            <p>{item.word.pos} · {item.word.category}</p>
          </div>
          <div className="quiz-context"><ClozeBlock cloze={item.cloze} /></div>
          <p className="answer-instruction">答案选项：选出「{item.word.word}」最准确的中文意思</p>
          <AbcdChoices
            choices={item.choices}
            picked={picked}
            onPick={(choiceIdx, ok) => {
              if (picked !== null) return
              setPicked(choiceIdx)
              setScore((s) => ({ ok: s.ok + (ok ? 1 : 0), total: s.total + 1 }))
              setProgress(recordQuiz(cloneProgress(), item.word.id, ok))
              window.setTimeout(() => advance(), 850)
            }}
          />
          <div className="quiz-feedback" aria-live="polite">
            {picked !== null ? (
              <p className={item.choices[picked]?.correct ? 'feedback-ok' : 'feedback-bad'}>
                <b>{item.choices[picked]?.correct ? '回答正确' : '回答错误'}</b>
                <span>正确释义：{item.word.meaningZh}</span>
              </p>
            ) : <p className="muted">作答后会在这里显示正误与正确释义。</p>}
          </div>
        </>
      ) : null}
      <div className="row quiz-actions">
        <button className="btn" type="button" onClick={() => advance()} disabled={!item || picked === null}>跳过等待，立即下一题</button>
        <button className="btn" type="button" onClick={() => startSession()}>重置本轮题目与得分</button>
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
  const [params] = useSearchParams()
  const qWord = (params.get('q') ?? '').trim()
  const startIdx = useMemo(() => {
    if (!qWord) return 0
    const found = words.findIndex(
      (x) => x.word.toLowerCase() === qWord.toLowerCase() || x.id === qWord,
    )
    return found >= 0 ? found : 0
  }, [words, qWord])
  const [idx, setIdx] = useState(startIdx)
  const [text, setText] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setIdx(startIdx)
  }, [startIdx])
  const w = words[idx % words.length]
  if (!w) return null

  const cloneProgress = () => ({
    ...progress,
    byWord: { ...progress.byWord },
    wrongIds: [...progress.wrongIds],
    dayLogs: progress.dayLogs.map((d) => ({ ...d })),
    sentences: [...progress.sentences],
  })

  return (
    <div className="card">
      <h2>造句练习（DSE）</h2>
      <p className="muted">
        由本站服务造句／点评。也可自己先写再点评。
      </p>
      <span className="tag">{w.category}</span>
      <div className="word-big">{w.word}</div>
      <p><b>{w.meaningZh}</b> · 参考：{w.example}</p>
      <label>你的句子</label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={`Write one sentence using “${w.word}”…`} />
      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setFeedback('正在生成造句…')
            try {
              const sentence = await generateAiSentence(w, api)
              setText(sentence)
              setFeedback('已填入造句，可直接保存或再改。')
            } catch (e) {
              setFeedback(e instanceof Error ? e.message : String(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? '模型思考中…' : 'AI 造句'}
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => {
            if (!text.trim()) return
            const next = addSentence(cloneProgress(), w.id, text.trim())
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
            setFeedback('请求模型点评中…')
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
      const result = await lookupWord(term, ac.signal)
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
        <p className="muted">由本站服务生成：输入英文／中文 → 一次返回<strong>英译 + 中译 + 例句</strong>。结果可缓存；失败时可回退网上词典。下方可筛本地 DSE 词表。</p>
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
            placeholder="英文或中文，例如 sustainable / 可持续"
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
          <p className="muted">共 {words.length} 个 DSE 词条可筛选；支持英文或中文关键词。</p>
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
          aria-label="单词释义"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div className="modal dict-modal">
            <div className="modal-top">
              <h3>AI 双语释义</h3>
              <button className="icon-btn" type="button" aria-label="关闭" onClick={closeModal}>✕</button>
            </div>

            {loading ? (
              <p className="muted">正在生成「{lastLookedUp || q.trim()}」的中译与英译…（首次约数秒，缓存后几乎瞬时）</p>
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

                {entry.query ? (
                  <p className="muted" style={{ marginTop: 0 }}>查询词：<b>{entry.query}</b></p>
                ) : null}

                <h4 className="dict-section">中译 · 英译</h4>
                <ul className="dict-meanings">
                  {entry.meanings.slice(0, 8).map((m, mi) => (
                    <li key={mi}>
                      {m.partOfSpeech ? <span className="dict-pos">{m.partOfSpeech}</span> : null}
                      <div className="dict-bilingual">
                        <div>
                          <span className="dict-lang-tag">中译</span>
                          <span>{m.definitionZh || (entry.provider === 'llm' ? '—' : '（词典备用暂无中译）')}</span>
                        </div>
                        <div>
                          <span className="dict-lang-tag en">英译</span>
                          <span>{m.definitionEn || m.definition}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <h4 className="dict-section">例句（与释义同次返回）</h4>
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
                  {entry.provider === 'llm' || entry.provider === 'cache' ? (
                    <>来源：本站服务 · 结果已本地缓存</>
                  ) : entry.provider === 'wiktionary' ? (
                    <>
                      来源：
                      <a
                        href={entry.sourceUrls[0] ?? `https://en.wiktionary.org/wiki/${encodeURIComponent(entry.word)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Wiktionary
                      </a>
                      （AI 失败后的英文备用）
                    </>
                  ) : entry.sourceUrls[0] ? (
                    <>
                      来源：
                      <a href={entry.sourceUrls[0]} target="_blank" rel="noreferrer">
                        {entry.sourceUrls[0].includes('wiktionary') ? 'Wiktionary' : '词典'}
                      </a>
                      {' · '}Free Dictionary（AI 失败后的英文备用）
                    </>
                  ) : (
                    <>数据来自网上词典备用</>
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
        <h2>我的收藏</h2>
        <p className="muted">这里保存你从搜索（AI 中英双语释义）收藏的单词（仅本机浏览器）。</p>
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
                    {preview.definitionZh || preview.definitionEn || preview.definition}
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
            <h4 className="dict-section">中译 · 英译</h4>
            <ul className="dict-meanings">
              {detail.meanings.slice(0, 8).map((m, mi) => (
                <li key={mi}>
                  {m.partOfSpeech ? <span className="dict-pos">{m.partOfSpeech}</span> : null}
                  <div className="dict-bilingual">
                    <div>
                      <span className="dict-lang-tag">中译</span>
                      <span>{m.definitionZh || '—'}</span>
                    </div>
                    <div>
                      <span className="dict-lang-tag en">英译</span>
                      <span>{m.definitionEn || m.definition}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <h4 className="dict-section">例句（与释义同次返回）</h4>
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
  const [path, setPath] = useState<BrowsePath>({ root: null, mid: null, leaf: null })
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [aiResult, setAiResult] = useState<{
    category: string
    reason: string
    word?: string
    meaningZh?: string
    sentence?: string
  } | null>(null)
  const [detail, setDetail] = useState<VocabWord | null>(null)
  const [detailExtra, setDetailExtra] = useState<{ sentence: string; tip?: string } | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)

  /** Categories-only: merge exam banks; recommend/learn/quiz keep pack.words. */
  const browseWords = useMemo(() => mergeCategoryBrowseWords(words), [words])

  const crumbs = useMemo(() => breadcrumbLabels(path), [path])
  const depth = path.root ? (path.mid ? (path.leaf ? 3 : 2) : 1) : 0

  const scopedWords = useMemo(() => wordsAtPath(browseWords, path), [browseWords, path])

  const childCards = useMemo(() => {
    if (depth === 0) {
      return TREE_ROOTS.map((r) => ({
        id: r.id,
        label: r.label,
        short: r.short ?? r.label,
        count: browseWords.length,
      }))
    }
    if (depth === 1 && path.root) {
      return level2Nodes(path.root).map((n) => ({
        id: n.id,
        label: n.label,
        short: n.short ?? n.label,
        count: wordsAtPath(browseWords, { root: path.root, mid: n.id, leaf: null }).length,
      })).filter((n) => n.count > 0)
    }
    if (depth === 2 && path.root && path.mid) {
      const midWords = wordsAtPath(browseWords, { root: path.root, mid: path.mid, leaf: null })
      return collectThemes(midWords).map((theme) => ({
        id: theme,
        label: themeLabel(theme),
        short: themeLabel(theme),
        count: wordsAtPath(browseWords, { root: path.root, mid: path.mid, leaf: theme }).length,
      })).filter((n) => n.count > 0)
    }
    return []
  }, [browseWords, path, depth])

  const showWordList = depth === 3 || (depth === 2 && childCards.length === 0)

  const goCrumb = (index: number) => {
    if (index <= 0) {
      setPath({ root: null, mid: null, leaf: null })
      return
    }
    if (index === 1) {
      setPath({ root: path.root, mid: null, leaf: null })
      return
    }
    if (index === 2) {
      setPath({ root: path.root, mid: path.mid, leaf: null })
      return
    }
  }

  const openChild = (id: string) => {
    if (depth === 0) {
      setPath({ root: id as TreeRootId, mid: null, leaf: null })
      return
    }
    if (depth === 1) {
      setPath({ root: path.root, mid: id, leaf: null })
      return
    }
    if (depth === 2) {
      setPath({ root: path.root, mid: path.mid, leaf: id })
    }
  }

  const goBack = () => {
    if (path.leaf) {
      setPath({ root: path.root, mid: path.mid, leaf: null })
    } else if (path.mid) {
      setPath({ root: path.root, mid: null, leaf: null })
    } else if (path.root) {
      setPath({ root: null, mid: null, leaf: null })
    }
  }

  const runCategorize = async () => {
    const input = q.trim()
    if (!input) return
    setBusy(true)
    setAiResult(null)
    try {
      const r = await freeAiCategorize(input, [...ALL_CATEGORIES])
      setAiResult(r)
      if (ALL_CATEGORIES.includes(r.category as WordCategory)) {
        // Jump into 主题领域 → that category (level 2), ready to pick theme
        setPath({ root: 'theme', mid: r.category, leaf: null })
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const openWord = async (w: VocabWord) => {
    setDetail(w)
    setDetailExtra(null)
    setDetailBusy(true)
    try {
      const e = await freeAiEnrichWord(w)
      setDetailExtra({ sentence: e.sentence || w.example, tip: e.tip })
    } catch {
      setDetailExtra({ sentence: w.example })
    } finally {
      setDetailBusy(false)
    }
  }

  const levelHint =
    depth === 0 ? '选择大分类' :
    depth === 1 ? '选择小分类' :
    depth === 2 ? '再选一层小分类' :
    '词表'

  return (
    <>
      <div className="card">
        <h2>单词归类</h2>
        <p className="muted">三层分类浏览：大分类 → 小分类 → 再一层小分类，点进去继续细分。智能归类仍可用。点开词条会再生成释义辅助与造句。</p>
        <form
          className="row"
          style={{ marginTop: 8 }}
          onSubmit={(e) => { e.preventDefault(); void runCategorize() }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="例如：sustainable / 可持续发展"
            style={{ flex: 1, minWidth: 180 }}
            aria-label="归类输入"
          />
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? '归类中…' : '智能归类'}
          </button>
        </form>
        {aiResult ? (
          <div className="card" style={{ marginTop: 12, background: 'var(--bg)' }}>
            <p><b>类别：</b>{aiResult.category}</p>
            {aiResult.word ? <p><b>英文：</b>{aiResult.word}</p> : null}
            {aiResult.meaningZh ? <p><b>中文：</b>{aiResult.meaningZh}</p> : null}
            {aiResult.sentence ? <p><b>例句：</b>{aiResult.sentence}</p> : null}
            {aiResult.reason ? <p className="muted">{aiResult.reason}</p> : null}
          </div>
        ) : null}

        <div className="row" style={{ marginTop: 16, gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {depth > 0 ? (
            <button type="button" className="btn" onClick={goBack}>← 返回上一级</button>
          ) : null}
          <nav aria-label="分类路径" className="muted" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {crumbs.map((c, i) => (
              <span key={`${c.id}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {i > 0 ? <span aria-hidden>›</span> : null}
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '2px 8px', fontSize: '0.9em' }}
                  onClick={() => goCrumb(i)}
                  disabled={i === crumbs.length - 1 && depth === 3}
                >
                  {c.label}
                </button>
              </span>
            ))}
          </nav>
        </div>

        {!showWordList ? (
          <>
            <h3 style={{ marginTop: 16, marginBottom: 8 }}>{levelHint}</h3>
            <div className="cat-grid">
              {childCards.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="cat-card"
                  onClick={() => openChild(n.id)}
                >
                  <b>{n.short}</b>
                  <div className="muted">{n.count} 词</div>
                </button>
              ))}
            </div>
            {depth === 2 ? (
              <p className="muted" style={{ marginTop: 12 }}>
                或直接{' '}
                <button type="button" className="btn" onClick={() => setPath({ ...path, leaf: '__all__' })}>
                  查看本类全部 {scopedWords.length} 词
                </button>
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      {showWordList ? (
        <div className="card">
          <h3>
            {crumbs.map((c) => c.label).join(' · ')} · {scopedWords.length} 词
          </h3>
          <table className="table">
            <thead><tr><th>单词</th><th>词性</th><th>中文</th><th>主题</th><th></th></tr></thead>
            <tbody>
              {scopedWords.map((w) => (
                <tr key={w.id}>
                  <td><b>{w.word}</b></td>
                  <td>{w.pos}</td>
                  <td>{w.meaningZh}</td>
                  <td>{w.theme ?? '—'}</td>
                  <td><button className="btn" type="button" onClick={() => void openWord(w)}>查看词条</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {detail ? (
        <div className="mask show" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setDetail(null) }}>
          <div className="modal dict-modal">
            <div className="modal-top">
              <h3>{detail.word}</h3>
              <button className="icon-btn" type="button" aria-label="关闭" onClick={() => setDetail(null)}>✕</button>
            </div>
            <p><b>{detail.meaningZh}</b> · {detail.pos} · {detail.category} · {wordExams(detail).join(' / ')}</p>
            {detailBusy ? <p className="muted">生成中…</p> : null}
            {detailExtra ? (
              <>
                {detailExtra.tip ? <p className="muted">{detailExtra.tip}</p> : null}
                <h4 className="dict-section">造句</h4>
                <p>{detailExtra.sentence}</p>
              </>
            ) : null}
            <div className="modal-actions">
              <NavLink className="btn" to={`/learn?word=${encodeURIComponent(detail.id)}`} onClick={() => setDetail(null)}>去学习</NavLink>
              <button className="btn btn-primary" type="button" onClick={() => setDetail(null)}>关闭</button>
            </div>
          </div>
        </div>
      ) : null}
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
  const [countInput, setCountInput] = useState(() => loadDailyCountInput())
  const [result, setResult] = useState<DailyRecommendResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [explain, setExplain] = useState('')
  const [planBusy, setPlanBusy] = useState(false)
  const [seenCount, setSeenCount] = useState(() => loadSeenRecommended().size)

  const list: RecommendItem[] = result?.items ?? []

  const runRecommend = useCallback(
    async (forceRefresh: boolean) => {
      const count = parseDailyCountInput(countInput)
      saveDailyCountInput(countInput.trim() === '' ? String(DEFAULT_DAILY_COUNT) : countInput)
      setLoading(true)
      setError('')
      try {
        const res = await fetchDailyAiRecommend({
          words,
          progress,
          api,
          count,
          forceRefresh,
        })
        setResult(res)
        setSeenCount(loadSeenRecommended().size)
        if (res.exhausted && !res.items.length) {
          setError('尚未推荐过的新词已用完。可点「清空已推记录」后重来，或降低每天数量。')
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    },
    [api, countInput, progress, words],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const count = parseDailyCountInput(loadDailyCountInput())
      setLoading(true)
      setError('')
      try {
        const res = await fetchDailyAiRecommend({
          words,
          progress,
          api,
          count,
          forceRefresh: false,
        })
        if (!cancelled) {
          setResult(res)
          setSeenCount(loadSeenRecommended().size)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, api])

  const sourceLabel =
    result?.source === 'ai'
      ? '本站推荐 · 仅 DSE 新词'
      : result?.source === 'local'
        ? '本地推荐（回退）· 仅 DSE 新词'
        : '仅 DSE 新词'

  return (
    <div className="card">
      <h2>今日推荐</h2>
      <p className="muted">
        设定每天背 N 个尚未推荐过的新词。「重新推荐」不会重复已推过的词。每词含例句中译挖空（目标词中文 ____）、ABCD 选义与推荐理由。
      </p>

      <div className="row" style={{ marginTop: 10, marginBottom: 8 }}>
        <label htmlFor="daily-count-input" style={{ margin: 0 }}>
          每天背几个
        </label>
        <input
          id="daily-count-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={countInput}
          onChange={(e) => {
            const v = e.target.value
            if (v === '' || /^\d{1,3}$/.test(v)) {
              setCountInput(v)
              saveDailyCountInput(v)
            }
          }}
          onBlur={() => {
            const clamped = parseDailyCountInput(countInput)
            const next = String(clamped)
            setCountInput(next)
            saveDailyCountInput(next)
          }}
          placeholder="例如 5"
          aria-label="每天背多少个新词"
          style={{ width: 120, flex: '0 0 auto' }}
        />
        <span className="muted">个新词（1–100）</span>
        <button
          className="btn btn-primary"
          type="button"
          disabled={loading}
          onClick={() => runRecommend(false)}
        >
          {loading ? '推荐中…' : '生成今日推荐'}
        </button>
        <button className="btn" type="button" disabled={loading} onClick={() => runRecommend(true)}>
          重新推荐
        </button>
        <button
          className="btn"
          type="button"
          disabled={loading}
          onClick={() => {
            if (!confirm('清空「已推荐过」记录？之后可以重新抽到这些词。')) return
            clearSeenRecommended()
            clearDailyRecommendCache()
            setSeenCount(0)
            setResult(null)
            void runRecommend(true)
          }}
        >
          清空已推记录
        </button>
      </div>

      <p className="muted" style={{ marginBottom: 8 }}>
        {loading && !list.length
          ? '正在挑选尚未学过的 DSE 新词…'
          : result
            ? `${sourceLabel} · ${result.date} · ${list.length}/${result.appliedCount} 词 · 已推记录 ${seenCount} · 剩余约 ${result.remainingUnseen ?? '—'}`
            : sourceLabel}
      </p>
      {error ? <p className="warn">{error}</p> : null}
      {result?.exhausted && list.length > 0 ? (
        <p className="muted">新词池不足 N，已尽量给出尚未推荐过的词。</p>
      ) : null}

      {!list.length && !loading ? (
        <p className="muted">暂无推荐，请输入数量后点「生成今日推荐」。</p>
      ) : (
        list.map((item) => (
          <SensePracticeCard
            key={item.word.id}
            word={item.word}
            pool={words}
            sentence={item.sentence}
            cloze={item.cloze}
            choices={item.choices}
            reasons={item.reasons}
          />
        ))
      )}

      <div className="row" style={{ marginTop: 10 }}>
        <NavLink className="btn btn-primary" to="/learn">
          去学习
        </NavLink>
        <button
          className="btn"
          type="button"
          disabled={planBusy || !list.length}
          onClick={async () => {
            setPlanBusy(true)
            try {
              const payload = list.map((x) => `${x.word.word}: ${x.reasons.join(',')}`).join('\n')
              const reply = await chatCompletion(
                api,
                'analysis',
                `根据今日推荐列表（仅 DSE 范围），用中文给学习计划（今日重点与复习顺序）：\n${payload}`,
              )
              setExplain(reply)
            } catch (e) {
              setExplain(e instanceof Error ? e.message : String(e))
            } finally {
              setPlanBusy(false)
            }
          }}
        >
          AI 学习计划
        </button>
      </div>
      {explain && (
        <pre style={{ whiteSpace: 'pre-wrap', marginTop: 12, font: 'inherit' }}>{explain}</pre>
      )}
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
                    掌握后移出错词本
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
  const [selected, setSelected] = useState<Set<string>>(() => new Set(words.map((w) => w.id)))
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return words
    return words.filter(
      (w) =>
        w.word.toLowerCase().includes(n) ||
        w.meaningZh.toLowerCase().includes(n) ||
        w.pos.toLowerCase().includes(n) ||
        w.example.toLowerCase().includes(n),
    )
  }, [words, q])

  const picked = useMemo(() => words.filter((w) => selected.has(w.id)), [words, selected])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const w of filtered) next.add(w.id)
      return next
    })
  }

  const clearFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const w of filtered) next.delete(w.id)
      return next
    })
  }

  const runExport = async (kind: 'excel' | 'docx' | 'pdf') => {
    if (picked.length === 0) {
      toast('请先选择至少一个单词')
      return
    }
    setBusy(true)
    try {
      if (kind === 'excel') exportExcel(picked, progress, 'dse-vocab.xlsx')
      else if (kind === 'docx') await exportDocx(picked, progress, title, 'dse-vocab.docx')
      else await exportPdf(picked, progress, title, 'dse-vocab.pdf')
      toast(`已导出 ${picked.length} 词`)
    } catch (e) {
      console.error(e)
      toast('导出失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h2>导出 PDF / Excel / Word</h2>
      <p className="muted">
        勾选要导出的单词。每条包含：<b>英文单词</b>、<b>词性</b>、<b>中文意思</b>、<b>造句</b>
        （词表例句 + 你保存过的造句）。PDF 已支持中文显示。
      </p>

      <div className="row" style={{ marginTop: 12, marginBottom: 8 }}>
        <input
          className="export-search"
          placeholder="筛选单词 / 中文 / 词性…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="筛选导出单词"
        />
        <button className="btn" type="button" onClick={() => setSelected(new Set(words.map((w) => w.id)))}>
          全选词表
        </button>
        <button className="btn" type="button" onClick={selectFiltered}>
          全选当前筛选
        </button>
        <button className="btn" type="button" onClick={clearFiltered}>
          取消当前筛选
        </button>
        <button className="btn" type="button" onClick={() => setSelected(new Set())}>
          清空
        </button>
      </div>

      <p className="muted" style={{ marginBottom: 8 }}>
        已选 <b>{picked.length}</b> / {words.length} · 当前列表 {filtered.length}
      </p>

      <div className="export-pick-list" role="list">
        {filtered.map((w) => {
          const userN = progress.sentences.filter((s) => s.wordId === w.id).length
          return (
            <label key={w.id} className={`export-pick-row${selected.has(w.id) ? ' on' : ''}`} role="listitem">
              <input type="checkbox" checked={selected.has(w.id)} onChange={() => toggle(w.id)} />
              <span className="export-pick-main">
                <b>{w.word}</b>
                <span className="muted">{w.pos}</span>
                <span>{w.meaningZh}</span>
              </span>
              <span className="export-pick-ex muted" title={w.example}>
                造句：{w.example}
                {userN > 0 ? ` · +${userN} 条我的造句` : ''}
              </span>
            </label>
          )
        })}
        {filtered.length === 0 ? <p className="muted">无匹配单词</p> : null}
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy || picked.length === 0}
          onClick={() => void runExport('pdf')}
        >
          {busy ? '导出中…' : `导出 PDF（${picked.length}）`}
        </button>
        <button className="btn" type="button" disabled={busy || picked.length === 0} onClick={() => void runExport('excel')}>
          Excel (.xlsx)
        </button>
        <button className="btn" type="button" disabled={busy || picked.length === 0} onClick={() => void runExport('docx')}>
          Word (.docx)
        </button>
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
          {dark ? '切换为浅色模式' : '切换为深色模式'}
        </button>
      </div>
      <p style={{ marginTop: 8 }}>
        <b>生成服务：本站通道</b>
        <span className="muted">（输入 → 生成结果 → 展示）</span>
      </p>
      <p className="muted" style={{ marginTop: 6 }}>
        本站即通道：搜索／学习／今日推荐／归类／测验／造句均由本站服务生成。
        无需登录即可使用。尚未接入本地训练权重。
      </p>
    </div>
  )
}

function AppInner() {
  const [pack, , shared] = usePack()
  const [progress, setProgress] = useState<AppProgress>(() => loadProgress())
  const [api] = useState<ApiSettings>(() => loadApiSettings())
  const location = useLocation()

  const persist = useCallback((p: AppProgress) => {
    saveProgress(p)
    setProgress(p)
  }, [])

  return (
    <Shell>
      <div className="route-frame" key={location.pathname}>
        <Routes location={location}>
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
      </div>
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
