import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

const DEFAULT: Profile = { place_name: '東京', latitude: 35.6895, longitude: 139.6917, style_notes: '' }

type Place = { name: string; admin1?: string; latitude: number; longitude: number }

export default function Settings() {
  const [profile, setProfile] = useState<Profile>(DEFAULT)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    supabase.from('profiles').select('place_name, latitude, longitude, style_notes').maybeSingle()
      .then(({ data }) => data && setProfile(data))
  }, [])

  async function search() {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=ja`)
    const json = await res.json()
    setResults(json.results ?? [])
    if (!json.results) setMessage('見つかりませんでした。市区町村名で試してください')
  }

  function useCurrentLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => setProfile({ ...profile, place_name: '現在地', latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => setMessage('位置情報を取得できませんでした'),
    )
  }

  async function save() {
    const { data: auth } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('profiles')
      .upsert({ ...profile, user_id: auth.user!.id, updated_at: new Date().toISOString() })
    setMessage(error ? '保存できませんでした: ' + error.message : '保存しました')
  }

  return (
    <div className="stack">
      <h1>設定</h1>

      <div className="card stack">
        <div>天気を見る地域：<strong>{profile.place_name}</strong></div>
        <div className="row">
          <input placeholder="市区町村名（例：横浜）" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button onClick={search} disabled={!query}>検索</button>
        </div>
        {results.map((p) => (
          <button
            key={`${p.latitude},${p.longitude}`}
            className="list-item"
            onClick={() => {
              setProfile({ ...profile, place_name: p.name, latitude: p.latitude, longitude: p.longitude })
              setResults([])
            }}
          >
            {p.name} <span className="muted small">{p.admin1}</span>
          </button>
        ))}
        <button onClick={useCurrentLocation}>📍 現在地を使う</button>
      </div>

      <div className="card stack">
        <label>
          好み・ふだんの予定（AIへのメモ）
          <textarea
            rows={4}
            placeholder="例：平日はオフィスカジュアル。寒がり。自転車通勤なのでスカートは避けたい。"
            value={profile.style_notes}
            onChange={(e) => setProfile({ ...profile, style_notes: e.target.value })}
          />
        </label>
      </div>

      <button className="primary" onClick={save}>保存</button>
      {message && <p className="notice">{message}</p>}

      <button className="link" onClick={() => supabase.auth.signOut()}>ログアウト</button>
    </div>
  )
}
