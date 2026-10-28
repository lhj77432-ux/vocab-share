/** Minimal Puter.js typings used by vocab-share (loaded via https://js.puter.com/v2/). */
interface PuterChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | unknown
}

interface PuterChatOptions {
  model?: string
  temperature?: number
  max_tokens?: number
  stream?: boolean
  normalize?: boolean
  signal?: AbortSignal
}

interface PuterChatResponse {
  message?: {
    role?: string
    content?: string | Array<{ type?: string; text?: string }>
  }
  toString?: () => string
}

interface PuterAI {
  chat(
    promptOrMessages: string | PuterChatMessage[],
    options?: PuterChatOptions,
  ): Promise<PuterChatResponse | string>
}

interface PuterAuth {
  isSignedIn(): boolean
  /** Intentionally overridden / unused — we never prompt login on this site. */
  signIn(): Promise<unknown>
  signOut?(): Promise<void>
  getUser?(): Promise<unknown>
}

interface PuterGlobal {
  ai: PuterAI
  auth?: PuterAuth
}

interface Window {
  puter?: PuterGlobal
}

declare const puter: PuterGlobal
