CREATE TABLE session_commits (
  dataset_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(dataset_id,request_id),
  FOREIGN KEY(dataset_id,request_id) REFERENCES write_requests(dataset_id,request_id)
);
CREATE INDEX session_commits_activity ON session_commits(dataset_id,session_id,created_at);
CREATE INDEX history_request_activity ON record_versions(dataset_id,request_id,namespace,record_key);
CREATE INDEX history_namespace_requests ON record_versions(dataset_id,namespace,request_id) WHERE request_id IS NOT NULL;
CREATE TRIGGER session_commits_no_update BEFORE UPDATE ON session_commits
BEGIN SELECT RAISE(ABORT,'activity-is-immutable'); END;
CREATE TRIGGER session_commits_no_delete BEFORE DELETE ON session_commits
BEGIN SELECT RAISE(ABORT,'activity-is-immutable'); END;
