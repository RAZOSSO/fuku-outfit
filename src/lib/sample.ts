import { supabase } from './supabase'
import type { ItemDraft } from './types'

/** サンプルの服の目印。メモ欄がこの文字列の服を「サンプル」とみなす */
export const SAMPLE_NOTE = 'サンプル'

const item = (d: Omit<ItemDraft, 'photo_path' | 'notes'>): ItemDraft => ({ ...d, photo_path: null, notes: SAMPLE_NOTE })

/** 写真なしで一通りの提案が試せるだけの服 */
const SAMPLE_ITEMS: ItemDraft[] = [
  item({ name: '白の無地Tシャツ', category: 'tops', color: '白', material: '綿', warmth: 1, rain_ok: true, formality: 2 }),
  item({ name: 'ネイビーのボーダー長袖', category: 'tops', color: 'ネイビー×白', material: '綿', warmth: 2, rain_ok: true, formality: 2 }),
  item({ name: '水色のシャツ', category: 'tops', color: '水色', material: '綿', warmth: 2, rain_ok: false, formality: 4 }),
  item({ name: 'グレーのニット', category: 'tops', color: 'グレー', material: 'ウール', warmth: 4, rain_ok: false, formality: 3 }),
  item({ name: 'インディゴのデニム', category: 'bottoms', color: 'インディゴ', material: 'デニム', warmth: 3, rain_ok: false, formality: 2 }),
  item({ name: 'ベージュのチノパン', category: 'bottoms', color: 'ベージュ', material: '綿', warmth: 3, rain_ok: false, formality: 3 }),
  item({ name: '黒のスラックス', category: 'bottoms', color: '黒', material: 'ポリエステル', warmth: 3, rain_ok: true, formality: 4 }),
  item({ name: 'ネイビーのワンピース', category: 'onepiece', color: 'ネイビー', material: 'ポリエステル', warmth: 2, rain_ok: true, formality: 4 }),
  item({ name: 'ベージュのトレンチコート', category: 'outer', color: 'ベージュ', material: '綿', warmth: 3, rain_ok: true, formality: 4 }),
  item({ name: '紺のダウンジャケット', category: 'outer', color: '紺', material: 'ナイロン・ダウン', warmth: 5, rain_ok: true, formality: 2 }),
  item({ name: 'グレーのカーディガン', category: 'outer', color: 'グレー', material: '綿', warmth: 2, rain_ok: false, formality: 3 }),
  item({ name: '白のスニーカー', category: 'shoes', color: '白', material: 'レザー', warmth: 3, rain_ok: false, formality: 2 }),
  item({ name: '黒のレインブーツ', category: 'shoes', color: '黒', material: 'ゴム', warmth: 3, rain_ok: true, formality: 2 }),
  item({ name: '茶色の革靴', category: 'shoes', color: '茶', material: 'レザー', warmth: 3, rain_ok: false, formality: 5 }),
  item({ name: '折りたたみ傘', category: 'accessory', color: '黒', material: 'ナイロン', warmth: 3, rain_ok: true, formality: 3 }),
  item({ name: 'グレーのマフラー', category: 'accessory', color: 'グレー', material: 'ウール', warmth: 5, rain_ok: false, formality: 3 }),
]

export async function addSamples() {
  const { error } = await supabase.from('items').insert(SAMPLE_ITEMS)
  if (error) throw new Error('サンプルを入れられませんでした: ' + error.message)
}

export async function removeSamples() {
  const { error } = await supabase.from('items').delete().eq('notes', SAMPLE_NOTE)
  if (error) throw new Error('サンプルを消せませんでした: ' + error.message)
}
