import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const demoUsers = [
    ['Demo Admin','admin@ledgerline.test','AdminDemo123!','admin'],
    ['Demo Holder','holder@ledgerline.test','HolderDemo123!','holder'],
    ['Demo Auditor','auditor@ledgerline.test','AuditorDemo123!','auditor']
  ];
  const ids = {};
  for (const [name,email,password,role] of demoUsers) {
    const hash = await bcrypt.hash(password, 12);
    const result = await client.query(
      `INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4)
       ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name, password_hash=EXCLUDED.password_hash, role=EXCLUDED.role
       RETURNING id`, [name,email,hash,role]);
    ids[role] = result.rows[0].id;
  }
  const acct = await client.query(
    `INSERT INTO accounts(owner_user_id,account_name,balance_paise)
     SELECT $1,'Demo Holder Account',100000
     WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE owner_user_id=$1 AND account_name='Demo Holder Account')
     RETURNING id`, [ids.holder]);
  if (acct.rowCount) {
    await client.query(
      `INSERT INTO ledger_entries(transaction_id,account_id,entry_type,amount_paise,balance_after_paise,initiator_user_id,description)
       VALUES(gen_random_uuid(),$1,'credit',100000,100000,$2,'Seed opening balance')`,
      [acct.rows[0].id, ids.admin]);
  }
  await client.query('COMMIT');
  console.log('Demo users seeded. See README for demo credentials.');
} catch (e) { await client.query('ROLLBACK'); throw e; }
finally { client.release(); await pool.end(); }
