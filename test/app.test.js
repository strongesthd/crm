const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET =
  'test-only-session-secret-that-is-long-enough-for-validation';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'test-password-with-more-than-twelve-characters';

const { adminPass, adminUser } = require('../src/config');
const { createDatabase } = require('../src/db');
const createApp = require('../src/app');
const { escapeCsvCell, isValidDate } = require('../src/routes/transactions');

const extractCsrfToken = (html) => {
  const match = html.match(/name="_csrf" value="([a-f0-9]+)"/);

  assert.ok(match, 'Expected a CSRF token in the rendered form');

  return match[1];
};

const getSessionCookie = (response) => {
  const setCookieHeader = response.headers.get('set-cookie');

  assert.ok(setCookieHeader, 'Expected the server to set a session cookie');

  return setCookieHeader.split(';')[0];
};

test('protects CRM routes, validates CSRF, escapes customer input, and exports filtered CSV', async (context) => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'internal-crm-finance-test-'),
  );
  const db = createDatabase({
    adminPass,
    adminUser,
    databasePath: temporaryDirectory,
  });
  const server = createApp(db).listen(0, '127.0.0.1');

  context.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    db.close();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  await new Promise((resolve) => server.once('listening', resolve));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const unauthenticatedResponse = await fetch(`${baseUrl}/customers`, {
    redirect: 'manual',
  });

  assert.equal(unauthenticatedResponse.status, 302);
  assert.equal(unauthenticatedResponse.headers.get('location'), '/login');

  const loginPageResponse = await fetch(`${baseUrl}/login`);
  const loginHtml = await loginPageResponse.text();
  const loginCsrfToken = extractCsrfToken(loginHtml);
  const anonymousCookie = getSessionCookie(loginPageResponse);
  const invalidCsrfResponse = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: {
      cookie: anonymousCookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      _csrf: 'invalid-token',
      username: adminUser,
      password: adminPass,
    }),
    redirect: 'manual',
  });

  assert.equal(invalidCsrfResponse.status, 403);

  const loginResponse = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: {
      cookie: anonymousCookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      _csrf: loginCsrfToken,
      username: adminUser,
      password: adminPass,
    }),
    redirect: 'manual',
  });

  assert.equal(loginResponse.status, 302);
  assert.equal(loginResponse.headers.get('location'), '/');

  const authenticatedCookie = getSessionCookie(loginResponse);
  const transactionsPageResponse = await fetch(`${baseUrl}/transactions`, {
    headers: { cookie: authenticatedCookie },
  });
  const transactionsHtml = await transactionsPageResponse.text();
  const csrfToken = extractCsrfToken(transactionsHtml);

  assert.equal(transactionsPageResponse.status, 200);
  assert.match(transactionsHtml, /Sổ thu chi/);

  const createCustomerResponse = await fetch(`${baseUrl}/customers`, {
    method: 'POST',
    headers: {
      cookie: authenticatedCookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      _csrf: csrfToken,
      name: '<img src=x onerror=alert(1)>',
      phone: '',
      email: '',
      status: 'Tiềm năng',
      notes: '',
    }),
    redirect: 'manual',
  });

  assert.equal(createCustomerResponse.status, 302);

  const customerPageResponse = await fetch(`${baseUrl}/customers`, {
    headers: { cookie: authenticatedCookie },
  });
  const customerHtml = await customerPageResponse.text();

  assert.equal(customerPageResponse.status, 200);
  assert.match(customerHtml, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(customerHtml, /<img src=x onerror=alert\(1\)>/);

  const csvResponse = await fetch(`${baseUrl}/transactions/export.csv?type=THU`, {
    headers: { cookie: authenticatedCookie },
  });
  const csvBuffer = Buffer.from(await csvResponse.arrayBuffer());
  const csv = csvBuffer.toString('utf8');

  assert.equal(csvResponse.status, 200);
  assert.deepEqual([...csvBuffer.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(csv, /"Loại","Số tiền \(VNĐ\)"/);
  assert.match(csv, /"Thu"/);
  assert.doesNotMatch(csv, /"Chi"/);
});

test('validates ISO transaction dates and protects CSV from formula injection', () => {
  assert.equal(isValidDate('2026-02-28'), true);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('28/02/2026'), false);
  assert.equal(escapeCsvCell('=HYPERLINK("https://example.com")'), '"\'=HYPERLINK(""https://example.com"")"');
  assert.equal(escapeCsvCell('Công ty "An Bình"'), '"Công ty ""An Bình"""');
});
