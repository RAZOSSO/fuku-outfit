import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORIES, type Item, type Outfit } from '../lib/types'

const ORDER = ['outer', 'tops', 'onepiece', 'bottoms', 'shoes', 'accessory']

const REASONS = ['暑かった', '寒かった', '雨に向いてなかった', '色・組み合わせ', 'きちんとしすぎ', 'カジュアルすぎ', '気分じゃない']

/** 服装に含まれる服を、上から下の順に並べて返す（削除済みの服は除く） */
export function itemsOf(outfit: Outfit, byId: Map<string, Item>): Item[] {
  return outfit.item_ids
    .map((id) => byId.get(id))
    .filter((i): i is Item => !!i)
    .sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category))
}

export function OutfitItems({ items, urls, small }: { items: Item[]; urls: Record<string, string>; small?: boolean }) {
  return (
    <div className={small ? 'outfit-grid small' : 'outfit-grid'}>
      {items.map((i) => (
        <figure key={i.id}>
          {i.photo_path && urls[i.photo_path] ? <img src={urls[i.photo_path]} alt={i.name} /> : <div className="noimg">{CATEGORIES[i.category]}</div>}
          {!small && <figcaption>{i.name}</figcaption>}
        </figure>
      ))}
    </div>
  )
}

/** 👍👎 と、👎 のときの理由（選ぶか、「その他」で自由に書く）。評価は次からの提案に使われる */
export function Rating({ outfit, onChange }: { outfit: Outfit; onChange: (o: Outfit) => void }) {
  const isCustom = !!outfit.feedback && !REASONS.includes(outfit.feedback)
  const [otherOpen, setOtherOpen] = useState(isCustom)
  const [text, setText] = useState(isCustom ? outfit.feedback : '')
  const [saved, setSaved] = useState(false)

  async function save(rating: -1 | 1 | null, feedback: string) {
    onChange({ ...outfit, rating, feedback })
    await supabase.from('outfits').update({ rating, feedback }).eq('id', outfit.id)
  }

  function pick(reason: string) {
    setOtherOpen(false)
    setSaved(false)
    save(-1, outfit.feedback === reason ? '' : reason)
  }

  async function saveText() {
    await save(-1, text.trim())
    setSaved(true)
  }

  return (
    <div className="stack rating">
      <div className="row">
        <button className={outfit.rating === 1 ? 'active' : ''} onClick={() => save(outfit.rating === 1 ? null : 1, '')}>
          👍 よかった
        </button>
        <button className={outfit.rating === -1 ? 'active' : ''} onClick={() => save(outfit.rating === -1 ? null : -1, '')}>
          👎 いまいち
        </button>
      </div>
      {outfit.rating === -1 && (
        <div className="chips wrap">
          {REASONS.map((r) => (
            <button key={r} className={outfit.feedback === r ? 'active' : ''} onClick={() => pick(r)}>
              {r}
            </button>
          ))}
          <button className={otherOpen ? 'active' : ''} onClick={() => setOtherOpen(!otherOpen)}>
            その他（書く）
          </button>
        </div>
      )}
      {outfit.rating === -1 && otherOpen && (
        <div className="stack other-reason">
          <textarea
            rows={2}
            maxLength={200}
            placeholder="例：袖が長くて自転車でじゃまだった／今日は会議でもう少しきちんとしたかった"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setSaved(false)
            }}
          />
          <div className="row between">
            <span className="muted small">{saved ? '✦ 次からの提案に活かします' : '書いた内容は次からの提案に使われます'}</span>
            <button className="primary" onClick={saveText} disabled={!text.trim() || text.trim() === outfit.feedback}>保存</button>
          </div>
        </div>
      )}
    </div>
  )
}
