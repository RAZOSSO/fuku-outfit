import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Closet from './pages/Closet'
import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import Settings from './pages/Settings'
import Today from './pages/Today'

type Tab = 'today' | 'closet' | 'settings'

// 招待メール・パスワード再設定メールのリンクから来たときは URL に type=invite / recovery が付く
const cameFromEmailLink = /type=(invite|recovery)/.test(window.location.hash)

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [needsPassword, setNeedsPassword] = useState(cameFromEmailLink)
  const [tab, setTab] = useState<Tab>('today')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="center muted">読み込み中…</div>
  if (!session) return <Login />
  if (needsPassword) return <SetPassword onDone={() => setNeedsPassword(false)} />

  return (
    <div className="app">
      <main className="content">
        {tab === 'today' && <Today onGoCloset={() => setTab('closet')} />}
        {tab === 'closet' && <Closet />}
        {tab === 'settings' && <Settings />}
      </main>
      <nav className="tabbar">
        <button className={tab === 'today' ? 'active' : ''} onClick={() => setTab('today')}>
          <span>☀️</span>きょう
        </button>
        <button className={tab === 'closet' ? 'active' : ''} onClick={() => setTab('closet')}>
          <span>👕</span>クローゼット
        </button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
          <span>⚙️</span>設定
        </button>
      </nav>
    </div>
  )
}
