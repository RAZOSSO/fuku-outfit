import type { ReactNode } from 'react'

/** 各画面の見出し。筆記体の英字タイトル、飾り罫、明朝の小見出し */
export default function PageHeader({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="logo">{title}</div>
      <div className="ornament">✦</div>
      {sub && <h1 className="page-sub">{sub}</h1>}
    </header>
  )
}
