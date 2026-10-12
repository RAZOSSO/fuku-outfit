// 提案された服装を、人が実際に着ているような写真風の画像にする。
//  1. Claude が服の一覧と人物の設定から、画像 AI 向けの英語の指示文を書く
//  2. Cloudflare Workers AI の FLUX.2 [klein] が画像を作る（登録写真のある服は参考画像として渡す）
//  3. Storage の <user_id>/looks/<outfit_id>.jpg に保存して、表示用の URL を返す
// 受け取るのは multipart/form-data: outfit_id, person(JSON), ref_item_ids(JSON), ref_0〜ref_3（512px 未満の JPEG）
// Secrets: ANTHROPIC_API_KEY, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64, encodeBase64 } from "jsr:@std/encoding@1/base64";

const MODEL = "claude-opus-5-5";
const IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
const DAILY_LIMIT = 6; // 1人1日あたりの枚数（Cloudflare の無料枠を何人かで分け合うため）
const anthropic = new Anthropic(); // ANTHROPIC_API_KEY は Secrets に登録する

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Person = { presentation: "woman" | "man" | "faceless"; age: string; height: number; body: string };
type Item = { id: string; name: string; category: string; color: string; material: string; notes: string };

const SYSTEM = `You write prompts for FLUX.2, a photorealistic image model, to show one outfit worn by one person.
Write a single English paragraph (no lists, no quotes, under 900 characters) describing:
- A full-body fashion editorial photo, head to toe with the shoes fully visible, standing naturally, front view, on a plain warm ivory studio backdrop with soft natural light.
- The person, exactly as specified (gender presentation, age range, height and build).
- Every garment in the outfit, worn the way a stylist would wear it, with the exact colors, patterns, materials and lengths given. Do not add garments or accessories that are not listed (a plain belt or simple jewelry is fine only if it suits the look).
- When a garment has a reference image, describe it as "the <garment> from image N" so the model copies it.
Translate the Japanese garment names faithfully. Output only the prompt.`;

async function writePrompt(items: Item[], person: Person, refs: string[]): Promise<string> {
  const who = person.presentation === "faceless"
    ? "a person whose face is not shown: frame the photo from the chin down to the shoes"
    : `a ${person.age} ${person.presentation}`;
  const lines = items.map((i) => {
    const ref = refs.indexOf(i.id);
    return `- ${i.category}: ${i.name}（色: ${i.color || "不明"}／素材: ${i.material || "不明"}${i.notes ? `／${i.notes}` : ""}）${ref >= 0 ? ` → reference image ${ref}` : ""}`;
  });
  const res = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // 安全フィルタで断られたら別モデルで答え直す
    system: SYSTEM,
    output_config: { effort: "low" },
    messages: [{
      role: "user",
      content: `Person: ${who}, about ${person.height} cm tall, ${person.body} build.\nOutfit:\n${lines.join("\n")}`,
    }],
  });
  if (res.stop_reason === "refusal") throw new HttpError(422, "AIがこの服装の画像を作れませんでした");
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text" || !text.text.trim()) throw new HttpError(502, "画像の指示文を作れませんでした");
  return text.text.trim().slice(0, 2000);
}

async function generateImage(prompt: string, refs: Blob[]): Promise<Uint8Array> {
  const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
  if (!account || !token) throw new HttpError(500, "画像AIの設定（Cloudflare）がサーバーにありません");

  const form = new FormData();
  form.append("prompt", prompt);
  form.append("width", "768");
  form.append("height", "1024");
  refs.forEach((blob, i) => form.append(`input_image_${i}`, blob, `ref${i}.jpg`));

  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${IMAGE_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("Cloudflare error", res.status, JSON.stringify(body));
    if (res.status === 429) throw new HttpError(429, "今日の画像AIの無料枠を使い切りました（毎朝9時にリセットされます）");
    if (res.status === 401 || res.status === 403) throw new HttpError(500, "Cloudflare のキーが正しくないようです");
    throw new HttpError(502, "画像を作れませんでした。少し待ってから試してください");
  }
  const image: string | undefined = body?.result?.image ?? body?.image;
  if (!image) throw new HttpError(502, "画像AIの返事が空でした");
  return decodeBase64(image);
}

async function handle(req: Request): Promise<Response> {
  // リクエストしたユーザーの権限で動くクライアント（自分のデータしか読み書きできない）
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new HttpError(401, "ログインが必要です");
  const userId = auth.user.id;

  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, "送られた内容を読めませんでした");
  const outfitId = String(form.get("outfit_id") ?? "");
  const person = JSON.parse(String(form.get("person") ?? "{}")) as Person;
  const refIds = JSON.parse(String(form.get("ref_item_ids") ?? "[]")) as string[];
  const refs = refIds.slice(0, 4).map((_, i) => form.get(`ref_${i}`)).filter((f): f is File => f instanceof File);
  if (!/^[0-9a-f-]{36}$/.test(outfitId)) throw new HttpError(400, "服装の指定が正しくありません");

  // 1日の枚数の上限（作った画像の数で数える）
  const today = new Date().toISOString().slice(0, 10);
  const { data: made } = await supabase.storage.from("clothes").list(`${userId}/looks`, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  if ((made ?? []).filter((f) => f.created_at?.startsWith(today)).length >= DAILY_LIMIT) {
    throw new HttpError(429, `写真風のイメージは1日${DAILY_LIMIT}枚までです`);
  }

  const { data: outfit } = await supabase.from("outfits").select("item_ids").eq("id", outfitId).maybeSingle();
  if (!outfit) throw new HttpError(404, "服装が見つかりません");
  const { data: itemRows } = await supabase.from("items").select("id, name, category, color, material, notes").in("id", outfit.item_ids);
  const items = (itemRows ?? []) as Item[];
  if (items.length === 0) throw new HttpError(400, "この服装の服が見つかりません");

  let prompt: string;
  try {
    prompt = await writePrompt(items, person, refIds.slice(0, refs.length));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "AIが混み合っています。少し待ってから試してください");
    if (e instanceof Anthropic.APIError) {
      console.error("Claude API error", e.status, e.message);
      throw new HttpError(502, "AIの呼び出しに失敗しました");
    }
    throw e;
  }
  const image = await generateImage(prompt, refs);

  // 同じ服装の画像は上書きする（Storage の権限は追加と削除だけなので、消してから入れる）
  const path = `${userId}/looks/${outfitId}.jpg`;
  await supabase.storage.from("clothes").remove([path]);
  const { error } = await supabase.storage.from("clothes").upload(path, image, { contentType: "image/jpeg" });
  if (error) {
    console.error("upload failed", error);
    // 保存できなくても、作った画像はそのまま見せる
    return json({ url: `data:image/jpeg;base64,${encodeBase64(image)}`, saved: false });
  }
  const { data: signed } = await supabase.storage.from("clothes").createSignedUrl(path, 60 * 60);
  return json({ url: signed?.signedUrl, saved: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    return await handle(req);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "サーバーでエラーが発生しました" }, 500);
  }
});
