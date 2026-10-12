import type { Body } from './body'
import { callFunction, shrinkImage, supabase } from './supabase'
import type { Item } from './types'

/** 参考画像として画像AIに渡す順番（見た目への影響が大きい服から、最大4枚） */
const REF_ORDER = ['outer', 'onepiece', 'tops', 'bottoms', 'shoes']
const AGE_EN: Record<string, string> = { '20代': 'in their 20s', '30代': 'in their 30s', '40代': 'in their 40s', '50代以上': 'in their 50s' }
const BUILD_EN = { slim: 'slim', regular: 'average', curvy: 'curvy', sturdy: 'sturdy' }

async function userId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

/** 前に作った写真風イメージがあれば、いちばん新しいものの表示用 URL */
export async function savedLookUrl(outfitId: string): Promise<string | null> {
  const uid = await userId()
  if (!uid) return null
  const { data: files } = await supabase.storage
    .from('clothes')
    .list(`${uid}/looks`, { search: outfitId, sortBy: { column: 'created_at', order: 'desc' }, limit: 1 })
  if (!files?.[0]) return null
  const { data } = await supabase.storage.from('clothes').createSignedUrl(`${uid}/looks/${files[0].name}`, 60 * 60)
  return data?.signedUrl ?? null
}

// ---- 本人の全身写真（着せ替え用）。非公開の置き場に1枚だけ保存する ----

const ownPath = (uid: string) => `${uid}/me/body.jpg`

export async function ownPhotoUrl(): Promise<string | null> {
  const uid = await userId()
  if (!uid) return null
  const { data: files } = await supabase.storage.from('clothes').list(`${uid}/me`, { search: 'body.jpg', limit: 1 })
  if (!files?.[0]) return null
  const { data } = await supabase.storage.from('clothes').createSignedUrl(ownPath(uid), 60 * 60)
  return data?.signedUrl ?? null
}

export async function saveOwnPhoto(file: File): Promise<string | null> {
  const uid = await userId()
  if (!uid) throw new Error('ログインが必要です')
  const blob = await shrinkImage(file, 1024)
  // 置き場の権限は追加と削除だけなので、消してから入れる
  await supabase.storage.from('clothes').remove([ownPath(uid)])
  const { error } = await supabase.storage.from('clothes').upload(ownPath(uid), blob, { contentType: 'image/jpeg' })
  if (error) throw new Error('写真を保存できませんでした: ' + error.message)
  return ownPhotoUrl()
}

export async function deleteOwnPhoto() {
  const uid = await userId()
  if (uid) await supabase.storage.from('clothes').remove([ownPath(uid)])
}

/**
 * 写真風イメージを作る（10〜30秒）。登録写真のある服は、縮小して参考画像として送る。
 * ownPhoto を渡すと、その人（本人の全身写真）に服を着せる。画像AIは4枚までなので、服は3枚まで
 */
export async function generateLook(
  outfitId: string,
  items: Item[],
  urls: Record<string, string>,
  body: Body,
  ownPhoto?: string,
): Promise<string> {
  const withPhoto = items
    .filter((i) => i.photo_path && urls[i.photo_path] && REF_ORDER.includes(i.category))
    .sort((a, b) => REF_ORDER.indexOf(a.category) - REF_ORDER.indexOf(b.category))
    .slice(0, ownPhoto ? 3 : 4)

  const refs: { id: string; blob: Blob }[] = []
  for (const item of withPhoto) {
    try {
      const original = await fetch(urls[item.photo_path!]).then((r) => r.blob())
      refs.push({ id: item.id, blob: await shrinkImage(original, 500) }) // 画像AIは 512px 未満しか受け付けない
    } catch {
      // 読めない写真は参考にしないだけ
    }
  }

  const form = new FormData()
  form.append('outfit_id', outfitId)
  form.append(
    'person',
    JSON.stringify({
      presentation: body.presentation,
      age: AGE_EN[body.age] ?? 'in their 30s',
      height: body.height,
      body: BUILD_EN[body.type],
    }),
  )
  form.append('ref_item_ids', JSON.stringify(refs.map((r) => r.id)))
  refs.forEach((r, i) => form.append(`ref_${i}`, r.blob, `ref${i}.jpg`))
  if (ownPhoto) {
    const original = await fetch(ownPhoto).then((r) => r.blob())
    const { width, height } = await createImageBitmap(original)
    // 本人らしさが残るよう、画像AIが受け付けるぎりぎりの大きさで送り、仕上がりも同じ縦横比にする
    form.append('person_photo', await shrinkImage(original, 508), 'person.jpg')
    form.append('person_aspect', String(width / height))
  }

  const { url } = await callFunction<{ url: string }>('generate-look', form)
  return url
}
