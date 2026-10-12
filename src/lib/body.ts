/** 写真風イメージ用の身長・体型・人物。この端末だけに保存する（配色と同じ） */
export type BodyType = 'slim' | 'regular' | 'curvy' | 'sturdy'
export type Presentation = 'faceless' | 'woman' | 'man'
export type Body = { height: number; type: BodyType; presentation: Presentation; age: string; saved: boolean }

export const PRESENTATIONS: { value: Presentation; label: string }[] = [
  { value: 'faceless', label: '顔を写さない' },
  { value: 'woman', label: '女性' },
  { value: 'man', label: '男性' },
]
export const AGES = ['20代', '30代', '40代', '50代以上']

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
      return {
        height: clampHeight(raw.height),
        type: raw.type,
        presentation: PRESENTATIONS.some((p) => p.value === raw.presentation) ? raw.presentation : 'faceless',
        age: AGES.includes(raw.age) ? raw.age : '30代',
        saved: true,
      }
    }
  } catch {
    // 読めなければ初期値
  }
  return { height: 160, type: 'regular', presentation: 'faceless', age: '30代', saved: false }
}

export function saveBody(body: Omit<Body, 'saved'>) {
  try {
    const { height, type, presentation, age } = body
    localStorage.setItem(KEY, JSON.stringify({ height: clampHeight(height), type, presentation, age }))
  } catch {
    // 保存できなくても画面はそのまま使える
  }
}

export const clampHeight = (h: number) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(h)))
