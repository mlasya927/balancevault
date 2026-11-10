import test from 'node:test';
import assert from 'node:assert/strict';
import { allowRoles } from '../src/auth.js';

function runMiddleware(role, allowedRoles) {
  const req = { user: { role } };
  let statusCode = 200;
  let responseBody;
  let nextCalled = false;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    }
  };

  allowRoles(...allowedRoles)(req, res, () => {
    nextCalled = true;
  });

  return { statusCode, responseBody, nextCalled };
}

test('admin can access admin-protected routes', () => {
  const result = runMiddleware('admin', ['admin']);
  assert.equal(result.nextCalled, true);
  assert.equal(result.statusCode, 200);
});

test('holder cannot access admin-only routes', () => {
  const result = runMiddleware('holder', ['admin']);
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
});

test('auditor can access auditor-protected routes', () => {
  const result = runMiddleware('auditor', ['admin', 'auditor']);
  assert.equal(result.nextCalled, true);
});