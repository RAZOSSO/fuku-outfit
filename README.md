# きょうの服

朝ひらくと、今日の天気と手持ちの服から服装を1つ提案してくれるスマホ向けアプリ（PWA）です。
招待コードを知っている人だけが使えます（メールアドレス・パスワードは不要）。

- 画面：React + TypeScript（Vite、PWA）
- ログイン・データ・写真：Supabase
- 天気：Open-Meteo
- AI：Claude Opus 5.5（Supabase Edge Function から呼び出し）

## フォルダ構成

```
src/                         スマホの画面
  pages/Today.tsx            きょうの提案（開くと自動で提案）
  pages/Closet.tsx           クローゼット（写真で追加 → AI が判定 → 確認して保存）
  pages/Settings.tsx         地域・好みのメモ・ログアウト
supabase/
  migrations/                テーブル・写真置き場・アクセス制限
  functions/analyze-item/    写真から服の情報を推定（登録時に1回）
  functions/suggest-outfit/  天気＋手持ちの服から1セット提案（1人1日10回まで）
```

## はじめての準備

### 1. Supabase プロジェクトを作る
1. https://supabase.com でアカウントを作り、New project を作成（リージョンは Tokyo がおすすめ）
2. **Authentication → Sign In / Providers** で **「Allow new users to sign up」をオフ**（アカウントは join 関数だけが作る）
3. **SQL Editor** で `supabase/migrations/20261011000000_init.sql` を実行

### 2. Secrets を登録する（Edge Functions → Secrets）
| Name | 値 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic の API キー（console.anthropic.com で発行。Limits で月の上限も設定） |
| `INVITE_CODE` | 招待コード（自分で決める。例：`FUKU-7Q2X-MORNING`） |
| `MAX_USERS` | 作れるアカウント数の上限（省略時 5） |

### 3. Edge Functions を作る（Edge Functions → Deploy a new function → Via Editor）
| 関数名 | 中身 | Verify JWT |
|---|---|---|
| `join` | `supabase/functions/join/index.ts` | **オフ**（ログイン前に呼ぶため） |
| `analyze-item` | `supabase/functions/analyze-item/index.ts` | オン |
| `suggest-outfit` | `supabase/functions/suggest-outfit/index.ts` | オン |

### 4. 画面を動かす（ローカル）
```bash
cp .env.example .env.local   # Project Settings → API の URL と anon key を書く
npm install
npm run dev
```

### 5. 使う人に招待コードを教える
アプリを開くと招待コードの入力画面になります。コードを入れるとその人専用のアカウントができ、
以降は何も入れずに使えます。設定画面の「引き継ぎコード」をメモしておけば、機種変更してもデータを戻せます。

メールアドレスで作った古いアカウントのデータを残したいときは、`supabase/convert-email-account.sql` を使います。

## 公開（GitHub Pages）
`main` に push すると GitHub Actions がビルドして https://razosso.github.io/fuku-outfit/ に公開します。
Supabase の URL と anon key は GitHub の Settings → Secrets and variables → Actions に
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` として登録してあります。

## スマホのホーム画面に追加する
https://razosso.github.io/fuku-outfit/ を開いて、
- iPhone：Safari で開く → 共有 → 「ホーム画面に追加」
- Android：Chrome で開く → メニュー → 「アプリをインストール」

※ iPhone は Safari とホーム画面のアプリでデータが別なので、**ホーム画面に追加してから**招待コードを入れてください。
