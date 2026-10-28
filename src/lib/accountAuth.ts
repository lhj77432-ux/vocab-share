/**
 * Email + password account auth for vocab-share.
 * Hashes live only on the private Worker — never in this public Pages repo.
 * Forgot-password: site submits a request; an admin emails the registered address
 * (agent @3 → @2 via lhj77432@gmail.com). The end user does not email themselves.
 */

export const AUTH_API_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { VITE_AUTH_API_URL?: string } }).env?.VITE_AUTH_API_URL) ||
  'https://vocab-share-auth.nonchalant-authorization.workers.dev'

const SESSION_KEY = 'vocab-share-account-session-v1'

export type AccountSession = {
  token: string
  email: string
  exp: number
}

export type AccountData = {
  progress: {
    byWord: Record<string, unknown>
    wrongIds: string[]
    dayLogs: unknown[]
    sentences: unknown[]
  }
  favorites: unknown[]
  seenRecommended: string[]
}

type AuthOk = AccountSession & { data?: AccountData }

const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* ignore */
    }
  })
}

export function onAccountChange(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function loadRaw(): AccountSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as AccountSession
    if (!s?.token || !s?.email || !s?.exp) return null
    if (Date.now() > s.exp) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return s
  } catch {
    return null
  }
}

function saveRaw(s: AccountSession | null) {
  if (!s) localStorage.removeItem(SESSION_KEY)
  else localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  notify()
}

export function getSession(): AccountSession | null {
  return loadRaw()
}

export function getAccountUserId(): string | null {
  return loadRaw()?.email ?? null
}

export function isLoggedIn(): boolean {
  return !!getAccountUserId()
}

async function api<
  T
>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = opts.token ?? loadRaw()?.token
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${AUTH_API_URL.replace(/\/$/, '')}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `请求失败 (${res.status})`)
  }
  return data as T
}

export async function register(email: string, password: string): Promise<AuthOk> {
  const data = await api<AuthOk>('/auth/register', {
    method: 'POST',
    body: { email, password },
  })
  saveRaw({ token: data.token, email: data.email, exp: data.exp })
  return data
}

export async function login(email: string, password: string): Promise<AuthOk> {
  const data = await api<AuthOk>('/auth/login', {
    method: 'POST',
    body: { email, password },
  })
  saveRaw({ token: data.token, email: data.email, exp: data.exp })
  return data
}

export async function logout(): Promise<void> {
  try {
    await api('/auth/logout', { method: 'POST' })
  } catch {
    /* ignore */
  }
  saveRaw(null)
}

/** Submit forgot-password request. Admin will email the registered address. */
export async function requestPasswordReset(email: string): Promise<string> {
  const data = await api<{ ok?: boolean; message?: string }>('/auth/forgot', {
    method: 'POST',
    body: { email },
  })
  return (
    data.message ||
    '已提交申请。管理员将向该邮箱发送重置说明，请留意收件箱（含垃圾邮件）。本站不会自动发信。'
  )
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  })
}

export async function fetchAccountData(): Promise<AccountData | null> {
  if (!loadRaw()) return null
  const data = await api<{ data: AccountData }>('/auth/data')
  return data.data
}

export async function pushAccountData(data: AccountData): Promise<void> {
  if (!loadRaw()) return
  await api('/auth/data', { method: 'PUT', body: { data } })
}
