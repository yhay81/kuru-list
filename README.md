# Kuru List

決定済みイベントの告知、参加・検討中・不参加の受付、当日名簿を1つの共有ページで扱う日本語Webツールです。SNSログインや利用登録は不要です。

Production: `https://kuru-list.yusuke8h.workers.dev`

## Stack

- Cloudflare Workers / D1 / Rate Limiting / Cron
- Hono / Hono JSX
- Vite+ / TypeScript / Oxlint / Oxfmt / Vitest / Wrangler

Better Authは使いません。作成者アカウントを保持せず、管理用URLのランダム鍵で操作を認可します。イベントと回答は開催日の35日後に削除されます。

## Local development

Node.js 24はfnmで管理し、Vite+によるランタイム管理は無効にします。

```powershell
vp env off
npm ci
npx wrangler d1 migrations apply kuru-list --local
npm run dev
```

## Quality gate

```powershell
npm run release:check
npm run check
npm test
npm run build
```

## Deployment

```powershell
npx wrangler d1 migrations apply kuru-list --remote
npm run deploy
npm run indexnow
npm run metrics
```

本番でイベント作成、参加ページ表示、回答作成・更新・削除、管理画面認可、CSV、受付終了・再開、イベント削除を確認します。ユーザーデータ、管理鍵、回答鍵、本番ログをGitへ保存しないでください。
