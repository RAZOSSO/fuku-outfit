import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Closet from './pages/Closet'
import History from './pages/History'
import Login from './pages/Login'
import Settings from './pages/Settings'
import Today from './pages/Today'

type Tab = 'today' | 'closet' | 'history' | 'settings'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [tab, setTab] = useState<Tab>('today')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="center muted">読み込み中…</div>
  if (!session) return <Login />

  return (
    <div className="app">
      <main className="content">
        {tab === 'today' && <Today onGoCloset={() => setTab('closet')} />}
        {tab === 'closet' && <Closet />}
        {tab === 'history' && <History />}
        {tab === 'settings' && <Settings user={session.user} />}
      </main>
      <nav className="tabbar">
        <button className={tab === 'today' ? 'active' : ''} onClick={() => setTab('today')}>
          <span>☀️</span>きょう
        </button>
        <button className={tab === 'closet' ? 'active' : ''} onClick={() => setTab('closet')}>
          <span>👕</span>クローゼット
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          <span>📅</span>履歴
        </button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
          <span>⚙️</span>設定
        </button>
      </nav>
    </div>
  )
}
