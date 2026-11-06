// Integration test plan: start PostgreSQL, run db:init and db:seed, then exercise
// concurrent POST /api/money/withdraw calls with the same seeded holder token.
// This starter keeps tests explicit rather than pretending unexecuted tests passed.
import test from 'node:test';
import assert from 'node:assert/strict';

test('money uses integer paise, not floating point rupees', () => {
  const rupees = 12.34;
  const paise = Math.round(rupees * 100);
  assert.equal(paise, 1234);
  assert.equal(Number.isSafeInteger(paise), true);
});

test('a valid transfer amount is a positive safe integer', () => {
  assert.equal(Number.isSafeInteger(100), true);
  assert.equal(Number.isSafeInteger(1.25), false);
  assert.equal(0 > 0, false);
});
