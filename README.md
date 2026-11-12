
# BalanceVault

BalanceVault is a learning MVP developed for the Snovasys Fresher Hiring Challenge 2026. It demonstrates role-based authentication, account management, integer-paise money operations, double-entry bookkeeping, idempotency, transaction safety, statements, and an append-only ledger.

> **Disclaimer:** This is an educational project, not a certified banking system. Do not use real money, real customer information, or production financial accounts.

## Features

- JWT-based authentication
- Admin, account holder, and auditor roles
- Account creation and account ownership
- Deposits, withdrawals, and transfers
- Integer-paise monetary calculations
- PostgreSQL database transactions
- Idempotency-key support
- Double-entry debit and credit ledger
- Account statements
- Append-only ledger protection
- Role-based and cross-user access restrictions

## Requirements

- Node.js 20+
- PostgreSQL 16 or Docker Desktop
- Git

## Local setup

1. Copy `.env.example` to `.env`.
2. Set a strong, private `JWT_SECRET` and configure `DATABASE_URL`.
3. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

4. Install dependencies:

   ```bash
   npm install
   ```

5. Initialize the database:

   ```bash
   node scripts/init-db.js
   ```

6. Seed demo users and accounts:

   ```bash
   npm run db:seed
   ```

7. Start the application:

   ```bash
   node src/server.js
   ```

8. Open `http://localhost:4000`.

## Demo accounts

These credentials are for local development only.

| Role | Email | Password |
|---|---|---|
| Admin | admin@ledgerline.test | AdminDemo123! |
| Holder | holder@ledgerline.test | HolderDemo123! |
| Auditor | auditor@ledgerline.test | AuditorDemo123! |

Do not use these demo credentials for a public deployment.

## API overview

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/register` | Register a user |
| `POST /api/auth/login` | Authenticate |
| `GET /api/me` | Get current user |
| `GET /api/accounts` | List accessible accounts |
| `POST /api/accounts` | Create an account (admin) |
| `POST /api/money/deposit` | Deposit funds |
| `POST /api/money/withdraw` | Withdraw funds |
| `POST /api/money/transfer` | Transfer funds |
| `GET /api/accounts/:id/statement` | View account statement |
| `GET /api/audit/ledger` | Access audit ledger |

Authenticated endpoints require:

`Authorization: Bearer TOKEN`

Money operations require a unique `Idempotency-Key` header for each distinct operation.

All monetary amounts are integer paise. ₹1 = 100 paise. Decimal rupee amounts must not be sent.

## Financial integrity

- Money operations run inside PostgreSQL transactions.
- Account rows are locked before balance updates.
- Transfers debit and credit accounts within the same transaction.
- Idempotency keys prevent duplicate processing on retries.
- Request hashes prevent reuse of a key for a different operation.
- Successful transactions create corresponding debit and credit ledger entries.
- Ledger updates and deletes are blocked by a database trigger.
- Account balances have a non-negative database constraint.

## Security and access control

- Admins can manage accounts.
- Holders are restricted to their own accounts.
- Auditors have read-only access to protected financial operations.
- Cross-user account and statement access is restricted.
- Authentication is required for protected API endpoints.

## Test results

The following tests were successfully executed locally on November 12, 2026:

- Admin route authorization
- Holder restriction on admin routes
- Auditor route authorization
- Integer-paise calculations
- Positive safe-integer validation
- Idempotent transaction retry
- Double-entry debit-credit conservation
- Concurrent duplicate request handling
- Cross-user account isolation
- Cross-user statement access restriction

Latest combined test run:

- 6 tests passed
- 0 failed
- 0 skipped

Latest expanded integration test:

- 1 test passed
- 0 failed
- 0 skipped

Run the integration test with the application server running:

```powershell
$env:RUN_INTEGRATION='1'; node --test .\test\integration.test.js; Remove-Item Env:RUN_INTEGRATION
```

Run the full test suite:

```powershell
$env:RUN_INTEGRATION='1'; node --test .\test\money.test.js .\test\integration.test.js .\test\auth.test.js; Remove-Item Env:RUN_INTEGRATION
```

## Known limitations

- This is an MVP, not production banking software.
- Production deployment security hardening is still required.
- Rate limiting, password reset, email verification, and refresh-token flows need further work.
- Concurrent testing currently verifies duplicate requests with the same idempotency key; it is not a complete concurrent-overdraft stress test.
- Additional failure-path, rollback, and load testing is recommended.
- Production database permissions and secrets must be configured securely.

## Development evidence

See [PROMPTS.md](PROMPTS.md) for genuine AI-assisted development records. Entries should describe actual prompts, generated changes, issues discovered, verification performed, and real commit references.

## License

Educational challenge project.
