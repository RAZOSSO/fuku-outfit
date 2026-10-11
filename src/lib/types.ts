export const CATEGORIES = {
  tops: 'トップス',
  bottoms: 'ボトムス',
  outer: 'アウター',
  onepiece: 'ワンピース',
  shoes: '靴',
  accessory: '小物',
} as const

export type Category = keyof typeof CATEGORIES

export type Item = {
  id: string
  photo_path: string | null
  name: string
  category: Category
  color: string
  material: string
  warmth: number
  rain_ok: boolean
  formality: number
  notes: string
}

export type ItemDraft = Omit<Item, 'id'>

export type Weather = {
  place: string
  date: string
  summary: string
  max: number
  min: number
  feels_max: number
  feels_min: number
  precip_prob: number
  precip_sum: number
  wind_max: number
  uv_max: number
  hourly: { hour: number; temp: number; feels: number; precip_prob: number; summary: string }[]
}

export type Outfit = {
  id: string
  date: string
  item_ids: string[]
  comment: string
  tips: string
  weather: Weather
  worn: boolean
  created_at: string
}

export type Profile = {
  place_name: string
  latitude: number
  longitude: number
  style_notes: string
}
