CREATE TABLE session_page_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  path TEXT NOT NULL,
  module TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,
  active_seconds INTEGER NOT NULL DEFAULT 0 CHECK(active_seconds >= 0)
);
CREATE INDEX session_page_visits_session_time ON session_page_visits(session_id,opened_at DESC);
CREATE INDEX session_page_visits_window ON session_page_visits(opened_at DESC);
