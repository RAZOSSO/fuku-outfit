import { useState } from 'react'
import { applyTheme, savedTheme, type Theme } from '../lib/theme'

const OPTIONS: { value: Theme; label: string; note: string }[] = [
  { value: 'auto', label: '自動', note: '端末の設定に合わせる' },
  { value: 'light', label: 'ライト', note: '象牙色に金箔' },
  { value: 'dark', label: 'ダーク', note: '漆黒に金' },
]

/** 設定画面の「画面の配色」。この端末だけに保存する */
export default function ThemeSettings() {
  const [theme, setTheme] = useState<Theme>(savedTheme)

  return (
    <div className="card stack">
      <h2 className="section-title">画面の配色</h2>
      <div className="theme-options" role="radiogroup">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={theme === o.value}
            className={`theme-option theme-${o.value}${theme === o.value ? ' active' : ''}`}
            onClick={() => {
              setTheme(o.value)
              applyTheme(o.value)
            }}
          >
            <span className="theme-swatch" aria-hidden="true" />
            <span className="theme-label">{o.label}</span>
            <span className="muted small">{o.note}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
