# Security Policy

## Reporting

脆弱性を公開Issueへ投稿せず、GitHubのPrivate vulnerability reportingから連絡してください。利用方法の不具合は、個人情報を除いて公開Issueへ報告できます。

## Implemented controls

- 管理用・回答編集用の鍵は十分な長さの乱数として発行し、D1にはSHA-256ハッシュだけを保存する。
- イベントと回答ページは推測困難なURL、`noindex`、CSP、フレーム拒否、厳格なMIME判定で保護する。
- JSONの種類・サイズ・文字数・日付範囲を検証し、ユーザー入力をHTMLとして解釈しない。
- `Sec-Fetch-Site`でクロスサイト書き込みを拒否し、匿名セッション単位のCloudflare Rate Limitingとhoneypotを併用する。
- イベント・回答・匿名集計を期限削除し、管理者と回答者に即時削除経路を提供する。
- CSVのセル先頭を保護し、表計算ソフトでの数式実行を防ぐ。

## Known limits

参加URLは認証ではなく共有秘密であり、転送された相手も内容を閲覧できる。高機密イベント、本人確認、決済、入場権管理には使用しない。匿名セッション鍵はブラウザ側で再発行できるため、レート制限は低強度の濫用抑止であり、強い本人単位制御ではない。
