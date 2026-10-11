# きょうの服

朝ひらくと、今日の天気と手持ちの服から服装を1つ提案してくれるスマホ向けアプリ（PWA）です。
招待した人だけが使えます。

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
2. **Authentication → Sign In / Providers** で **「Allow new users to sign up」をオフ**（招待制にする）
3. **Authentication → URL Configuration** の Site URL に、アプリの URL を入れる（公開前は `http://localhost:5173`）

### 2. Anthropic API キーを用意する
https://console.anthropic.com で API キーを発行し、支払い方法を登録します。
**Limits** で月の上限金額を設定しておくと安心です（2人なら月1,000円程度で十分）。

### 3. データベースと AI 関数を Supabase に送る
このフォルダで次を実行します（`<project-ref>` は Supabase の URL の `https://<ここ>.supabase.co` の部分）。

```bash
npx supabase login
npx supabase init                       # 初回だけ。既存のファイルは消えません
npx supabase link --project-ref <project-ref>
npx supabase db push                    # テーブル・写真置き場を作る
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy analyze-item
npx supabase functions deploy suggest-outfit
```

### 4. 画面を動かす
```bash
cp .env.example .env.local   # Project Settings → API の URL と anon key を書く
npm install
npm run dev
```

### 5. 使う人を招待する
**Authentication → Users → Invite user** でメールアドレスを入れます。
届いたメールのリンクを開くとパスワード設定画面になり、以降はそのパスワードでログインします。

## 公開（GitHub Pages）
`main` に push すると GitHub Actions がビルドして https://razosso.github.io/fuku-outfit/ に公開します。
Supabase の URL と anon key は GitHub の Settings → Secrets and variables → Actions に
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` として登録してあります。

## スマホのホーム画面に追加する
https://razosso.github.io/fuku-outfit/ を開いて、
- iPhone：Safari で開く → 共有 → 「ホーム画面に追加」
- Android：Chrome で開く → メニュー → 「アプリをインストール」

※ iPhone は Safari とホーム画面のアプリでログイン状態が別なので、ホーム画面のアプリでもう一度ログインしてください。
