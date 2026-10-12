// 服の写真、または言葉での説明から、種類・色・暖かさなどを推定する（登録時に1回だけ呼ぶ）
//  - { photo_path }  … アップロード済みの写真を見る
//  - { description } … 「去年買った紺のダッフルコート」のような説明を読む
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const MODEL = "claude-opus-5-5";
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

const SYSTEM = `あなたはファッションに詳しいスタイリストです。
写真に写っている服、または言葉で説明された服を1点だけ読み取って、ワードローブ登録用の情報を日本語で返してください。
説明に書かれていないことは、その種類の服として一般的な値を推定して埋めてください。

- name: 一覧で見分けやすい短い名前（例:「ネイビーのウールコート」「白のオックスフォードシャツ」）
- category: tops / bottoms / outer / onepiece / shoes / accessory のどれか
- color: 主な色（柄があれば「グレーのチェック」のように）
- material: 見た目から推定できる素材（わからなければ推定でよい）
- warmth: 着たときの暖かさ。1=真夏向け(半袖・リネン) 2=薄手 3=春秋の標準 4=厚手(ニット・裏起毛) 5=真冬向け(ダウン・厚手コート)
- rain_ok: 雨の日に着ても困らないか（撥水素材・濡れても目立たない素材なら true。スエード・白い布靴などは false）
- formality: 1=部屋着・スポーツ 2=カジュアル 3=きれいめカジュアル 4=オフィス 5=フォーマル
- notes: コーディネートに役立つ特徴を1文（丈感、シルエット、合わせやすい色など）

写真に複数の服が写っている場合は、一番大きく写っている1点について答えてください。
説明に複数の服が書かれている場合は、最初の1点について答えてください。`;

const SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    category: { type: "string", enum: ["tops", "bottoms", "outer", "onepiece", "shoes", "accessory"] },
    color: { type: "string" },
    material: { type: "string" },
    warmth: { type: "integer", enum: [1, 2, 3, 4, 5] },
    rain_ok: { type: "boolean" },
    formality: { type: "integer", enum: [1, 2, 3, 4, 5] },
    notes: { type: "string" },
  },
  required: ["name", "category", "color", "material", "warmth", "rain_ok", "formality", "notes"],
  additionalProperties: false,
};

async function handle(req: Request): Promise<Response> {
  // リクエストしたユーザーの権限で動くクライアント（自分の写真しか読めない）
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new HttpError(401, "ログインが必要です");

  const { photo_path, description } = await req.json();
  let content: Anthropic.Beta.BetaContentBlockParam[];
  if (typeof description === "string") {
    const text = description.trim();
    if (!text || text.length > 500) throw new HttpError(400, "服の説明は500文字以内で入れてください");
    content = [{ type: "text", text: `この服の情報を教えてください。

<説明>
${text}
</説明>` }];
  } else {
    if (typeof photo_path !== "string" || !photo_path.startsWith(`${auth.user.id}/`)) {
      throw new HttpError(400, "写真の指定が正しくありません");
    }
    const { data: blob, error } = await supabase.storage.from("clothes").download(photo_path);
    if (error || !blob) throw new HttpError(404, "写真が見つかりません");
    const mediaType = blob.type === "image/png" || blob.type === "image/webp" ? blob.type : "image/jpeg";
    content = [
      { type: "image", source: { type: "base64", media_type: mediaType, data: encodeBase64(await blob.arrayBuffer()) } },
      { type: "text", text: "この服の情報を教えてください。" },
    ];
  }

  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // 安全フィルタで断られたら別モデルで答え直す
      system: SYSTEM,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "AIが混み合っています。少し待ってから試してください");
    if (e instanceof Anthropic.APIError) {
      console.error("Claude API error", e.status, e.message);
      throw new HttpError(502, "AIの呼び出しに失敗しました");
    }
    throw e;
  }

  if (res.stop_reason === "refusal") throw new HttpError(422, "AIがこの服には回答できませんでした");
  if (res.stop_reason === "max_tokens") throw new HttpError(502, "AIの回答が途中で切れました");
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new HttpError(502, "AIの回答が空でした");
  return json(JSON.parse(text.text));
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
