import { useEffect, useState } from 'react'
import { itemsOf, OutfitItems, Rating } from '../components/Outfit'
import { signedUrls, supabase } from '../lib/supabase'
import type { Item, Outfit } from '../lib/types'

/** 実際に着た服の履歴（新しい順）。ここでも 👍👎 を付けられる */
export default function History() {
  const [outfits, setOutfits] = useState<Outfit[] | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    ;(async () => {
      const [{ data: outfitRows }, { data: itemRows }] = await Promise.all([
        supabase.from('outfits').select('*').eq('worn', true).order('date', { ascending: false }).limit(90),
        supabase.from('items').select('*'),
      ])
      const all = (itemRows ?? []) as Item[]
      setItems(all)
      setUrls(await signedUrls(all.map((i) => i.photo_path ?? '')))
      setOutfits((outfitRows ?? []) as Outfit[])
    })()
  }, [])

  if (!outfits) return <div className="center muted">読み込み中…</div>
  if (outfits.length === 0)
    return (
      <div className="center stack">
        <h1>履歴</h1>
        <p className="muted">「きょう」の画面で「これを着る」を押すと、ここに記録されます。</p>
      </div>
    )

  const byId = new Map(items.map((i) => [i.id, i]))
  const update = (o: Outfit) => setOutfits(outfits.map((x) => (x.id === o.id ? o : x)))

  return (
    <div className="stack">
      <h1>履歴</h1>
      {outfits.map((o, idx) => {
        const month = o.date.slice(0, 7)
        const showMonth = idx === 0 || outfits[idx - 1].date.slice(0, 7) !== month
        return (
          <div key={o.id} className="stack">
            {showMonth && <h2 className="month">{Number(month.slice(0, 4))}年{Number(month.slice(5))}月</h2>}
            <div className="card stack">
              <div className="row between">
                <strong>{formatDay(o.date)}</strong>
                <span className="muted small">
                  {o.weather.summary}　{Math.round(o.weather.max)}° / {Math.round(o.weather.min)}°　☔{o.weather.precip_prob}%
                </span>
              </div>
              <OutfitItems items={itemsOf(o, byId)} urls={urls} small />
              <Rating outfit={o} onChange={update} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function formatDay(date: string) {
  const d = new Date(date + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`
}
