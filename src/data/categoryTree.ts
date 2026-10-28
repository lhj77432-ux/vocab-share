/**
 * Hierarchical browse tree for the Categories page only (3 levels).
 * Level 1: 考试备考 | 主题领域
 * Level 2: exam ids / WordCategory
 * Level 3: theme buckets present in the word data
 */
import { ALL_CATEGORIES, type VocabWord, type WordCategory } from './dseWords'
import { EXAM_LEVELS, wordExams, type ExamLevel } from './examLevels'

export type TreeRootId = 'exam' | 'theme'

export type TreeNode = {
  id: string
  label: string
  short?: string
}

export const TREE_ROOTS: TreeNode[] = [
  { id: 'exam', label: '考试备考', short: '考试' },
  { id: 'theme', label: '主题领域', short: '主题' },
]

/** Display labels for VocabWord.theme values. */
export const THEME_LABELS: Record<string, string> = {
  Education: '教育 Education',
  Academic: '学术 Academic',
  Writing: '写作 Writing',
  Society: '社会 Society',
  Community: '社区 Community',
  Culture: '文化 Culture',
  Youth: '青少年 Youth',
  Media: '媒体 Media',
  Technology: '科技 Technology',
  Environment: '环境 Environment',
  Health: '健康 Health',
  Emotions: '情感 Emotions',
}

export function themeLabel(theme: string): string {
  return THEME_LABELS[theme] ?? theme
}

export function wordsForExam(words: VocabWord[], exam: ExamLevel): VocabWord[] {
  return words.filter((w) => wordExams(w).includes(exam))
}

export function wordsForCategory(words: VocabWord[], cat: WordCategory): VocabWord[] {
  return words.filter((w) => w.category === cat)
}

export function wordsForTheme(words: VocabWord[], theme: string): VocabWord[] {
  return words.filter((w) => (w.theme ?? '') === theme)
}

/** Unique themes among words, stable order by frequency then name. */
export function collectThemes(words: VocabWord[]): string[] {
  const counts = new Map<string, number>()
  for (const w of words) {
    const t = w.theme?.trim()
    if (!t) continue
    counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t)
}

export function level2Nodes(root: TreeRootId): TreeNode[] {
  if (root === 'exam') {
    return EXAM_LEVELS.map((e) => ({ id: e.id, label: e.label, short: e.short }))
  }
  return ALL_CATEGORIES.map((c) => ({ id: c, label: c, short: c }))
}

export type BrowsePath = {
  root: TreeRootId | null
  mid: string | null
  leaf: string | null
}

export function wordsAtPath(all: VocabWord[], path: BrowsePath): VocabWord[] {
  let list = all
  if (!path.root) return list
  if (path.root === 'exam') {
    if (path.mid) list = wordsForExam(list, path.mid as ExamLevel)
  } else {
    if (path.mid) list = wordsForCategory(list, path.mid as WordCategory)
  }
  if (path.leaf && path.leaf !== '__all__') list = wordsForTheme(list, path.leaf)
  return list
}

export function countAtPath(all: VocabWord[], path: BrowsePath): number {
  return wordsAtPath(all, path).length
}

export function breadcrumbLabels(path: BrowsePath): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [{ id: 'root', label: '全部分类' }]
  if (!path.root) return out
  const root = TREE_ROOTS.find((r) => r.id === path.root)
  out.push({ id: path.root, label: root?.label ?? path.root })
  if (!path.mid) return out
  if (path.root === 'exam') {
    const e = EXAM_LEVELS.find((x) => x.id === path.mid)
    out.push({ id: path.mid, label: e?.label ?? path.mid })
  } else {
    out.push({ id: path.mid, label: path.mid })
  }
  if (path.leaf) {
    out.push({
      id: `theme:${path.leaf}`,
      label: path.leaf === '__all__' ? '全部词条' : themeLabel(path.leaf),
    })
  }
  return out
}
