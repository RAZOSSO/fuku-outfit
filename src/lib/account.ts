import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

// 利用者のアカウントは「引き継ぎコード」がそのまま合い鍵になっている。
// メールアドレスは内部用（実際にメールは届かない）。規則は supabase/functions/join と同じ。
const EMAIL_PREFIX = 'fuku-user-'
const EMAIL_DOMAIN = '@example.com'

/** 入力のゆれ（小文字・空白・ハイフン）をそろえる */
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[\s-]/g, '')

/** 表示用に4文字ずつ区切る（ABCD-EFGH-JKLM-NPQR） */
export const formatCode = (code: string) => code.match(/.{1,4}/g)?.join('-') ?? code

/** ログイン中の利用者の引き継ぎコード（コード方式でないアカウントなら null） */
export function codeOf(user: User | null | undefined): string | null {
  const email = user?.email ?? ''
  if (!email.startsWith(EMAIL_PREFIX) || !email.endsWith(EMAIL_DOMAIN)) return null
  return email.slice(EMAIL_PREFIX.length, -EMAIL_DOMAIN.length).toUpperCase()
}

/** 引き継ぎコードでログインする */
export async function signInWithCode(input: string) {
  const code = normalizeCode(input)
  const { error } = await supabase.auth.signInWithPassword({
    email: `${EMAIL_PREFIX}${code.toLowerCase()}${EMAIL_DOMAIN}`,
    password: code,
  })
  if (error) {
    if (error.code === 'invalid_credentials') throw new Error('引き継ぎコードが違います')
    throw new Error(`ログインできませんでした（${error.code ?? error.status}: ${error.message}）`)
  }
}
