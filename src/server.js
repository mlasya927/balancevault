
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID, createHash } from 'node:crypto';
import { pool } from './db.js';
import { requireAuth, allowRoles } from './auth.js';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
app.use(cors());
app.use(express.json());

if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET is not set. Set it before use.');
}

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'BalanceVault API' })
);

// REGISTER
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !name.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      password.length < 8
    ) {
      return res.status(400).json({
        error: 'Valid name, email and password (minimum 8 characters) required'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'holder')
       RETURNING id, name, email, role, created_at`,
      [name.trim(), email.trim().toLowerCase(), passwordHash]
    );

    return res.status(201).json({
      message: 'User registered successfully',
      user: result.rows[0]
    });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }

    console.error('Registration failed:', e);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await pool.query(
      'SELECT id,name,email,password_hash,role FROM users WHERE email=$1',
      [email.trim().toLowerCase()]
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '4h' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (e) {
    console.error('Login failed:', e);
    return res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/me', requireAuth, (req, res) =>
  res.json({ user: req.user })
);

// CREATE CUSTOMER ACCOUNT WITH PAIRED OPENING ENTRIES
app.post('/api/accounts', requireAuth, allowRoles('admin'), async (req, res) => {
  const { ownerUserId, accountName, openingBalancePaise = 0 } = req.body || {};

  if (
    !ownerUserId ||
    typeof accountName !== 'string' ||
    !accountName.trim() ||
    !Number.isSafeInteger(openingBalancePaise) ||
    openingBalancePaise < 0
  ) {
    return res.status(400).json({
      error: 'Valid ownerUserId, accountName and non-negative openingBalancePaise required'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let clearing = null;

    if (openingBalancePaise > 0) {
      const clearingResult = await client.query(
        `SELECT id, balance_paise
         FROM accounts
         WHERE account_type = 'system' AND currency = 'INR'
         FOR UPDATE`
      );

      if (!clearingResult.rowCount) {
        throw new Error('INR system clearing account not configured');
      }

      clearing = clearingResult.rows[0];
    }

    const accountResult = await client.query(
      `INSERT INTO accounts
       (owner_user_id, account_name, balance_paise)
       VALUES($1,$2,$3)
       RETURNING id, owner_user_id, account_name, currency,
                 balance_paise, created_at`,
      [ownerUserId, accountName.trim(), openingBalancePaise]
    );

    const account = accountResult.rows[0];

    if (openingBalancePaise > 0) {
      const txid = randomUUID();
      const newClearingBalance =
        BigInt(clearing.balance_paise) + BigInt(openingBalancePaise);

      await client.query(
        'UPDATE accounts SET balance_paise=$2 WHERE id=$1',
        [clearing.id, newClearingBalance.toString()]
      );

      await client.query(
        `INSERT INTO ledger_entries
         (transaction_id, account_id, entry_type, amount_paise,
          balance_after_paise, initiator_user_id, description)
         VALUES
         ($1,$2,'credit',$3,$4,$5,'Opening balance'),
         ($1,$6,'debit',$3,$7,$5,'Opening balance clearing')`,
        [
          txid,
          account.id,
          openingBalancePaise,
          String(openingBalancePaise),
          req.user.id,
          clearing.id,
          newClearingBalance.toString()
        ]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json(account);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Account creation failed:', e);
    return res.status(400).json({ error: 'Could not create account' });
  } finally {
    client.release();
  }
});

// LIST CUSTOMER ACCOUNTS ONLY
app.get('/api/accounts', requireAuth, async (req, res) => {
  try {
    const q =
      req.user.role === 'admin' || req.user.role === 'auditor'
        ? await pool.query(
            `SELECT id,owner_user_id,account_name,currency,
                    balance_paise,created_at
             FROM accounts
             WHERE account_type = 'customer'
             ORDER BY id`
          )
        : await pool.query(
            `SELECT id,owner_user_id,account_name,currency,
                    balance_paise,created_at
             FROM accounts
             WHERE owner_user_id=$1 AND account_type = 'customer'
             ORDER BY id`,
            [req.user.id]
          );

    return res.json(q.rows);
  } catch (e) {
    console.error('Account listing failed:', e);
    return res.status(500).json({ error: 'Could not list accounts' });
  }
});

// DOUBLE-ENTRY MONEY MOVEMENT
async function moveMoney(req, res, kind) {
  const { accountId, toAccountId, amountPaise, description = '' } = req.body || {};
  const key = req.header('Idempotency-Key');

  if (!key || key.length > 200) {
    return res.status(400).json({
      error: 'A valid Idempotency-Key header is required'
    });
  }

  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    return res.status(400).json({
      error: 'amountPaise must be a positive integer'
    });
  }

  if (
    !accountId ||
    (kind === 'transfer' &&
      (!toAccountId || String(accountId) === String(toAccountId)))
  ) {
    return res.status(400).json({ error: 'Valid account ids required' });
  }

  const payload = JSON.stringify({
    kind,
    accountId,
    toAccountId: toAccountId || null,
    amountPaise,
    description
  });

  const hash = createHash('sha256').update(payload).digest('hex');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const inserted = await client.query(
      `INSERT INTO idempotency_keys(user_id,key,request_hash)
       VALUES($1,$2,$3)
       ON CONFLICT (user_id,key) DO NOTHING
       RETURNING key`,
      [req.user.id, key, hash]
    );

    if (!inserted.rowCount) {
      const prior = await client.query(
        `SELECT request_hash,response_json
         FROM idempotency_keys
         WHERE user_id=$1 AND key=$2
         FOR UPDATE`,
        [req.user.id, key]
      );

      if (!prior.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Could not verify previous idempotency request'
        });
      }

      if (prior.rows[0].request_hash !== hash) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Idempotency key reused with different request'
        });
      }

      if (prior.rows[0].response_json) {
        await client.query('COMMIT');
        return res.json({
          ...prior.rows[0].response_json,
          replayed: true
        });
      }

      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Request is already being processed; retry shortly'
      });
    }

    let clearingId = null;

    if (kind !== 'transfer') {
      const clearing = await client.query(
        `SELECT s.id
         FROM accounts s
         JOIN accounts customer
           ON customer.id=$1 AND customer.currency=s.currency
         WHERE s.account_type='system'
         LIMIT 1`,
        [accountId]
      );

      if (!clearing.rowCount) {
        throw new Error('System clearing account not configured');
      }

      clearingId = clearing.rows[0].id;
    }

    const ids = kind === 'transfer'
      ? [Number(accountId), Number(toAccountId)].sort((a, b) => a - b)
      : [Number(accountId), Number(clearingId)].sort((a, b) => a - b);

    const locked = await client.query(
      `SELECT id,owner_user_id,balance_paise,account_type,currency
       FROM accounts
       WHERE id=ANY($1::bigint[])
       ORDER BY id
       FOR UPDATE`,
      [ids]
    );

    const source = locked.rows.find(
      a => String(a.id) === String(accountId)
    );

    const target = kind === 'transfer'
      ? locked.rows.find(a => String(a.id) === String(toAccountId))
      : null;

    const clearingAccount = kind !== 'transfer'
      ? locked.rows.find(a => String(a.id) === String(clearingId))
      : null;

    const authorised =
      source &&
      source.account_type === 'customer' &&
      (req.user.role === 'admin' ||
        (req.user.role === 'holder' &&
          String(source.owner_user_id) === String(req.user.id)));

    if (
      !authorised ||
      (kind === 'transfer' &&
        (!target ||
          target.account_type !== 'customer' ||
          !(req.user.role === 'admin' ||
            (req.user.role === 'holder' &&
              String(target.owner_user_id) === String(req.user.id)))))
    ) {
      const result = {
        ok: false,
        error: 'Not authorised for one or more accounts'
      };

      if (source && source.account_type === 'customer') {
        await client.query(
          `INSERT INTO ledger_entries
           (transaction_id,account_id,entry_type,amount_paise,
            balance_after_paise,initiator_user_id,description)
           VALUES($1,$2,'refused',$3,$4,$5,$6)`,
          [
            randomUUID(), source.id, amountPaise, source.balance_paise,
            req.user.id, 'Refused: unauthorised'
          ]
        );
      }

      await client.query(
        `UPDATE idempotency_keys SET response_json=$3
         WHERE user_id=$1 AND key=$2`,
        [req.user.id, key, JSON.stringify(result)]
      );

      await client.query('COMMIT');
      return res.status(403).json(result);
    }

    if (
      (kind === 'withdraw' || kind === 'transfer') &&
      BigInt(source.balance_paise) < BigInt(amountPaise)
    ) {
      const result = { ok: false, error: 'Insufficient funds' };

      await client.query(
        `INSERT INTO ledger_entries
         (transaction_id,account_id,entry_type,amount_paise,
          balance_after_paise,initiator_user_id,description)
         VALUES($1,$2,'refused',$3,$4,$5,$6)`,
        [
          randomUUID(), source.id, amountPaise, source.balance_paise,
          req.user.id, 'Refused: insufficient funds'
        ]
      );

      await client.query(
        `UPDATE idempotency_keys SET response_json=$3
         WHERE user_id=$1 AND key=$2`,
        [req.user.id, key, JSON.stringify(result)]
      );

      await client.query('COMMIT');
      return res.status(409).json(result);
    }

    if (kind !== 'transfer' && !clearingAccount) {
      throw new Error('System clearing account could not be locked');
    }

    const txid = randomUUID();
    const amount = BigInt(amountPaise);

    const newSource = kind === 'deposit'
      ? BigInt(source.balance_paise) + amount
      : BigInt(source.balance_paise) - amount;

    await client.query(
      'UPDATE accounts SET balance_paise=$2 WHERE id=$1',
      [source.id, newSource.toString()]
    );

    await client.query(
      `INSERT INTO ledger_entries
       (transaction_id,account_id,entry_type,amount_paise,
        balance_after_paise,initiator_user_id,description)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        txid,
        source.id,
        kind === 'deposit' ? 'credit' : 'debit',
        amountPaise,
        newSource.toString(),
        req.user.id,
        description || kind
      ]
    );

    let newTarget = null;

    if (kind === 'transfer') {
      newTarget = BigInt(target.balance_paise) + amount;

      await client.query(
        'UPDATE accounts SET balance_paise=$2 WHERE id=$1',
        [target.id, newTarget.toString()]
      );

      await client.query(
        `INSERT INTO ledger_entries
         (transaction_id,account_id,entry_type,amount_paise,
          balance_after_paise,initiator_user_id,description)
         VALUES($1,$2,'credit',$3,$4,$5,$6)`,
        [
          txid, target.id, amountPaise, newTarget.toString(),
          req.user.id, description || 'transfer received'
        ]
      );
    } else {
      const newClearing = kind === 'deposit'
        ? BigInt(clearingAccount.balance_paise) + amount
        : BigInt(clearingAccount.balance_paise) - amount;

      await client.query(
        'UPDATE accounts SET balance_paise=$2 WHERE id=$1',
        [clearingAccount.id, newClearing.toString()]
      );

      await client.query(
        `INSERT INTO ledger_entries
         (transaction_id,account_id,entry_type,amount_paise,
          balance_after_paise,initiator_user_id,description)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          txid,
          clearingAccount.id,
          kind === 'deposit' ? 'debit' : 'credit',
          amountPaise,
          newClearing.toString(),
          req.user.id,
          description || `Clearing for ${kind}`
        ]
      );
    }

    const result = {
      ok: true,
      transactionId: txid,
      kind,
      amountPaise,
      sourceBalancePaise: newSource.toString(),
      ...(newTarget !== null
        ? { targetBalancePaise: newTarget.toString() }
        : {})
    };

    await client.query(
      `UPDATE idempotency_keys SET response_json=$3
       WHERE user_id=$1 AND key=$2`,
      [req.user.id, key, JSON.stringify(result)]
    );

    await client.query('COMMIT');
    return res.json(result);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Money transaction failed:', e);
    return res.status(500).json({ error: 'Transaction failed safely' });
  } finally {
    client.release();
  }
}

// MONEY ROUTES
app.post('/api/money/deposit', requireAuth, allowRoles('admin', 'holder'),
  (req, res) => moveMoney(req, res, 'deposit'));

app.post('/api/money/withdraw', requireAuth, allowRoles('admin', 'holder'),
  (req, res) => moveMoney(req, res, 'withdraw'));

app.post('/api/money/transfer', requireAuth, allowRoles('admin', 'holder'),
  (req, res) => moveMoney(req, res, 'transfer'));

// ACCOUNT STATEMENT
app.get('/api/accounts/:id/statement', requireAuth,
  allowRoles('admin', 'auditor', 'holder'), async (req, res) => {
    try {
      const a = await pool.query(
        `SELECT id,owner_user_id,balance_paise
         FROM accounts
         WHERE id=$1 AND account_type='customer'`,
        [req.params.id]
      );

      if (!a.rowCount) {
        return res.status(404).json({ error: 'Account not found' });
      }

      const account = a.rows[0];

      if (
        req.user.role === 'holder' &&
        String(account.owner_user_id) !== String(req.user.id)
      ) {
        return res.status(403).json({
          error: 'Not authorised for this account'
        });
      }

      const rows = await pool.query(
        `SELECT id,transaction_id,entry_type,amount_paise,
                balance_after_paise,initiator_user_id,description,created_at
         FROM ledger_entries
         WHERE account_id=$1
         ORDER BY created_at,id`,
        [req.params.id]
      );

      return res.json({
        accountId: account.id,
        currentBalancePaise: account.balance_paise,
        entries: rows.rows
      });
    } catch (e) {
      console.error('Statement error:', e);
      return res.status(500).json({ error: 'Could not load statement' });
    }
  }
);

// AUDIT LEDGER
app.get('/api/audit/ledger', requireAuth, allowRoles('admin', 'auditor'),
  async (_req, res) => {
    try {
      const q = await pool.query(
        'SELECT * FROM ledger_entries ORDER BY created_at,id'
      );
      return res.json(q.rows);
    } catch (e) {
      console.error('Audit ledger error:', e);
      return res.status(500).json({ error: 'Could not load ledger' });
    }
  });

app.listen(PORT, () =>
  console.log(`BalanceVault API listening on http://localhost:${PORT}`)
);
