/**
 * Puter auth helpers for 翻转学习卡 only.
 * Global AI paths keep signIn neutered (PUTER_SKIP_AUTH); Learn may call
 * deliberateSignIn() which uses the stashed original puter.auth.signIn.
 */

const ORIGINAL_KEY = '__vocabSharePuterSignInOriginal'

type PuterUserLike = {
  uuid?: string
  id?: string
  username?: string
  email?: string
}

function win(): Window & { [ORIGINAL_KEY]?: () => Promise<unknown>; puter?: PuterGlobal } {
  return window as Window & { [ORIGINAL_KEY]?: () => Promise<unknown>; puter?: PuterGlobal }
}

/** Stash real signIn before neutering (idempotent). */
export function stashPuterSignInOriginal(p?: PuterGlobal) {
  const puter = p ?? (typeof window !== 'undefined' ? window.puter : undefined)
  if (!puter?.auth?.signIn) return
  const w = win()
  if (w[ORIGINAL_KEY]) return
  try {
    const fn = puter.auth.signIn.bind(puter.auth)
    // Only stash if it does not look like our neutered stub
    const sample = Function.prototype.toString.call(puter.auth.signIn)
    if (sample.includes('PUTER_AUTH_DISABLED')) return
    w[ORIGINAL_KEY] = fn
  } catch {
    /* ignore */
  }
}

export function neuterPuterSignIn(p?: PuterGlobal) {
  const puter = p ?? (typeof window !== 'undefined' ? window.puter : undefined)
  if (!puter?.auth) return false
  stashPuterSignInOriginal(puter)
  try {
    puter.auth.signIn = () => Promise.reject(new Error('PUTER_AUTH_DISABLED'))
  } catch {
    /* ignore */
  }
  return true
}

export async function waitForPuterReady(timeoutMs = 12000): Promise<PuterGlobal> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const p =
      (typeof window !== 'undefined' ? window.puter : undefined) ??
      (typeof puter !== 'undefined' ? puter : undefined)
    if (p?.auth) {
      stashPuterSignInOriginal(p)
      return p
    }
    await new Promise((r) => setTimeout(r, 40))
  }
  throw new Error('Puter 未就绪，请刷新页面后重试')
}

export function isPuterSignedInNow(p?: PuterGlobal): boolean {
  try {
    const puter = p ?? (typeof window !== 'undefined' ? window.puter : undefined)
    return typeof puter?.auth?.isSignedIn === 'function' && puter.auth.isSignedIn() === true
  } catch {
    return false
  }
}

function userIdFromPayload(user: unknown): string | null {
  if (!user || typeof user !== 'object') return null
  const u = user as PuterUserLike
  const id = (u.uuid || u.id || u.username || u.email || '').trim()
  return id || null
}

/** Stable account key for localStorage namespacing; null if signed out. */
export async function getPuterUserId(): Promise<string | null> {
  try {
    const p = await waitForPuterReady()
    if (!isPuterSignedInNow(p)) return null
    if (typeof p.auth?.getUser === 'function') {
      const user = await p.auth.getUser()
      const id = userIdFromPayload(user)
      if (id) return id
    }
    // Signed in but no getUser — still bind a session bucket
    return 'puter-signed-in'
  } catch {
    return null
  }
}

/**
 * Intentional login from 翻转学习卡 CTA only.
 * Uses stashed original signIn; does not leave auth.signIn permanently open.
 */
export async function deliberatePuterSignIn(): Promise<string> {
  const p = await waitForPuterReady()
  stashPuterSignInOriginal(p)
  const w = win()
  const original = w[ORIGINAL_KEY]
  if (typeof original !== 'function') {
    // Last resort: temporarily assign a passthrough if Puter re-exposed signIn on a fresh object
    throw new Error('无法打开 Puter 登录，请刷新页面后重试')
  }
  await original()
  // Re-neuter immediately so AI paths stay silent
  neuterPuterSignIn(p)
  const id = await getPuterUserId()
  if (!id) throw new Error('登录未完成，请重试')
  return id
}
