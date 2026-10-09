PRAGMA foreign_keys = ON;
CREATE TABLE datasets (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('staging','verified','active','retired')),
  source_sha256 TEXT NOT NULL,
  codec_version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE records (
  dataset_id TEXT NOT NULL REFERENCES datasets(id),
  namespace TEXT NOT NULL,
  record_key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  payload_sha256 TEXT NOT NULL,
  deleted INTEGER NOT NULL CHECK(deleted IN (0,1)),
  actor_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payload_bytes INTEGER GENERATED ALWAYS AS (length(CAST(payload AS BLOB))) STORED,
  PRIMARY KEY(dataset_id,namespace,record_key)
);
CREATE TABLE write_requests (
  dataset_id TEXT NOT NULL REFERENCES datasets(id),
  request_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  request_sha256 TEXT NOT NULL,
  receipt TEXT NOT NULL CHECK(json_valid(receipt)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(dataset_id,request_id)
);
CREATE INDEX requests_generation ON write_requests(dataset_id);
CREATE TRIGGER requests_no_update BEFORE UPDATE ON write_requests
BEGIN SELECT RAISE(ABORT,'receipt-is-immutable'); END;
CREATE TRIGGER requests_no_delete BEFORE DELETE ON write_requests
BEGIN SELECT RAISE(ABORT,'receipt-is-immutable'); END;
CREATE TABLE record_versions (
  dataset_id TEXT NOT NULL REFERENCES datasets(id),
  namespace TEXT NOT NULL,
  record_key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  operation TEXT NOT NULL CHECK(operation IN ('import','put','delete','restore')),
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  payload_sha256 TEXT NOT NULL,
  deleted INTEGER NOT NULL CHECK(deleted IN (0,1)),
  actor_id TEXT NOT NULL,
  request_id TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(dataset_id,namespace,record_key,version)
);
CREATE TRIGGER requests_require_active BEFORE INSERT ON write_requests
WHEN COALESCE((SELECT status FROM datasets WHERE id=NEW.dataset_id),'missing') <> 'active'
BEGIN SELECT RAISE(ABORT,'dataset-read-only'); END;
CREATE TRIGGER revisions_guard BEFORE INSERT ON record_versions
BEGIN
  SELECT CASE WHEN NEW.version <> COALESCE((SELECT version FROM records
    WHERE dataset_id=NEW.dataset_id AND namespace=NEW.namespace AND record_key=NEW.record_key),0)+1
    THEN RAISE(ABORT,'stale-record') END;
  SELECT CASE WHEN NEW.operation='import' AND (NEW.version<>1 OR NEW.request_id IS NOT NULL OR
    (SELECT status FROM datasets WHERE id=NEW.dataset_id)<>'staging')
    THEN RAISE(ABORT,'invalid-import') END;
  SELECT CASE WHEN NEW.operation<>'import' AND (NEW.request_id IS NULL OR
    COALESCE((SELECT status FROM datasets WHERE id=NEW.dataset_id),'missing')<>'active' OR
    COALESCE((SELECT actor_id FROM write_requests WHERE dataset_id=NEW.dataset_id AND request_id=NEW.request_id),'')<>NEW.actor_id)
    THEN RAISE(ABORT,'unverified-request') END;
  SELECT CASE WHEN NEW.operation='delete' AND (NEW.version=1 OR NEW.deleted<>1 OR NEW.payload<>'null')
    THEN RAISE(ABORT,'invalid-delete') END;
  SELECT CASE WHEN NEW.operation<>'delete' AND NEW.deleted<>0 THEN RAISE(ABORT,'invalid-payload') END;
  SELECT CASE WHEN NEW.operation='put' AND COALESCE((SELECT deleted FROM records
    WHERE dataset_id=NEW.dataset_id AND namespace=NEW.namespace AND record_key=NEW.record_key),0)=1
    THEN RAISE(ABORT,'restore-required') END;
  SELECT CASE WHEN NEW.operation='restore' AND COALESCE((SELECT deleted FROM records
    WHERE dataset_id=NEW.dataset_id AND namespace=NEW.namespace AND record_key=NEW.record_key),0)<>1
    THEN RAISE(ABORT,'not-deleted') END;
END;
CREATE TRIGGER revisions_apply AFTER INSERT ON record_versions
BEGIN
  INSERT INTO records VALUES(NEW.dataset_id,NEW.namespace,NEW.record_key,NEW.version,NEW.payload,
    NEW.payload_sha256,NEW.deleted,NEW.actor_id,NEW.created_at)
  ON CONFLICT(dataset_id,namespace,record_key) DO UPDATE SET version=excluded.version,
    payload=excluded.payload,payload_sha256=excluded.payload_sha256,deleted=excluded.deleted,
    actor_id=excluded.actor_id,updated_at=excluded.updated_at;
END;
CREATE TRIGGER history_no_update BEFORE UPDATE ON record_versions
BEGIN SELECT RAISE(ABORT,'history-is-immutable'); END;
CREATE TRIGGER history_no_delete BEFORE DELETE ON record_versions
BEGIN SELECT RAISE(ABORT,'history-is-immutable'); END;
CREATE TRIGGER records_no_delete BEFORE DELETE ON records
BEGIN SELECT RAISE(ABORT,'use-a-tombstone'); END;
