// 今日の天気と手持ちの服から、服装を1セット提案して outfits に保存する。
// 呼ばれ方は2つ:
//  1. アプリから（ログイン中の利用者のトークン付き）… その人の提案を作って返す
//  2. pg_cron から5分おきに（x-cron-secret ヘッダ付き）… 通知時刻になった人の提案を作ってプッシュ通知する
// ※ 2 のために「Verify JWT」はオフにする（1 のログイン確認はこのコードの中で行う）
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const MODEL = "claude-opus-5-5";
const DAILY_LIMIT = 10; // 1人1日あたりの提案回数の上限（API費用の上限を決める）
const NOTIFY_WINDOW_MIN = 180; // 通知時刻を過ぎてから何分以内なら送るか（夜に登録した人へ深夜に送らないため）
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
- 「過去の評価」から、本人の好みや暑がり・寒がりの傾向を読み取って反映する。👎 の理由があれば同じ失敗を繰り返さない。
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
type Weather = Awaited<ReturnType<typeof fetchWeather>>;
type Outfit = { id: string; date: string; item_ids: string[]; comment: string; tips: string; weather: Weather };

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
    max: d.temperature_2m_max[0] as number,
    min: d.temperature_2m_min[0] as number,
    feels_max: d.apparent_temperature_max[0] as number,
    feels_min: d.apparent_temperature_min[0] as number,
    precip_prob: d.precipitation_probability_max[0] as number,
    precip_sum: d.precipitation_sum[0] as number,
    wind_max: d.wind_speed_10m_max[0] as number,
    uv_max: d.uv_index_max[0] as number,
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

/** 1人分の提案を作って保存する（supabase は利用者本人のクライアントでも管理者クライアントでもよい） */
async function generateOutfit(supabase: SupabaseClient, userId: string, date: string): Promise<Outfit> {
  const { count } = await supabase.from("outfits").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("date", date);
  if ((count ?? 0) >= DAILY_LIMIT) throw new HttpError(429, `提案は1日${DAILY_LIMIT}回までです`);

  const daysAgo = (n: number) => new Date(Date.parse(date) - n * 86400_000).toISOString().slice(0, 10);
  const [profileRes, itemsRes, recentRes, ratedRes] = await Promise.all([
    supabase.from("profiles").select("place_name, latitude, longitude, style_notes").eq("user_id", userId).maybeSingle(),
    supabase.from("items").select("id, name, category, color, material, warmth, rain_ok, formality, notes").eq("user_id", userId),
    supabase.from("outfits").select("date, item_ids, worn").eq("user_id", userId).gte("date", daysAgo(14))
      .order("date", { ascending: false }),
    supabase.from("outfits").select("date, item_ids, rating, feedback, weather").eq("user_id", userId)
      .not("rating", "is", null).gte("date", daysAgo(60)).order("date", { ascending: false }).limit(30),
  ]);
  const profile: Profile = profileRes.data ?? { place_name: "東京", latitude: 35.6895, longitude: 139.6917, style_notes: "" };
  const items = (itemsRes.data ?? []) as Item[];
  if (items.length === 0) throw new HttpError(400, "先にクローゼットに服を登録してください");

  const names = new Map(items.map((i) => [i.id, i.name]));
  const describe = (ids: string[]) => ids.map((id) => names.get(id) ?? "（削除済み）").join("、");
  const recent = recentRes.data ?? [];
  const wornLines = recent.filter((o) => o.worn && o.date !== date).map((o) => `- ${o.date}: ${describe(o.item_ids)}`);
  const todayLines = recent.filter((o) => o.date === date).map((o) => `- ${describe(o.item_ids)}`);
  const ratedLines = (ratedRes.data ?? []).map((o) => {
    const w = o.weather as Weather;
    const mark = o.rating === 1 ? "👍" : `👎${o.feedback ? `（${o.feedback}）` : ""}`;
    return `- ${mark} ${o.date} 最高${Math.round(w.max)}°/最低${Math.round(w.min)}°・雨${w.precip_prob}%: ${describe(o.item_ids)}`;
  });

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

# 過去の評価
${ratedLines.join("\n") || "（まだなし）"}

# 今日すでに出した案
${todayLines.join("\n") || "（なし）"}`;

  const answer = await askClaude(prompt);
  const itemIds = [...new Set(answer.item_ids)].filter((id) => names.has(id));
  if (itemIds.length === 0) throw new HttpError(502, "AIが服を選べませんでした。もう一度試してください");

  const { data: outfit, error } = await supabase
    .from("outfits")
    .insert({ user_id: userId, date, item_ids: itemIds, comment: answer.comment, tips: answer.tips, weather })
    .select()
    .single();
  if (error) throw error;
  return outfit as Outfit;
}

// ---- 毎朝の通知 ----

type Subscription = {
  endpoint: string; user_id: string; p256dh: string; auth: string;
  notify_time: string; timezone: string; last_sent_date: string | null;
};

/** そのタイムゾーンでの今日の日付と、0時からの経過分 */
function localNow(timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

async function runMorning() {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "https://razosso.github.io/fuku-outfit/",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );

  const { data: subs, error } = await admin.from("push_subscriptions").select("*");
  if (error) throw error;

  // 通知時刻になった端末を、利用者ごとにまとめる
  const due = new Map<string, { date: string; subs: Subscription[] }>();
  for (const s of (subs ?? []) as Subscription[]) {
    const now = localNow(s.timezone);
    const [h, m] = s.notify_time.split(":").map(Number);
    const passed = now.minutes - (h * 60 + m);
    if (s.last_sent_date === now.date || passed < 0 || passed > NOTIFY_WINDOW_MIN) continue;
    const entry = due.get(s.user_id) ?? { date: now.date, subs: [] };
    entry.subs.push(s);
    due.set(s.user_id, entry);
  }

  await Promise.all([...due].map(async ([userId, { date, subs }]) => {
    // 先に送信済みにして、AI が失敗しても5分おきに何度もやり直さない（費用を増やさない）
    await admin.from("push_subscriptions").update({ last_sent_date: date }).in("endpoint", subs.map((s) => s.endpoint));

    let payload = { title: "きょうの服", body: "今日の服装を見てみましょう" };
    try {
      const { data: existing } = await admin.from("outfits").select("*").eq("user_id", userId).eq("date", date)
        .order("created_at", { ascending: false }).limit(1);
      const outfit = (existing?.[0] as Outfit | undefined) ?? await generateOutfit(admin, userId, date);
      const { data: items } = await admin.from("items").select("id, name").in("id", outfit.item_ids);
      const w = outfit.weather;
      payload = {
        title: `きょうの服　${w.summary} ${Math.round(w.max)}° / ${Math.round(w.min)}°`,
        body: [(items ?? []).map((i) => i.name).join("・"), outfit.tips].filter(Boolean).join("\n"),
      };
    } catch (e) {
      console.error("morning outfit failed", userId, e);
    }

    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 3 * 3600 },
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint); // 通知をやめた端末
        } else {
          console.error("push failed", status, e);
        }
      }
    }));
  }));
}

// ---- 入口 ----

async function handle(req: Request): Promise<Response> {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) {
    EdgeRuntime.waitUntil(runMorning().catch((e) => console.error("runMorning failed", e)));
    return json({ ok: true }, 202);
  }

  // リクエストしたユーザーの権限で動くクライアント（自分のデータしか読み書きできない）
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  // Verify JWT をオフにしているので、トークンが本物かどうかをここで確かめる
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await supabase.auth.getUser(token);
  if (!auth.user) throw new HttpError(401, "ログインが必要です");

  const body = await req.json().catch(() => ({}));
  const date: string = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "") ? body.date : new Date().toISOString().slice(0, 10);
  return json(await generateOutfit(supabase, auth.user.id, date));
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
