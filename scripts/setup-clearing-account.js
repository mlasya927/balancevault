
import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

const client = await pool.connect();

try {
  await client.query('BEGIN');

  // Avoid duplicate system accounts if startup runs more than once.
  await client.query(
    "SELECT pg_advisory_xact_lock(20261112)"
  );

  const existing = await client.query(
    `SELECT id FROM accounts
     WHERE account_type = 'system' AND currency = 'INR'
     LIMIT 1`
  );

  if (existing.rowCount === 0) {
    const openingBalancePaise = 1000000000; // ₹1 crore (demo only)

    const account = await client.query(
      `INSERT INTO accounts
        (owner_user_id, account_type, account_name, currency, balance_paise)
       VALUES (NULL, 'system', 'INR Clearing Account', 'INR', $1)
       RETURNING id`,
      [openingBalancePaise]
    );

    await client.query(
      `INSERT INTO ledger_entries
        (transaction_id, account_id, entry_type, amount_paise,
         balance_after_paise, initiator_user_id, description)
       VALUES (gen_random_uuid(), $1, 'credit', $2, $2, NULL,
               'Demo clearing account opening balance')`,
      [account.rows[0].id, openingBalancePaise]
    );

    console.log('INR demo clearing account created.');
  } else {
    console.log('INR system clearing account already exists. No changes made.');
  }

  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Clearing account setup failed:', error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
