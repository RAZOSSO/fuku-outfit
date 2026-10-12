import { useEffect, useRef, useState } from 'react'
import { deleteOwnPhoto, ownPhotoUrl, saveOwnPhoto } from '../lib/look'

/** 設定画面の「自分の全身写真」。写真風イメージで、提案の服を本人に着せるのに使う */
export default function OwnPhotoSettings() {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ownPhotoUrl().then(setUrl)
  }, [])

  async function onFile(file: File) {
    setBusy(true)
    setMessage('')
    try {
      setUrl(await saveOwnPhoto(file))
      setMessage('写真を登録しました')
    } catch (e) {
      setMessage((e as Error).message)
    }
    setBusy(false)
  }

  async function remove() {
    if (!confirm('登録した全身写真を削除しますか？')) return
    await deleteOwnPhoto()
    setUrl(null)
    setMessage('写真を削除しました')
  }

  return (
    <div className="card stack">
      <h2 className="section-title">自分の全身写真（着せ替え用）</h2>
      <p className="muted small">
        登録すると、写真風イメージで提案の服を<strong>あなた自身に着せた画像</strong>を作れます。
        頭から足先まで写った、正面向きで体の線がわかる服装の写真がきれいに仕上がります。写真の立ち姿・背景・構図はそのまま残り、服だけが入れ替わります。
      </p>
      {url === undefined ? (
        <p className="muted small">確認中…</p>
      ) : url ? (
        <div className="own-photo">
          <img src={url} alt="登録した全身写真" />
          <div className="stack">
            <button disabled={busy} onClick={() => input.current?.click()}>{busy ? '保存中…' : '撮り直す'}</button>
            <button className="danger" disabled={busy} onClick={remove}>削除</button>
          </div>
        </div>
      ) : (
        <button className="primary" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? '保存中…' : '📷 全身写真を登録する'}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onFile(f)
        }}
      />
      <p className="muted small">
        写真は非公開の置き場に保存され、本人しか見られません。画像を作るときだけ、画像AI（Cloudflare）に送られます。
      </p>
      {message && <p className="notice">{message}</p>}
    </div>
  )
}
