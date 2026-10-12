// 提案された服装を、人が実際に着ているような写真風の画像にする。
//  1. Claude が服の一覧と人物の設定から、画像 AI 向けの英語の指示文を書く
//  2. Cloudflare Workers AI の FLUX.2 [klein] が画像を作る（登録写真のある服は参考画像として渡す）
//     本人の写真に着せるときは、本人らしさを保てるよう高画質の 9B を使い、写真の構図と縦横比をそのまま残す
//  3. Storage の <user_id>/looks/<日付>-<outfit_id>-<時刻>.jpg に保存して、表示用の URL を返す
// 受け取るのは multipart/form-data: outfit_id, person(JSON), ref_item_ids(JSON), ref_0〜ref_3（512px 未満の JPEG）,
//   person_photo（任意。本人の全身写真。あれば image 0 にして、その人に服を着せる）, person_aspect（その写真の 幅÷高さ）
// Secrets: ANTHROPIC_API_KEY, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64, encodeBase64 } from "jsr:@std/encoding@1/base64";

const MODEL = "claude-opus-5-5";
const IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-4b"; // モデルで作るとき（1枚 約100〜170 Neurons）
const EDIT_MODEL = "@cf/black-forest-labs/flux-2-klein-9b"; // 本人に着せるとき（1枚 約1,500 Neurons。無料枠は1日10,000）
const DAILY_LIMIT = 6; // 1人1日あたりの枚数（Cloudflare の無料枠を何人かで分け合うため）
const DAILY_LIMIT_OWN = 3; // うち本人に着せる枚数
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

type Person = { presentation: "woman" | "man" | "person"; age: string; height: number; body: string };
type Item = { id: string; name: string; category: string; color: string; material: string; notes: string };

const SYSTEM = `You write prompts for FLUX.2, a photorealistic image model, to show one outfit worn by one person.
Write a single English paragraph (no lists, no quotes, under 900 characters) describing:
- A full-body fashion editorial photo, head to toe with the shoes fully visible, standing naturally, front view, on a plain warm ivory studio backdrop with soft natural light.
- The person, exactly as specified (gender presentation, age range, height and build).
- Every garment in the outfit, worn the way a stylist would wear it, with the exact colors, patterns, materials and lengths given. Do not add garments or accessories that are not listed (a plain belt or simple jewelry is fine only if it suits the look).
- When a garment has a reference image, describe it as "the <garment> from image N" so the model copies it.
Translate the Japanese garment names faithfully. Output only the prompt.`;

/** 本人の写真に着せるとき。新しい写真を作るのではなく、image 0 の服だけを差し替える編集として書かせる */
const SYSTEM_EDIT = `You write prompts for FLUX.2, a photorealistic image editing model. Image 0 is a real photo of a person. The task is to change only what they are wearing.
Write a single English paragraph (no lists, no quotes, under 900 characters) that:
- Starts with "Edit image 0: dress the same person in" and then describes every garment and the shoes, with the exact colors, patterns, materials and lengths given, worn the way a stylist would wear them. Do not add garments that are not listed.
- When a garment has a reference image, call it "the <garment> from image N" so the model copies it exactly.
- Ends by stating firmly that everything else in image 0 must stay identical: the same face and facial features, expression, hairstyle, skin tone, body shape and proportions, height, pose, hands, camera angle, framing, background and lighting. Only the clothing and shoes change; the result must look like the same photo of the same person.
Do not describe the person's appearance yourself. Translate the Japanese garment names faithfully. Output only the prompt.`;

/** refs は参考画像の順の服 id。ownPhoto のときは image 0 が本人の写真で、服は image 1 から */
async function writePrompt(items: Item[], person: Person, refs: string[], ownPhoto: boolean): Promise<string> {
  // presentation は woman / man / person（性別を決めない）。年代は "in their 30s" の形
  const who = ownPhoto ? "the person from image 0" : `a ${person.presentation || "person"} ${person.age}`;
  const offset = ownPhoto ? 1 : 0;
  const lines = items.map((i) => {
    const ref = refs.indexOf(i.id);
    return `- ${i.category}: ${i.name}（色: ${i.color || "不明"}／素材: ${i.material || "不明"}${i.notes ? `／${i.notes}` : ""}）${ref >= 0 ? ` → reference image ${ref + offset}` : ""}`;
  });
  const res = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // 安全フィルタで断られたら別モデルで答え直す
    system: ownPhoto ? SYSTEM_EDIT : SYSTEM,
    output_config: { effort: "low" },
    messages: [{
      role: "user",
      content: ownPhoto
        ? `Outfit (image 0 is the person):\n${lines.join("\n")}`
        : `Person: ${who}, about ${person.height} cm tall, ${person.body} build.\nOutfit:\n${lines.join("\n")}`,
    }],
  });
  if (res.stop_reason === "refusal") throw new HttpError(422, "AIがこの服装の画像を作れませんでした");
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text" || !text.text.trim()) throw new HttpError(502, "画像の指示文を作れませんでした");
  return text.text.trim().slice(0, 2000);
}

/** 縦横比（幅÷高さ）から、長い辺 1024px・16 の倍数の大きさを決める */
function sizeFor(aspect: number) {
  const a = Math.min(2, Math.max(0.5, aspect || 0.75));
  const round = (n: number) => Math.round(n / 16) * 16;
  return a < 1 ? { width: round(1024 * a), height: 1024 } : { width: 1024, height: round(1024 / a) };
}

async function generateImage(prompt: string, refs: Blob[], model: string, size: { width: number; height: number }): Promise<Uint8Array> {
  const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
  if (!account || !token) throw new HttpError(500, "画像AIの設定（Cloudflare）がサーバーにありません");

  const form = new FormData();
  form.append("prompt", prompt);
  form.append("width", String(size.width));
  form.append("height", String(size.height));
  refs.forEach((blob, i) => form.append(`input_image_${i}`, blob, `ref${i}.jpg`));

  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
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
  const personPhoto = form.get("person_photo");
  const ownPhoto = personPhoto instanceof File;
  // 画像AIに渡せるのは4枚まで。本人の写真があれば、服は3枚まで
  const refIds = (JSON.parse(String(form.get("ref_item_ids") ?? "[]")) as string[]).slice(0, ownPhoto ? 3 : 4);
  const refs = refIds.map((_, i) => form.get(`ref_${i}`)).filter((f): f is File => f instanceof File);
  if (!/^[0-9a-f-]{36}$/.test(outfitId)) throw new HttpError(400, "服装の指定が正しくありません");

  // 1日の枚数の上限。ファイル名の先頭の日付（UTC）で数える
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const { data: made } = await supabase.storage.from("clothes").list(`${userId}/looks`, { limit: 1000 });
  const files = made ?? [];
  const todays = files.filter((f) => f.name.startsWith(`${today}-`));
  if (todays.length >= DAILY_LIMIT) throw new HttpError(429, `写真風のイメージは1日${DAILY_LIMIT}枚までです`);
  if (ownPhoto && todays.filter((f) => f.name.endsWith("-me.jpg")).length >= DAILY_LIMIT_OWN) {
    throw new HttpError(429, `自分に着せる画像は1日${DAILY_LIMIT_OWN}枚までです（「モデルで作る」はまだ作れます）`);
  }

  const { data: outfit } = await supabase.from("outfits").select("item_ids").eq("id", outfitId).maybeSingle();
  if (!outfit) throw new HttpError(404, "服装が見つかりません");
  const { data: itemRows } = await supabase.from("items").select("id, name, category, color, material, notes").in("id", outfit.item_ids);
  const items = (itemRows ?? []) as Item[];
  if (items.length === 0) throw new HttpError(400, "この服装の服が見つかりません");

  let prompt: string;
  try {
    prompt = await writePrompt(items, person, refIds.slice(0, refs.length), ownPhoto);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "AIが混み合っています。少し待ってから試してください");
    if (e instanceof Anthropic.APIError) {
      console.error("Claude API error", e.status, e.message);
      throw new HttpError(502, "AIの呼び出しに失敗しました");
    }
    throw e;
  }
  const image = ownPhoto
    ? await generateImage(prompt, [personPhoto, ...refs], EDIT_MODEL, sizeFor(Number(form.get("person_aspect"))))
    : await generateImage(prompt, refs, IMAGE_MODEL, { width: 768, height: 1024 });

  // 作り直しも1日の枚数に数えるため、上書きせず毎回別の名前で保存する
  const path = `${userId}/looks/${today}-${outfitId}-${Date.now()}${ownPhoto ? "-me" : ""}.jpg`;
  const { error } = await supabase.storage.from("clothes").upload(path, image, { contentType: "image/jpeg" });
  await cleanUp(supabase, userId, files, today);
  if (error) {
    console.error("upload failed", error);
    // 保存できなくても、作った画像はそのまま見せる
    return json({ url: `data:image/jpeg;base64,${encodeBase64(image)}`, saved: false });
  }
  const { data: signed } = await supabase.storage.from("clothes").createSignedUrl(path, 60 * 60);
  return json({ url: signed?.signedUrl, saved: true });
}

/** 前の日までの画像は、服装ごとに最新の1枚だけ残して消す（今日の分は枚数を数えるので残す） */
async function cleanUp(supabase: SupabaseClient, userId: string, files: { name: string }[], today: string) {
  const latest = new Map<string, string>();
  const old = files.filter((f) => !f.name.startsWith(`${today}-`));
  for (const f of old) {
    const outfit = f.name.match(/[0-9a-f-]{36}/)?.[0] ?? f.name;
    if ((latest.get(outfit) ?? "") < f.name) latest.set(outfit, f.name);
  }
  const keep = new Set(latest.values());
  const remove = old.filter((f) => !keep.has(f.name)).map((f) => `${userId}/looks/${f.name}`);
  if (remove.length > 0) await supabase.storage.from("clothes").remove(remove);
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
