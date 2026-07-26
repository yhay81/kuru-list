SELECT
  COUNT(DISTINCT CASE WHEN name = 'visited' THEN session_hash END) AS users,
  COUNT(DISTINCT CASE WHEN name = 'created' THEN session_hash END) AS created,
  COUNT(DISTINCT CASE WHEN name = 'responded' THEN session_hash END) AS responded,
  COUNT(DISTINCT CASE WHEN name = 'managed' THEN session_hash END) AS managed,
  COUNT(DISTINCT CASE WHEN name = 'returned' THEN session_hash END) AS returned,
  COUNT(DISTINCT CASE WHEN name = 'visited' AND occurred_on >= date('now', '-6 days') THEN session_hash END) AS users_7d,
  COUNT(DISTINCT CASE WHEN name = 'responded' AND occurred_on >= date('now', '-6 days') THEN session_hash END) AS responded_7d,
  (SELECT COUNT(*) FROM events WHERE expires_at >= unixepoch()) AS active_events,
  (SELECT COUNT(DISTINCT event_id) FROM responses) AS events_with_responses,
  (SELECT COUNT(*) FROM responses) AS total_responses
FROM product_events;
