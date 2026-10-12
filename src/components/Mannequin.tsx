import { useId, type ReactNode } from 'react'
import { colorsOf, patternOf, type Body } from '../lib/body'
import type { Item } from '../lib/types'

/*
 * 身長・体型に合わせたマネキンに、選んだ服を色と形で重ねたスタイル画。
 * 服の形は名前（「半袖」「ワイド」「ロングコート」など）と暖かさから決める。
 * 座標は viewBox 200×430 の中で、頭の上 y=12 から床 y=412 までが身長。
 */

const TOP = 12
const H = 400
const CX = 100
const OUTLINE = 'var(--garment-outline)' // 暗い配色では明るい線にして黒い服も見えるようにする（index.css）

type Geo = ReturnType<typeof geometry>

function geometry(body: Body) {
  // 背が高いほど頭が小さく脚が長く見える（6.6〜7.8頭身）
  const heads = Math.min(7.8, Math.max(6.6, 6.4 + (body.height - 140) * 0.03))
  const chin = 1 / heads
  const BASE_CHIN = 1 / 7
  const y = (f: number) => TOP + H * (chin + ((f - BASE_CHIN) * (1 - chin)) / (1 - BASE_CHIN))
  const [u, l] = { slim: [0.9, 0.9], regular: [1, 1], curvy: [0.98, 1.14], sturdy: [1.15, 1.1] }[body.type]
  return {
    head: { cy: TOP + (H * chin) / 2, rx: H * chin * 0.37, ry: (H * chin) / 2 },
    neck: y(0.163),
    shoulder: y(0.185),
    armpit: y(0.255),
    waist: y(0.385),
    hip: y(0.465),
    crotch: y(0.505),
    knee: y(0.72),
    ankle: y(0.955),
    floor: TOP + H,
    sh: 32 * u,
    ch: 25 * u,
    wa: (body.type === 'curvy' ? 18.5 : 20) * u,
    hi: 27 * l,
    arm: 8.5 * u,
    kneeX: 11 * l,
    ankleX: 9.5,
  }
}

/** 左右の腕の通り道（肩 → 肘 → 手首） */
function armPoints(g: Geo, side: -1 | 1) {
  return [
    [CX + side * (g.sh - 3), g.shoulder + 5],
    [CX + side * (g.sh + 4), g.waist - 4],
    [CX + side * (g.sh + 2), g.crotch - 6],
  ] as const
}

/** 腕の途中まで（0〜1）の折れ線 */
function armPath(g: Geo, side: -1 | 1, upTo: number) {
  const [a, b, c] = armPoints(g, side)
  const lerp = (p: readonly number[], q: readonly number[], t: number) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
  const end = upTo <= 0.5 ? lerp(a, b, upTo * 2) : lerp(b, c, (upTo - 0.5) * 2)
  return upTo <= 0.5 ? `M${a[0]},${a[1]} L${end[0]},${end[1]}` : `M${a[0]},${a[1]} L${b[0]},${b[1]} L${end[0]},${end[1]}`
}

/** 脚の中心線上の x（膝から足首へ） */
const legX = (g: Geo, yy: number) => {
  if (yy <= g.knee) return g.kneeX
  return g.kneeX + ((g.ankleX - g.kneeX) * (yy - g.knee)) / (g.ankle - g.knee)
}

/** 胴体の形（肩から裾まで）。ease で体より少し大きくする */
function torso(g: Geo, ease: number, hemY: number, hemHalf: number, neckline: 'crew' | 'v' | 'shirt' = 'crew') {
  const n = 9
  const neckDip = neckline === 'v' ? 22 : 8
  return [
    `M${CX - n},${g.neck}`,
    `L${CX - g.sh * ease},${g.shoulder + 3}`,
    `L${CX - g.ch * ease},${g.armpit}`,
    `L${CX - Math.max(g.wa * ease, 15)},${g.waist}`,
    `L${CX - hemHalf},${hemY}`,
    `L${CX + hemHalf},${hemY}`,
    `L${CX + Math.max(g.wa * ease, 15)},${g.waist}`,
    `L${CX + g.ch * ease},${g.armpit}`,
    `L${CX + g.sh * ease},${g.shoulder + 3}`,
    `L${CX + n},${g.neck}`,
    neckline === 'v' ? `L${CX},${g.neck + neckDip}Z` : `Q${CX},${g.neck + neckDip} ${CX - n},${g.neck}Z`,
  ].join(' ')
}

/** 腰から hemY までの横幅（ヒップより下は脚に沿って細くなる） */
const hipHalfAt = (g: Geo, yy: number) => (yy <= g.hip ? g.wa + ((g.hi - g.wa) * (yy - g.waist)) / (g.hip - g.waist) : g.hi)

type Shape = { node: ReactNode; z: number }

export default function Mannequin({ items, body }: { items: Item[]; body: Body }) {
  const id = useId().replace(/:/g, '')
  const g = geometry(body)
  const defs: ReactNode[] = []

  /** 服の塗り。柄があれば SVG のパターンを作る */
  const fill = (item: Item) => {
    const text = `${item.color} ${item.name}`
    const [c1, c2 = c1 === '#f6f3ec' ? '#27395a' : '#f6f3ec'] = colorsOf(text)
    const p = patternOf(text)
    if (!p) return c1
    const pid = `${id}-${item.id}`
    defs.push(
      <pattern key={pid} id={pid} patternUnits="userSpaceOnUse" width="8" height="8">
        <rect width="8" height="8" fill={c1} />
        {p === 'border' && <rect y="5" width="8" height="3" fill={c2} />}
        {p === 'stripe' && <rect x="5" width="2" height="8" fill={c2} />}
        {p === 'check' && <path d="M0 0h4v8H0zM0 0h8v4H0z" fill={c2} fillOpacity="0.45" />}
        {p === 'dot' && <circle cx="4" cy="4" r="1.4" fill={c2} />}
      </pattern>,
    )
    return `url(#${pid})`
  }

  const shapes: Shape[] = []
  const tops = items.filter((i) => i.category === 'tops').sort((a, b) => a.warmth - b.warmth)

  for (const item of items) {
    const name = item.name + item.notes
    const f = fill(item)
    const common = { fill: f, stroke: OUTLINE, strokeWidth: 0.8, strokeLinejoin: 'round' as const }

    if (item.category === 'tops' || item.category === 'onepiece') {
      const layer = item.category === 'tops' ? tops.indexOf(item) : 0
      const ease = 1.04 + layer * 0.05 + (/ニット|セーター|スウェット|パーカー/.test(name) ? 0.04 : 0)
      const short = /半袖|Tシャツ|ノースリーブ|タンク|キャミ/.test(name) || (item.warmth <= 1 && !/長袖/.test(name))
      const sleeve = /ノースリーブ|タンク|キャミ/.test(name) ? 0 : short ? 0.32 : /七分|7分|五分|5分/.test(name) ? 0.7 : 0.97
      const neckline = /シャツ|ブラウス/.test(name) && !/Tシャツ/.test(name) ? 'shirt' : /Vネック|カーディガン/.test(name) ? 'v' : 'crew'
      const isDress = item.category === 'onepiece'
      const hemY = isDress
        ? /ミニ/.test(name) ? g.crotch + 22 : /ロング|マキシ/.test(name) ? g.ankle - 22 : g.knee + 12
        : g.hip + 8 + layer * 3
      const hemHalf = isDress ? hipHalfAt(g, g.hip) * ease + (hemY - g.hip) * 0.22 : g.hi * ease + 2
      shapes.push({
        z: isDress ? 30 : 30 + layer,
        node: (
          <g key={item.id}>
            {sleeve > 0 &&
              ([-1, 1] as const).map((s) => (
                <g key={s}>
                  <path d={armPath(g, s, sleeve)} stroke={OUTLINE} strokeWidth={g.arm + 6.6 + layer * 2} strokeLinecap="round" fill="none" />
                  <path d={armPath(g, s, sleeve)} stroke={f} strokeWidth={g.arm + 5 + layer * 2} strokeLinecap="round" fill="none" />
                </g>
              ))}
            <path d={torso(g, ease, hemY, hemHalf, neckline)} {...common} />
            {neckline === 'shirt' && (
              <path d={`M${CX - 9},${g.neck} L${CX - 3},${g.neck + 11} L${CX},${g.neck + 4} L${CX + 3},${g.neck + 11} L${CX + 9},${g.neck} M${CX},${g.neck + 11} V${hemY - 4}`} fill="none" stroke={OUTLINE} strokeWidth="0.9" />
            )}
            {/ニット|セーター/.test(name) && <path d={`M${CX - hemHalf + 2},${hemY - 4} H${CX + hemHalf - 2}`} stroke={OUTLINE} strokeWidth="0.8" strokeDasharray="1.5 1.5" />}
          </g>
        ),
      })
    } else if (item.category === 'bottoms') {
      const skirt = /スカート/.test(name)
      if (skirt) {
        const hemY = /ミニ/.test(name) ? g.crotch + 20 : /ロング|マキシ/.test(name) ? g.ankle - 18 : g.knee + 14
        const flare = /タイト|ペンシル/.test(name) ? 0.04 : /フレア|プリーツ|ギャザー/.test(name) ? 0.3 : 0.16
        const half = g.hi + 2 + (hemY - g.hip) * flare
        shapes.push({
          z: 20,
          node: <path key={item.id} d={`M${CX - g.wa - 1},${g.waist} L${CX - g.hi - 2},${g.hip} L${CX - half},${hemY} L${CX + half},${hemY} L${CX + g.hi + 2},${g.hip} L${CX + g.wa + 1},${g.waist}Z`} {...common} />,
        })
      } else {
        const shorts = /ショート|短パン|ハーフ/.test(name)
        const hemY = shorts ? g.crotch + (g.knee - g.crotch) * 0.45 : /クロップド|アンクル|9分|九分/.test(name) ? g.ankle - 12 : g.ankle + 2
        const wide = /ワイド|フレア|バギー|ガウチョ|スラックス/.test(name) ? (/スラックス/.test(name) ? 3 : 10) : /スキニー|スリム|テーパード/.test(name) ? -1 : 1.5
        const half = (shorts ? 12 : 6.5) + wide
        const cl = CX - legX(g, hemY)
        const cr = CX + legX(g, hemY)
        shapes.push({
          z: 20,
          node: (
            <path
              key={item.id}
              d={`M${CX - g.wa - 1},${g.waist} L${CX - g.hi - 2},${g.hip} L${cl - half},${hemY} L${Math.min(cl + half, CX - 1)},${hemY} L${CX},${g.crotch} L${Math.max(cr - half, CX + 1)},${hemY} L${cr + half},${hemY} L${CX + g.hi + 2},${g.hip} L${CX + g.wa + 1},${g.waist}Z`}
              {...common}
            />
          ),
        })
      }
    } else if (item.category === 'outer') {
      const long = /ロング|コート|トレンチ|チェスター/.test(name) && !/ショート/.test(name)
      const hemY = long ? g.knee + (/ロング|マキシ/.test(name) ? 30 : 6) : g.hip + 18
      const ease = /ダウン|ボア|ムートン/.test(name) ? 1.3 : 1.18
      const hemHalf = Math.max(g.hi * ease, hipHalfAt(g, g.hip) * ease) + (hemY - g.hip) * 0.1
      const gap = /カーディガン|ジャケット|コート|トレンチ|チェスター/.test(name) ? 6 : 0
      const panel = (s: -1 | 1) =>
        [
          `M${CX + s * 9},${g.neck - 1}`,
          `L${CX + s * g.sh * ease},${g.shoulder + 2}`,
          `L${CX + s * g.ch * ease},${g.armpit}`,
          `L${CX + s * Math.max(g.wa * ease, 17)},${g.waist}`,
          `L${CX + s * hemHalf},${hemY}`,
          `L${CX + s * gap},${hemY}`,
          `L${CX + s * gap},${g.armpit + 6}`,
          gap ? `L${CX + s * 4},${g.neck + 8}Z` : `L${CX},${g.neck + 6}Z`,
        ].join(' ')
      shapes.push({
        z: 50,
        node: (
          <g key={item.id}>
            {([-1, 1] as const).map((s) => (
              <g key={s}>
                <path d={armPath(g, s, 1)} stroke={OUTLINE} strokeWidth={g.arm + 11.6} strokeLinecap="round" fill="none" />
                <path d={armPath(g, s, 1)} stroke={f} strokeWidth={g.arm + 10} strokeLinecap="round" fill="none" />
                <path d={panel(s)} {...common} />
              </g>
            ))}
            {/トレンチ/.test(name) && <path d={`M${CX - Math.max(g.wa * ease, 17)},${g.waist} H${CX + Math.max(g.wa * ease, 17)}`} stroke={OUTLINE} strokeWidth="2" />}
            {/ダウン/.test(name) &&
              [0.25, 0.45, 0.65, 0.85].map((t) => {
                const yy = g.armpit + (hemY - g.armpit) * t
                return <path key={t} d={`M${CX - hemHalf + 3},${yy} H${CX + hemHalf - 3}`} stroke={OUTLINE} strokeWidth="0.8" />
              })}
          </g>
        ),
      })
    } else if (item.category === 'shoes') {
      const boots = /ブーツ/.test(name)
      shapes.push({
        z: 25,
        node: (
          <g key={item.id}>
            {([-1, 1] as const).map((s) => {
              const c = CX + s * g.ankleX
              return (
                <g key={s}>
                  {boots && <rect x={c - 6} y={g.ankle - (/ロング/.test(name) ? 70 : 26)} width="12" height={g.floor - g.ankle + (/ロング/.test(name) ? 66 : 22)} rx="3" {...common} />}
                  <path d={`M${c - 6},${g.floor - 7} Q${c - 6},${g.ankle} ${c},${g.ankle} Q${c + 6},${g.ankle} ${c + 6 + s * 5},${g.floor - 5} Q${c + s * 10},${g.floor + 1} ${c},${g.floor} Q${c - 7},${g.floor} ${c - 6},${g.floor - 7}Z`} {...common} />
                </g>
              )
            })}
          </g>
        ),
      })
    } else if (item.category === 'accessory') {
      const [wristX, wristY] = armPoints(g, 1)[2]
      if (/マフラー|ストール|スカーフ|スヌード/.test(name)) {
        shapes.push({
          z: 60,
          node: (
            <g key={item.id}>
              <rect x={CX - 13} y={g.neck - 5} width="26" height="10" rx="5" {...common} />
              <rect x={CX + 2} y={g.neck + 2} width="9" height={g.armpit - g.neck + 26} rx="3" {...common} />
            </g>
          ),
        })
      } else if (/傘/.test(name)) {
        shapes.push({
          z: 60,
          node: (
            <g key={item.id}>
              <path d={`M${wristX + 6},${wristY - 2} V${g.floor - 4}`} stroke={OUTLINE} strokeWidth="1.4" />
              <path d={`M${wristX + 6},${wristY + 6} L${wristX + 11},${g.floor - 30} L${wristX + 6},${g.floor - 22} L${wristX + 1},${g.floor - 30}Z`} {...common} />
              <path d={`M${wristX + 6},${wristY - 2} q-6,0 -6,6`} fill="none" stroke={OUTLINE} strokeWidth="1.6" />
            </g>
          ),
        })
      } else if (/帽子|ハット|キャップ|ベレー|ニット帽/.test(name)) {
        const top = g.head.cy - g.head.ry
        shapes.push({
          z: 60,
          node: /キャップ|ニット帽|ベレー/.test(name) ? (
            <path key={item.id} d={`M${CX - g.head.rx - 2},${top + g.head.ry * 0.7} Q${CX},${top - 8} ${CX + g.head.rx + 2},${top + g.head.ry * 0.7}Z`} {...common} />
          ) : (
            <g key={item.id}>
              <ellipse cx={CX} cy={top + g.head.ry * 0.55} rx={g.head.rx * 1.9} ry="4" {...common} />
              <path d={`M${CX - g.head.rx},${top + g.head.ry * 0.55} Q${CX - g.head.rx},${top - 6} ${CX},${top - 6} Q${CX + g.head.rx},${top - 6} ${CX + g.head.rx},${top + g.head.ry * 0.55}Z`} {...common} />
            </g>
          ),
        })
      } else if (/バッグ|鞄|かばん|トート|ポーチ/.test(name)) {
        const [lx, ly] = armPoints(g, -1)[2]
        shapes.push({
          z: 60,
          node: (
            <g key={item.id}>
              <path d={`M${lx - 7},${ly + 4} Q${lx},${ly - 10} ${lx + 7},${ly + 4}`} fill="none" stroke={OUTLINE} strokeWidth="1.6" />
              <rect x={lx - 12} y={ly + 4} width="24" height="22" rx="3" {...common} />
            </g>
          ),
        })
      } else if (/ベルト/.test(name)) {
        shapes.push({ z: 40, node: <rect key={item.id} x={CX - g.wa - 2} y={g.waist - 2} width={(g.wa + 2) * 2} height="4" {...common} /> })
      }
    }
  }

  shapes.sort((a, b) => a.z - b.z)

  return (
    <svg className="mannequin-svg" viewBox="0 0 200 430" role="img" aria-label={`身長${body.height}cmのマネキンに今日の服を重ねたイラスト`}>
      <defs>
        {defs}
        <linearGradient id={`${id}-skin`} x1="0" x2="1">
          <stop offset="0" stopColor="var(--mannequin-1)" />
          <stop offset="1" stopColor="var(--mannequin-2)" />
        </linearGradient>
      </defs>

      {/* 床の影 */}
      <ellipse cx={CX} cy={g.floor + 3} rx="38" ry="4" fill="var(--gold)" opacity="0.18" />

      {/* マネキン */}
      <g fill={`url(#${id}-skin)`} stroke="var(--gold)" strokeWidth="0.7" strokeOpacity="0.6">
        {/* 腕は細長い線なので、線の色にグラデーションを使うと消えてしまう。単色で縁取りして描く */}
        {([-1, 1] as const).map((s) => (
          <g key={s} fill="none" strokeLinecap="round">
            <path d={armPath(g, s, 1)} stroke="var(--gold)" strokeOpacity="0.55" strokeWidth={g.arm + 1.4} />
            <path d={armPath(g, s, 1)} stroke="var(--mannequin-2)" strokeWidth={g.arm} />
          </g>
        ))}
        <path d={`M${CX - g.wa},${g.waist} L${CX - g.hi},${g.hip} L${CX - g.kneeX - 6.5},${g.knee} L${CX - g.ankleX - 4},${g.ankle} L${CX - g.ankleX + 4},${g.ankle} L${CX - g.kneeX + 6},${g.knee} L${CX - 1.5},${g.crotch} L${CX + 1.5},${g.crotch} L${CX + g.kneeX - 6},${g.knee} L${CX + g.ankleX - 4},${g.ankle} L${CX + g.ankleX + 4},${g.ankle} L${CX + g.kneeX + 6.5},${g.knee} L${CX + g.hi},${g.hip} L${CX + g.wa},${g.waist}Z`} />
        <ellipse cx={CX - g.ankleX} cy={g.floor - 4} rx="5" ry="4" />
        <ellipse cx={CX + g.ankleX} cy={g.floor - 4} rx="5" ry="4" />
        <path d={torso(g, 1, g.waist + 2, g.wa)} />
        <rect x={CX - 5.5} y={g.head.cy + g.head.ry - 4} width="11" height={g.neck - (g.head.cy + g.head.ry) + 8} rx="3" />
        <ellipse cx={CX} cy={g.head.cy} rx={g.head.rx} ry={g.head.ry} />
      </g>

      {shapes.map((s) => s.node)}

      {/* 手は袖より手前に描く */}
      {([-1, 1] as const).map((s) => {
        const [x, yy] = armPoints(g, s)[2]
        return <ellipse key={s} cx={x} cy={yy + 5} rx={g.arm * 0.48} ry={g.arm * 0.7} fill="var(--mannequin-1)" stroke="var(--gold)" strokeOpacity="0.6" strokeWidth="0.7" />
      })}
    </svg>
  )
}
