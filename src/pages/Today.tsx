import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import Celebration from '../components/Celebration'
import PageHeader from '../components/PageHeader'
import { itemsOf, OutfitItems, Rating } from '../components/Outfit'
import { loadBody } from '../lib/body'
import { generateLook, ownPhotoUrl, savedLookUrl } from '../lib/look'
import { addSamples } from '../lib/sample'
import { callFunction, signedUrls, supabase, today } from '../lib/supabase'
import type { Item, Outfit, Weather } from '../lib/types'

type Day = 'today' | 'tomorrow'

export default function Today({ onGoCloset }: { onGoCloset: () => void }) {
  const [day, setDay] = useState<Day>('today')
  const [outfit, setOutfit] = useState<Outfit | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<'loading' | 'thinking' | 'ready' | 'empty'>('loading')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [plans, setPlans] = useState<Record<Day, string>>({ today: '', tomorrow: '' })
  const [celebrate, setCelebrate] = useState<{ x: number; y: number } | null>(null)
  const endCelebration = useCallback(() => setCelebrate(null), [])

  const date = today(day === 'today' ? 0 : 1)
  const dayLabel = day === 'today' ? '今日' : '明日'
  const plan = plans[day]

  const suggest = useCallback(async (planText = '') => {
    setStatus('thinking')
    setError('')
    try {
      setOutfit(await callFunction<Outfit>('suggest-outfit', { date, plan: planText }))
    } catch (e) {
      setError((e as Error).message)
    }
    setStatus('ready')
  }, [date])

  useEffect(() => {
    ;(async () => {
      setStatus('loading')
      setOutfit(null)
      const [{ data: itemRows }, { data: outfitRows }] = await Promise.all([
        supabase.from('items').select('*'),
        supabase.from('outfits').select('*').eq('date', date).order('worn', { ascending: false }).order('created_at', { ascending: false }).limit(1),
      ])
      const all = (itemRows ?? []) as Item[]
      setItems(all)
      setUrls(await signedUrls(all.map((i) => i.photo_path ?? '')))
      if (all.length === 0) return setStatus('empty')
      if (outfitRows?.[0]) {
        setOutfit(outfitRows[0] as Outfit)
        setStatus('ready')
      } else {
        await suggest() // その日をはじめて開いたときは自動で提案する
      }
    })()
  }, [suggest, reload, date])

  async function trySamples() {
    setStatus('loading')
    try {
      await addSamples()
    } catch (e) {
      setError((e as Error).message)
    }
    setReload((n) => n + 1)
  }

  async function wear(e: MouseEvent<HTMLButtonElement>) {
    if (!outfit) return
    const r = e.currentTarget.getBoundingClientRect()
    setCelebrate({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    if (outfit.worn) return // 決定済みなら演出だけもう一度
    await supabase.from('outfits').update({ worn: false }).eq('date', outfit.date).neq('id', outfit.id)
    await supabase.from('outfits').update({ worn: true }).eq('id', outfit.id)
    setOutfit({ ...outfit, worn: true })
  }

  if (status === 'empty')
    return (
      <div className="stack">
        <PageHeader title="Welcome" sub="ようこそ" />
        <div className="card stack center empty">
          <p className="lead">まずは手持ちの服を登録しましょう</p>
          <p className="muted">トップス・ボトムス・靴が数点ずつあると提案できます。</p>
          <button className="primary" onClick={onGoCloset}>クローゼットへ</button>
          <button onClick={trySamples}>サンプルの服で試してみる</button>
          <p className="muted small">サンプルはあとでクローゼットからまとめて消せます。</p>
          {error && <p className="notice">{error}</p>}
        </div>
      </div>
    )

  const chosen = outfit ? itemsOf(outfit, new Map(items.map((i) => [i.id, i]))) : []
  const busy = status === 'loading' || status === 'thinking'

  return (
    <div className="stack">
      <PageHeader title={day === 'today' ? "Today's Outfit" : "Tomorrow's Outfit"} sub={formatDate(date)} />
      <div className="segmented" role="tablist">
        {(['today', 'tomorrow'] as const).map((d) => (
          <button key={d} role="tab" aria-selected={day === d} className={day === d ? 'active' : ''} onClick={() => setDay(d)} disabled={busy}>
            {d === 'today' ? '今日' : '明日'}
          </button>
        ))}
      </div>
      {outfit && status !== 'loading' && <WeatherCard w={outfit.weather} />}

      {status === 'loading' ? (
        <div className="center muted">読み込み中…</div>
      ) : status === 'thinking' ? (
        <div className="card center muted">
          <div className="spinner" />
          <div className="thinking-title">Styling…</div>
          {dayLabel}の装いを考えています（30秒ほどかかることがあります）
        </div>
      ) : (
        outfit && (
          <div key={outfit.id} className={outfit.worn ? 'card stack look reveal chosen' : 'card stack look reveal'}>
            <div className="look-label">{outfit.worn ? `✦ ${day === 'today' ? "Today's" : "Tomorrow's"} Choice ✦` : 'Suggestion'}</div>
            <LookFigure outfitId={outfit.id} items={chosen} urls={urls} />
            <OutfitItems items={chosen} urls={urls} />
            <p>{outfit.comment}</p>
            {outfit.tips && <p className="tips">💡 {outfit.tips}</p>}
            <Rating outfit={outfit} onChange={setOutfit} />
          </div>
        )
      )}

      {error && <p className="notice">{error}</p>}

      {celebrate && <Celebration origin={celebrate} onDone={endCelebration} />}

      <div className="row">
        <button className="primary" onClick={wear} disabled={!outfit || busy}>
          {outfit?.worn ? '✦ 決定済み' : 'この装いに決める'}
        </button>
        <button onClick={() => suggest(plan)} disabled={busy}>別の案</button>
      </div>

      <div className="card stack plan">
        <label>
          {dayLabel}の予定をひと言（任意）
          <input
            value={plan}
            maxLength={200}
            placeholder="例：午後から会議、夜は食事／自転車で移動"
            onChange={(e) => setPlans({ ...plans, [day]: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && plan.trim() && !busy && suggest(plan)}
            enterKeyHint="go"
          />
        </label>
        <button onClick={() => suggest(plan)} disabled={!plan.trim() || busy}>この予定に合わせて組み直す</button>
      </div>
    </div>
  )
}

/** 装いの写真風イメージ。ボタンを押したときだけ作る（前に作ってあれば表示する） */
function LookFigure({ outfitId, items, urls }: { outfitId: string; items: Item[]; urls: Record<string, string> }) {
  const [body] = useState(loadBody)
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [own, setOwn] = useState<string | null>(null)

  useEffect(() => {
    savedLookUrl(outfitId).then(setPhoto) // 前に作ってあれば、すぐ見られるようにしておく
    ownPhotoUrl().then(setOwn)
  }, [outfitId])

  /** wearMe: 登録した本人の全身写真に着せる */
  async function make(wearMe: boolean) {
    setBusy(true)
    setError('')
    try {
      setPhoto(await generateLook(outfitId, items, urls, body, wearMe && own ? own : undefined))
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  return (
    <div className="stack look-figure">
      {busy ? (
        <div className="look-photo-frame center muted">
          <div className="spinner" />
          <div className="thinking-title">Developing…</div>
          写真風のイメージを作っています（10〜30秒）
        </div>
      ) : photo ? (
        <figure className="look-photo-frame">
          <img className="look-photo" src={photo} alt="今日の服を着た人物の写真風イメージ" />
          <figcaption className="muted small">
            AIが作ったイメージです。服の細部は実物と違うことがあります。
          </figcaption>
          <div className="row">
            {own && <button onClick={() => make(true)}>✦ 自分に着せる</button>}
            <button onClick={() => make(false)}>{own ? 'モデルで作る' : '作り直す'}</button>
          </div>
        </figure>
      ) : (
        <div className="look-photo-frame center stack">
          <p className="muted small">提案された服を着た人物の写真風イメージを、AIが作ります。写真を登録した服は、その写真を参考にします。</p>
          {own ? (
            <>
              <button className="primary" onClick={() => make(true)}>✦ 自分に着せる</button>
              <button onClick={() => make(false)}>モデルで作る</button>
            </>
          ) : (
            <button className="primary" onClick={() => make(false)}>✦ 写真風のイメージを作る</button>
          )}
          <p className="muted small">
            {own ? '1日6枚まで（自分に着せるのは3枚まで）・自分の写真は設定で撮り直せます' : '1日6枚まで・設定で自分の全身写真を登録すると、自分に着せられます'}
          </p>
        </div>
      )}
      {error && <p className="notice">{error}</p>}
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
