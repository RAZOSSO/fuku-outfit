import { useEffect, useRef, useState } from 'react'
import { callFunction, shrinkImage, signedUrls, supabase } from '../lib/supabase'
import { CATEGORIES, type Category, type Item, type ItemDraft } from '../lib/types'

type Editing = { id?: string; draft: ItemDraft; previewUrl?: string }

export default function Closet() {
  const [items, setItems] = useState<Item[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<Category | 'all'>('all')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  async function load() {
    const { data } = await supabase.from('items').select('*').order('created_at', { ascending: false })
    const all = (data ?? []) as Item[]
    setItems(all)
    setUrls(await signedUrls(all.map((i) => i.photo_path ?? '')))
  }

  useEffect(() => {
    load()
  }, [])

  async function onPhoto(file: File) {
    setError('')
    setBusy('写真をアップロード中…')
    try {
      const { data: auth } = await supabase.auth.getUser()
      const blob = await shrinkImage(file)
      const path = `${auth.user!.id}/${crypto.randomUUID()}.jpg`
      const { error: upErr } = await supabase.storage.from('clothes').upload(path, blob, { contentType: 'image/jpeg' })
      if (upErr) throw upErr
      setBusy('AIが服を見ています…')
      const guess = await callFunction<Omit<ItemDraft, 'photo_path'>>('analyze-item', { photo_path: path })
      setEditing({ draft: { ...guess, photo_path: path }, previewUrl: URL.createObjectURL(blob) })
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy('')
  }

  async function save(e: Editing) {
    const { error: err } = e.id
      ? await supabase.from('items').update(e.draft).eq('id', e.id)
      : await supabase.from('items').insert(e.draft)
    if (err) return setError('保存できませんでした: ' + err.message)
    setEditing(null)
    load()
  }

  async function cancel(e: Editing) {
    // 新規登録をやめたときは、アップロード済みの写真も消す
    if (!e.id && e.draft.photo_path) await supabase.storage.from('clothes').remove([e.draft.photo_path])
    setEditing(null)
  }

  async function remove(e: Editing) {
    if (!e.id || !confirm(`「${e.draft.name}」を削除しますか？`)) return
    await supabase.from('items').delete().eq('id', e.id)
    if (e.draft.photo_path) await supabase.storage.from('clothes').remove([e.draft.photo_path])
    setEditing(null)
    load()
  }

  if (editing)
    return (
      <ItemForm
        editing={editing}
        imageUrl={editing.previewUrl ?? urls[editing.draft.photo_path ?? '']}
        onChange={(draft) => setEditing({ ...editing, draft })}
        onSave={() => save(editing)}
        onCancel={() => cancel(editing)}
        onDelete={editing.id ? () => remove(editing) : undefined}
      />
    )

  const shown = filter === 'all' ? items : items.filter((i) => i.category === filter)

  return (
    <div className="stack">
      <div className="row between">
        <h1>クローゼット <span className="muted small">{items.length}点</span></h1>
        <button className="primary" onClick={() => fileInput.current?.click()} disabled={!!busy}>＋ 写真で追加</button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onPhoto(f)
        }}
      />
      {busy && (
        <div className="card center muted">
          <div className="spinner" />
          {busy}
        </div>
      )}
      {error && <p className="notice">{error}</p>}

      <div className="chips">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>すべて</button>
        {(Object.keys(CATEGORIES) as Category[]).map((c) => (
          <button key={c} className={filter === c ? 'active' : ''} onClick={() => setFilter(c)}>{CATEGORIES[c]}</button>
        ))}
      </div>

      <div className="item-grid">
        {shown.map((i) => (
          <button key={i.id} className="item" onClick={() => setEditing({ id: i.id, draft: toDraft(i) })}>
            {i.photo_path && urls[i.photo_path] ? <img src={urls[i.photo_path]} alt={i.name} /> : <div className="noimg">{CATEGORIES[i.category]}</div>}
            <span>{i.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** 編集できる項目だけを取り出す（user_id などを update に混ぜない） */
function toDraft(i: Item): ItemDraft {
  const { name, category, color, material, warmth, rain_ok, formality, notes, photo_path } = i
  return { name, category, color, material, warmth, rain_ok, formality, notes, photo_path }
}

function ItemForm(props: {
  editing: Editing
  imageUrl?: string
  onChange: (d: ItemDraft) => void
  onSave: () => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const d = props.editing.draft
  const set = <K extends keyof ItemDraft>(k: K, v: ItemDraft[K]) => props.onChange({ ...d, [k]: v })

  return (
    <div className="stack">
      <h1>{props.editing.id ? '服を編集' : 'AIの判定を確認'}</h1>
      {props.imageUrl && <img className="preview" src={props.imageUrl} alt="" />}
      {!props.editing.id && <p className="muted small">違うところがあれば直してから保存してください。</p>}

      <label>名前<input value={d.name} onChange={(e) => set('name', e.target.value)} /></label>
      <label>
        種類
        <select value={d.category} onChange={(e) => set('category', e.target.value as Category)}>
          {(Object.keys(CATEGORIES) as Category[]).map((c) => <option key={c} value={c}>{CATEGORIES[c]}</option>)}
        </select>
      </label>
      <div className="row">
        <label>色<input value={d.color} onChange={(e) => set('color', e.target.value)} /></label>
        <label>素材<input value={d.material} onChange={(e) => set('material', e.target.value)} /></label>
      </div>
      <Scale label="暖かさ" low="真夏" high="真冬" value={d.warmth} onChange={(v) => set('warmth', v)} />
      <Scale label="きちんと度" low="部屋着" high="フォーマル" value={d.formality} onChange={(v) => set('formality', v)} />
      <label className="check">
        <input type="checkbox" checked={d.rain_ok} onChange={(e) => set('rain_ok', e.target.checked)} />
        雨の日でもOK
      </label>
      <label>メモ<textarea rows={2} value={d.notes} onChange={(e) => set('notes', e.target.value)} /></label>

      <div className="row">
        <button className="primary" onClick={props.onSave} disabled={!d.name}>保存</button>
        <button onClick={props.onCancel}>やめる</button>
      </div>
      {props.onDelete && <button className="danger" onClick={props.onDelete}>この服を削除</button>}
    </div>
  )
}

function Scale(props: { label: string; low: string; high: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div>{props.label}</div>
      <div className="scale">
        <span className="muted small">{props.low}</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={props.value === n ? 'active' : ''} onClick={() => props.onChange(n)}>{n}</button>
        ))}
        <span className="muted small">{props.high}</span>
      </div>
    </div>
  )
}
