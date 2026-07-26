export const accentNames = ["coral", "ocean", "leaf", "violet"] as const;
export const responseStatuses = ["yes", "maybe", "no"] as const;

export type AccentName = (typeof accentNames)[number];
export type ResponseStatus = (typeof responseStatuses)[number];

export type EventRecord = {
  accent: AccentName;
  admin_token_hash: string;
  capacity: number;
  created_at: number;
  details: string;
  event_date: string;
  expires_at: number;
  id: string;
  start_time: string;
  status: "open" | "closed";
  timezone: string;
  title: string;
  venue: string;
};

export type ResponseRecord = {
  created_at: number;
  display_name: string;
  event_id: string;
  id: string;
  note: string;
  status: ResponseStatus;
  token_hash: string;
  updated_at: number;
};

export type PublicEvent = Omit<EventRecord, "admin_token_hash">;
export type PublicResponse = Omit<ResponseRecord, "token_hash">;

export type EventBundle = {
  event: PublicEvent;
  responses: PublicResponse[];
};

export function toPublicEvent(event: EventRecord): PublicEvent {
  const { admin_token_hash: _token, ...publicEvent } = event;
  return publicEvent;
}

export function toPublicResponse(response: ResponseRecord): PublicResponse {
  const { token_hash: _token, ...publicResponse } = response;
  return publicResponse;
}
