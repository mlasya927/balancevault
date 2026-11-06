# Five-minute demo outline

Only record this after you have run and verified the steps.
1. Explain LedgerLine and the money conservation invariant.
2. Sign in as the demo holder and show the account balance.
3. Show a deposit/withdrawal/transfer and the resulting statement.
4. Explain the idempotency key and demonstrate a retry using the same key via an API client.
5. Explain PostgreSQL row locking and transaction boundaries; run the concurrent withdrawal test once implemented.
6. Sign in as auditor, show read-only ledger access and denied money movement.
7. Show THREATS.md, test results and known gaps.
