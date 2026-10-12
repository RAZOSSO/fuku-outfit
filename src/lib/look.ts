import type { Body } from './body'
import { callFunction, shrinkImage, supabase } from './supabase'
import type { Item } from './types'

/** 参考画像として画像AIに渡す順番（見た目への影響が大きい服から、最大4枚） */
const REF_ORDER = ['outer', 'onepiece', 'tops', 'bottoms', 'shoes']
const AGE_EN: Record<string, string> = { '20代': 'in their 20s', '30代': 'in their 30s', '40代': 'in their 40s', '50代以上': 'in their 50s' }
const BUILD_EN = { slim: 'slim', regular: 'average', curvy: 'curvy', sturdy: 'sturdy' }

const lookPath = (userId: string, outfitId: string) => `${userId}/looks/${outfitId}.jpg`

/** 前に作った写真風イメージがあれば、その表示用 URL */
export async function savedLookUrl(outfitId: string): Promise<string | null> {
  const { data: session } = await supabase.auth.getSession()
  const userId = session.session?.user.id
  if (!userId) return null
  const { data } = await supabase.storage.from('clothes').createSignedUrl(lookPath(userId, outfitId), 60 * 60)
  return data?.signedUrl ?? null
}

/** 写真風イメージを作る（10〜30秒）。登録写真のある服は、縮小して参考画像として送る */
export async function generateLook(outfitId: string, items: Item[], urls: Record<string, string>, body: Body): Promise<string> {
  const withPhoto = items
    .filter((i) => i.photo_path && urls[i.photo_path] && REF_ORDER.includes(i.category))
    .sort((a, b) => REF_ORDER.indexOf(a.category) - REF_ORDER.indexOf(b.category))
    .slice(0, 4)

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

  const { url } = await callFunction<{ url: string }>('generate-look', form)
  return url
}
