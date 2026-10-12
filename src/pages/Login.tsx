import { useState, type FormEvent } from 'react'
import { signInWithCode } from '../lib/account'
import { callFunction } from '../lib/supabase'

type Mode = 'invite' | 'transfer'

export default function Login() {
  const [mode, setMode] = useState<Mode>('invite')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      if (mode === 'invite') {
        const { code } = await callFunction<{ code: string }>('join', { invite_code: input })
        await signInWithCode(code)
      } else {
        await signInWithCode(input)
      }
    } catch (err) {
      setMessage((err as Error).message)
    }
    setBusy(false)
  }

  function switchMode(m: Mode) {
    setMode(m)
    setInput('')
    setMessage('')
  }

  return (
    <div className="auth">
      <h1 className="logo">Today's Outfit</h1>
      <div className="ornament">✦</div>
      <p className="muted">
        {mode === 'invite' ? '教えてもらった招待コードを入れてください' : '設定画面でメモした引き継ぎコードを入れてください'}
      </p>
      <form onSubmit={onSubmit} className="stack">
        <input
          className="code-input"
          placeholder={mode === 'invite' ? '招待コード' : 'XXXX-XXXX-XXXX-XXXX'}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          required
        />
        <button className="primary" disabled={busy}>{busy ? '確認中…' : 'はじめる'}</button>
      </form>
      {message && <p className="notice">{message}</p>}
      {mode === 'invite' ? (
        <button className="link" onClick={() => switchMode('transfer')}>機種変更などで、前のデータを引き継ぐ</button>
      ) : (
        <button className="link" onClick={() => switchMode('invite')}>はじめて使う（招待コードを入れる）</button>
      )}
      <p className="muted small">iPhoneの方は、先にホーム画面に追加してから、そちらで始めてください。</p>
    </div>
  )
}
