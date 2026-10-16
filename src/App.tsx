import { useCallback, useEffect, useMemo, useState } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { ALL_CATEGORIES, type VocabWord, type WordCategory } from './data/dseWords'
import { chatCompletion } from './lib/api'
import { exportDocx, exportExcel, exportPdf } from './lib/export'
import { addSentence, clearWrong, recordQuiz, recordSeen } from './lib/progressActions'
import { recommendToday, weekStats, weeklySummaryText } from './lib/srs'
import { buildShareUrl, decodeSharePack, shareCodeFromId } from './lib/share'
import {
  demoPack,
  loadApiSettings,
  loadProgress,
  saveApiSettings,
  saveProgress,
} from './lib/storage'
import type { ApiSettings, AppProgress, StudyMode, WordListPack } from './lib/types'
import './index.css'

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
  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">DSE 背单词</div>
        <nav className="nav">
          <NavLink to="/" end>首页</NavLink>
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
      {children}
      <p className="footer-note">实用优先 · 香港 DSE English 词表 · 进度仅保存在本机浏览器</p>
    </div>
  )
}

function Home({ pack, shared, progress }: { pack: WordListPack; shared: boolean; progress: AppProgress }) {
  const known = Object.values(progress.byWord).filter((x) => (x.ease ?? 0) >= 3).length
  return (
    <>
      {shared && <div className="banner">正在查看分享词表（只读词表；你的进度仍保存在本机）</div>}
      <div className="card">
        <h2>{pack.title}</h2>
        <p className="muted">面向香港 DSE English 的示范词表与练习。可接「自建模型 API」做讲解与分析。</p>
        <div className="grid2" style={{ marginTop: 12 }}>
          <div className="stat"><b>{pack.words.length}</b>词条</div>
          <div className="stat"><b>{known}</b>较熟悉</div>
          <div className="stat"><b>{progress.wrongIds.length}</b>错词</div>
          <div className="stat"><b>{progress.sentences.length}</b>造句</div>
        </div>
      </div>
      <div className="card">
        <h3>快速入口</h3>
        <div className="row">
          <NavLink className="btn btn-primary" to="/recommend">今日推荐</NavLink>
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
  const [i, setI] = useState(0)
  const [show, setShow] = useState(false)
  const w = words[i % words.length]
  if (!w) return <div className="card">词表为空</div>
  return (
    <div className="card">
      <h2>学习 · {i + 1}/{words.length}</h2>
      <span className="tag">{w.category}</span>
      <div className="word-big">{w.word}</div>
      <p className="muted">{w.pos}</p>
      <div className="reveal-box">
        {show ? (
          <>
            <div><b>{w.meaningZh}</b></div>
            <p style={{ marginBottom: 0 }}>{w.example}</p>
          </>
        ) : (
          <span className="muted">先回想词义，再点「揭晓」</span>
        )}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        {!show ? (
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setShow(true)
              const next = recordSeen({ ...progress, byWord: { ...progress.byWord }, wrongIds: [...progress.wrongIds], dayLogs: progress.dayLogs.map((d) => ({ ...d })), sentences: [...progress.sentences] }, w.id)
              setProgress(next)
            }}
          >
            揭晓
          </button>
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
        <button className="btn" type="button" onClick={() => { setShow(false); setI((x) => (x - 1 + words.length) % words.length) }}>上一个</button>
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
              className="btn"
              style={{
                justifyContent: 'flex-start',
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
      <p className="muted">用目标词写一句与校园／社会话题相关的英文句子，可请自建模型点评。</p>
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
          自建模型点评
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
          自建模型解释为何这样排
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
        自建模型加深分析
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
              alert('已复制链接')
            } catch {
              alert('请手动复制链接')
            }
          }}
        >
          复制链接
        </button>
      </div>
    </div>
  )
}

function Settings({ api, setApi }: { api: ApiSettings; setApi: (s: ApiSettings) => void }) {
  const [mode, setMode] = useState<StudyMode>('vocab')
  const [msg, setMsg] = useState('用一句话解释 sustainable 在 DSE 写作里怎么用')
  const [out, setOut] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState(api)

  return (
    <div className="card">
      <h2>自建模型 API</h2>
      <div className="warn">此处连接你自己部署／DeepSeek 帮你做的模型服务（OpenAI 兼容 Chat Completions），不是官方 DeepSeek 聊天品牌入口。</div>
      <label>API Base URL（例如 https://xxx/v1）</label>
      <input value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} placeholder="https://your-api.example/v1" />
      <label>API Key（可选）</label>
      <input type="password" value={draft.apiKey} onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} />
      <label>Model 名</label>
      <input value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => {
            saveApiSettings(draft)
            setApi(draft)
            alert('已保存到本机')
          }}
        >
          保存
        </button>
      </div>
      <h3 style={{ marginTop: 16 }}>模式试聊</h3>
      <label>模式</label>
      <select value={mode} onChange={(e) => setMode(e.target.value as StudyMode)}>
        <option value="vocab">背单词助教</option>
        <option value="analysis">分析建议</option>
        <option value="reasoning">逻辑推理</option>
        <option value="search">上网搜索（占位：无网时会明示）</option>
      </select>
      <label>消息</label>
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} />
      <button
        className="btn"
        type="button"
        disabled={busy}
        style={{ marginTop: 8 }}
        onClick={async () => {
          setBusy(true)
          try {
            setOut(await chatCompletion(draft, mode, msg))
          } catch (e) {
            setOut(e instanceof Error ? e.message : String(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        发送
      </button>
      {out && <pre style={{ whiteSpace: 'pre-wrap', marginTop: 12, font: 'inherit' }}>{out}</pre>}
    </div>
  )
}

function AppInner() {
  const [pack, , shared] = usePack()
  const [progress, setProgress] = useState<AppProgress>(() => loadProgress())
  const [api, setApi] = useState<ApiSettings>(() => loadApiSettings())

  const persist = useCallback((p: AppProgress) => {
    saveProgress(p)
    setProgress(p)
  }, [])

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Home pack={pack} shared={shared} progress={progress} />} />
        <Route path="/learn" element={<Learn words={pack.words} progress={progress} setProgress={persist} />} />
        <Route path="/quiz" element={<Quiz words={pack.words} progress={progress} setProgress={persist} />} />
        <Route path="/sentence" element={<Sentence words={pack.words} progress={progress} setProgress={persist} api={api} />} />
        <Route path="/categories" element={<Categories words={pack.words} />} />
        <Route path="/recommend" element={<Recommend words={pack.words} progress={progress} api={api} />} />
        <Route path="/wrong" element={<WrongBook words={pack.words} progress={progress} setProgress={persist} />} />
        <Route path="/week" element={<Week words={pack.words} progress={progress} api={api} />} />
        <Route path="/export" element={<ExportPage words={pack.words} progress={progress} title={pack.title} />} />
        <Route path="/share" element={<SharePage pack={pack} />} />
        <Route path="/settings" element={<Settings api={api} setApi={setApi} />} />
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
