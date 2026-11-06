# LedgerLine

A learning MVP for the Snovasys Fresher Hiring Challenge 2026. It demonstrates authenticated roles, accounts, integer-paise balances, deposits/withdrawals/transfers, database transactions, idempotency keys, statements, and an append-only ledger trigger.

> Important: this is a starter implementation, not a certified banking system. Run the tests, review the security notes, and do not use real money or real customer data. The current test suite is only a small unit-test baseline; the required concurrency, retry, conservation, and cross-user authorization integration tests still need to be written and run.

## Requirements

- Node.js 20+
- Docker Desktop (or a local PostgreSQL 16 server)
- Git

## Run locally

1. Copy `.env.example` to `.env` and change `JWT_SECRET` to a long random value.
2. Start PostgreSQL: `docker compose up -d`
3. Install packages: `npm install`
4. Create tables: `npm run db:init`
5. Seed demo users/account: `npm run db:seed`
6. Start API: `npm run dev`
7. Open `http://localhost:4000/` for the UI or `http://localhost:4000/health` for the health check

## Demo login accounts

These are local demo-only credentials. Change them before any public deployment; never use these passwords for personal accounts.

| Role | Email | Password |
|---|---|---|
| Admin | admin@ledgerline.test | AdminDemo123! |
| Account holder | holder@ledgerline.test | HolderDemo123! |
| Auditor | auditor@ledgerline.test | AuditorDemo123! |

## API overview

Login: `POST /api/auth/login` with `{ "email": "...", "password": "..." }`. Use returned token as `Authorization: Bearer TOKEN`.

- `GET /api/me` — any signed-in user
- `GET /api/accounts` — admin/auditor see all; holder sees owned accounts
- `POST /api/accounts` — admin only; `{ "ownerUserId": 2, "accountName": "Payroll", "openingBalancePaise": 50000 }`
- `POST /api/money/deposit` — admin/holder; body `{ "accountId": 1, "amountPaise": 500, "description": "cash deposit" }`
- `POST /api/money/withdraw` — admin/holder; body `{ "accountId": 1, "amountPaise": 500 }`
- `POST /api/money/transfer` — admin/holder; body `{ "accountId": 1, "toAccountId": 2, "amountPaise": 500 }`
- All money endpoints require a unique `Idempotency-Key` header for each distinct intended operation.
- `GET /api/accounts/:id/statement` — statement; holder only for own account, admin/auditor can read
- `GET /api/audit/ledger` — admin/auditor only

All amounts are integer paise (₹1 = 100 paise). Do not send decimal rupee amounts.

## Integrity design

- Money changes happen in a single PostgreSQL transaction.
- Account rows are locked in ascending ID order with `FOR UPDATE` before checking/updating balances.
- Transfers debit and credit inside the same transaction.
- A unique idempotency key and request hash prevent a key from being reused for a different operation; a stored response is returned on retry.
- Refused insufficient-funds and unauthorized attempts are recorded when an account can be safely identified.
- Ledger UPDATE/DELETE is blocked by a database trigger. A production app should connect with a restricted DB role, not the schema owner.
- The database balance has a non-negative CHECK constraint.

## Known gaps — do not claim these are complete

- A minimal browser UI is included in `public/`; it is an MVP, not a polished product.
- No production-grade rate limiting, refresh-token flow, password reset, email verification, or security headers.
- Seed passwords are for local demos only and must be rotated before deployment.
- `test/integration.test.js` is an initial API check for idempotent retry and auditor read-only access. Full concurrency, conservation and cross-user authorization integration tests are still required.
- A public deployment and five-minute demo video are not included.
- The auditor can read all accounts and ledger entries; refine the exact policy and document it.
- A holder transfer is currently allowed only when the holder owns both source and destination accounts.
- Review all edge cases with a mentor before treating this as secure.

## Development evidence

Keep `PROMPTS.md` updated with real dated prompts, the actual AI output, a specific mistake you found, how you checked/fixed it, and the commit that contains the fix. Do not invent entries or commits.

## License

Educational challenge project.

## Tests

- `npm test` runs the small unit tests and skips the integration test by default.
- Start the app and seed data, then run `npm run test:integration` for the initial API check.
- A real concurrent-overdraft race test and complete conservation/cross-user tests remain unfinished.
