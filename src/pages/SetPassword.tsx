import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

/** 招待メール（または再設定メール）から来た人がパスワードを決める画面 */
export default function SetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setMessage('8文字以上にしてください')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setMessage('設定できませんでした: ' + error.message)
    history.replaceState(null, '', window.location.pathname)
    onDone()
  }

  return (
    <div className="auth">
      <h1>パスワードを決める</h1>
      <p className="muted">次回からはこのパスワードでログインします。ホーム画面に追加したアプリからもこれでログインできます。</p>
      <form onSubmit={onSubmit} className="stack">
        <input type="password" placeholder="新しいパスワード（8文字以上）" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="primary" disabled={busy}>{busy ? '保存中…' : '保存してはじめる'}</button>
      </form>
      {message && <p className="notice">{message}</p>}
    </div>
  )
}
