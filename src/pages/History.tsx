import { useEffect, useState } from 'react'
import { itemsOf, OutfitItems, Rating } from '../components/Outfit'
import PageHeader from '../components/PageHeader'
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
      <div className="stack">
        <PageHeader title="Journal" sub="装いの記録" />
        <div className="card stack center empty">
          <p className="lead">まだ記録がありません</p>
          <p className="muted">「きょう」の画面で「この装いに決める」を押すと、ここに記録されます。</p>
        </div>
      </div>
    )

  const byId = new Map(items.map((i) => [i.id, i]))
  const update = (o: Outfit) => setOutfits(outfits.map((x) => (x.id === o.id ? o : x)))

  return (
    <div className="stack">
      <PageHeader title="Journal" sub={<>装いの記録<span className="count">{outfits.length}日</span></>} />
      {outfits.map((o, idx) => {
        const month = o.date.slice(0, 7)
        const showMonth = idx === 0 || outfits[idx - 1].date.slice(0, 7) !== month
        return (
          <div key={o.id} className="stack">
            {showMonth && (
              <h2 className="month">
                <span className="month-en">{MONTHS[Number(month.slice(5)) - 1]}</span> {month.slice(0, 4)}
              </h2>
            )}
            <div className="card stack journal-entry">
              <div className="journal-head">
                <Day date={o.date} />
                <div className="journal-weather">
                  <div>{o.weather.summary}</div>
                  <div className="muted small">
                    <span className="max">{Math.round(o.weather.max)}°</span> / <span className="min">{Math.round(o.weather.min)}°</span>　☔ {o.weather.precip_prob}%
                  </div>
                </div>
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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** 大きな日付の数字と曜日 */
function Day({ date }: { date: string }) {
  const d = new Date(date + 'T00:00:00')
  return (
    <div className="journal-day">
      <span className="day-num">{d.getDate()}</span>
      <span className="day-week">{'日月火水木金土'[d.getDay()]}曜日</span>
    </div>
  )
}
