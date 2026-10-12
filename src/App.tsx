import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Closet from './pages/Closet'
import History from './pages/History'
import Login from './pages/Login'
import Settings from './pages/Settings'
import Today from './pages/Today'

type Tab = 'today' | 'closet' | 'history' | 'settings'

/** タブの細線アイコン（色は CSS の currentColor） */
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'today',
    label: 'きょう',
    icon: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></>,
  },
  {
    id: 'closet',
    label: 'クローゼット',
    icon: <path d="M12 6.5a2 2 0 1 1 2-2c0 1.2-2 1.6-2 3.2v.8M12 8.5 2.8 15.4a1 1 0 0 0 .6 1.8h17.2a1 1 0 0 0 .6-1.8L12 8.5" />,
  },
  {
    id: 'history',
    label: '履歴',
    icon: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>,
  },
  {
    id: 'settings',
    label: '設定',
    icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  },
]

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
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{t.icon}</svg>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
