import type { User } from '@supabase/supabase-js'
import { useState } from 'react'
import { codeOf, formatCode, signInWithCode } from '../lib/account'
import { callFunction } from '../lib/supabase'

/** 設定画面の「引き継ぎコード」。まだない人（メールで作った古いアカウント）はここで作れる */
export default function TransferCode({ user }: { user: User }) {
  const code = codeOf(user)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function issue() {
    if (code && !confirm('新しいコードを作ると、今のコードは使えなくなります。よろしいですか？')) return
    setBusy(true)
    setMessage('')
    try {
      const { code: next } = await callFunction<{ code: string }>('join', { action: 'issue' })
      await signInWithCode(next) // 新しいコードで入り直して、画面の表示を更新する
      setShow(true)
      setMessage('引き継ぎコードを作りました。スクショやメモで保管してください')
    } catch (e) {
      setMessage((e as Error).message)
    }
    setBusy(false)
  }

  return (
    <div className="card stack">
      <div><strong>引き継ぎコード</strong></div>
      <p className="muted small">
        機種変更やアプリを消したときに、このコードでデータを戻せます。スクショやメモで保管してください。
        人に教えると、あなたのクローゼットを見られてしまうので注意してください。
      </p>
      {!code ? (
        <button className="primary" disabled={busy} onClick={issue}>{busy ? '作成中…' : '引き継ぎコードを作る'}</button>
      ) : show ? (
        <>
          <div className="code-display">{formatCode(code)}</div>
          <button onClick={() => navigator.clipboard?.writeText(formatCode(code)).then(() => setMessage('コピーしました'))}>コピー</button>
        </>
      ) : (
        <button onClick={() => setShow(true)}>コードを表示</button>
      )}
      {code && (
        <button className="link" disabled={busy} onClick={issue}>コードを作り直す（人に知られたときなど）</button>
      )}
      {message && <p className="notice">{message}</p>}
    </div>
  )
}
