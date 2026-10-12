export type Theme = 'auto' | 'light' | 'dark'

const KEY = 'theme'
const COLORS = { light: '#f7f2e9', dark: '#0e0c0a' }

/** この端末で選んだ配色（保存していなければ「自動」） */
export function savedTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : 'auto'
  } catch {
    return 'auto'
  }
}

/** 配色を切り替えて、この端末に覚えておく。最初の描画前の処理は index.html にある */
export function applyTheme(theme: Theme) {
  try {
    if (theme === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // 保存できなくても、今の画面には反映する
  }
  const root = document.documentElement
  if (theme === 'auto') delete root.dataset.theme
  else root.dataset.theme = theme

  // ステータスバーの色。「自動」なら meta の media 指定どおりに戻す
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name=theme-color]')) {
    const forDark = meta.media.includes('dark')
    meta.content = theme === 'auto' ? COLORS[forDark ? 'dark' : 'light'] : COLORS[theme]
  }
}
