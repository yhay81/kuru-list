import { Hono, type Context } from "hono";
import { requestId } from "hono/request-id";

import { loadEvent, loadEventBundle, loadResponse } from "./data";
import { toPublicResponse } from "./domain";
import { securityHeaders } from "./middleware/security";
import { bearerToken, hashValue, randomToken } from "./security/tokens";
import { EventPage, HomePage, ManagePage, NotFoundPage, PrivacyPage } from "./ui/pages";
import {
  eventExpiry,
  validateEventInput,
  validateResponseInput,
  validateStatusAction,
  validSessionId,
} from "./validation";

export type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
  WRITE_LIMITER: RateLimit;
};

type AppContext = Context<{ Bindings: Bindings }>;
type ObjectPayload = Record<string, unknown>;

const app = new Hono<{ Bindings: Bindings }>();
const eventIdPattern = /^[A-Za-z0-9_-]{10,12}$/;
const responseIdPattern = /^[A-Za-z0-9_-]{14,18}$/;
const telemetryNames = new Set(["visited", "created", "responded", "managed", "returned"]);

app.use("*", requestId());
app.use("*", securityHeaders);

function apiError(c: AppContext, status: 400 | 401 | 403 | 404 | 409 | 413 | 429, error: string) {
  return c.json({ error, requestId: c.get("requestId") }, status);
}

function validWriteOrigin(c: AppContext) {
  const fetchSite = c.req.header("Sec-Fetch-Site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "same-site";
}

async function readJson(c: AppContext, maximumBytes = 3_000): Promise<ObjectPayload | null> {
  const contentType = c.req.header("Content-Type") ?? "";
  const contentLength = Number(c.req.header("Content-Length") ?? "0");
  if (
    !contentType.toLowerCase().startsWith("application/json") ||
    (contentLength > 0 && contentLength > maximumBytes)
  ) {
    return null;
  }
  const raw = await c.req.text();
  if (!raw || new TextEncoder().encode(raw).byteLength > maximumBytes) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as ObjectPayload)
      : null;
  } catch {
    return null;
  }
}

async function allowWrite(c: AppContext, key: string) {
  const outcome = await c.env.WRITE_LIMITER.limit({ key });
  return outcome.success;
}

async function requireAdmin(c: AppContext, eventId: string) {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return null;
  }
  const event = await loadEvent(c.env.DB, eventId);
  if (!event || (await hashValue(token)) !== event.admin_token_hash) {
    return null;
  }
  return event;
}

async function requireResponse(c: AppContext, eventId: string, responseId: string) {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return null;
  }
  const response = await loadResponse(c.env.DB, eventId, responseId);
  if (!response || (await hashValue(token)) !== response.token_hash) {
    return null;
  }
  return response;
}

function csvCell(value: string) {
  const flattened = value.replaceAll(/\r?\n/g, " ").trim();
  const guarded = /^[=+\-@]/.test(flattened) ? `'${flattened}` : flattened;
  return `"${guarded.replaceAll('"', '""')}"`;
}

app.get("/", (c) => c.html(<HomePage />));
app.get("/privacy", (c) => c.html(<PrivacyPage />));

app.get("/e/:id", async (c) => {
  const id = c.req.param("id");
  const bundle = eventIdPattern.test(id) ? await loadEventBundle(c.env.DB, id) : null;
  if (!bundle) {
    return c.html(<NotFoundPage />, 404);
  }
  return c.html(<EventPage bundle={bundle} />);
});

app.get("/e/:id/manage", async (c) => {
  const id = c.req.param("id");
  const bundle = eventIdPattern.test(id) ? await loadEventBundle(c.env.DB, id) : null;
  if (!bundle) {
    return c.html(<NotFoundPage />, 404);
  }
  return c.html(<ManagePage bundle={bundle} />);
});

app.post("/api/events", async (c) => {
  if (!validWriteOrigin(c)) {
    return apiError(c, 403, "cross_site_request");
  }
  const payload = await readJson(c);
  const input = payload ? validateEventInput(payload) : null;
  if (!input) {
    return apiError(c, 400, "invalid_event");
  }
  if (!(await allowWrite(c, `create:${input.sessionId}`))) {
    return apiError(c, 429, "rate_limited");
  }

  const id = randomToken(8);
  const adminToken = randomToken(32);
  await c.env.DB.prepare(
    `INSERT INTO events
       (id, admin_token_hash, title, event_date, start_time, timezone, venue,
        details, capacity, accent, status, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
  )
    .bind(
      id,
      await hashValue(adminToken),
      input.title,
      input.eventDate,
      input.startTime,
      input.timezone,
      input.venue,
      input.details,
      input.capacity,
      input.accent,
      eventExpiry(input.eventDate),
    )
    .run();

  return c.json(
    {
      adminToken,
      eventId: id,
      managePath: `/e/${id}/manage#${adminToken}`,
      sharePath: `/e/${id}`,
    },
    201,
  );
});

app.get("/api/events/:id", async (c) => {
  const id = c.req.param("id");
  if (!eventIdPattern.test(id)) {
    return apiError(c, 404, "event_not_found");
  }
  const bundle = await loadEventBundle(c.env.DB, id);
  return bundle ? c.json(bundle) : apiError(c, 404, "event_not_found");
});

app.post("/api/events/:id/responses", async (c) => {
  if (!validWriteOrigin(c)) {
    return apiError(c, 403, "cross_site_request");
  }
  const eventId = c.req.param("id");
  const payload = eventIdPattern.test(eventId) ? await readJson(c) : null;
  const input = payload ? validateResponseInput(payload) : null;
  if (!input) {
    return apiError(c, 400, "invalid_response");
  }
  if (!(await allowWrite(c, `respond:${input.sessionId}`))) {
    return apiError(c, 429, "rate_limited");
  }
  const event = await loadEvent(c.env.DB, eventId);
  if (!event) {
    return apiError(c, 404, "event_not_found");
  }
  if (event.status !== "open") {
    return apiError(c, 409, "event_closed");
  }

  const responseId = randomToken(12);
  const token = randomToken(24);
  const result = await c.env.DB.prepare(
    `INSERT INTO responses (id, event_id, token_hash, display_name, status, note)
     SELECT ?, ?, ?, ?, ?, ?
     WHERE ? != 'yes'
        OR ? = 0
        OR (SELECT COUNT(*) FROM responses WHERE event_id = ? AND status = 'yes') < ?`,
  )
    .bind(
      responseId,
      eventId,
      await hashValue(token),
      input.displayName,
      input.status,
      input.note,
      input.status,
      event.capacity,
      eventId,
      event.capacity,
    )
    .run();
  if (!result.meta.changes) {
    return apiError(c, 409, "event_full");
  }
  const response = await loadResponse(c.env.DB, eventId, responseId);
  return c.json({ response: response ? toPublicResponse(response) : null, token }, 201);
});

app.put("/api/events/:eventId/responses/:responseId", async (c) => {
  if (!validWriteOrigin(c)) {
    return apiError(c, 403, "cross_site_request");
  }
  const eventId = c.req.param("eventId");
  const responseId = c.req.param("responseId");
  if (!eventIdPattern.test(eventId) || !responseIdPattern.test(responseId)) {
    return apiError(c, 404, "response_not_found");
  }
  const current = await requireResponse(c, eventId, responseId);
  if (!current) {
    return apiError(c, 401, "invalid_response_token");
  }
  const payload = await readJson(c);
  const input = payload ? validateResponseInput(payload) : null;
  if (!input) {
    return apiError(c, 400, "invalid_response");
  }
  if (!(await allowWrite(c, `respond:${input.sessionId}`))) {
    return apiError(c, 429, "rate_limited");
  }
  const event = await loadEvent(c.env.DB, eventId);
  if (!event) {
    return apiError(c, 404, "event_not_found");
  }
  if (event.status !== "open") {
    return apiError(c, 409, "event_closed");
  }
  if (input.status === "yes" && current.status !== "yes" && event.capacity > 0) {
    const taken = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM responses WHERE event_id = ? AND status = 'yes'",
    )
      .bind(eventId)
      .first<{ total: number }>();
    if ((taken?.total ?? 0) >= event.capacity) {
      return apiError(c, 409, "event_full");
    }
  }
  await c.env.DB.prepare(
    `UPDATE responses
     SET display_name = ?, status = ?, note = ?, updated_at = unixepoch()
     WHERE id = ? AND event_id = ?`,
  )
    .bind(input.displayName, input.status, input.note, responseId, eventId)
    .run();
  const response = await loadResponse(c.env.DB, eventId, responseId);
  return c.json({ response: response ? toPublicResponse(response) : null });
});

app.delete("/api/events/:eventId/responses/:responseId", async (c) => {
  if (!validWriteOrigin(c)) {
    return apiError(c, 403, "cross_site_request");
  }
  const eventId = c.req.param("eventId");
  const responseId = c.req.param("responseId");
  if (!eventIdPattern.test(eventId) || !responseIdPattern.test(responseId)) {
    return apiError(c, 404, "response_not_found");
  }
  const response = await requireResponse(c, eventId, responseId);
  if (!response) {
    return apiError(c, 401, "invalid_response_token");
  }
  await c.env.DB.prepare("DELETE FROM responses WHERE id = ? AND event_id = ?")
    .bind(responseId, eventId)
    .run();
  return c.body(null, 204);
});

app.get("/api/events/:id/manage", async (c) => {
  const id = c.req.param("id");
  const event = eventIdPattern.test(id) ? await requireAdmin(c, id) : null;
  if (!event) {
    return apiError(c, 401, "invalid_admin_token");
  }
  const bundle = await loadEventBundle(c.env.DB, id);
  return bundle ? c.json(bundle) : apiError(c, 404, "event_not_found");
});

app.patch("/api/events/:id/manage", async (c) => {
  if (!validWriteOrigin(c)) {
    return apiError(c, 403, "cross_site_request");
  }
  const id = c.req.param("id");
  const event = eventIdPattern.test(id) ? await requireAdmin(c, id) : null;
  if (!event) {
    return apiError(c, 401, "invalid_admin_token");
  }
  const payload = await readJson(c, 300);
  const action = payload ? validateStatusAction(payload) : null;
  if (!action) {
    return apiError(c, 400, "invalid_action");
  }
  await c.env.DB.prepare("UPDATE events SET status = ? WHERE id = ?")
    .bind(action === "open" ? "open" : "closed", id)
    .run();
  return c.json({ status: action === "open" ? "open" : "closed" });
});

app.delete("/api/events/:id/manage", async (c) => {
  if (!validWriteOrigin(c)) {
    return apiError(c, 403, "cross_site_request");
  }
  const id = c.req.param("id");
  const event = eventIdPattern.test(id) ? await requireAdmin(c, id) : null;
  if (!event) {
    return apiError(c, 401, "invalid_admin_token");
  }
  await c.env.DB.prepare("DELETE FROM events WHERE id = ?").bind(id).run();
  return c.body(null, 204);
});

app.get("/api/events/:id/manage.csv", async (c) => {
  const id = c.req.param("id");
  const event = eventIdPattern.test(id) ? await requireAdmin(c, id) : null;
  if (!event) {
    return apiError(c, 401, "invalid_admin_token");
  }
  const bundle = await loadEventBundle(c.env.DB, id);
  if (!bundle) {
    return apiError(c, 404, "event_not_found");
  }
  const labels = { maybe: "検討中", no: "不参加", yes: "参加" } as const;
  const rows = [
    ["表示名", "回答", "ひとこと", "更新日時"].map(csvCell).join(","),
    ...bundle.responses.map((response) =>
      [
        response.display_name,
        labels[response.status],
        response.note,
        new Date(response.updated_at * 1000).toISOString(),
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  c.header("Cache-Control", "no-store");
  c.header("Content-Disposition", `attachment; filename="kuru-list-${id}.csv"`);
  return c.body(`\uFEFF${rows.join("\r\n")}\r\n`, 200, {
    "Content-Type": "text/csv; charset=utf-8",
  });
});

app.post("/api/telemetry", async (c) => {
  if (!validWriteOrigin(c)) {
    return apiError(c, 403, "cross_site_request");
  }
  const payload = await readJson(c, 500);
  const name = typeof payload?.name === "string" ? payload.name : "";
  const sessionId = payload?.sessionId;
  if (!telemetryNames.has(name) || !validSessionId(sessionId)) {
    return apiError(c, 400, "invalid_telemetry");
  }
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO product_events (session_hash, name, occurred_on)
     VALUES (?, ?, date('now'))`,
  )
    .bind(await hashValue(sessionId), name)
    .run();
  return c.body(null, 204);
});

app.get("/healthz", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({
    healthy: true,
    service: "kuru-list",
    time: new Date().toISOString(),
  });
});

app.notFound((c) => {
  if (!c.req.path.startsWith("/api/")) {
    return c.html(<NotFoundPage />, 404);
  }
  return c.json({ error: "not_found", requestId: c.get("requestId") }, 404);
});

app.onError((error, c) => {
  console.error(
    JSON.stringify({
      event: "request_failed",
      message: error.message,
      requestId: c.get("requestId"),
    }),
  );
  return c.json({ error: "internal_error", requestId: c.get("requestId") }, 500);
});

async function cleanup(db: D1Database) {
  await db.batch([
    db.prepare("DELETE FROM events WHERE expires_at < unixepoch()"),
    db.prepare("DELETE FROM product_events WHERE occurred_on < date('now', '-35 days')"),
  ]);
}

export { app };
export default {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, env: Bindings, context: ExecutionContext) {
    context.waitUntil(cleanup(env.DB));
  },
};
