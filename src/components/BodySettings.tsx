import { useState } from 'react'
import { AGES, BODY_TYPES, clampHeight, loadBody, MAX_HEIGHT, MIN_HEIGHT, PRESENTATIONS, saveBody, type Body } from '../lib/body'

/** 設定画面の「体型とイメージの人物」。写真風イメージの人物に使う。この端末だけに保存する */
export default function BodySettings() {
  const [body, setBody] = useState(loadBody)
  const [heightText, setHeightText] = useState(String(body.height))

  function update(change: Partial<Body>) {
    const next = { ...body, ...change, saved: true }
    next.height = clampHeight(next.height)
    saveBody(next)
    setBody(next)
  }

  return (
    <div className="card stack">
      <h2 className="section-title">体型とイメージの人物</h2>
      <p className="muted small">写真風イメージで「モデルで作る」ときの人物になります。この端末だけに保存されます。</p>
      <label>
        身長（cm）
        <input
          type="number"
          inputMode="numeric"
          min={MIN_HEIGHT}
          max={MAX_HEIGHT}
          value={heightText}
          onChange={(e) => {
            setHeightText(e.target.value)
            const n = Number(e.target.value)
            if (n >= MIN_HEIGHT && n <= MAX_HEIGHT) update({ height: n })
          }}
          onBlur={() => setHeightText(String(body.height))}
        />
      </label>
      <div className="chips wrap">
        {BODY_TYPES.map((t) => (
          <button key={t.value} className={body.type === t.value ? 'active' : ''} onClick={() => update({ type: t.value })}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="stack">
        <div className="scale-label">写真風イメージの人物</div>
        <div className="chips wrap">
          {PRESENTATIONS.map((p) => (
            <button key={p.value} className={body.presentation === p.value ? 'active' : ''} onClick={() => update({ presentation: body.presentation === p.value ? 'unset' : p.value })}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="chips wrap">
          {AGES.map((a) => (
            <button key={a} className={body.age === a ? 'active' : ''} onClick={() => update({ age: a })}>
              {a}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
