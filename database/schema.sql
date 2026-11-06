CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','holder','auditor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT REFERENCES users(id),
  account_name TEXT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  response_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  transaction_id UUID NOT NULL,
  account_id BIGINT NOT NULL REFERENCES accounts(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('debit','credit','refused')),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  balance_after_paise BIGINT NOT NULL CHECK (balance_after_paise >= 0),
  initiator_user_id BIGINT REFERENCES users(id),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ledger_account_created_idx
  ON ledger_entries(account_id, created_at, id);

-- Prevent ordinary UPDATE/DELETE of ledger rows. Database owner can still alter schema/data;
-- production deployments should use a separate restricted application DB role.
CREATE OR REPLACE FUNCTION reject_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_no_update ON ledger_entries;
CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
