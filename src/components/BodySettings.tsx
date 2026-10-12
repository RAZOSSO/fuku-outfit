import { useState } from 'react'
import { BODY_TYPES, clampHeight, loadBody, MAX_HEIGHT, MIN_HEIGHT, saveBody, type BodyType } from '../lib/body'
import Mannequin from './Mannequin'

/** 設定画面の「体型」。マネキンのイラストに使う。この端末だけに保存する */
export default function BodySettings() {
  const [body, setBody] = useState(loadBody)
  const [heightText, setHeightText] = useState(String(body.height))

  function update(height: number, type: BodyType) {
    saveBody(height, type)
    setBody({ height: clampHeight(height), type, saved: true })
  }

  return (
    <div className="card stack">
      <h2 className="section-title">体型（イラスト用）</h2>
      <p className="muted small">提案された服を、あなたの背丈に近いマネキンに着せて表示します。この端末だけに保存されます。</p>
      <div className="body-settings">
        <div className="mannequin mini">
          <Mannequin items={[]} body={body} />
        </div>
        <div className="stack">
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
                if (n >= MIN_HEIGHT && n <= MAX_HEIGHT) update(n, body.type)
              }}
              onBlur={() => setHeightText(String(body.height))}
            />
          </label>
          <div className="chips wrap">
            {BODY_TYPES.map((t) => (
              <button key={t.value} className={body.type === t.value ? 'active' : ''} onClick={() => update(body.height, t.value)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
