
-- Day 04: Double-entry accounting migration

ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'customer';

ALTER TABLE accounts
DROP CONSTRAINT IF EXISTS accounts_account_type_check;

ALTER TABLE accounts
ADD CONSTRAINT accounts_account_type_check
CHECK (account_type IN ('customer', 'system'));

-- Customer balances cannot be negative. System clearing balance may be signed.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'accounts'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%balance_paise%'
  LOOP
    EXECUTE format('ALTER TABLE accounts DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE accounts
ADD CONSTRAINT accounts_balance_rule
CHECK (account_type = 'system' OR balance_paise >= 0);

-- Allow signed running balances for system-account ledger entries.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'ledger_entries'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%balance_after_paise%'
  LOOP
    EXECUTE format('ALTER TABLE ledger_entries DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_one_system_account_per_currency
ON accounts(currency)
WHERE account_type = 'system';

INSERT INTO accounts (
  owner_user_id, account_name, currency, balance_paise, account_type
)
SELECT NULL, 'System Clearing - INR', 'INR', 0, 'system'
WHERE NOT EXISTS (
  SELECT 1 FROM accounts
  WHERE account_type = 'system' AND currency = 'INR'
);

CREATE INDEX IF NOT EXISTS accounts_customer_owner_idx
ON accounts(owner_user_id, id)
WHERE account_type = 'customer';
