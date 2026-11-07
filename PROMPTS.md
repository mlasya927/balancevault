# PROMPTS.md â€” AI development log

Add entries as you actually use an AI assistant. The examples below are a template only; replace them with real dated interactions, observed errors, verification steps, and actual commit links. Do not submit invented evidence.

## Entry template

### YYYY-MM-DD â€” short topic
- **Prompt:** Paste the prompt you actually used.
- **AI output:** Summarise or link the generated code.
- **Specific issue found:** Describe a real bug or unsafe assumption you observed. If none, state what you independently checked and the evidence.
- **What I did:** Explain the change you made and how you tested it.
- **Fix commit:** https://github.com/YOUR-USERNAME/YOUR-REPO/commit/ACTUAL_COMMIT_SHA

## Required focus
At least two genuine entries should cover money integrity, concurrency, or idempotency. Record five genuine dated entries over your development work. Do not fill this file with fictional prompts or fake commit links.

## 2026-11-06 — User-scoped idempotency

- **Prompt:** Review the LedgerLine idempotency implementation. Check whether idempotency keys should be scoped by user, and help update the database schema and server queries safely.
- **AI output:** Explained the risk of globally scoped idempotency keys and provided changes to use a composite `(user_id, key)` primary key. Updated the server INSERT, SELECT, and UPDATE queries to include the authenticated user ID.
- **Specific issue found:** The original schema used `key` alone as the primary key, and the server replay lookup was not scoped to the authenticated user. This could allow cross-user idempotency-key collisions.
- **What I did:** Updated `database/schema.sql` to use `(user_id, key)` as the primary key and edited the corresponding queries in `src/server.js`. Verified JavaScript syntax with `node --check src/server.js`. Ran `node --test test/money.test.js test/integration.test.js`: 2 passed, 1 skipped, 0 failed. Database integration remains unverified because PostgreSQL is not configured.
- **Fix commit:** Pending — add the actual commit URL after committing these changes.
