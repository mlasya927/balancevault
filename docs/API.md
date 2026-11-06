# API notes

All protected routes use `Authorization: Bearer <JWT>`. Money routes also require `Idempotency-Key: <unique-operation-key>`.

## Authentication
`POST /api/auth/login` — public. Body: `{ "email": "...", "password": "..." }`.

## Accounts
`GET /api/accounts` — authenticated. Admin/auditor: all accounts. Holder: own accounts.
`POST /api/accounts` — admin only. Creates account and optional opening credit.

## Money
`POST /api/money/deposit`, `/withdraw`, `/transfer` — admin or holder. Server enforces ownership. Amount is integer paise. Each operation is atomic.

## Statements and audit
`GET /api/accounts/:id/statement` — authenticated; holder must own account.
`GET /api/audit/ledger` — admin/auditor only, read-only.

See README for request examples and current limitations.
