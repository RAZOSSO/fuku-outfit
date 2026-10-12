// 引き継ぎコードがそのまま合い鍵になるアカウントを扱う。利用者はメールもパスワードも決めなくてよい。
//  - { invite_code }      … 招待コードを確認して新しいアカウントを作り、引き継ぎコードを返す（ログイン前）
//  - { action: "issue" }  … ログイン中の人の引き継ぎコードを新しく作る（データはそのまま。古いコードは使えなくなる）
// ※ ログイン前に呼ばれるので「Verify JWT」はオフにする（issue のログイン確認はこのコードの中で行う）
import { createClient } from "npm:@supabase/supabase-js@2";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 見間違えやすい 0/O・1/I は使わない

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** 16文字のランダムなコード（約80ビット） */
function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

/** アプリ側 src/lib/account.ts と同じ規則 */
const codeToEmail = (code: string) => `fuku-user-${code.toLowerCase()}@example.com`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));

    if (body.action === "issue") {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: auth } = await admin.auth.getUser(token);
      if (!auth.user) return json({ error: "ログインが必要です" }, 401);

      const code = newCode();
      const { error } = await admin.auth.admin.updateUserById(auth.user.id, {
        email: codeToEmail(code),
        password: code,
        email_confirm: true,
      });
      if (error) throw error;
      return json({ code });
    }

    const expected = Deno.env.get("INVITE_CODE");
    if (!expected) return json({ error: "招待コードがサーバーに設定されていません" }, 500);

    const normalize = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");
    if (typeof body.invite_code !== "string" || normalize(body.invite_code) !== normalize(expected)) {
      return json({ error: "招待コードが違います" }, 403);
    }

    const code = newCode();
    const { error } = await admin.auth.admin.createUser({
      email: codeToEmail(code),
      password: code,
      email_confirm: true,
    });
    if (error) throw error;
    return json({ code });
  } catch (e) {
    console.error(e);
    return json({ error: "サーバーでエラーが発生しました" }, 500);
  }
});
