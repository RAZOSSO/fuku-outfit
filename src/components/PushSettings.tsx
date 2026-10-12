import { useEffect, useState } from 'react'
import { currentSubscription, disablePush, enablePush, pushSupported, savedPushTimes, updateEveningTime, updatePushTime } from '../lib/push'

/** 設定画面の「毎朝の通知」 */
export default function PushSettings() {
  const [sub, setSub] = useState<PushSubscription | null | undefined>(undefined)
  const [time, setTime] = useState('07:00')
  const [evening, setEvening] = useState<string | null>(null) // 前の晩の通知の時刻（null ならなし）
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    ;(async () => {
      const s = await currentSubscription()
      const saved = s ? await savedPushTimes(s) : null
      if (saved) {
        setTime(saved.morning)
        setEvening(saved.evening)
      }
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
      <h2 className="section-title">毎朝の通知</h2>
      {!pushSupported() ? (
        <p className="muted small">
          この画面では通知を使えません。iPhone はホーム画面に追加したアプリから開くと設定できます（iOS 16.4 以降）。
        </p>
      ) : sub === undefined ? (
        <p className="muted small">確認中…</p>
      ) : (
        <>
          <p className="muted small">決めた時刻に、天気に合わせた今日の服を用意して通知します。アプリを開くとすぐに見られます。前の晩に、明日の服を知らせることもできます。</p>
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
          {sub && (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={evening !== null}
                  onChange={(e) => {
                    const next = e.target.checked ? '21:00' : null
                    run(async () => {
                      await updateEveningTime(sub, next)
                      setEvening(next)
                    }, next ? '前の晩にも明日の服を通知します' : '前の晩の通知をやめました')
                  }}
                />
                前の晩にも、明日の服を通知する
              </label>
              {evening !== null && (
                <label className="row between">
                  前の晩の時刻
                  <input
                    type="time"
                    className="time-input"
                    value={evening}
                    onChange={(e) => {
                      const v = e.target.value
                      setEvening(v)
                      if (v) updateEveningTime(sub, v).then(() => setMessage('前の晩の時刻を変更しました'), (err) => setMessage(err.message))
                    }}
                  />
                </label>
              )}
            </>
          )}
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
