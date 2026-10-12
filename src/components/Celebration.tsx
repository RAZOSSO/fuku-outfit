import { useEffect, useRef } from 'react'

const GOLDS = ['#fff6d5', '#f3d98b', '#e2bd5f', '#c99a3b', '#ffffff']
const DURATION = 2600

type Spark = { x: number; y: number; vx: number; vy: number; size: number; color: string; spin: number; phase: number; delay: number }

/** 服装が決まったときの演出。金色の星屑が弾けて舞い落ち、筆記体のメッセージが浮かぶ */
export default function Celebration({ origin, onDone }: { origin?: { x: number; y: number }; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    navigator.vibrate?.([12, 40, 12])
    const timer = setTimeout(onDone, reduced ? 1400 : DURATION)
    if (reduced) return () => clearTimeout(timer)

    const c = canvas.current!
    const ctx = c.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = window.innerWidth
    const h = window.innerHeight
    c.width = w * dpr
    c.height = h * dpr
    ctx.scale(dpr, dpr)

    const ox = origin?.x ?? w / 2
    const oy = origin?.y ?? h * 0.6
    const pick = () => GOLDS[Math.floor(Math.random() * GOLDS.length)]
    const sparks: Spark[] = [
      // ボタンから弾ける星
      ...Array.from({ length: 70 }, () => {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4
        const speed = 4 + Math.random() * 9
        return { x: ox, y: oy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: 2 + Math.random() * 6, color: pick(), spin: Math.random() * 6, phase: Math.random() * 6, delay: 0 }
      }),
      // 上からゆっくり舞い落ちる金粉
      ...Array.from({ length: 60 }, () => ({
        x: Math.random() * w, y: -20 - Math.random() * h * 0.4, vx: (Math.random() - 0.5) * 0.6, vy: 1 + Math.random() * 2,
        size: 1 + Math.random() * 3.5, color: pick(), spin: Math.random() * 6, phase: Math.random() * 6, delay: 150 + Math.random() * 500,
      })),
    ]

    const start = performance.now()
    let frame = 0
    const draw = (now: number) => {
      const t = now - start
      ctx.clearRect(0, 0, w, h)
      const fade = Math.max(0, 1 - Math.max(0, t - DURATION * 0.55) / (DURATION * 0.45))
      for (const s of sparks) {
        if (t < s.delay) continue
        s.vy += 0.12 // 重力
        s.vx *= 0.985
        s.vy *= 0.985
        s.x += s.vx
        s.y += s.vy
        const twinkle = 0.55 + 0.45 * Math.sin(t / 90 + s.phase)
        ctx.globalAlpha = fade * twinkle
        star(ctx, s.x, s.y, s.size * (0.7 + 0.3 * twinkle), t / 400 + s.spin, s.color)
      }
      if (t < DURATION) frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [origin, onDone, reduced])

  return (
    <div className="celebration" onClick={onDone} aria-live="polite">
      {!reduced && <canvas ref={canvas} />}
      <div className="celebration-message">
        <div className="celebration-script">Have a lovely day</div>
        <div className="celebration-sub">今日の装いが決まりました</div>
      </div>
    </div>
  )
}

/** 光る4枚の光芒をもつ星 */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rotate: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotate)
  ctx.shadowColor = color
  ctx.shadowBlur = r * 2.5
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const len = i % 2 === 0 ? r * 2 : r * 0.45
    const a = (Math.PI / 4) * i
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
