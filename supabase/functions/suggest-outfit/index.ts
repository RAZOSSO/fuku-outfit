// 今日の天気と手持ちの服から、服装を1セット提案して outfits に保存する
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-opus-5-5";
const DAILY_LIMIT = 10; // 1人1日あたりの提案回数の上限（API費用の上限を決める）
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

const SYSTEM = `あなたは天気と手持ちの服から、その日の服装を1セットだけ選ぶスタイリストです。
必ず「手持ちの服」一覧にある id だけを使ってください。一覧にない服を勧めてはいけません。

選び方:
- 構成は「tops + bottoms」または「onepiece」を基本にし、shoes が登録されていれば1足選ぶ。outer は気温や風・雨で必要なときだけ。accessory は合うものがあれば任意。
- 最高・最低気温だけでなく、体感温度・時間ごとの気温差・風・降水確率を考える。朝晩と日中の差が大きい日は脱ぎ着しやすい重ね方にする。
- 降水確率が高い日は rain_ok の服と靴を優先する。
- 最近着た服、特にトップスやワンピースは数日あけるようにする。
- 色の組み合わせとフォーマル度をそろえる。本人の好み・予定のメモがあれば最優先する。
- 「今日すでに出した案」がある場合は、それとはっきり違う組み合わせにする。

返す内容:
- item_ids: 選んだ服の id
- comment: なぜこの組み合わせにしたかを、天気と結びつけて2〜3文で。親しみやすい口調で。
- tips: 傘・羽織りもの・脱ぎ着など、今日気をつけることを1文で。
手持ちの服が足りずに組めない場合は、組める範囲で選び、足りないものを comment で伝えてください。`;

const SCHEMA = {
  type: "object",
  properties: {
    item_ids: { type: "array", items: { type: "string" } },
    comment: { type: "string" },
    tips: { type: "string" },
  },
  required: ["item_ids", "comment", "tips"],
  additionalProperties: false,
};

const WEATHER_NAMES: Record<number, string> = {
  0: "快晴", 1: "晴れ", 2: "晴れ時々くもり", 3: "くもり", 45: "霧", 48: "霧",
  51: "弱い霧雨", 53: "霧雨", 55: "強い霧雨", 61: "弱い雨", 63: "雨", 65: "強い雨",
  66: "冷たい雨", 67: "強い冷たい雨", 71: "弱い雪", 73: "雪", 75: "大雪", 77: "霧雪",
  80: "にわか雨", 81: "にわか雨", 82: "激しいにわか雨", 85: "にわか雪", 86: "激しいにわか雪",
  95: "雷雨", 96: "ひょうを伴う雷雨", 99: "ひょうを伴う激しい雷雨",
};

type Profile = { place_name: string; latitude: number; longitude: number; style_notes: string };
type Item = {
  id: string; name: string; category: string; color: string; material: string;
  warmth: number; rain_ok: boolean; formality: number; notes: string;
};

async function fetchWeather(p: Profile, date: string) {
  const params = new URLSearchParams({
    latitude: String(p.latitude),
    longitude: String(p.longitude),
    timezone: "auto",
    start_date: date,
    end_date: date,
    wind_speed_unit: "ms",
    daily: [
      "weather_code", "temperature_2m_max", "temperature_2m_min", "apparent_temperature_max",
      "apparent_temperature_min", "precipitation_probability_max", "precipitation_sum",
      "wind_speed_10m_max", "uv_index_max",
    ].join(","),
    hourly: "temperature_2m,apparent_temperature,precipitation_probability,weather_code",
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new HttpError(502, "天気を取得できませんでした");
  const w = await res.json();
  const d = w.daily;
  const hourly = [6, 9, 12, 15, 18, 21].map((h) => ({
    hour: h,
    temp: w.hourly.temperature_2m[h],
    feels: w.hourly.apparent_temperature[h],
    precip_prob: w.hourly.precipitation_probability[h],
    summary: WEATHER_NAMES[w.hourly.weather_code[h]] ?? "",
  }));
  return {
    place: p.place_name,
    date,
    summary: WEATHER_NAMES[d.weather_code[0]] ?? "不明",
    max: d.temperature_2m_max[0],
    min: d.temperature_2m_min[0],
    feels_max: d.apparent_temperature_max[0],
    feels_min: d.apparent_temperature_min[0],
    precip_prob: d.precipitation_probability_max[0],
    precip_sum: d.precipitation_sum[0],
    wind_max: d.wind_speed_10m_max[0],
    uv_max: d.uv_index_max[0],
    hourly,
  };
}

async function askClaude(prompt: string): Promise<{ item_ids: string[]; comment: string; tips: string }> {
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // 安全フィルタで断られたら別モデルで答え直す
      system: SYSTEM,
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "AIが混み合っています。少し待ってから試してください");
    if (e instanceof Anthropic.APIError) {
      console.error("Claude API error", e.status, e.message);
      throw new HttpError(502, "AIの呼び出しに失敗しました");
    }
    throw e;
  }

  if (res.stop_reason === "refusal") throw new HttpError(422, "AIがこの内容には回答できませんでした");
  if (res.stop_reason === "max_tokens") throw new HttpError(502, "AIの回答が途中で切れました");
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new HttpError(502, "AIの回答が空でした");
  return JSON.parse(text.text);
}

async function handle(req: Request): Promise<Response> {
  // リクエストしたユーザーの権限で動くクライアント（自分のデータしか読み書きできない）
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new HttpError(401, "ログインが必要です");

  const body = await req.json().catch(() => ({}));
  const date: string = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "") ? body.date : new Date().toISOString().slice(0, 10);

  const { count } = await supabase.from("outfits").select("id", { count: "exact", head: true }).eq("date", date);
  if ((count ?? 0) >= DAILY_LIMIT) throw new HttpError(429, `提案は1日${DAILY_LIMIT}回までです`);

  const since = new Date(Date.parse(date) - 14 * 86400_000).toISOString().slice(0, 10);
  const [profileRes, itemsRes, recentRes] = await Promise.all([
    supabase.from("profiles").select("place_name, latitude, longitude, style_notes").maybeSingle(),
    supabase.from("items").select("id, name, category, color, material, warmth, rain_ok, formality, notes"),
    supabase.from("outfits").select("date, item_ids, worn").gte("date", since).order("date", { ascending: false }),
  ]);
  const profile: Profile = profileRes.data ?? { place_name: "東京", latitude: 35.6895, longitude: 139.6917, style_notes: "" };
  const items = (itemsRes.data ?? []) as Item[];
  if (items.length === 0) throw new HttpError(400, "先にクローゼットに服を登録してください");

  const names = new Map(items.map((i) => [i.id, i.name]));
  const describe = (ids: string[]) => ids.map((id) => names.get(id) ?? "（削除済み）").join("、");
  const recent = recentRes.data ?? [];
  const wornLines = recent.filter((o) => o.worn && o.date !== date).map((o) => `- ${o.date}: ${describe(o.item_ids)}`);
  const todayLines = recent.filter((o) => o.date === date).map((o) => `- ${describe(o.item_ids)}`);

  const weather = await fetchWeather(profile, date);

  const prompt = `# 今日（${date}）の天気 — ${weather.place}
${JSON.stringify(weather, null, 1)}
（気温は℃、風速は m/s、降水確率は %）

# 本人の好み・予定のメモ
${profile.style_notes || "（なし）"}

# 手持ちの服
${items.map((i) => JSON.stringify(i)).join("\n")}

# 最近実際に着た服
${wornLines.join("\n") || "（記録なし）"}

# 今日すでに出した案
${todayLines.join("\n") || "（なし）"}`;

  const answer = await askClaude(prompt);
  const itemIds = [...new Set(answer.item_ids)].filter((id) => names.has(id));
  if (itemIds.length === 0) throw new HttpError(502, "AIが服を選べませんでした。もう一度試してください");

  const { data: outfit, error } = await supabase
    .from("outfits")
    .insert({ date, item_ids: itemIds, comment: answer.comment, tips: answer.tips, weather })
    .select()
    .single();
  if (error) throw error;
  return json(outfit);
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
