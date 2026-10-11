import { useEffect, useState } from 'react'
import { currentSubscription, disablePush, enablePush, pushSupported, savedPushTime, updatePushTime } from '../lib/push'

/** 設定画面の「毎朝の通知」 */
export default function PushSettings() {
  const [sub, setSub] = useState<PushSubscription | null | undefined>(undefined)
  const [time, setTime] = useState('07:00')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    ;(async () => {
      const s = await currentSubscription()
      const saved = s ? await savedPushTime(s) : null
      if (saved) setTime(saved)
      setSub(saved ? s : null) // サーバーに登録が残っていない端末はオフ扱い
    })()
  }, [])

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true)
    setMessage('')
    try {
      await action()
      setSub(await currentSubscription())
      setMessage(done)
    } catch (e) {
      setMessage((e as Error).message)
    }
    setBusy(false)
  }

  return (
    <div className="card stack">
      <div><strong>毎朝の通知</strong></div>
      {!pushSupported() ? (
        <p className="muted small">
          この画面では通知を使えません。iPhone はホーム画面に追加したアプリから開くと設定できます（iOS 16.4 以降）。
        </p>
      ) : sub === undefined ? (
        <p className="muted small">確認中…</p>
      ) : (
        <>
          <p className="muted small">決めた時刻に、天気に合わせた今日の服を用意して通知します。アプリを開くとすぐに見られます。</p>
          <label className="row between">
            通知する時刻
            <input
              type="time"
              className="time-input"
              value={time}
              onChange={(e) => {
                setTime(e.target.value)
                if (sub && e.target.value) updatePushTime(sub, e.target.value).then(() => setMessage('時刻を変更しました'))
              }}
            />
          </label>
          {sub ? (
            <button disabled={busy} onClick={() => run(() => disablePush(sub), '通知をオフにしました')}>通知をオフにする</button>
          ) : (
            <button className="primary" disabled={busy} onClick={() => run(() => enablePush(time), '通知をオンにしました')}>
              通知をオンにする
            </button>
          )}
        </>
      )}
      {message && <p className="notice">{message}</p>}
    </div>
  )
}
