CREATE TABLE session_policy (
  id INTEGER PRIMARY KEY CHECK(id=1),
  idle_minutes INTEGER NOT NULL CHECK(idle_minutes BETWEEN 5 AND 480),
  max_hours INTEGER NOT NULL CHECK(max_hours BETWEEN 1 AND 24),
  updated_at INTEGER NOT NULL,
  CHECK(idle_minutes<=max_hours*60)
);
INSERT INTO session_policy VALUES(1,30,8,0);
