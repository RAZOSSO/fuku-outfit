/** マネキンのイラスト用の身長・体型。この端末だけに保存する（配色と同じ） */
export type BodyType = 'slim' | 'regular' | 'curvy' | 'sturdy'
export type Body = { height: number; type: BodyType; saved: boolean }

export const BODY_TYPES: { value: BodyType; label: string }[] = [
  { value: 'slim', label: '細身' },
  { value: 'regular', label: '標準' },
  { value: 'curvy', label: '曲線的' },
  { value: 'sturdy', label: 'がっしり' },
]

const KEY = 'body'
export const MIN_HEIGHT = 120
export const MAX_HEIGHT = 210

export function loadBody(): Body {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (raw && typeof raw.height === 'number' && BODY_TYPES.some((t) => t.value === raw.type)) {
      return { height: clampHeight(raw.height), type: raw.type, saved: true }
    }
  } catch {
    // 読めなければ初期値
  }
  return { height: 160, type: 'regular', saved: false }
}

export function saveBody(height: number, type: BodyType) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ height: clampHeight(height), type }))
  } catch {
    // 保存できなくても画面はそのまま使える
  }
}

export const clampHeight = (h: number) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(h)))

// ---- 色名 → 実際の色 ----

const COLORS: [string[], string][] = [
  [['オフホワイト', 'アイボリー', '生成', 'クリーム', 'エクリュ'], '#efe7d3'],
  [['ライトグレー', '杢グレー'], '#c9c6c0'],
  [['チャコール'], '#45423e'],
  [['グレー', '灰', 'シルバー'], '#9b9893'],
  [['白', 'ホワイト'], '#f6f3ec'],
  [['黒', 'ブラック'], '#2a2622'],
  [['ネイビー', '紺'], '#27395a'],
  [['インディゴ', 'デニム'], '#36496c'],
  [['水色', 'サックス', 'ライトブルー', 'スカイ'], '#a8c6e0'],
  [['くすみブルー', 'ブルーグレー'], '#7f97ad'],
  [['青', 'ブルー'], '#3f6eaa'],
  [['ミント'], '#a9d4c0'],
  [['カーキ', 'オリーブ'], '#77724a'],
  [['緑', 'グリーン'], '#4b7a52'],
  [['キャメル'], '#b5844c'],
  [['ベージュ', 'サンド', 'トープ'], '#d6c2a0'],
  [['モカ', 'ブラウン', '茶', 'チョコ'], '#6d4b31'],
  [['ボルドー', 'ワイン', 'バーガンディ'], '#6c2434'],
  [['赤', 'レッド'], '#b13a33'],
  [['ピンク', 'ローズ'], '#e2aab4'],
  [['テラコッタ', 'オレンジ'], '#d47e44'],
  [['マスタード', '黄', 'イエロー'], '#d3aa3a'],
  [['ラベンダー'], '#c2b3db'],
  [['紫', 'パープル'], '#7f6aa1'],
  [['ゴールド', '金'], '#c9a44c'],
]
const FALLBACK = '#b3a998'

/** 「ネイビー×白のボーダー」→ 文中に出てくる順に色を返す（最大2色） */
export function colorsOf(text: string): string[] {
  const found: { at: number; hex: string }[] = []
  for (const [words, hex] of COLORS) {
    let at = -1
    for (const w of words) {
      const i = text.indexOf(w)
      if (i >= 0 && (at < 0 || i < at)) at = i
    }
    // 「ライトグレー」と「グレー」のような重なりは、先に見つけた長い名前を優先する
    if (at >= 0 && !found.some((f) => Math.abs(f.at - at) < 2)) found.push({ at, hex })
  }
  found.sort((a, b) => a.at - b.at)
  const result = [...new Set(found.map((f) => f.hex))].slice(0, 2)
  return result.length > 0 ? result : [FALLBACK]
}

export type Pattern = 'border' | 'stripe' | 'check' | 'dot' | null

export function patternOf(text: string): Pattern {
  if (/ボーダー|横縞|マリン/.test(text)) return 'border'
  if (/チェック|格子|ギンガム|タータン|千鳥/.test(text)) return 'check'
  if (/ドット|水玉/.test(text)) return 'dot'
  if (/ストライプ|縦縞|ピンストライプ/.test(text)) return 'stripe'
  return null
}
