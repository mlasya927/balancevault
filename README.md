# BalanceVault

**Smart Money. Secure Future.**

BalanceVault is an educational banking application developed for the **Snovasys Fresher Hiring Challenge 2026**.

It demonstrates role-based authentication, account management, deposits, withdrawals, transfers, integer-paise calculations, PostgreSQL transactions, idempotency, account statements, and an append-only audit ledger.

**Live Demo:** https://balancevault-6zmc.onrender.com

> **Disclaimer:** This is an educational MVP, not a certified banking system. Never use real money, real customer information, or production financial accounts.

## Features

- JWT-based authentication
- Admin, account holder, and auditor roles
- Customer and account management
- Deposits, withdrawals, and account transfers
- Integer-paise monetary calculations
- PostgreSQL database transactions
- Idempotency-key support
- Double-entry debit and credit ledger
- Account statements and transaction history
- Append-only ledger protection
- Role-based access restrictions

## Technology Stack

- Node.js
- Express.js
- PostgreSQL
- HTML, CSS, and JavaScript
- JWT authentication
- bcryptjs

## Requirements

- Node.js 20+
- PostgreSQL 16 or Docker Desktop
- Git

## Local Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/mlasya927/balancevault.git
   cd balancevault
   ```

2. Create your environment file:

   ```bash
   cp .env.example .env
   ```

3. Configure `DATABASE_URL` and a strong, private `JWT_SECRET` in `.env`.

4. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

5. Install dependencies:

   ```bash
   npm install
   ```

6. Initialize the database:

   ```bash
   npm run db:init
   ```

7. Seed demo data:

   ```bash
   npm run db:seed
   ```

8. Start the application:

   ```bash
   npm start
   ```

9. Open:

   `http://localhost:4000`

## Demo Accounts

Demo users can be created using the database seed script or the application's admin setup process.

Do not publish passwords or use demo credentials for personal or production accounts.

## API Overview

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login` | User authentication |
| `GET /api/me` | Current user details |
| `GET /api/accounts` | List accessible accounts |
| `POST /api/accounts` | Create an account |
| `POST /api/money/deposit` | Deposit funds |
| `POST /api/money/withdraw` | Withdraw funds |
| `POST /api/money/transfer` | Transfer funds |
| `GET /api/accounts/:id/statement` | View account statement |
| `GET /api/audit/ledger` | View audit ledger |

Authenticated endpoints require:

`Authorization: Bearer TOKEN`

Money operations require a unique `Idempotency-Key` header for each distinct operation.

All monetary amounts are represented in integer paise.

**₹1 = 100 paise.**

## Financial Integrity

- Money operations use PostgreSQL transactions.
- Account balances are checked before money movements.
- Transfers debit and credit accounts within a transaction.
- Idempotency keys help prevent duplicate processing.
- Request hashes help prevent idempotency-key reuse for different requests.
- Successful money movements create ledger entries.
- Database triggers protect ledger records from updates and deletes.
- Account balances have a non-negative database constraint.

## Security and Access Control

- JWT authentication protects restricted API endpoints.
- Admins can manage customer accounts.
- Account holders are restricted to permitted accounts.
- Auditors have read-only access to audit information.
- Cross-user access restrictions are implemented.

## Testing

The deployed demo has been manually tested for:

- Admin login
- Customer and account management
- Money transfers
- Withdrawals
- Account statements
- Audit ledger access

Automated tests can be run using:

```bash
npm test
```

For the integration test, start the application first and run:

```bash
npm run test:integration
```

Review the test output before reporting automated test results.

## Known Limitations

- Financial transaction and ledger consistency require further verification before any real-world use.
- This is an MVP and not production banking software.
- Production-grade security hardening is still required.
- Rate limiting, password reset, email verification, and refresh-token support need further work.
- Additional concurrency, rollback, failure-path, and load testing is recommended.
- Database permissions and production secrets require secure configuration.
- The user interface is a minimal educational demonstration.

## Development Evidence

See [PROMPTS.md](PROMPTS.md) for genuine AI-assisted development records, including prompts, changes, issues discovered, verification, and actual commit references.

## License

Educational challenge project.
