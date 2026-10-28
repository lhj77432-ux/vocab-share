import { useEffect, useState } from 'react'
import {
  changePassword,
  getAccountUserId,
  getSession,
  login,
  logout,
  onAccountChange,
  register,
  requestPasswordReset,
} from '../lib/accountAuth'

type Mode = 'login' | 'register' | 'forgot'

export function AccountPage({ onAuthChange }: { onAuthChange?: () => void }) {
  const [email, setEmail] = useState(() => getSession()?.email ?? '')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [mode, setMode] = useState<Mode>('login')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [userId, setUserId] = useState<string | null>(() => getAccountUserId())

  useEffect(() => onAccountChange(() => {
    setUserId(getAccountUserId())
    onAuthChange?.()
  }), [onAuthChange])

  const clearFlash = () => {
    setErr('')
    setMsg('')
  }

  const doLogin = async () => {
    clearFlash()
    setBusy(true)
    try {
      await login(email.trim(), password)
      setPassword('')
      setMsg('登录成功')
      onAuthChange?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const doRegister = async () => {
    clearFlash()
    if (password !== password2) {
      setErr('两次输入的密码不一致')
      return
    }
    setBusy(true)
    try {
      await register(email.trim(), password)
      setPassword('')
      setPassword2('')
      setMsg('注册成功，已登录')
      onAuthChange?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const doForgot = async () => {
    clearFlash()
    setBusy(true)
    try {
      const message = await requestPasswordReset(email.trim())
      setMsg(message)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const doLogout = async () => {
    clearFlash()
    setBusy(true)
    try {
      await logout()
      setMsg('已退出登录')
      onAuthChange?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const doChangePw = async () => {
    clearFlash()
    setBusy(true)
    try {
      await changePassword(currentPw, newPw)
      setCurrentPw('')
      setNewPw('')
      setMsg('密码已更新')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (userId) {
    return (
      <div className="card">
        <h2>账号</h2>
        <p className="muted">已登录邮箱账号。学习进度、收藏与已推荐记录按账号隔离。</p>
        <p>
          当前账号：<b>{userId}</b>
        </p>
        <div className="row" style={{ marginTop: 8, marginBottom: 16 }}>
          <button className="btn" type="button" disabled={busy} onClick={() => void doLogout()}>
            退出登录
          </button>
        </div>
        <h3>修改密码</h3>
        <label>当前密码</label>
        <input type="password" autoComplete="current-password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
        <label>新密码（至少 8 位）</label>
        <input type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn btn-primary" type="button" disabled={busy || newPw.length < 8} onClick={() => void doChangePw()}>
            更新密码
          </button>
        </div>
        {err ? <p className="warn">{err}</p> : null}
        {msg ? <p className="muted">{msg}</p> : null}
      </div>
    )
  }

  return (
    <div className="card">
      <h2>账号 · 邮箱登录</h2>
      <p className="muted">
        使用邮箱 + 密码注册／登录。「翻转学习卡」与「连续词义测验」需登录后使用；进度与已推荐记录按账号保存。
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`btn${mode === 'login' ? ' btn-primary' : ''}`} type="button" onClick={() => { setMode('login'); clearFlash() }}>登录</button>
        <button className={`btn${mode === 'register' ? ' btn-primary' : ''}`} type="button" onClick={() => { setMode('register'); clearFlash() }}>注册</button>
        <button className={`btn${mode === 'forgot' ? ' btn-primary' : ''}`} type="button" onClick={() => { setMode('forgot'); clearFlash() }}>忘记密码</button>
      </div>

      <label>邮箱</label>
      <input
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />

      {mode !== 'forgot' ? (
        <>
          <label>密码（至少 8 位）</label>
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </>
      ) : null}

      {mode === 'register' ? (
        <>
          <label>确认密码</label>
          <input
            type="password"
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
          />
        </>
      ) : null}

      {mode === 'forgot' ? (
        <p className="muted" style={{ marginTop: 8 }}>
          提交后，管理员会向<strong>该注册邮箱</strong>发送重置说明。本站不会自动发信，也请不要自己给自己发邮件。
        </p>
      ) : null}

      <div className="row" style={{ marginTop: 12 }}>
        {mode === 'login' ? (
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void doLogin()}>
            {busy ? '登录中…' : '登录'}
          </button>
        ) : null}
        {mode === 'register' ? (
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void doRegister()}>
            {busy ? '注册中…' : '注册并登录'}
          </button>
        ) : null}
        {mode === 'forgot' ? (
          <button className="btn btn-primary" type="button" disabled={busy || !email.trim()} onClick={() => void doForgot()}>
            {busy ? '提交中…' : '提交重置申请'}
          </button>
        ) : null}
      </div>

      {err ? <p className="warn">{err}</p> : null}
      {msg ? <p className="muted">{msg}</p> : null}
    </div>
  )
}

/** Compact gate card linking to /account — used on Learn / Quiz. */
export function AccountGateCard({
  title,
  busy,
  onGoAccount,
}: {
  title: string
  busy?: boolean
  onGoAccount: () => void
}) {
  return (
    <div className="card" style={{ marginTop: 12, background: 'var(--bg)' }}>
      <p style={{ marginTop: 0 }}>
        <b>{title}</b>
      </p>
      <p className="muted">
        请先用邮箱账号登录。登录后学习／测验记录按账号隔离。其它功能仍可不登录使用。
      </p>
      <button className="btn btn-primary" type="button" disabled={busy} onClick={onGoAccount}>
        前往账号登录／注册
      </button>
    </div>
  )
}
