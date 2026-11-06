# THREATS.md — LedgerLine

This document describes the starter's current threat model. Update it as you test and change the code.

| Threat | Current mitigation | Remaining risk / verification |
|---|---|---|
| Duplicate request after timeout | Unique idempotency key, request hash, stored response in DB | Add integration test for concurrent same-key requests and verify the same response is returned |
| Same key reused with different body | Request hash mismatch returns 409 | Test all money endpoints |
| Two withdrawals race | PostgreSQL row lock (`FOR UPDATE`) serializes updates to the same account | Must add a real concurrent integration test |
| Transfer partially applies | Debit, credit, ledger entries and idempotency response share one DB transaction | Test forced failure between debit and credit |
| Holder accesses another account | Server checks ownership for source and destination and statement | Add tests for every endpoint and account ID |
| Negative balance | Row lock plus balance check plus DB CHECK constraint | Test simultaneous withdrawals exceeding total balance |
| Ledger row edited/deleted | Trigger rejects UPDATE/DELETE | DB owner/superuser can bypass/drop trigger; use restricted app DB role and backups |
| Password guessing | bcrypt password hashes | Rate limiting and alerting are not implemented |
| Token theft | Short-lived JWT | HTTPS, secure client storage, revocation, refresh strategy not implemented |
| Malicious oversized input | Basic validation on money endpoints | Add request size limits, schema validation and rate limiting |

## Accepted risks for this learning MVP

This is not production banking software. It has no real-money integration, regulatory controls, formal penetration test, high-availability setup, or independent reconciliation process. Do not store real customer data or expose demo passwords on a public deployment without changing them.
