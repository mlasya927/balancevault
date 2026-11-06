import 'dotenv/config';
import fs from 'node:fs';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const sql = fs.readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  console.log('Database schema ready.');
} finally { await pool.end(); }
