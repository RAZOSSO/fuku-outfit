import { supabase } from './supabase'

// VAPID の公開鍵（公開してよい鍵。対になる秘密鍵は Supabase の Secrets にだけ置く）
const VAPID_PUBLIC_KEY = 'BN4V2vhV5ziRZhSDKOFVoURBMKeN38hJIQfoK7VJU3qzr46zAzg7oZI3BtksVJDrRkuHiaFcfzVkdBNXa3Pctlg'

/** この端末・ブラウザでプッシュ通知が使えるか（iPhone はホーム画面に追加したアプリのみ） */
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** この端末の通知登録（なければ null） */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** 通知を許可してもらい、この端末を登録する */
export async function enablePush(notifyTime: string) {
  if ((await Notification.requestPermission()) !== 'granted') {
    throw new Error('通知が許可されませんでした。端末の設定から、このアプリの通知を許可してください')
  }
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) }))
  const json = sub.toJSON()
  const { data: auth } = await supabase.auth.getUser()
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: sub.endpoint,
    user_id: auth.user!.id,
    p256dh: json.keys!.p256dh,
    auth: json.keys!.auth,
    notify_time: notifyTime,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })
  if (error) throw new Error('登録できませんでした: ' + error.message)
}

/** 通知の時刻だけ変える */
export async function updatePushTime(sub: PushSubscription, notifyTime: string) {
  await supabase.from('push_subscriptions').update({ notify_time: notifyTime }).eq('endpoint', sub.endpoint)
}

/** この端末の通知をやめる */
export async function disablePush(sub: PushSubscription) {
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/** 登録済みの通知時刻（HH:MM） */
export async function savedPushTime(sub: PushSubscription): Promise<string | null> {
  const { data } = await supabase.from('push_subscriptions').select('notify_time').eq('endpoint', sub.endpoint).maybeSingle()
  return data ? String(data.notify_time).slice(0, 5) : null
}

function base64UrlToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}
