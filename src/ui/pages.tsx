import type { EventBundle, PublicEvent, PublicResponse, ResponseStatus } from "../domain";
import { product } from "../config/product";
import { Layout } from "./layout";

const statusCopy: Record<ResponseStatus, { label: string; short: string }> = {
  maybe: { label: "検討中", short: "△" },
  no: { label: "不参加", short: "×" },
  yes: { label: "参加", short: "○" },
};

const sampleAttendees = [
  { name: "mio", note: "少し早めに着きます", status: "yes" },
  { name: "ハル", note: "", status: "yes" },
  { name: "田中", note: "夕方までに決めます", status: "maybe" },
  { name: "ao", note: "", status: "yes" },
] as const;

function dateParts(eventDate: string) {
  const date = new Date(`${eventDate}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) {
    return { day: "--", long: eventDate, month: "---", weekday: "" };
  }
  return {
    day: new Intl.DateTimeFormat("ja-JP", { day: "2-digit", timeZone: "UTC" }).format(date),
    long: new Intl.DateTimeFormat("ja-JP", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
      weekday: "short",
      year: "numeric",
    }).format(date),
    month: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
      .format(date)
      .toUpperCase(),
    weekday: new Intl.DateTimeFormat("ja-JP", { timeZone: "UTC", weekday: "short" }).format(date),
  };
}

function counts(responses: PublicResponse[]) {
  return {
    maybe: responses.filter((response) => response.status === "maybe").length,
    no: responses.filter((response) => response.status === "no").length,
    yes: responses.filter((response) => response.status === "yes").length,
  };
}

function EventIdentity({ event }: { event: PublicEvent }) {
  const date = dateParts(event.event_date);
  return (
    <header class="event-identity" data-accent={event.accent}>
      <div class="date-tile" aria-label={date.long}>
        <span>{date.month}</span>
        <strong>{date.day}</strong>
        <small>{date.weekday}</small>
      </div>
      <div>
        <span class="event-state" data-status={event.status}>
          {event.status === "open" ? "参加受付中" : "受付終了"}
        </span>
        <h1>{event.title}</h1>
        <dl class="event-meta">
          <div>
            <dt>日時</dt>
            <dd>
              {date.long} {event.start_time}
            </dd>
          </div>
          {event.venue ? (
            <div>
              <dt>場所</dt>
              <dd>{event.venue}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </header>
  );
}

function ResponseSummary({
  capacity,
  responses,
}: {
  capacity: number;
  responses: PublicResponse[];
}) {
  const totals = counts(responses);
  return (
    <div class="response-summary" aria-label="参加状況">
      <div data-status="yes">
        <span>○ 参加</span>
        <strong>
          {totals.yes}
          {capacity ? <small> / {capacity}</small> : null}
        </strong>
      </div>
      <div data-status="maybe">
        <span>△ 検討中</span>
        <strong>{totals.maybe}</strong>
      </div>
      <div data-status="no">
        <span>× 不参加</span>
        <strong>{totals.no}</strong>
      </div>
    </div>
  );
}

function AttendeeList({ responses }: { responses: PublicResponse[] }) {
  return (
    <div class="attendee-list" id="attendee-list">
      {responses.length ? (
        responses.map((response) => (
          <article
            class="attendee-row"
            data-response-id={response.id}
            data-status={response.status}
          >
            <span class="attendee-avatar" aria-hidden="true">
              {response.display_name.slice(0, 1)}
            </span>
            <div>
              <strong>{response.display_name}</strong>
              {response.note ? <p>{response.note}</p> : null}
            </div>
            <span class="response-badge">
              <i aria-hidden="true">{statusCopy[response.status].short}</i>
              {statusCopy[response.status].label}
            </span>
          </article>
        ))
      ) : (
        <div class="empty-attendees">
          <span aria-hidden="true">◎</span>
          <strong>まだ回答はありません</strong>
          <p>共有した相手の回答が、ここへ並びます。</p>
        </div>
      )}
    </div>
  );
}

export function HomePage() {
  return (
    <Layout>
      <section class="app-intro">
        <span class="app-symbol" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
        </span>
        <div>
          <h1>イベント参加受付をつくる</h1>
          <p>告知、参加表明、当日の名簿をひとつのURLにまとめます。</p>
        </div>
        <span class="intro-badge">登録不要</span>
      </section>

      <section class="create-workspace">
        <form class="create-panel" id="create-event-form">
          <header class="panel-heading">
            <div>
              <span>NEW EVENT</span>
              <h2>イベントの内容</h2>
            </div>
            <span class="draft-state">入力中</span>
          </header>

          <label class="field wide">
            <span>イベント名</span>
            <input
              autocomplete="off"
              id="event-title"
              maxlength={80}
              name="title"
              required
              value="創作交流会 2026"
            />
          </label>
          <div class="field-row">
            <label class="field">
              <span>日付</span>
              <input id="event-date" name="eventDate" required type="date" value="2026-08-08" />
            </label>
            <label class="field">
              <span>開始</span>
              <input id="start-time" name="startTime" required type="time" value="13:00" />
            </label>
          </div>
          <label class="field wide">
            <span>場所</span>
            <input
              autocomplete="off"
              id="event-venue"
              maxlength={100}
              name="venue"
              placeholder="会場名、オンライン など"
              value="ひかり市民ホール 2F"
            />
          </label>
          <div class="field-row capacity-row">
            <label class="field">
              <span>定員</span>
              <span class="input-suffix">
                <input
                  id="event-capacity"
                  max="500"
                  min="0"
                  name="capacity"
                  type="number"
                  value="30"
                />
                <span>人</span>
              </span>
              <small>0で上限なし</small>
            </label>
            <fieldset class="accent-field">
              <legend>カードの色</legend>
              <div class="accent-choices">
                {(["coral", "ocean", "leaf", "violet"] as const).map((accent, index) => (
                  <button
                    aria-label={`${index + 1}番目の色`}
                    aria-pressed={accent === "coral" ? "true" : "false"}
                    data-accent={accent}
                    data-selected={accent === "coral" ? "true" : "false"}
                    type="button"
                  ></button>
                ))}
              </div>
            </fieldset>
          </div>
          <label class="field wide">
            <span>案内</span>
            <textarea
              id="event-details"
              maxlength={600}
              name="details"
              rows={4}
              placeholder="持ち物、参加費、連絡事項など"
            >
              好きな作品を持ち寄る小さな交流会です。途中参加・退出も歓迎します。
            </textarea>
          </label>
          <label class="honeypot" aria-hidden="true">
            ウェブサイト
            <input autocomplete="off" name="website" tabIndex={-1} />
          </label>
          <input id="event-timezone" name="timezone" type="hidden" value="Asia/Tokyo" />
          <div class="create-note">
            <span aria-hidden="true">◌</span>
            <p>
              作成後に、参加者へ渡すURLと管理用URLを発行します。イベントは開催35日後に自動削除します。
            </p>
          </div>
          <button class="primary-button" type="submit">
            参加ページを作る
            <span aria-hidden="true">→</span>
          </button>
          <p class="form-error" hidden id="create-error" role="alert"></p>
        </form>

        <section class="event-preview" aria-labelledby="preview-title" data-accent="coral">
          <header class="preview-heading">
            <span>参加者に見えるページ</span>
            <strong id="preview-title">プレビュー</strong>
          </header>
          <div class="preview-card">
            <div class="preview-cover">
              <span class="preview-pattern" aria-hidden="true">
                <i></i>
                <i></i>
                <i></i>
              </span>
              <span class="preview-status">参加受付中</span>
            </div>
            <div class="preview-event">
              <div class="preview-date">
                <span id="preview-month">AUG</span>
                <strong id="preview-day">08</strong>
                <small id="preview-weekday">土</small>
              </div>
              <div>
                <h2 id="preview-event-title">創作交流会 2026</h2>
                <p>
                  <span id="preview-date-label">2026年8月8日(土) 13:00</span>
                  <span id="preview-venue">ひかり市民ホール 2F</span>
                </p>
              </div>
            </div>
            <div class="preview-summary">
              <span>
                <strong>3</strong>参加
              </span>
              <span>
                <strong>1</strong>検討中
              </span>
              <span>
                <strong>0</strong>不参加
              </span>
              <small>
                定員 <span id="preview-capacity">30</span>人
              </small>
            </div>
            <div class="preview-attendees">
              {sampleAttendees.map((person) => (
                <div data-status={person.status}>
                  <span aria-hidden="true">{person.name.slice(0, 1)}</span>
                  <div>
                    <strong>{person.name}</strong>
                    {person.note ? <small>{person.note}</small> : null}
                  </div>
                  <i>{person.status === "yes" ? "○" : "△"}</i>
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>

      <section class="create-success" hidden id="create-success">
        <span class="success-mark" aria-hidden="true">
          ✓
        </span>
        <div>
          <h2>参加ページを作成しました</h2>
          <p>参加者には共有URLだけを送り、管理用URLは主催者だけで保管してください。</p>
          <div class="issued-links">
            <label>
              <span>参加者へ共有</span>
              <span>
                <input id="share-url" readonly />
                <button data-copy-target="share-url" type="button">
                  コピー
                </button>
              </span>
            </label>
            <label>
              <span>主催者用</span>
              <span>
                <input id="manage-url" readonly />
                <button data-copy-target="manage-url" type="button">
                  コピー
                </button>
              </span>
            </label>
          </div>
          <a class="manage-link" id="open-manage" href="/">
            管理画面を開く →
          </a>
        </div>
      </section>
    </Layout>
  );
}

export function EventPage({ bundle }: { bundle: EventBundle }) {
  const { event, responses } = bundle;
  return (
    <Layout noIndex page="event" title={`${event.title} | ${product.name}`}>
      <div class="event-page" data-event-id={event.id}>
        <section class="event-main">
          <EventIdentity event={event} />
          {event.details ? <p class="event-details">{event.details}</p> : null}
          <ResponseSummary capacity={event.capacity} responses={responses} />
          <section class="roster" aria-labelledby="roster-title">
            <header class="roster-heading">
              <div>
                <span>GUESTS</span>
                <h2 id="roster-title">参加者</h2>
              </div>
              <button class="copy-link-button" id="copy-event-link" type="button">
                URLをコピー
              </button>
            </header>
            <AttendeeList responses={responses} />
          </section>
        </section>

        <aside class="response-panel">
          <header>
            <span aria-hidden="true">◉</span>
            <div>
              <h2>参加を知らせる</h2>
              <p>名前と回答は、このURLを知る人に表示されます。</p>
            </div>
          </header>
          {event.status === "open" ? (
            <form id="response-form">
              <label class="field">
                <span>表示名</span>
                <input autocomplete="name" maxlength={40} name="displayName" required />
              </label>
              <fieldset class="response-choice">
                <legend>参加しますか？</legend>
                <div>
                  <button
                    aria-pressed="true"
                    data-response-status="yes"
                    data-selected="true"
                    type="button"
                  >
                    <span>○</span>
                    参加
                  </button>
                  <button
                    aria-pressed="false"
                    data-response-status="maybe"
                    data-selected="false"
                    type="button"
                  >
                    <span>△</span>
                    検討中
                  </button>
                  <button
                    aria-pressed="false"
                    data-response-status="no"
                    data-selected="false"
                    type="button"
                  >
                    <span>×</span>
                    不参加
                  </button>
                </div>
              </fieldset>
              <label class="field">
                <span>
                  ひとこと <small>任意</small>
                </span>
                <textarea
                  maxlength={120}
                  name="note"
                  placeholder="到着時間、連絡など"
                  rows={3}
                ></textarea>
              </label>
              <label class="honeypot" aria-hidden="true">
                ウェブサイト
                <input autocomplete="off" name="website" tabIndex={-1} />
              </label>
              <button class="primary-button" type="submit">
                回答を送る
              </button>
              <button class="delete-response" hidden id="delete-response" type="button">
                自分の回答を削除
              </button>
              <p class="form-error" hidden id="response-error" role="alert"></p>
            </form>
          ) : (
            <div class="closed-message">
              <strong>受付は終了しました</strong>
              <p>参加状況の確認はできますが、新しい回答は送れません。</p>
            </div>
          )}
        </aside>
      </div>
    </Layout>
  );
}

export function ManagePage({ bundle }: { bundle: EventBundle }) {
  const { event, responses } = bundle;
  return (
    <Layout noIndex page="manage" title={`管理 | ${event.title} | ${product.name}`}>
      <div class="manage-page" data-event-id={event.id}>
        <section class="manage-main">
          <EventIdentity event={event} />
          <ResponseSummary capacity={event.capacity} responses={responses} />
          <section class="roster manage-roster" aria-labelledby="manage-roster-title">
            <header class="roster-heading">
              <div>
                <span>GUEST LIST</span>
                <h2 id="manage-roster-title">参加名簿</h2>
              </div>
              <span>{responses.length}件の回答</span>
            </header>
            <AttendeeList responses={responses} />
          </section>
        </section>
        <aside class="manage-panel" id="manage-panel">
          <header>
            <span aria-hidden="true">◆</span>
            <div>
              <h2>主催者メニュー</h2>
              <p id="manage-auth-state">管理用URLを確認しています</p>
            </div>
          </header>
          <div hidden id="manage-controls">
            <label class="manage-share">
              <span>参加者へ共有するURL</span>
              <span>
                <input id="manage-share-url" readonly value={`${product.url}/e/${event.id}`} />
                <button data-copy-target="manage-share-url" type="button">
                  コピー
                </button>
              </span>
            </label>
            <a class="secondary-button" href={`/e/${event.id}`}>
              参加ページを確認
            </a>
            <button class="secondary-button" id="print-roster" type="button">
              名簿を印刷
            </button>
            <button class="secondary-button" id="download-csv" type="button">
              CSVを保存
            </button>
            <button
              class="status-button"
              data-event-status={event.status}
              id="toggle-event"
              type="button"
            >
              {event.status === "open" ? "参加受付を終了" : "参加受付を再開"}
            </button>
            <button class="danger-button" id="delete-event" type="button">
              イベントを削除
            </button>
          </div>
          <div class="manage-auth-error" hidden id="manage-auth-error">
            <strong>管理用URLが必要です</strong>
            <p>作成時に発行された管理用URLを、そのまま開いてください。</p>
          </div>
        </aside>
      </div>
    </Layout>
  );
}

export function PrivacyPage() {
  return (
    <Layout page="privacy" title={`プライバシー | ${product.name}`}>
      <article class="prose">
        <p class="prose-kicker">PRIVACY</p>
        <h1>参加受付に必要な情報だけを保存します</h1>
        <h2>イベントに保存するもの</h2>
        <p>
          イベント名、日付、時刻、タイムゾーン、場所、案内、定員、カード色、受付状態をD1へ保存します。開催日の35日後にイベントと回答を自動削除します。主催者は管理画面からいつでも即時削除できます。
        </p>
        <h2>回答に保存するもの</h2>
        <p>
          表示名、参加・検討中・不参加、任意のひとことを保存します。メールアドレス、電話番号、SNSアカウントは求めません。回答内容は参加URLを知る人に表示されます。
        </p>
        <h2>この端末に保存するもの</h2>
        <p>
          自分の回答を更新・削除するためのランダムな鍵、回答内容、匿名の利用識別子、最終訪問日をブラウザ内に保存します。ブラウザのサイトデータを消すと削除できます。
        </p>
        <h2>匿名集計</h2>
        <p>
          閲覧、イベント作成、回答、管理操作、別日の再訪を、匿名識別子を一方向変換して日単位で記録し、35日後に削除します。イベント名、表示名、回答内容、IPアドレスは集計へ保存しません。広告Cookieや外部解析SDKは使用しません。
        </p>
      </article>
    </Layout>
  );
}

export function NotFoundPage() {
  return (
    <Layout noIndex page="not-found" title={`見つかりません | ${product.name}`}>
      <section class="not-found">
        <span aria-hidden="true">◇</span>
        <h1>この参加ページは見つかりません</h1>
        <p>URLが違うか、開催から35日が経過して削除された可能性があります。</p>
        <a href="/">新しい参加受付を作る</a>
      </section>
    </Layout>
  );
}
