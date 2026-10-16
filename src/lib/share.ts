import type { WordListPack } from './types'

/** Compact share via URL hash: #share=<base64url json> */
export function encodeSharePack(pack: WordListPack): string {
  const json = JSON.stringify({
    id: pack.id,
    title: pack.title,
    words: pack.words,
    createdAt: pack.createdAt,
  })
  const b64 = btoa(unescape(encodeURIComponent(json)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeSharePack(token: string): WordListPack | null {
  try {
    let b64 = token.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const json = decodeURIComponent(escape(atob(b64)))
    const pack = JSON.parse(json) as WordListPack
    if (!pack?.words?.length) return null
    return pack
  } catch {
    return null
  }
}

export function shareCodeFromId(id: string) {
  // short human code from id
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h.toString(36).toUpperCase().slice(0, 6)
}

export function buildShareUrl(pack: WordListPack) {
  const token = encodeSharePack(pack)
  const base = `${location.origin}${location.pathname}`
  return `${base}#share=${token}`
}
