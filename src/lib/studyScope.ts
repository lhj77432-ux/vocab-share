/**
 * Shared study-scope (category filter) for 今日推荐 + 学习.
 * Persisted in localStorage; reuses Categories browse path shape.
 */
import type { VocabWord } from '../data/dseWords'
import { EXAM_LEVELS, mergeCategoryBrowseWords } from '../data/examLevels'
import {
  TREE_ROOTS,
  level2Nodes,
  collectThemes,
  wordsAtPath,
  themeLabel,
  type BrowsePath,
  type TreeRootId,
} from '../data/categoryTree'

export const STUDY_SCOPE_KEY = 'vocab-share-study-scope-v1'

export type StudyScope = BrowsePath

export const DEFAULT_STUDY_SCOPE: StudyScope = {
  root: null,
  mid: null,
  leaf: null,
}

export function scopeKey(scope: StudyScope): string {
  return [scope.root ?? '', scope.mid ?? '', scope.leaf ?? ''].join('|')
}

export function loadStudyScope(): StudyScope {
  try {
    const raw = localStorage.getItem(STUDY_SCOPE_KEY)
    if (!raw) return { ...DEFAULT_STUDY_SCOPE }
    const parsed = JSON.parse(raw) as Partial<StudyScope>
    const root = parsed.root === 'exam' || parsed.root === 'theme' ? parsed.root : null
    const mid = typeof parsed.mid === 'string' && parsed.mid ? parsed.mid : null
    const leaf = typeof parsed.leaf === 'string' && parsed.leaf ? parsed.leaf : null
    if (root === 'exam' && mid && !EXAM_LEVELS.some((e) => e.id === mid)) {
      return { root, mid: null, leaf: null }
    }
    if (root === 'theme' && mid && !level2Nodes('theme').some((n) => n.id === mid)) {
      return { root, mid: null, leaf: null }
    }
    return { root, mid, leaf }
  } catch {
    return { ...DEFAULT_STUDY_SCOPE }
  }
}

export function saveStudyScope(scope: StudyScope) {
  try {
    localStorage.setItem(STUDY_SCOPE_KEY, JSON.stringify(scope))
  } catch { /* ignore */ }
}

/** Word pool for recommend/learn given a scope. Default (no root) = DSE pack only. */
export function resolveStudyWords(packWords: VocabWord[], scope: StudyScope): VocabWord[] {
  if (!scope.root) return packWords
  const all = mergeCategoryBrowseWords(packWords)
  if (!scope.mid) return all
  return wordsAtPath(all, {
    root: scope.root,
    mid: scope.mid,
    leaf: scope.leaf && scope.leaf !== '__all__' ? scope.leaf : null,
  })
}

export function studyScopeLabel(scope: StudyScope): string {
  if (!scope.root) return '默认 DSE 词表'
  const root = TREE_ROOTS.find((r) => r.id === scope.root)
  const parts: string[] = [root?.label ?? scope.root]
  if (scope.mid) {
    if (scope.root === 'exam') {
      const e = EXAM_LEVELS.find((x) => x.id === scope.mid)
      parts.push(e?.short ?? scope.mid)
    } else {
      parts.push(scope.mid)
    }
  }
  if (scope.leaf && scope.leaf !== '__all__') {
    parts.push(themeLabel(scope.leaf))
  } else if (scope.mid) {
    parts.push('全部细分')
  }
  return parts.join(' · ')
}

export function studyThemeOptions(
  packWords: VocabWord[],
  scope: StudyScope,
): string[] {
  if (!scope.root || !scope.mid) return []
  const midWords = resolveStudyWords(packWords, { ...scope, leaf: null })
  return collectThemes(midWords)
}

export type { TreeRootId }
