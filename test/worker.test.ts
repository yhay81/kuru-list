import { describe, expect, it } from "vitest";

import type { EventRecord, ResponseRecord } from "../src/domain";
import { hashValue } from "../src/security/tokens";
import { validateEventInput, validateResponseInput } from "../src/validation";
import { app, type Bindings } from "../src/worker";

const sessionId = "313c096a-2ab6-4bda-a6bc-21361e522e99";

type RecordedStatement = {
  bindings: unknown[];
  sql: string;
};

function database(options: { event?: EventRecord; responses?: ResponseRecord[] } = {}) {
  const recorded: RecordedStatement[] = [];
  const db = {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      const statement = {
        all: async () => ({ results: options.responses ?? [], success: true }),
        bind(...values: unknown[]) {
          bindings = values;
          return statement;
        },
        first: async () => {
          if (sql.includes("FROM events")) {
            return options.event ?? null;
          }
          if (sql.includes("FROM responses")) {
            return options.responses?.[0] ?? null;
          }
          return null;
        },
        run: async () => {
          recorded.push({ bindings, sql });
          return { meta: { changes: 1 }, success: true };
        },
      };
      return statement;
    },
  };
  return { db: db as unknown as D1Database, recorded };
}

function bindings(db: D1Database): Bindings {
  return {
    ASSETS: {
      fetch: () => Promise.resolve(new Response("not used")),
    } as unknown as Fetcher,
    DB: db,
    WRITE_LIMITER: {
      limit: () => Promise.resolve({ success: true }),
    },
  };
}

const futureDate = () => new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

describe("worker", () => {
  it("renders a compact Japanese product workspace without meta experiment copy", async () => {
    const { db } = database();
    const response = await app.request("/", undefined, bindings(db));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(html).toContain('lang="ja"');
    expect(html).toContain("イベント参加受付をつくる");
    expect(html).toContain('id="create-event-form"');
    expect(html).toContain('class="event-preview"');
    expect(html).not.toContain('class="hero"');
    expect(html).not.toContain("仮説");
    expect(html).not.toContain("検証条件");
  });

  it("creates an event while storing only a hash of the admin token", async () => {
    const { db, recorded } = database();
    const response = await app.request(
      "/api/events",
      {
        body: JSON.stringify({
          accent: "coral",
          capacity: 24,
          details: "入口で受付します",
          eventDate: futureDate(),
          sessionId,
          startTime: "13:00",
          timezone: "Asia/Tokyo",
          title: "創作交流会",
          venue: "市民ホール",
          website: "",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
      bindings(db),
    );
    const body = await response.json<{ adminToken: string; eventId: string; managePath: string }>();

    expect(response.status).toBe(201);
    expect(body.eventId).toMatch(/^[A-Za-z0-9_-]{10,12}$/);
    expect(body.managePath).toContain(`#${body.adminToken}`);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.sql).toContain("INSERT INTO events");
    expect(recorded[0]?.bindings[1]).toBe(await hashValue(body.adminToken));
    expect(recorded[0]?.bindings).not.toContain(body.adminToken);
  });

  it("renders an unindexed participant page from stored event data", async () => {
    const { db } = database({
      event: {
        accent: "ocean",
        admin_token_hash: "hash",
        capacity: 20,
        created_at: 1,
        details: "受付は12時30分からです",
        event_date: futureDate(),
        expires_at: Math.floor(Date.now() / 1000) + 30 * 86_400,
        id: "AbCdEfGhIjK",
        start_time: "13:00",
        status: "open",
        timezone: "Asia/Tokyo",
        title: "小さな展示交流会",
        venue: "市民ギャラリー",
      },
      responses: [
        {
          created_at: 1,
          display_name: "mio",
          event_id: "AbCdEfGhIjK",
          id: "AbCdEfGhIjKlMnOp",
          note: "少し早めに着きます",
          status: "yes",
          token_hash: "hash",
          updated_at: 1,
        },
      ],
    });
    const response = await app.request("/e/AbCdEfGhIjK", undefined, bindings(db));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("小さな展示交流会");
    expect(html).toContain("mio");
    expect(html).toContain('content="noindex, nofollow"');
    expect(html).not.toContain("admin_token_hash");
    expect(html).not.toContain("token_hash");
  });

  it("rejects cross-site writes before accessing the database", async () => {
    const { db, recorded } = database();
    const response = await app.request(
      "/api/events",
      {
        body: "{}",
        headers: {
          "Content-Type": "application/json",
          "Sec-Fetch-Site": "cross-site",
        },
        method: "POST",
      },
      bindings(db),
    );

    expect(response.status).toBe(403);
    expect(recorded).toHaveLength(0);
  });

  it("hashes anonymous telemetry identifiers and rejects unknown event names", async () => {
    const { db, recorded } = database();
    const environment = bindings(db);
    const accepted = await app.request(
      "/api/telemetry",
      {
        body: JSON.stringify({ name: "visited", sessionId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
      environment,
    );
    const rejected = await app.request(
      "/api/telemetry",
      {
        body: JSON.stringify({ name: "clicked_everything", sessionId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
      environment,
    );

    expect(accepted.status).toBe(204);
    expect(rejected.status).toBe(400);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.bindings[0]).toBe(await hashValue(sessionId));
    expect(recorded[0]?.bindings).not.toContain(sessionId);
  });

  it("exposes a no-store health endpoint and HTML not-found page", async () => {
    const { db } = database();
    const environment = bindings(db);
    const health = await app.request("/healthz", undefined, environment);
    const missing = await app.request("/missing", undefined, environment);

    expect(health.status).toBe(200);
    expect(health.headers.get("cache-control")).toBe("no-store");
    expect((await health.json<{ healthy: boolean }>()).healthy).toBe(true);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("この参加ページは見つかりません");
  });
});

describe("validation", () => {
  it("accepts a bounded event and rejects invalid dates and honeypots", () => {
    const valid = {
      accent: "leaf",
      capacity: 0,
      details: "",
      eventDate: futureDate(),
      sessionId,
      startTime: "18:30",
      timezone: "Asia/Tokyo",
      title: "読書会",
      venue: "",
      website: "",
    };
    expect(validateEventInput(valid)?.title).toBe("読書会");
    expect(validateEventInput({ ...valid, eventDate: "2026-02-31" })).toBeNull();
    expect(validateEventInput({ ...valid, website: "spam.example" })).toBeNull();
  });

  it("requires a display name, valid response status, and anonymous session", () => {
    expect(
      validateResponseInput({
        displayName: "ao",
        note: "",
        sessionId,
        status: "maybe",
        website: "",
      })?.status,
    ).toBe("maybe");
    expect(
      validateResponseInput({
        displayName: "",
        note: "",
        sessionId,
        status: "yes",
        website: "",
      }),
    ).toBeNull();
  });
});
