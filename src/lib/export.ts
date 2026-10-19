import { jsPDF } from 'jspdf'
import { Document, Packer, Paragraph, TextRun } from 'docx'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import html2canvas from 'html2canvas'
import type { VocabWord } from '../data/dseWords'
import type { AppProgress } from './types'

/** One row ready for Excel / Word / PDF export. */
export interface ExportEntry {
  word: string
  pos: string
  meaning: string
  example: string
  userSentences: string[]
  category: string
  seen: number
  correct: number
  wrong: number
  inWrongBook: boolean
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Pure: map selected words + progress into export rows (EN / 词性 / 中文 / 造句). */
export function buildExportEntries(words: VocabWord[], progress: AppProgress): ExportEntry[] {
  return words.map((w) => {
    const st = progress.byWord[w.id]
    const userSentences = progress.sentences
      .filter((s) => s.wordId === w.id)
      .map((s) => s.text)
      .filter(Boolean)
    return {
      word: w.word,
      pos: w.pos,
      meaning: w.meaningZh,
      example: w.example,
      userSentences,
      category: w.category,
      seen: st?.seen ?? 0,
      correct: st?.correct ?? 0,
      wrong: st?.wrong ?? 0,
      inWrongBook: progress.wrongIds.includes(w.id),
    }
  })
}

function allSentences(e: ExportEntry): string[] {
  const out: string[] = []
  if (e.example?.trim()) out.push(e.example.trim())
  for (const s of e.userSentences) {
    const t = s.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

export function exportExcel(words: VocabWord[], progress: AppProgress, filename: string) {
  const rows = buildExportEntries(words, progress).map((e) => ({
    word: e.word,
    pos: e.pos,
    meaning_zh: e.meaning,
    example: e.example,
    user_sentences: e.userSentences.join(' | '),
    category: e.category,
    seen: e.seen,
    correct: e.correct,
    wrong: e.wrong,
    inWrongBook: e.inWrongBook ? 'Y' : '',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'vocab')
  const wrong = words.filter((w) => progress.wrongIds.includes(w.id))
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      wrong.map((w) => ({
        word: w.word,
        pos: w.pos,
        meaning: w.meaningZh,
        example: w.example,
        category: w.category,
      })),
    ),
    'wrong',
  )
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : filename + '.xlsx')
}

export async function exportDocx(words: VocabWord[], progress: AppProgress, title: string, filename: string) {
  const rows = buildExportEntries(words, progress)
  const children = [
    new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 32 })] }),
    new Paragraph({
      children: [new TextRun({ text: `导出时间：${new Date().toLocaleString('zh-HK')}`, size: 20 })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '每条含：英文单词 · 词性 · 中文意思 · 造句',
          size: 20,
          italics: true,
        }),
      ],
    }),
    new Paragraph({ children: [] }),
    ...rows.flatMap((r) => {
      const sentences = allSentences(r)
      return [
        new Paragraph({
          children: [
            new TextRun({ text: r.word, bold: true, size: 26 }),
            new TextRun({ text: `  ${r.pos}`, size: 22 }),
          ],
        }),
        new Paragraph({
          children: [new TextRun({ text: `中文意思：${r.meaning}`, size: 22 })],
        }),
        ...sentences.map(
          (s, i) =>
            new Paragraph({
              children: [
                new TextRun({
                  text: `${sentences.length > 1 ? `造句 ${i + 1}` : '造句'}：${s}`,
                  size: 22,
                }),
              ],
            }),
        ),
        new Paragraph({ children: [] }),
      ]
    }),
  ]
  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  saveAs(blob, filename.endsWith('.docx') ? filename : filename + '.docx')
}

/**
 * PDF with CJK: render HTML (system Chinese fonts) via html2canvas, then slice into A4 pages.
 * Fields per word: English, 词性, 中文意思, 造句 (demo example + any saved user sentences).
 */
export async function exportPdf(words: VocabWord[], progress: AppProgress, title: string, filename: string) {
  const rows = buildExportEntries(words, progress)
  if (rows.length === 0) {
    throw new Error('No words selected')
  }

  const when = new Date().toLocaleString('zh-HK')
  const cards = rows
    .map((r) => {
      const sentences = allSentences(r)
      const sentenceHtml =
        sentences.length === 0
          ? `<div class="field"><span class="label">造句</span> —</div>`
          : sentences
              .map(
                (s, i) =>
                  `<div class="field"><span class="label">${sentences.length > 1 ? `造句 ${i + 1}` : '造句'}</span> ${escapeHtml(s)}</div>`,
              )
              .join('')
      return `<article class="card">
        <div class="head"><span class="en">${escapeHtml(r.word)}</span><span class="pos">${escapeHtml(r.pos)}</span></div>
        <div class="field"><span class="label">中文意思</span> ${escapeHtml(r.meaning)}</div>
        ${sentenceHtml}
      </article>`
    })
    .join('')

  const container = document.createElement('div')
  container.setAttribute('data-vocab-pdf-root', '1')
  container.style.cssText =
    'position:fixed;left:-10000px;top:0;width:720px;padding:36px 40px;background:#ffffff;color:#1f2430;' +
    'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif;' +
    'line-height:1.55;box-sizing:border-box;'
  container.innerHTML = `
    <style>
      .pdf-title { font-size: 22px; font-weight: 800; margin: 0 0 6px; }
      .pdf-meta { font-size: 12px; color: #7a8194; margin: 0 0 18px; }
      .card { border-bottom: 1px solid #e6e8f0; padding: 14px 0; page-break-inside: avoid; }
      .head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
      .en { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; }
      .pos { font-size: 13px; color: #5b6cff; font-weight: 600; }
      .field { font-size: 14px; margin-top: 4px; }
      .label { display: inline-block; min-width: 4.5em; color: #7a8194; font-weight: 600; font-size: 12px; }
    </style>
    <h1 class="pdf-title">${escapeHtml(title)}</h1>
    <p class="pdf-meta">导出时间：${escapeHtml(when)} · 共 ${rows.length} 词 · 每条含英文 / 词性 / 中文意思 / 造句</p>
    ${cards}
  `
  document.body.appendChild(container)

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    })

    const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const imgW = pageW
    const imgH = (canvas.height * pageW) / canvas.width
    const imgData = canvas.toDataURL('image/jpeg', 0.92)

    let heightLeft = imgH
    let position = 0
    pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH)
    heightLeft -= pageH
    while (heightLeft > 0) {
      position = heightLeft - imgH
      pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH)
      heightLeft -= pageH
    }

    pdf.save(filename.endsWith('.pdf') ? filename : filename + '.pdf')
  } finally {
    container.remove()
  }
}
