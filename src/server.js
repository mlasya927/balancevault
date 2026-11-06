import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID, createHash } from 'node:crypto';
import { pool } from './db.js';
import { requireAuth, allowRoles } from './auth.js';

const app = express();
app.use(express.static(new URL('../public', import.meta.url).pathname));
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 4000;
if (!process.env.JWT_SECRET) console.warn('WARNING: JWT_SECRET is not set. Set it before use.');

app.get('/health', (_req,res) => res.json({ status:'ok', service:'LedgerLine API' }));

app.post('/api/auth/login', async (req,res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({error:'Email and password required'});
    const result = await pool.query('SELECT id,name,email,password_hash,role FROM users WHERE email=$1',[email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({error:'Invalid credentials'});
    const token = jwt.sign({ id:user.id, name:user.name, role:user.role },process.env.JWT_SECRET,{expiresIn:'4h'});
    res.json({ token, user:{id:user.id,name:user.name,email:user.email,role:user.role} });
  } catch (e) { res.status(500).json({error:'Login failed'}); }
});

app.get('/api/me', requireAuth, (req,res) => res.json({user:req.user}));

app.post('/api/accounts', requireAuth, allowRoles('admin'), async (req,res) => {
  const { ownerUserId, accountName, openingBalancePaise=0 } = req.body || {};
  if (!ownerUserId || !accountName || !Number.isSafeInteger(openingBalancePaise) || openingBalancePaise < 0)
    return res.status(400).json({error:'Valid ownerUserId, accountName and non-negative openingBalancePaise required'});
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const a = await client.query('INSERT INTO accounts(owner_user_id,account_name,balance_paise) VALUES($1,$2,$3) RETURNING *',
      [ownerUserId,accountName,openingBalancePaise]);
    if (openingBalancePaise > 0) await client.query(
      `INSERT INTO ledger_entries(transaction_id,account_id,entry_type,amount_paise,balance_after_paise,initiator_user_id,description)
       VALUES($1,$2,'credit',$3,$3,$4,'Opening balance')`,
      [randomUUID(),a.rows[0].id,openingBalancePaise,req.user.id]);
    await client.query('COMMIT'); res.status(201).json(a.rows[0]);
  } catch(e) { await client.query('ROLLBACK'); res.status(400).json({error:'Could not create account'}); }
  finally { client.release(); }
});

app.get('/api/accounts', requireAuth, async (req,res) => {
  try {
    const q = req.user.role === 'admin' || req.user.role === 'auditor'
      ? await pool.query('SELECT id,owner_user_id,account_name,currency,balance_paise,created_at FROM accounts ORDER BY id')
      : await pool.query('SELECT id,owner_user_id,account_name,currency,balance_paise,created_at FROM accounts WHERE owner_user_id=$1 ORDER BY id',[req.user.id]);
    res.json(q.rows);
  } catch { res.status(500).json({error:'Could not list accounts'}); }
});

async function moveMoney(req,res,kind) {
  const { accountId, toAccountId, amountPaise, description='' } = req.body || {};
  const key = req.header('Idempotency-Key');
  if (!key || key.length > 200) return res.status(400).json({error:'A valid Idempotency-Key header is required'});
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) return res.status(400).json({error:'amountPaise must be a positive integer'});
  if (!accountId || (kind==='transfer' && (!toAccountId || String(accountId)===String(toAccountId))))
    return res.status(400).json({error:'Valid account ids required'});
  const payload = JSON.stringify({kind,accountId,toAccountId:toAccountId||null,amountPaise,description});
  const hash = createHash('sha256').update(payload).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      'INSERT INTO idempotency_keys(key,request_hash) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING key',[key,hash]);
    if (!inserted.rowCount) {
      const prior = await client.query('SELECT request_hash,response_json FROM idempotency_keys WHERE key=$1 FOR UPDATE',[key]);
      if (prior.rows[0].request_hash !== hash) { await client.query('ROLLBACK'); return res.status(409).json({error:'Idempotency key reused with different request'}); }
      if (prior.rows[0].response_json) { await client.query('COMMIT'); return res.json({...prior.rows[0].response_json,replayed:true}); }
      await client.query('ROLLBACK'); return res.status(409).json({error:'Request is already being processed; retry shortly'});
    }

    const ids = kind==='transfer' ? [Number(accountId),Number(toAccountId)].sort((a,b)=>a-b) : [Number(accountId)];
    const locked = await client.query('SELECT id,owner_user_id,balance_paise FROM accounts WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);
    const source = locked.rows.find(a=>String(a.id)===String(accountId));
    const target = kind==='transfer' ? locked.rows.find(a=>String(a.id)===String(toAccountId)) : null;
    let result;
    const authorised = source && (req.user.role==='admin' || (req.user.role==='holder' && String(source.owner_user_id)===String(req.user.id)));
    if (!authorised || !source || (kind==='transfer' && (!target || !(req.user.role==='admin' || (req.user.role==='holder' && String(target.owner_user_id)===String(req.user.id)))))) {
      result={ok:false,error:'Not authorised for one or more accounts'};
      if (source) await client.query(
        `INSERT INTO ledger_entries(transaction_id,account_id,entry_type,amount_paise,balance_after_paise,initiator_user_id,description)
         VALUES($1,$2,'refused',$3,$4,$5,$6)`,
        [randomUUID(),source.id,amountPaise,source.balance_paise,req.user.id,'Refused: unauthorised']);
      await client.query('UPDATE idempotency_keys SET response_json=$2 WHERE key=$1',[key,JSON.stringify(result)]);
      await client.query('COMMIT'); return res.status(403).json(result);
    }
    if ((kind==='withdraw' || kind==='transfer') && BigInt(source.balance_paise)<BigInt(amountPaise)) {
      result={ok:false,error:'Insufficient funds'};
      await client.query(
        `INSERT INTO ledger_entries(transaction_id,account_id,entry_type,amount_paise,balance_after_paise,initiator_user_id,description)
         VALUES($1,$2,'refused',$3,$4,$5,$6)`,
        [randomUUID(),source.id,amountPaise,source.balance_paise,req.user.id,'Refused: insufficient funds']);
      await client.query('UPDATE idempotency_keys SET response_json=$2 WHERE key=$1',[key,JSON.stringify(result)]);
      await client.query('COMMIT'); return res.status(409).json(result);
    }
    const txid=randomUUID();
    let newSource=BigInt(source.balance_paise);
    if (kind==='deposit') newSource += BigInt(amountPaise); else newSource -= BigInt(amountPaise);
    await client.query('UPDATE accounts SET balance_paise=$2 WHERE id=$1',[source.id,newSource.toString()]);
    await client.query(
      `INSERT INTO ledger_entries(transaction_id,account_id,entry_type,amount_paise,balance_after_paise,initiator_user_id,description)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [txid,source.id,kind==='deposit'?'credit':'debit',amountPaise,newSource.toString(),req.user.id,description||kind]);
    if (kind==='transfer') {
      const newTarget=BigInt(target.balance_paise)+BigInt(amountPaise);
      await client.query('UPDATE accounts SET balance_paise=$2 WHERE id=$1',[target.id,newTarget.toString()]);
      await client.query(
        `INSERT INTO ledger_entries(transaction_id,account_id,entry_type,amount_paise,balance_after_paise,initiator_user_id,description)
         VALUES($1,$2,'credit',$3,$4,$5,$6)`,
        [txid,target.id,amountPaise,newTarget.toString(),req.user.id,description||'transfer received']);
    }
    result={ok:true,transactionId:txid,kind,amountPaise,sourceBalancePaise:newSource.toString(),targetBalancePaise:target?String(BigInt(target.balance_paise)+BigInt(amountPaise)):undefined};
    await client.query('UPDATE idempotency_keys SET response_json=$2 WHERE key=$1',[key,JSON.stringify(result)]);
    await client.query('COMMIT'); return res.json(result);
  } catch(e) {
    await client.query('ROLLBACK');
    console.error(e);
    return res.status(500).json({error:'Transaction failed safely'});
  } finally { client.release(); }
}
app.post('/api/money/deposit',requireAuth,allowRoles('admin','holder'),(req,res)=>moveMoney(req,res,'deposit'));
app.post('/api/money/withdraw',requireAuth,allowRoles('admin','holder'),(req,res)=>moveMoney(req,res,'withdraw'));
app.post('/api/money/transfer',requireAuth,allowRoles('admin','holder'),(req,res)=>moveMoney(req,res,'transfer'));

app.get('/api/accounts/:id/statement',requireAuth,async(req,res)=>{
  try {
    const a=await pool.query('SELECT id,owner_user_id,balance_paise FROM accounts WHERE id=$1',[req.params.id]);
    if(!a.rowCount) return res.status(404).json({error:'Account not found'});
    const account=a.rows[0];
    if(req.user.role==='holder' && String(account.owner_user_id)!==String(req.user.id))
      return res.status(403).json({error:'Not authorised for this account'});
    const rows=await pool.query(
      `SELECT id,transaction_id,entry_type,amount_paise,balance_after_paise,initiator_user_id,description,created_at
       FROM ledger_entries WHERE account_id=$1 ORDER BY created_at,id`,[req.params.id]);
    res.json({accountId:account.id,currentBalancePaise:account.balance_paise,entries:rows.rows});
  } catch { res.status(500).json({error:'Could not load statement'}); }
});

app.get('/api/audit/ledger',requireAuth,allowRoles('admin','auditor'),async(_req,res)=>{
  try { const q=await pool.query('SELECT * FROM ledger_entries ORDER BY created_at,id'); res.json(q.rows); }
  catch { res.status(500).json({error:'Could not load ledger'}); }
});

app.listen(PORT,()=>console.log(`LedgerLine API listening on http://localhost:${PORT}`));
