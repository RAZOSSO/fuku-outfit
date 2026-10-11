import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage('メールアドレスかパスワードが違います')
    setBusy(false)
  }

  async function onForgot() {
    if (!email) return setMessage('メールアドレスを入れてから押してください')
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + import.meta.env.BASE_URL })
    setMessage('パスワード再設定のメールを送りました')
  }

  return (
    <div className="auth">
      <h1>きょうの服</h1>
      <p className="muted">招待されたメールアドレスでログインしてください</p>
      <form onSubmit={onSubmit} className="stack">
        <input type="email" placeholder="メールアドレス" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="パスワード" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="primary" disabled={busy}>{busy ? 'ログイン中…' : 'ログイン'}</button>
      </form>
      <button className="link" onClick={onForgot}>パスワードを忘れた</button>
      {message && <p className="notice">{message}</p>}
    </div>
  )
}
