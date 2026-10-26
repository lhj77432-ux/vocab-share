import { useMemo, useState } from 'react'
import type { VocabWord } from '../data/dseWords'
import type { ClozeGloss, MeaningChoice } from '../lib/mcq'
import { buildMeaningChoices, localClozeGloss, normalizeGlossParts } from '../lib/mcq'

export function ClozeBlock({ cloze }: { cloze: ClozeGloss }) {
  return (
    <div className="cloze-block" style={{ marginTop: 10 }}>
      <p style={{ marginBottom: 6 }}>
        <b>例句：</b>
        {cloze.sentenceEn}
      </p>
      <p className="cloze-gloss" style={{ marginBottom: 0, lineHeight: 1.7 }}>
        <b>中译：</b>
        {cloze.parts.map((p, i) =>
          p.blank ? (
            <span
              key={i}
              className="cloze-blank"
              style={{
                display: 'inline-block',
                minWidth: '3.5em',
                borderBottom: '2px solid var(--fg, #333)',
                textAlign: 'center',
                margin: '0 2px',
                fontWeight: 700,
                letterSpacing: 1,
              }}
            >
              ____
            </span>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </p>
    </div>
  )
}

export function AbcdChoices({
  choices,
  disabled,
  picked,
  onPick,
}: {
  choices: MeaningChoice[]
  disabled?: boolean
  picked: number | null
  onPick: (idx: number, correct: boolean) => void
}) {
  return (
    <div className="row quiz-options" style={{ flexDirection: 'column', alignItems: 'stretch', marginTop: 10, gap: 8 }}>
      {choices.map((c, idx) => {
        const label = String.fromCharCode(65 + idx)
        const selected = picked === idx
        const showCorrect = picked !== null && c.correct
        const showWrong = selected && !c.correct
        return (
          <button
            key={`${label}-${c.text}`}
            type="button"
            className={`btn quiz-opt${showCorrect ? ' correct' : ''}${showWrong ? ' wrong' : ''}`}
            style={{
              borderColor: showCorrect ? 'var(--ok)' : showWrong ? 'var(--bad)' : undefined,
              textAlign: 'left',
            }}
            disabled={disabled || picked !== null}
            onClick={() => onPick(idx, c.correct)}
          >
            <b style={{ marginRight: 8 }}>{label}.</b>
            {c.text}
          </button>
        )
      })}
    </div>
  )
}

/** One word: cloze gloss + ABCD Chinese meaning. */
export function SensePracticeCard({
  word,
  pool,
  sentence,
  cloze,
  choices,
  reasons,
  onAnswered,
}: {
  word: VocabWord
  pool: VocabWord[]
  sentence?: string
  cloze?: ClozeGloss
  choices?: MeaningChoice[]
  reasons?: string[]
  onAnswered?: (ok: boolean) => void
}) {
  const resolvedCloze = useMemo(() => {
    if (cloze?.parts?.length) {
      return {
        sentenceEn: cloze.sentenceEn || sentence || word.example,
        parts: normalizeGlossParts(cloze.parts, word, cloze.sentenceEn || sentence || word.example),
      }
    }
    return localClozeGloss(word, sentence || word.example)
  }, [cloze, sentence, word])

  const resolvedChoices = useMemo(
    () => (choices?.length ? choices : buildMeaningChoices(word, pool, 4)),
    [choices, word, pool],
  )

  const [picked, setPicked] = useState<number | null>(null)

  return (
    <div className="card sense-card" style={{ marginTop: 12, background: 'var(--bg)' }}>
      <div className="word-big" style={{ fontSize: '1.6rem' }}>
        {word.word}
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        {word.pos}
        {word.category ? ` · ${word.category}` : ''}
      </p>

      <ClozeBlock cloze={resolvedCloze} />
      <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
        先看例句与中译挖空，再选该词的中文意思：
      </p>
      <AbcdChoices
        choices={resolvedChoices}
        picked={picked}
        onPick={(idx, ok) => {
          setPicked(idx)
          onAnswered?.(ok)
        }}
      />
      {picked !== null ? (
        <p style={{ marginTop: 10 }} className={resolvedChoices[picked]?.correct ? undefined : 'warn'}>
          {resolvedChoices[picked]?.correct
            ? `正确：${word.meaningZh}`
            : `不对。正确答案：${word.meaningZh}`}
        </p>
      ) : null}
      {reasons?.length ? (
        <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
          <b>为何推荐：</b>
          {reasons.join('；')}
        </p>
      ) : null}
    </div>
  )
}
