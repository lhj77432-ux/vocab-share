import { jsPDF } from 'jspdf'
import { Document, Packer, Paragraph, TextRun } from 'docx'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import type { VocabWord } from '../data/dseWords'
import type { AppProgress } from './types'

function linesFrom(words: VocabWord[], progress: AppProgress) {
  return words.map((w) => {
    const st = progress.byWord[w.id]
    return {
      word: w.word,
      pos: w.pos,
      meaning: w.meaningZh,
      category: w.category,
      seen: st?.seen ?? 0,
      correct: st?.correct ?? 0,
      wrong: st?.wrong ?? 0,
      inWrongBook: progress.wrongIds.includes(w.id) ? 'Y' : '',
    }
  })
}

export function exportExcel(words: VocabWord[], progress: AppProgress, filename: string) {
  const rows = linesFrom(words, progress)
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'vocab')
  const wrong = words.filter((w) => progress.wrongIds.includes(w.id))
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(wrong.map((w) => ({ word: w.word, meaning: w.meaningZh, category: w.category }))),
    'wrong',
  )
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : filename + '.xlsx')
}

export async function exportDocx(words: VocabWord[], progress: AppProgress, title: string, filename: string) {
  const rows = linesFrom(words, progress)
  const children = [
    new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 32 })] }),
    new Paragraph({ children: [new TextRun({ text: `导出时间：${new Date().toLocaleString('zh-HK')}`, size: 20 })] }),
    new Paragraph({ children: [] }),
    ...rows.map(
      (r) =>
        new Paragraph({
          children: [
            new TextRun({
              text: `${r.word} (${r.pos}) — ${r.meaning} [${r.category}] 看${r.seen}/对${r.correct}/错${r.wrong}${r.inWrongBook ? ' ※错词' : ''}`,
              size: 22,
            }),
          ],
        }),
    ),
  ]
  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  saveAs(blob, filename.endsWith('.docx') ? filename : filename + '.docx')
}

export function exportPdf(words: VocabWord[], progress: AppProgress, title: string, filename: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  let y = 40
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(title, 40, y)
  y += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Exported: ${new Date().toISOString()}`, 40, y)
  y += 20
  const rows = linesFrom(words, progress)
  for (const r of rows) {
    const line = `${r.word} (${r.pos}) - ${r.meaning} [${r.category}] s${r.seen}/c${r.correct}/w${r.wrong}${r.inWrongBook ? ' WRONG' : ''}`
    // PDF default fonts lack CJK; meanings may show as blanks — Excel/Word better for Chinese
    const split = doc.splitTextToSize(line, pageW - 80)
    if (y + split.length * 12 > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage()
      y = 40
    }
    doc.text(split, 40, y)
    y += split.length * 12 + 4
  }
  doc.setFontSize(8)
  doc.text('Note: Chinese glyphs may be missing in PDF viewer fonts; use Excel/Word for full CJK.', 40, doc.internal.pageSize.getHeight() - 24)
  doc.save(filename.endsWith('.pdf') ? filename : filename + '.pdf')
}
