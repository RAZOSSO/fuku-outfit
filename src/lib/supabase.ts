import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

/** Edge Function を呼び、エラー時はサーバーのメッセージを投げる */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    // 関数がエラーを返したときだけ context が Response になる。通信自体の失敗では Error などが入る
    const ctx = (error as { context?: unknown }).context
    if (ctx instanceof Response) {
      const message = await ctx.json().then((j) => j.error).catch(() => null)
      throw new Error(message ?? `エラーが発生しました（${ctx.status}）`)
    }
    if (error.name === 'FunctionsFetchError')
      throw new Error('サーバーから返事がありませんでした。時間がかかりすぎたか、通信が切れた可能性があります。もう一度試してください')
    throw new Error(error.message)
  }
  return data as T
}

/** 端末のタイムゾーンでの今日の日付（YYYY-MM-DD） */
export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 非公開バケットの写真を表示用の署名付き URL に変換する */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))]
  if (unique.length === 0) return {}
  const { data } = await supabase.storage.from('clothes').createSignedUrls(unique, 60 * 60)
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]))
}

/** 写真を長辺 1024px の JPEG に縮小する（保存容量と AI の費用を抑える） */
export async function shrinkImage(file: File, maxSize = 1024): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を変換できませんでした'))), 'image/jpeg', 0.85),
  )
}
