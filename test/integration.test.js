
import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/db.js';

const enabled = process.env.RUN_INTEGRATION === '1';

test('API integration: idempotency, concurrent requests, double-entry conservation, auditor permissions and cross-user isolation', {
  skip: !enabled
}, async () => {
  const base = process.env.TEST_BASE_URL || 'http://localhost:4000';

  async function login(email, password) {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    assert.equal(response.status, 200);
    return (await response.json()).token;
  }

  const holderToken = await login(
    'holder@ledgerline.test',
    'HolderDemo123!'
  );

  const holderHeaders = {
    Authorization: `Bearer ${holderToken}`,
    'content-type': 'application/json'
  };

  // Get holder account
  const accountsResponse = await fetch(`${base}/api/accounts`, {
    headers: holderHeaders
  });

  const accounts = await accountsResponse.json();
  assert.ok(accounts.length > 0);

  const accountId = accounts[0].id;
  const key = randomUUID();
  const body = JSON.stringify({ accountId, amountPaise: 1 });

  // First withdrawal
  const first = await fetch(`${base}/api/money/withdraw`, {
    method: 'POST',
    headers: { ...holderHeaders, 'Idempotency-Key': key },
    body
  });

  const result = await first.json();

  assert.equal(first.status, 200);
  assert.equal(result.ok, true);

  // Retry with same idempotency key
  const retry = await fetch(`${base}/api/money/withdraw`, {
    method: 'POST',
    headers: { ...holderHeaders, 'Idempotency-Key': key },
    body
  });

  const replay = await retry.json();

  assert.equal(replay.replayed, true);

  // Verify double-entry conservation
  const ledger = await pool.query(
    `SELECT
       COUNT(*)::int AS entry_count,
       COALESCE(SUM(amount_paise) FILTER (
         WHERE entry_type = 'debit'
       ), 0)::text AS total_debits,
       COALESCE(SUM(amount_paise) FILTER (
         WHERE entry_type = 'credit'
       ), 0)::text AS total_credits
     FROM ledger_entries
     WHERE transaction_id = $1`,
    [result.transactionId]
  );

  assert.equal(ledger.rows[0].entry_count, 2);
  assert.equal(
    ledger.rows[0].total_debits,
    ledger.rows[0].total_credits
  );

  // Concurrent duplicate withdrawal requests
  const concurrentKey = randomUUID();
  const concurrentBody = JSON.stringify({
    accountId,
    amountPaise: 1
  });

  const [responseA, responseB] = await Promise.all([
    fetch(`${base}/api/money/withdraw`, {
      method: 'POST',
      headers: {
        ...holderHeaders,
        'Idempotency-Key': concurrentKey
      },
      body: concurrentBody
    }),
    fetch(`${base}/api/money/withdraw`, {
      method: 'POST',
      headers: {
        ...holderHeaders,
        'Idempotency-Key': concurrentKey
      },
      body: concurrentBody
    })
  ]);

  const [dataA, dataB] = await Promise.all([
    responseA.json(),
    responseB.json()
  ]);

  assert.equal(responseA.status, 200);
  assert.equal(responseB.status, 200);

  // Both requests must refer to the same transaction
  assert.equal(dataA.transactionId, dataB.transactionId);

  const concurrentLedger = await pool.query(
    `SELECT
       COUNT(*)::int AS entry_count,
       COALESCE(SUM(amount_paise) FILTER (
         WHERE entry_type = 'debit'
       ), 0)::text AS total_debits,
       COALESCE(SUM(amount_paise) FILTER (
         WHERE entry_type = 'credit'
       ), 0)::text AS total_credits
     FROM ledger_entries
     WHERE transaction_id = $1`,
    [dataA.transactionId]
  );

  // Only one withdrawal should be recorded
  assert.equal(concurrentLedger.rows[0].entry_count, 2);
  assert.equal(
    concurrentLedger.rows[0].total_debits,
    concurrentLedger.rows[0].total_credits
  );

  // Auditor must not perform money movement
  const auditorToken = await login(
    'auditor@ledgerline.test',
    'AuditorDemo123!'
  );

  const denied = await fetch(`${base}/api/money/withdraw`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auditorToken}`,
      'content-type': 'application/json',
      'Idempotency-Key': randomUUID()
    },
    body: JSON.stringify({ accountId, amountPaise: 1 })
  });

  assert.equal(denied.status, 403);

  // Register a second holder
  const uniqueEmail = `security-${randomUUID()}@example.test`;

  const registration = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Security Test Holder',
      email: uniqueEmail,
      password: 'SecureTest123!'
    })
  });

  assert.equal(registration.status, 201);

  const newUser = (await registration.json()).user;

  // Admin creates an account for the second holder
  const adminToken = await login(
    'admin@ledgerline.test',
    'AdminDemo123!'
  );

  const created = await fetch(`${base}/api/accounts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      ownerUserId: newUser.id,
      accountName: 'Security Test Account',
      openingBalancePaise: 0
    })
  });

  assert.equal(created.status, 201);

  const secondAccount = await created.json();

  // First holder must not see the second holder's account
  const ownAccounts = await (
    await fetch(`${base}/api/accounts`, {
      headers: holderHeaders
    })
  ).json();

  assert.equal(
    ownAccounts.some(
      a => String(a.id) === String(secondAccount.id)
    ),
    false
  );

  // First holder must not read the second holder's statement
  const crossUserAccess = await fetch(
    `${base}/api/accounts/${secondAccount.id}/statement`,
    { headers: holderHeaders }
  );

  assert.equal(crossUserAccess.status, 403);
});

test.after(async () => {
  await pool.end();
});
