import {
  type EventBundle,
  type EventRecord,
  type ResponseRecord,
  toPublicEvent,
  toPublicResponse,
} from "./domain";

export async function loadEvent(db: D1Database, id: string): Promise<EventRecord | null> {
  return db
    .prepare(
      `SELECT id, admin_token_hash, title, event_date, start_time, timezone,
              venue, details, capacity, accent, status, expires_at, created_at
       FROM events
       WHERE id = ? AND expires_at >= unixepoch()`,
    )
    .bind(id)
    .first<EventRecord>();
}

export async function loadResponse(
  db: D1Database,
  eventId: string,
  responseId: string,
): Promise<ResponseRecord | null> {
  return db
    .prepare(
      `SELECT id, event_id, token_hash, display_name, status, note, created_at, updated_at
       FROM responses
       WHERE id = ? AND event_id = ?`,
    )
    .bind(responseId, eventId)
    .first<ResponseRecord>();
}

export async function loadResponses(db: D1Database, eventId: string): Promise<ResponseRecord[]> {
  const result = await db
    .prepare(
      `SELECT id, event_id, token_hash, display_name, status, note, created_at, updated_at
       FROM responses
       WHERE event_id = ?
       ORDER BY
         CASE status WHEN 'yes' THEN 0 WHEN 'maybe' THEN 1 ELSE 2 END,
         updated_at ASC`,
    )
    .bind(eventId)
    .all<ResponseRecord>();
  return result.results;
}

export async function loadEventBundle(db: D1Database, id: string): Promise<EventBundle | null> {
  const event = await loadEvent(db, id);
  if (!event) {
    return null;
  }
  const responses = await loadResponses(db, id);
  return {
    event: toPublicEvent(event),
    responses: responses.map(toPublicResponse),
  };
}
