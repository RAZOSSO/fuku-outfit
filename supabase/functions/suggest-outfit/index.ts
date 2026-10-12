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

const SYSTEM = `あなたはファッション誌でも活躍するパーソナルスタイリストです。
本人の手持ちの服だけを使って、今日の天気にきちんと合い、なおかつ「おしゃれ」と言われる服装を1セット組みます。

## 必ず守ること
- 「手持ちの服」一覧にある id だけを使う。一覧にない服を勧めない。
- 構成は「tops + bottoms」か「onepiece」を軸にする。shoes が登録されていれば必ず1足選ぶ。
- bottoms・shoes・outer はそれぞれ1点まで。tops は重ね着（シャツの上にニットなど）のときだけ2点まで。accessory は合うものだけ（傘は雨の日のみ）。

## 天気の読み方
- 体感の最高気温を目安にする: 25°以上は warmth 1〜2 中心／20〜24° は 2〜3／15〜19° は 3 に軽い羽織り／10〜14° は 3〜4 に outer／9°以下は 4〜5 に厚手の outer。
- 朝晩と日中の差が7°以上なら、脱ぎ着しやすい重ね方にする（羽織りを脱いでも成立するコーデに）。
- 降水確率50%以上なら rain_ok の靴を優先し、白い布やスエード、引きずる丈は避ける。
- 風が強い日（8m/s以上）は、広がる裾や薄すぎる素材を避ける。

## おしゃれに見せる考え方
1. 色: 全身で3色以内が目安。ベースカラー（紺・黒・グレー・白・ベージュ・茶など）を中心に、差し色は1点だけ。色数を絞る／トーンをそろえる／同系色でグラデーションにする、のどれかで統一感を出す。柄物は1点まで。
2. シルエット: 上下のボリュームにメリハリをつける（上がゆったりなら下はすっきり、上がコンパクトなら下はワイド）。Iライン・Aライン・Yラインのどれを作るかを決める。
3. テイスト: きれいめとカジュアルのバランスを取る（大人っぽく見せるなら きれいめ7：カジュアル3）。formality が2以上離れた服は、意図した外しでない限り混ぜない。
4. 素材と季節感: 季節に合った素材を選び、質感の対比（ニット×レザー、コットン×ウールなど）で奥行きを出す。
5. 足元と小物: 靴は全体のテイストとフォーマル度に合わせ、小物と色をつなげると洗練されて見える。
6. 本人の好み・予定のメモを最優先する。曜日も考える（平日は通勤・仕事、休日はリラックスした装いになりやすい）。
7. 「過去の評価」で 👍 の傾向は伸ばし、👎 の理由（暑い・寒い・色など）は繰り返さない。暑がり・寒がりの傾向は気温の目安を補正する。
8. 最近着た服、特にトップスやワンピースは数日あける。「今日すでに出した案」とは、色かテイストがはっきり違う方向にする。

決める前に、色・シルエット・天気・構成のルールを満たしているかを自分で確認してください。

## 返す内容
- item_ids: 選んだ服の id
- comment: 2〜3文。どこがおしゃれのポイントか（色・シルエット・素材のどれか）と、天気にどう合うかを、具体的に親しみやすい口調で。
- tips: 1文。雨や寒暖差など天気の注意が必要な日はそれを、そうでなければ着こなしのひと工夫（袖をまくる、前だけタックイン、裾をロールアップなど）を。
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

type Answer = { item_ids: string[]; comment: string; tips: string };

async function askClaude(messages: Anthropic.Beta.BetaMessageParam[]): Promise<Answer> {
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // 安全フィルタで断られたら別モデルで答え直す
      system: SYSTEM,
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
      messages,
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

  const weekday = "日月火水木金土"[new Date(`${date}T00:00:00Z`).getUTCDay()];
  const prompt = `# 今日（${date}・${weekday}曜日）の天気 — ${weather.place}
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

  // 組み合わせの決まりを破っていたら、理由を伝えて1回だけ組み直してもらう
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  let answer = await askClaude(messages);
  const problems = checkOutfit(answer.item_ids, items);
  if (problems.length > 0) {
    console.warn("outfit retry", problems);
    messages.push(
      { role: "assistant", content: JSON.stringify(answer) },
      { role: "user", content: `この組み合わせには次の問題があります。直した組み合わせを返してください。\n${problems.map((p) => `- ${p}`).join("\n")}` },
    );
    answer = await askClaude(messages).catch(() => answer); // 組み直しに失敗したら最初の案を使う
  }
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

/** 構成の決まり（システムプロンプトの「必ず守ること」）を破っていないか確かめ、問題を文で返す */
function checkOutfit(ids: string[], items: Item[]): string[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const chosen = [...new Set(ids)].map((id) => byId.get(id)).filter((i): i is Item => !!i);
  const count = (c: string) => chosen.filter((i) => i.category === c).length;
  const has = (c: string) => items.some((i) => i.category === c);
  const problems: string[] = [];

  if (chosen.length < ids.length) problems.push("一覧にない id が含まれています");
  const core = (count("tops") > 0 && count("bottoms") > 0) || count("onepiece") > 0;
  const canMakeCore = (has("tops") && has("bottoms")) || has("onepiece");
  if (!core && canMakeCore) problems.push("「tops + bottoms」か「onepiece」がそろっていません");
  if (count("shoes") === 0 && has("shoes")) problems.push("靴が選ばれていません");
  for (const [c, label] of [["bottoms", "ボトムス"], ["shoes", "靴"], ["outer", "アウター"], ["onepiece", "ワンピース"]]) {
    if (count(c) > 1) problems.push(`${label}が${count(c)}点あります（1点まで）`);
  }
  if (count("tops") > 2) problems.push(`トップスが${count("tops")}点あります（重ね着でも2点まで）`);
  return problems;
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

    let payload = { title: "Today's Outfit", body: "今日の服装を見てみましょう" };
    try {
      const { data: existing } = await admin.from("outfits").select("*").eq("user_id", userId).eq("date", date)
        .order("created_at", { ascending: false }).limit(1);
      const outfit = (existing?.[0] as Outfit | undefined) ?? await generateOutfit(admin, userId, date);
      const { data: items } = await admin.from("items").select("id, name").in("id", outfit.item_ids);
      const w = outfit.weather;
      payload = {
        title: `Today's Outfit　${w.summary} ${Math.round(w.max)}° / ${Math.round(w.min)}°`,
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
