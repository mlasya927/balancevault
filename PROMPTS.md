
# PROMPTS.md — AI Development Log

This document records AI-assisted development work on BalanceVault.
Historical prompt descriptions marked "reconstructed summary" are summaries
of the development work, not verbatim chat transcripts.

## Entry 1 — 2026-11-06 — Project baseline

- **Prompt:** Review the initial LedgerLine project structure and help establish the application baseline.
- **AI output:** Initial project setup and implementation guidance.
- **Specific issue found:** The initial implementation required further backend, database, and authentication development.
- **What I did:** Created the initial project baseline.
- **Fix commit:** https://github.com/mlasya927/balancevault/commit/292183a

## Entry 2 — 2026-11-07 — Backend and authentication

- **Prompt summary (reconstructed):** Help improve the backend, PostgreSQL database integration, and authentication implementation.
- **AI output:** Backend and authentication implementation changes.
- **Specific issue found:** Backend and database integration needed further development and verification.
- **What I did:** Updated the backend, database schema, package configuration, and server implementation. Reviewed the changes and subsequently tested authentication and protected routes.
- **Fix commit:** https://github.com/mlasya927/balancevault/commit/09daa43

## Entry 3 — 2026-11-10 — Role-based access control

- **Prompt summary (reconstructed):** Implement onboarding, role-based access control, and secure admin bootstrapping.
- **AI output:** Admin bootstrap implementation, role-based route restrictions, and authentication tests.
- **Specific issue found:** Different user roles require different permissions; admin-only routes must reject ordinary holders.
- **What I did:** Added the admin bootstrap script and authorization tests. Verified admin access, holder restrictions, and auditor-protected routes.
- **Fix commit:** https://github.com/mlasya927/balancevault/commit/028b278

## Entry 4 — 2026-11-10 — Double-entry accounting

- **Prompt summary (reconstructed):** Implement double-entry accounting for deposits, withdrawals, and transfers using database transactions.
- **AI output:** Double-entry ledger implementation and database changes.
- **Specific issue found:** Money movement must preserve matching debit and credit entries and avoid inconsistent account balances.
- **What I did:** Implemented the double-entry accounting changes. Later verified integer-paise handling, ledger conservation, and transaction retry behavior through integration tests.
- **Fix commit:** https://github.com/mlasya927/balancevault/commit/f8774b1

## Entry 5 — 2026-11-11 — BalanceVault UI redesign

- **Prompt summary (reconstructed):** Improve the application interface and redesign the LedgerLine UI as BalanceVault.
- **AI output:** UI redesign implementation.
- **Specific issue found:** The application needed a clearer and more consistent user interface.
- **What I did:** Updated the frontend design and reviewed the resulting application.
- **Fix commit:** https://github.com/mlasya927/balancevault/commit/2b50968

## Additional verification — 2026-11-12

- **Prompt:** Help verify idempotency, double-entry conservation, auditor permissions, and cross-user account isolation through integration tests.
- **AI output:** Expanded integration test coverage.
- **Specific issue found:** The existing integration tests did not cover all the required security and transaction scenarios.
- **What I did:** Ran the expanded integration test successfully. Verified duplicate concurrent requests with the same idempotency key return the same transaction ID. Also verified debit-credit conservation, auditor restrictions, and cross-user isolation.
- **Fix commit:** Pending — the current integration test changes have not yet been committed.

## Evidence policy

- Historical prompt summaries are identified as reconstructed summaries, not verbatim transcripts.
- Commit links refer to actual repository commits.
- New test results are recorded only after successful execution.
- No fabricated prompts, test results, or commit references should be submitted.
