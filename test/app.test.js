const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');

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

const login = async (baseUrl, username, password) => {
  const loginPageResponse = await fetch(`${baseUrl}/login`);
  const loginPageHtml = await loginPageResponse.text();
  const cookie = getSessionCookie(loginPageResponse);
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      _csrf: extractCsrfToken(loginPageHtml),
      username,
      password,
    }),
    redirect: 'manual',
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/');

  return getSessionCookie(response);
};

const getCsrfToken = async (baseUrl, cookie, route) => {
  const response = await fetch(`${baseUrl}${route}`, {
    headers: { cookie },
  });

  assert.equal(response.status, 200);

  return extractCsrfToken(await response.text());
};

const postForm = (baseUrl, route, cookie, csrfToken, fields = {}) =>
  fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ _csrf: csrfToken, ...fields }),
    redirect: 'manual',
  });

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
  const appScriptResponse = await fetch(`${baseUrl}/app.js`);
  await appScriptResponse.arrayBuffer();

  assert.equal(appScriptResponse.status, 200);
  assert.equal(appScriptResponse.headers.get('cache-control'), 'no-cache');

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
  assert.match(
    transactionsHtml,
    /<script src="\/app\.js\?v=[a-f0-9]{12}" defer><\/script>/,
  );

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
  assert.match(customerHtml, /data-modal-toggle="customer-details-modal"/);

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

test('enforces staff permissions and the transaction approval workflow', async (context) => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'internal-crm-finance-approval-test-'),
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
  const adminCookie = await login(baseUrl, adminUser, adminPass);
  const adminCsrfToken = await getCsrfToken(baseUrl, adminCookie, '/users');
  const accountantPassword = 'accountant-password-12';
  const cashierPassword = 'cashier-password-123';

  const createAccountantResponse = await postForm(
    baseUrl,
    '/users',
    adminCookie,
    adminCsrfToken,
    {
      fullName: 'Nhân viên kế toán',
      username: 'accountant01',
      password: accountantPassword,
      role: 'accountant',
    },
  );
  const createCashierResponse = await postForm(
    baseUrl,
    '/users',
    adminCookie,
    adminCsrfToken,
    {
      fullName: 'Nhân viên thủ quỹ',
      username: 'cashier01',
      password: cashierPassword,
      role: 'cashier',
      canApprove: 'on',
    },
  );

  assert.equal(createAccountantResponse.status, 302);
  assert.equal(createCashierResponse.status, 302);

  const accountantId = db
    .prepare("SELECT id FROM users WHERE username = 'accountant01'")
    .get().id;
  const updatedAccountantPassword = 'accountant-password-changed';
  const updateAccountantResponse = await postForm(
    baseUrl,
    `/users/${accountantId}`,
    adminCookie,
    adminCsrfToken,
    {
      fullName: 'Kế toán đã cập nhật',
      username: 'accountant01',
      password: updatedAccountantPassword,
    },
  );

  assert.equal(updateAccountantResponse.status, 302);
  assert.equal(
    db.prepare('SELECT full_name FROM users WHERE id = ?')
      .get(accountantId).full_name,
    'Kế toán đã cập nhật',
  );

  const accountantCookie = await login(
    baseUrl,
    'accountant01',
    updatedAccountantPassword,
  );
  const accountantCsrfToken = await getCsrfToken(
    baseUrl,
    accountantCookie,
    '/transactions',
  );
  const transactionFields = {
    type: 'THU',
    amount: '1234',
    category: 'Dịch vụ',
    description: 'Phiếu chờ duyệt',
    transactionDate: new Date().toISOString().slice(0, 10),
    paymentStatus: 'Công nợ',
    customerId: '',
  };
  const createPendingResponse = await postForm(
    baseUrl,
    '/transactions',
    accountantCookie,
    accountantCsrfToken,
    transactionFields,
  );
  const pendingTransaction = db
    .prepare(
      `SELECT id, approval_status, created_by, payment_status
       FROM transactions
       WHERE description = ?`,
    )
    .get(transactionFields.description);
  const createCustomerAsAccountantResponse = await postForm(
    baseUrl,
    '/customers',
    accountantCookie,
    accountantCsrfToken,
    {
       name: 'Khách hàng do kế toán tạo',
       phone: '',
       email: '',
       status: 'Tiềm năng',
       notes: '',
    },
  );
  const editPendingAsAccountantResponse = await postForm(
    baseUrl,
    `/transactions/${pendingTransaction.id}`,
    accountantCookie,
    accountantCsrfToken,
    { ...transactionFields, amount: '2234' },
  );

  assert.equal(createPendingResponse.status, 302);
  assert.equal(createCustomerAsAccountantResponse.status, 302);
  assert.equal(editPendingAsAccountantResponse.status, 302);
  assert.equal(
    db.prepare('SELECT amount FROM transactions WHERE id = ?')
       .get(pendingTransaction.id).amount,
    2234,
  );
  assert.equal(pendingTransaction.approval_status, 'PENDING');
  assert.equal(
    pendingTransaction.created_by,
    accountantId,
  );

  const accountantApprovalResponse = await postForm(
    baseUrl,
    `/transactions/${pendingTransaction.id}/approve`,
    accountantCookie,
    accountantCsrfToken,
  );
  assert.equal(accountantApprovalResponse.status, 403);

  const cashierCookie = await login(baseUrl, 'cashier01', cashierPassword);
  const cashierCsrfToken = await getCsrfToken(
    baseUrl,
    cashierCookie,
    '/transactions',
  );
  const cashierTransactionsResponse = await fetch(
    `${baseUrl}/transactions`,
    { headers: { cookie: cashierCookie } },
  );
  const cashierTransactionsHtml = await cashierTransactionsResponse.text();

  assert.equal(cashierTransactionsResponse.status, 200);
  assert.match(
    cashierTransactionsHtml,
    new RegExp(`aria-label="Xem phiếu #${pendingTransaction.id}"`),
  );
  assert.match(
    cashierTransactionsHtml,
    /data-modal-toggle="transaction-details-modal"/,
  );
  assert.doesNotMatch(
    cashierTransactionsHtml,
    new RegExp(`aria-label="Sửa phiếu #${pendingTransaction.id}"`),
  );

  const createCustomerResponse = await postForm(
    baseUrl,
    '/customers',
    cashierCookie,
    cashierCsrfToken,
    {
      name: 'Không được phép tạo',
      phone: '',
      email: '',
      status: 'Tiềm năng',
      notes: '',
    },
  );
  const editPendingResponse = await postForm(
    baseUrl,
    `/transactions/${pendingTransaction.id}`,
    cashierCookie,
    cashierCsrfToken,
    { ...transactionFields, amount: '9999' },
  );
  const markPendingAsPaidResponse = await postForm(
    baseUrl,
    `/transactions/${pendingTransaction.id}/paid`,
    cashierCookie,
    cashierCsrfToken,
  );

  assert.equal(createCustomerResponse.status, 403);
  assert.equal(editPendingResponse.status, 403);
  assert.equal(markPendingAsPaidResponse.status, 403);
  const cashierUsersResponse = await fetch(`${baseUrl}/users`, {
    headers: { cookie: cashierCookie },
  });
  assert.equal(cashierUsersResponse.status, 403);
  assert.equal(
    db.prepare('SELECT payment_status FROM transactions WHERE id = ?')
      .get(pendingTransaction.id).payment_status,
    'Công nợ',
  );

  const selfApproveFields = {
    ...transactionFields,
    amount: '5678',
    description: 'Phiếu tự duyệt',
    paymentStatus: 'Đã thanh toán',
  };
  const createSelfApproveResponse = await postForm(
    baseUrl,
    '/transactions',
    cashierCookie,
    cashierCsrfToken,
    selfApproveFields,
  );
  const selfApproveTransaction = db
    .prepare('SELECT id FROM transactions WHERE description = ?')
    .get(selfApproveFields.description);
  const cashierListingWithOwnTransaction = await fetch(
    `${baseUrl}/transactions`,
    { headers: { cookie: cashierCookie } },
  );
  const cashierListingWithOwnTransactionHtml =
    await cashierListingWithOwnTransaction.text();
  const editOwnPendingResponse = await postForm(
    baseUrl,
    `/transactions/${selfApproveTransaction.id}`,
    cashierCookie,
    cashierCsrfToken,
    { ...selfApproveFields, amount: '6789' },
  );
  const selfApproveResponse = await postForm(
    baseUrl,
    `/transactions/${selfApproveTransaction.id}/approve`,
    cashierCookie,
    cashierCsrfToken,
  );

  assert.equal(createSelfApproveResponse.status, 302);
  assert.match(
    cashierListingWithOwnTransactionHtml,
    new RegExp(`aria-label="Xem phiếu #${selfApproveTransaction.id}"`),
  );
  assert.match(
    cashierListingWithOwnTransactionHtml,
    new RegExp(`aria-label="Sửa phiếu #${selfApproveTransaction.id}"`),
  );
  assert.equal(editOwnPendingResponse.status, 302);
  assert.equal(selfApproveResponse.status, 302);
  assert.deepEqual(
    db
      .prepare(
        'SELECT approval_status, reviewed_by FROM transactions WHERE id = ?',
      )
      .get(selfApproveTransaction.id),
    {
      approval_status: 'APPROVED',
      reviewed_by: db
        .prepare("SELECT id FROM users WHERE username = 'cashier01'")
        .get().id,
    },
  );

  const editOwnApprovedResponse = await postForm(
    baseUrl,
    `/transactions/${selfApproveTransaction.id}`,
    cashierCookie,
    cashierCsrfToken,
    { ...selfApproveFields, amount: '7890' },
  );
  const reapproveOwnEditedResponse = await postForm(
    baseUrl,
    `/transactions/${selfApproveTransaction.id}/approve`,
    cashierCookie,
    cashierCsrfToken,
  );

  assert.equal(editOwnApprovedResponse.status, 302);
  assert.equal(reapproveOwnEditedResponse.status, 302);
  assert.equal(
    db.prepare('SELECT amount FROM transactions WHERE id = ?')
      .get(selfApproveTransaction.id).amount,
    7890,
  );

  const rejectedFields = {
    ...transactionFields,
    amount: '5000',
    description: 'Phiếu bị từ chối',
  };
  await postForm(
    baseUrl,
    '/transactions',
    cashierCookie,
    cashierCsrfToken,
    rejectedFields,
  );
  const rejectedTransaction = db
    .prepare('SELECT id FROM transactions WHERE description = ?')
    .get(rejectedFields.description);
  const missingReasonResponse = await postForm(
    baseUrl,
    `/transactions/${rejectedTransaction.id}/reject`,
    cashierCookie,
    cashierCsrfToken,
  );
  const rejectResponse = await postForm(
    baseUrl,
    `/transactions/${rejectedTransaction.id}/reject`,
    cashierCookie,
    cashierCsrfToken,
    { reason: 'Thiếu chứng từ' },
  );

  assert.equal(missingReasonResponse.status, 400);
  assert.equal(rejectResponse.status, 302);
  assert.deepEqual(
    db
      .prepare(
        `SELECT approval_status, rejection_reason
         FROM transactions WHERE id = ?`,
      )
      .get(rejectedTransaction.id),
    {
      approval_status: 'REJECTED',
      rejection_reason: 'Thiếu chứng từ',
    },
  );

  const [year, month] = transactionFields.transactionDate.split('-');
  const dashboardResponse = await fetch(
    `${baseUrl}/?month=${Number(month)}&year=${year}`,
    { headers: { cookie: accountantCookie } },
  );
  const dashboardHtml = await dashboardResponse.text();
  const incomeMetric = dashboardHtml.match(
    /Tổng thu đã thanh toán<\/p>\s*<p[^>]*>([^<]+)<\/p>/,
  );

  assert.equal(dashboardResponse.status, 200);
  assert.ok(incomeMetric);
  assert.equal(incomeMetric[1], '15.007.890 ₫');

  const rejectedCsvResponse = await fetch(
    `${baseUrl}/transactions/export.csv?approvalStatus=REJECTED`,
    { headers: { cookie: accountantCookie } },
  );
  const rejectedCsv = await rejectedCsvResponse.text();

  assert.equal(rejectedCsvResponse.status, 200);
  assert.match(rejectedCsv, /"Từ chối"/);
  assert.match(rejectedCsv, /"Phiếu bị từ chối"/);
  assert.doesNotMatch(rejectedCsv, /"Phiếu tự duyệt"/);
});

test('migrates existing users and transactions without losing records', () => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'internal-crm-finance-migration-test-'),
  );
  const legacyDatabasePath = path.join(
    temporaryDirectory,
    'database.sqlite',
  );
  const legacyDb = new Database(legacyDatabasePath);

  legacyDb.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Tiềm năng',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      transaction_date TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'Đã thanh toán',
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO users (username, password_hash, full_name)
      VALUES ('admin', 'existing-hash', 'Quản trị viên');
    INSERT INTO customers (name) VALUES ('Khách hàng cũ');
    INSERT INTO transactions
      (type, amount, category, transaction_date, customer_id)
      VALUES ('THU', 2000, 'Bán hàng', '2026-11-26', 1);
  `);
  legacyDb.close();

  const migratedDb = createDatabase({
    adminPass,
    adminUser,
    databasePath: temporaryDirectory,
  });

  try {
    assert.deepEqual(
      migratedDb
        .prepare(
          `SELECT u.role, u.can_approve, t.approval_status, t.amount,
            c.name AS customer_name
           FROM users u
           JOIN transactions t ON t.customer_id = 1
           JOIN customers c ON c.id = t.customer_id`,
        )
        .get(),
      {
        role: 'admin',
        can_approve: 1,
        approval_status: 'APPROVED',
        amount: 2000,
        customer_name: 'Khách hàng cũ',
      },
    );
  } finally {
    migratedDb.close();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('validates ISO transaction dates and protects CSV from formula injection', () => {
  assert.equal(isValidDate('2026-02-28'), true);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('28/02/2026'), false);
  assert.equal(escapeCsvCell('=HYPERLINK("https://example.com")'), '"\'=HYPERLINK(""https://example.com"")"');
  assert.equal(escapeCsvCell('Công ty "An Bình"'), '"Công ty ""An Bình"""');
});
