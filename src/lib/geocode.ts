export type Place = { name: string; detail?: string; latitude: number; longitude: number }

const PREF = /^(北海道|東京都|大阪府|京都府|.{2,3}県)/
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 国内は国土地理院の住所検索、見つからなければ Open-Meteo（海外の都市名など）で探す */
export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim().replace(/\s+/g, '')
  if (!q) return []
  const domestic = await searchGsi(q).catch(() => [])
  if (domestic.length > 0) return domestic
  return searchOpenMeteo(q)
}

type GsiFeature = { geometry: { coordinates: [number, number] }; properties: { title: string; addressCode?: string } }

async function searchGsi(q: string): Promise<Place[]> {
  const [res, muni] = await Promise.all([
    fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`),
    loadMunicipalities(),
  ])
  if (!res.ok) throw new Error('検索に失敗しました')
  const features = (await res.json()) as GsiFeature[]

  // 「神奈川県横浜市」「愛知県名古屋市港区」「広島県安芸郡府中町」のような、検索語そのものの市区町村
  const head = `^${PREF.source.slice(1)}(.+?[郡市])?${escape(q)}`
  const withSuffix = new RegExp(`${head}([市区町村])$`) // 「横浜」→「神奈川県横浜市」
  const asTyped = new RegExp(`${head}$`) // 「横浜市」→「神奈川県横浜市」
  const rank = (name: string) => {
    if (name === q || name.match(PREF)?.[0] === name) return 0
    const m = name.match(withSuffix)
    if (m) return 1 + '市区町村'.indexOf(m[m.length - 1]) / 10
    if (/[市区町村]$/.test(q) && asTyped.test(name)) return 1.5
    if (PREF.test(name)) return 2
    return 3 // 山・駅・施設など
  }

  const places = new Map<string, Place & { rank: number; hits: number }>()
  for (const f of features) {
    const title = f.properties.title
    if (!title.includes(q)) continue // 「吉祥寺」で「吉」が出るような、あいまい一致は除く
    // 町名だけの結果（「吉祥寺南町三丁目」）には市区町村名を付け、丁目はまとめる
    const prefix = !PREF.test(title) && f.properties.addressCode ? muni.get(f.properties.addressCode) ?? '' : ''
    const chome = /[一二三四五六七八九十]+丁目$/
    const name = (prefix + title).replace(chome, '')
    const seen = places.get(name)
    if (seen && chome.test(title)) seen.hits++ // 丁目が多い＝大きな町。並べ替えに使う
    else places.set(name, { name, latitude: f.geometry.coordinates[1], longitude: f.geometry.coordinates[0], rank: rank(name), hits: 1 })
  }
  return [...places.values()]
    .sort((a, b) => a.rank - b.rank || b.hits - a.hits || a.name.length - b.name.length)
    .slice(0, 8)
    .map(({ name, latitude, longitude }) => ({ name, latitude, longitude }))
}

let muniCache: Promise<Map<string, string>> | undefined

/** 国土地理院の市区町村コード表（コード → 「東京都武蔵野市」） */
function loadMunicipalities(): Promise<Map<string, string>> {
  muniCache ??= fetch('https://maps.gsi.go.jp/js/muni.js')
    .then((res) => res.text())
    .then((text) => {
      const map = new Map<string, string>()
      for (const [, code, pref, city] of text.matchAll(/\["(\d+)"\] = '\d+,([^,]+),\d+,([^']+)'/g)) {
        map.set(code, pref + city.replace(/\s|　/g, ''))
      }
      return map
    })
    .catch(() => {
      muniCache = undefined // 次の検索でもう一度読む
      return new Map<string, string>()
    })
  return muniCache
}

async function searchOpenMeteo(q: string): Promise<Place[]> {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=ja`)
  if (!res.ok) throw new Error('検索に失敗しました')
  const json = (await res.json()) as { results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[] }
  return (json.results ?? []).map((r) => ({
    name: r.name,
    detail: [r.country, r.admin1].filter(Boolean).join(' '),
    latitude: r.latitude,
    longitude: r.longitude,
  }))
}
