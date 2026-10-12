import type { User } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import PushSettings from '../components/PushSettings'
import TransferCode from '../components/TransferCode'
import { searchPlaces, type Place } from '../lib/geocode'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

const DEFAULT: Profile = { place_name: '東京', latitude: 35.6895, longitude: 139.6917, style_notes: '' }

export default function Settings({ user }: { user: User }) {
  const [profile, setProfile] = useState<Profile>(DEFAULT)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [message, setMessage] = useState('')
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    supabase.from('profiles').select('place_name, latitude, longitude, style_notes').maybeSingle()
      .then(({ data }) => data && setProfile(data))
  }, [])

  async function search() {
    setMessage('')
    setSearching(true)
    try {
      const found = await searchPlaces(query)
      setResults(found)
      if (found.length === 0) setMessage('見つかりませんでした。「横浜」「渋谷区」「吉祥寺」のように入れてみてください')
    } catch {
      setMessage('検索できませんでした。通信状態を確認してください')
    }
    setSearching(false)
  }

  function useCurrentLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => setProfile({ ...profile, place_name: '現在地', latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => setMessage('位置情報を取得できませんでした'),
    )
  }

  async function save() {
    const { error } = await supabase
      .from('profiles')
      .upsert({ ...profile, user_id: user.id, updated_at: new Date().toISOString() })
    setMessage(error ? '保存できませんでした: ' + error.message : '保存しました')
  }

  return (
    <div className="stack">
      <h1>設定</h1>

      <div className="card stack">
        <div>天気を見る地域：<strong>{profile.place_name}</strong></div>
        <div className="row">
          <input
            placeholder="市区町村・町名（例：横浜、渋谷区、吉祥寺）"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && query.trim() && search()}
            enterKeyHint="search"
          />
          <button onClick={search} disabled={!query.trim() || searching}>{searching ? '検索中…' : '検索'}</button>
        </div>
        {results.map((p) => (
          <button
            key={`${p.latitude},${p.longitude}`}
            className="list-item"
            onClick={() => {
              setProfile({ ...profile, place_name: p.name, latitude: p.latitude, longitude: p.longitude })
              setResults([])
              setMessage('地域を選びました。下の「保存」を押すと反映されます')
            }}
          >
            {p.name} {p.detail && <span className="muted small">{p.detail}</span>}
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

      <PushSettings />

      <TransferCode user={user} />

      <button
        className="link"
        onClick={() => {
          if (confirm('この端末からログアウトします。戻るには引き継ぎコードが必要です。よろしいですか？')) supabase.auth.signOut()
        }}
      >
        この端末からログアウト
      </button>
    </div>
  )
}
