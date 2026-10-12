import { useCallback, useEffect, useState } from 'react'
import { itemsOf, OutfitItems, Rating } from '../components/Outfit'
import { addSamples } from '../lib/sample'
import { callFunction, signedUrls, supabase, today } from '../lib/supabase'
import type { Item, Outfit, Weather } from '../lib/types'

export default function Today({ onGoCloset }: { onGoCloset: () => void }) {
  const [outfit, setOutfit] = useState<Outfit | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<'loading' | 'thinking' | 'ready' | 'empty'>('loading')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  const suggest = useCallback(async () => {
    setStatus('thinking')
    setError('')
    try {
      setOutfit(await callFunction<Outfit>('suggest-outfit', { date: today() }))
    } catch (e) {
      setError((e as Error).message)
    }
    setStatus('ready')
  }, [])

  useEffect(() => {
    ;(async () => {
      const [{ data: itemRows }, { data: outfitRows }] = await Promise.all([
        supabase.from('items').select('*'),
        supabase.from('outfits').select('*').eq('date', today()).order('worn', { ascending: false }).order('created_at', { ascending: false }).limit(1),
      ])
      const all = (itemRows ?? []) as Item[]
      setItems(all)
      setUrls(await signedUrls(all.map((i) => i.photo_path ?? '')))
      if (all.length === 0) return setStatus('empty')
      if (outfitRows?.[0]) {
        setOutfit(outfitRows[0] as Outfit)
        setStatus('ready')
      } else {
        await suggest() // 朝はじめて開いたときは自動で提案する
      }
    })()
  }, [suggest, reload])

  async function trySamples() {
    setStatus('loading')
    try {
      await addSamples()
    } catch (e) {
      setError((e as Error).message)
    }
    setReload((n) => n + 1)
  }

  async function wear() {
    if (!outfit) return
    await supabase.from('outfits').update({ worn: false }).eq('date', outfit.date).neq('id', outfit.id)
    await supabase.from('outfits').update({ worn: true }).eq('id', outfit.id)
    setOutfit({ ...outfit, worn: true })
  }

  if (status === 'loading') return <div className="center muted">読み込み中…</div>
  if (status === 'empty')
    return (
      <div className="center stack">
        <p>まずは手持ちの服を登録しましょう。</p>
        <p className="muted">トップス・ボトムス・靴が数点ずつあると提案できます。</p>
        <button className="primary" onClick={onGoCloset}>クローゼットへ</button>
        <button onClick={trySamples}>サンプルの服で試してみる</button>
        <p className="muted small">サンプルはあとでクローゼットからまとめて消せます。</p>
        {error && <p className="notice">{error}</p>}
      </div>
    )

  const chosen = outfit ? itemsOf(outfit, new Map(items.map((i) => [i.id, i]))) : []

  return (
    <div className="stack">
      <div className="logo">Today's Outfit</div>
      <h1 className="date">{formatDate(today())}</h1>
      {outfit && <WeatherCard w={outfit.weather} />}

      {status === 'thinking' ? (
        <div className="card center muted">
          <div className="spinner" />
          今日の服を考えています…（30秒ほどかかることがあります）
        </div>
      ) : (
        outfit && (
          <div className="card stack">
            <OutfitItems items={chosen} urls={urls} />
            <p>{outfit.comment}</p>
            {outfit.tips && <p className="tips">💡 {outfit.tips}</p>}
            <Rating outfit={outfit} onChange={setOutfit} />
          </div>
        )
      )}

      {error && <p className="notice">{error}</p>}

      <div className="row">
        <button className="primary" onClick={wear} disabled={!outfit || outfit.worn || status === 'thinking'}>
          {outfit?.worn ? '✓ 今日はこれを着る' : 'これを着る'}
        </button>
        <button onClick={suggest} disabled={status === 'thinking'}>別の案</button>
      </div>
    </div>
  )
}

function WeatherCard({ w }: { w: Weather }) {
  return (
    <div className="card weather">
      <div className="weather-main">
        <div>
          <div className="muted small">{w.place}</div>
          <div className="big">{w.summary}</div>
        </div>
        <div className="temps">
          <span className="max">{Math.round(w.max)}°</span> / <span className="min">{Math.round(w.min)}°</span>
          <div className="muted small">体感 {Math.round(w.feels_min)}〜{Math.round(w.feels_max)}°</div>
        </div>
      </div>
      <div className="muted small">☔ {w.precip_prob}%　💨 {Math.round(w.wind_max)}m/s　☀️ UV {Math.round(w.uv_max)}</div>
      <div className="hourly">
        {w.hourly.map((h) => (
          <div key={h.hour}>
            <div className="muted small">{h.hour}時</div>
            <div>{Math.round(h.temp)}°</div>
            <div className="muted small">{h.precip_prob}%</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatDate(date: string) {
  const d = new Date(date + 'T00:00:00')
  return `${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）`
}
