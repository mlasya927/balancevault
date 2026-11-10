
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

try {
  if (!name || !email || !password || password.length < 12) {
    throw new Error(
      'Set BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL and a password of at least 12 characters.'
    );
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(987654321)");

    const existingAdmin = await client.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );

    if (existingAdmin.rowCount > 0) {
      throw new Error('An admin already exists. Bootstrap refused.');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')`,
      [name, email, passwordHash]
    );

    await client.query('COMMIT');
    console.log('First admin created successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  console.error('Admin bootstrap failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
