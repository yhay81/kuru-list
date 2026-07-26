PRAGMA foreign_keys = ON;

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  admin_token_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  timezone TEXT NOT NULL,
  venue TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  capacity INTEGER NOT NULL DEFAULT 0 CHECK (capacity BETWEEN 0 AND 500),
  accent TEXT NOT NULL CHECK (accent IN ('coral', 'ocean', 'leaf', 'violet')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE responses (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('yes', 'maybe', 'no')),
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX responses_event_idx ON responses (event_id, status, updated_at);
CREATE INDEX events_expiry_idx ON events (expires_at);

CREATE TABLE product_events (
  session_hash TEXT NOT NULL,
  name TEXT NOT NULL CHECK (name IN ('visited', 'created', 'responded', 'managed', 'returned')),
  occurred_on TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (session_hash, name, occurred_on)
);

CREATE INDEX product_events_date_idx ON product_events (occurred_on);
