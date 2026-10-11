// 招待コードを確認して、新しい利用者のアカウントを作り、引き継ぎコードを返す。
// アカウントは「引き継ぎコードがそのまま合い鍵になる」形で作るので、利用者はメールもパスワードも決めなくてよい。
// ※ この関数はログイン前に呼ばれるので「Verify JWT」はオフにする
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_USERS = Number(Deno.env.get("MAX_USERS") ?? "5"); // 作れるアカウント数の上限（費用の上限）
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
    const expected = Deno.env.get("INVITE_CODE");
    if (!expected) return json({ error: "招待コードがサーバーに設定されていません" }, 500);

    const { invite_code } = await req.json().catch(() => ({}));
    const normalize = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");
    if (typeof invite_code !== "string" || normalize(invite_code) !== normalize(expected)) {
      return json({ error: "招待コードが違います" }, 403);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: list, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;
    if (list.users.length >= MAX_USERS) {
      return json({ error: "利用できる人数の上限に達しています。引き継ぎコードをお持ちならそちらを使ってください" }, 403);
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
