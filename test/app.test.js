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
  assert.match(transactionsHtml, /data-dropdown-toggle="profile-dropdown"/);
  assert.match(transactionsHtml, /href="\/account"/);
  assert.match(transactionsHtml, /<form method="post" action="\/logout">/);
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
    },
  );

  assert.equal(createAccountantResponse.status, 302);
  assert.equal(createCashierResponse.status, 302);

  const usersPageResponse = await fetch(`${baseUrl}/users`, {
    headers: { cookie: adminCookie },
  });
  const usersHtml = await usersPageResponse.text();
  const cashierId = db
    .prepare("SELECT id FROM users WHERE username = 'cashier01'")
    .get().id;
  const promoteCashierResponse = await postForm(
    baseUrl,
    `/users/${cashierId}/role`,
    adminCookie,
    adminCsrfToken,
    { role: 'accountant' },
  );
  const restoreCashierRoleResponse = await postForm(
    baseUrl,
    `/users/${cashierId}/role`,
    adminCookie,
    adminCsrfToken,
    { role: 'cashier' },
  );

  assert.equal(usersPageResponse.status, 200);
  assert.match(usersHtml, /data-modal-toggle="user-create-modal"/);
  assert.match(usersHtml, /id="user-create-modal"/);
  assert.match(usersHtml, /data-user-open="/);
  assert.match(usersHtml, /id="user-action-modal"/);
  assert.doesNotMatch(usersHtml, /Quyền duyệt phiếu|Lưu quyền|canApprove/);
  assert.doesNotMatch(
    usersHtml,
    /name="fullName" value="Nhân viên kế toán"/,
  );
  assert.equal(promoteCashierResponse.status, 302);
  assert.equal(restoreCashierRoleResponse.status, 302);

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
      passwordConfirmation: updatedAccountantPassword,
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

  const adminApprovalResponse = await postForm(
    baseUrl,
    `/transactions/${pendingTransaction.id}/approve`,
    adminCookie,
    adminCsrfToken,
  );
  const accountantApprovalResponse = await postForm(
    baseUrl,
    `/transactions/${pendingTransaction.id}/approve`,
    accountantCookie,
    accountantCsrfToken,
  );
  assert.equal(adminApprovalResponse.status, 403);
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
  assert.doesNotMatch(cashierTransactionsHtml, /title="Duyệt phiếu"/);
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
  assert.equal(selfApproveResponse.status, 403);
  assert.deepEqual(
    db
      .prepare(
        'SELECT approval_status, reviewed_by FROM transactions WHERE id = ?',
      )
      .get(selfApproveTransaction.id),
    {
      approval_status: 'PENDING',
      reviewed_by: null,
    },
  );

  const editOwnPendingResponseAgain = await postForm(
    baseUrl,
    `/transactions/${selfApproveTransaction.id}`,
    cashierCookie,
    cashierCsrfToken,
    { ...selfApproveFields, amount: '7890' },
  );
  const approveOwnEditedResponse = await postForm(
    baseUrl,
    `/transactions/${selfApproveTransaction.id}/approve`,
    cashierCookie,
    cashierCsrfToken,
  );

  assert.equal(editOwnPendingResponseAgain.status, 302);
  assert.equal(approveOwnEditedResponse.status, 403);
  assert.equal(
    db.prepare('SELECT amount FROM transactions WHERE id = ?')
      .get(selfApproveTransaction.id).amount,
    7890,
  );
  assert.equal(
    db.prepare('SELECT approval_status FROM transactions WHERE id = ?')
      .get(selfApproveTransaction.id).approval_status,
    'PENDING',
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

  assert.equal(missingReasonResponse.status, 403);
  assert.equal(rejectResponse.status, 403);
  assert.deepEqual(
    db
      .prepare(
        `SELECT approval_status, rejection_reason
         FROM transactions WHERE id = ?`,
      )
      .get(rejectedTransaction.id),
    {
      approval_status: 'PENDING',
      rejection_reason: '',
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
  assert.equal(incomeMetric[1], '15.000.000 ₫');

  const accountPageResponse = await fetch(`${baseUrl}/account`, {
    headers: { cookie: accountantCookie },
  });
  const accountHtml = await accountPageResponse.text();
  const accountCsrfToken = extractCsrfToken(accountHtml);
  const selfUpdatedPassword = 'accountant-self-password-123';
  const accountUpdateFields = {
    fullName: 'Kế toán tự cập nhật',
    username: 'accountant.self',
    password: selfUpdatedPassword,
    passwordConfirmation: selfUpdatedPassword,
  };
  const incorrectCurrentPasswordResponse = await postForm(
    baseUrl,
    '/account',
    accountantCookie,
    accountCsrfToken,
    {
      ...accountUpdateFields,
      currentPassword: 'not-the-current-password',
    },
  );
  const accountUpdateResponse = await postForm(
    baseUrl,
    '/account',
    accountantCookie,
    accountCsrfToken,
    {
      ...accountUpdateFields,
      currentPassword: updatedAccountantPassword,
    },
  );

  assert.equal(accountPageResponse.status, 200);
  assert.match(accountHtml, /Tài khoản của tôi/);
  assert.equal(incorrectCurrentPasswordResponse.status, 403);
  assert.equal(accountUpdateResponse.status, 302);
  assert.deepEqual(
    db.prepare('SELECT full_name, username FROM users WHERE id = ?')
      .get(accountantId),
    {
      full_name: 'Kế toán tự cập nhật',
      username: 'accountant.self',
    },
  );
  await login(baseUrl, 'accountant.self', selfUpdatedPassword);
});

test('grants managers administrator-level permissions', async (context) => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'internal-crm-finance-manager-test-'),
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
  const managerPassword = 'manager-password-123';
  const createManagerResponse = await postForm(
    baseUrl,
    '/users',
    adminCookie,
    adminCsrfToken,
    {
      fullName: 'Quản lý',
      username: 'manager01',
      password: managerPassword,
      role: 'manager',
    },
  );

  assert.equal(createManagerResponse.status, 302);
  assert.equal(
    db.prepare('SELECT role FROM users WHERE username = ?')
      .get('manager01').role,
    'manager',
  );

  const managerCookie = await login(
    baseUrl,
    'manager01',
    managerPassword,
  );
  const usersPageResponse = await fetch(`${baseUrl}/users`, {
    headers: { cookie: managerCookie },
  });
  const usersHtml = await usersPageResponse.text();
  const managerCsrfToken = extractCsrfToken(usersHtml);

  assert.equal(usersPageResponse.status, 200);
  assert.match(usersHtml, /Quản lý/);

  const createCashierResponse = await postForm(
    baseUrl,
    '/users',
    managerCookie,
    managerCsrfToken,
    {
      fullName: 'Thủ quỹ mới',
      username: 'cashier02',
      password: 'cashier-password-123',
      role: 'cashier',
    },
  );
  const cashierId = db
    .prepare("SELECT id FROM users WHERE username = 'cashier02'")
    .get().id;
  const promoteCashierResponse = await postForm(
    baseUrl,
    `/users/${cashierId}/role`,
    managerCookie,
    managerCsrfToken,
    { role: 'manager' },
  );
  const createCustomerResponse = await postForm(
    baseUrl,
    '/customers',
    managerCookie,
    managerCsrfToken,
    {
      name: 'Khách hàng do quản lý tạo',
      phone: '',
      email: '',
      status: 'Tiềm năng',
      notes: '',
    },
  );
  const transactionFields = {
    type: 'THU',
    amount: '1234',
    category: 'Dịch vụ',
    description: 'Phiếu do quản lý tạo',
    transactionDate: new Date().toISOString().slice(0, 10),
    paymentStatus: 'Công nợ',
    customerId: '',
  };
  const createTransactionResponse = await postForm(
    baseUrl,
    '/transactions',
    managerCookie,
    managerCsrfToken,
    transactionFields,
  );
  const transaction = db
    .prepare('SELECT id, approval_status FROM transactions WHERE description = ?')
    .get(transactionFields.description);

  assert.equal(createCashierResponse.status, 302);
  assert.equal(promoteCashierResponse.status, 302);
  assert.equal(
    db.prepare('SELECT role FROM users WHERE id = ?').get(cashierId).role,
    'manager',
  );
  assert.equal(createCustomerResponse.status, 302);
  assert.equal(createTransactionResponse.status, 302);
  assert.ok(transaction);
  assert.equal(transaction.approval_status, 'PENDING');

  const adminApprovalResponse = await postForm(
    baseUrl,
    `/transactions/${transaction.id}/approve`,
    adminCookie,
    adminCsrfToken,
  );
  const adminTransactionsPage = await fetch(`${baseUrl}/transactions`, {
    headers: { cookie: adminCookie },
  });
  const adminTransactionsHtml = await adminTransactionsPage.text();
  const managerTransactionsPage = await fetch(`${baseUrl}/transactions`, {
    headers: { cookie: managerCookie },
  });
  const managerTransactionsHtml = await managerTransactionsPage.text();
  const approveResponse = await postForm(
    baseUrl,
    `/transactions/${transaction.id}/approve`,
    managerCookie,
    managerCsrfToken,
  );
  const deleteResponse = await postForm(
    baseUrl,
    `/transactions/${transaction.id}/delete`,
    managerCookie,
    managerCsrfToken,
  );

  assert.equal(adminApprovalResponse.status, 403);
  assert.doesNotMatch(adminTransactionsHtml, /title="Duyệt phiếu"/);
  assert.match(managerTransactionsHtml, /title="Duyệt phiếu"/);
  assert.equal(approveResponse.status, 302);
  assert.equal(deleteResponse.status, 302);
  assert.equal(
    db.prepare('SELECT 1 FROM transactions WHERE id = ?').get(transaction.id),
    undefined,
  );

  const rejectedFields = {
    ...transactionFields,
    description: 'Phiếu do quản lý từ chối',
  };
  await postForm(
    baseUrl,
    '/transactions',
    managerCookie,
    managerCsrfToken,
    rejectedFields,
  );
  const rejectedTransaction = db
    .prepare('SELECT id FROM transactions WHERE description = ?')
    .get(rejectedFields.description);
  const missingReasonResponse = await postForm(
    baseUrl,
    `/transactions/${rejectedTransaction.id}/reject`,
    managerCookie,
    managerCsrfToken,
  );
  const rejectResponse = await postForm(
    baseUrl,
    `/transactions/${rejectedTransaction.id}/reject`,
    managerCookie,
    managerCsrfToken,
    { reason: 'Thiếu chứng từ' },
  );
  const rejectedCsvResponse = await fetch(
    `${baseUrl}/transactions/export.csv?approvalStatus=REJECTED`,
    { headers: { cookie: managerCookie } },
  );
  const rejectedCsv = await rejectedCsvResponse.text();

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
  assert.equal(rejectedCsvResponse.status, 200);
  assert.match(rejectedCsv, /"Từ chối"/);
  assert.match(rejectedCsv, /"Phiếu do quản lý từ chối"/);
});

test('links inventory documents to cashbook and limits cost visibility', async (context) => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'internal-crm-finance-inventory-test-'),
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
  const managerPassword = 'inventory-manager-password';
  const accountantPassword = 'inventory-accountant-password';
  const cashierPassword = 'inventory-cashier-password';

  await postForm(baseUrl, '/users', adminCookie, adminCsrfToken, {
    fullName: 'Quản lý kho',
    username: 'inventory.manager',
    password: managerPassword,
    role: 'manager',
  });
  await postForm(baseUrl, '/users', adminCookie, adminCsrfToken, {
    fullName: 'Kế toán kho',
    username: 'inventory.accountant',
    password: accountantPassword,
    role: 'accountant',
  });
  await postForm(baseUrl, '/users', adminCookie, adminCsrfToken, {
    fullName: 'Thủ quỹ kho',
    username: 'inventory.cashier',
    password: cashierPassword,
    role: 'cashier',
  });

  const managerCookie = await login(
    baseUrl,
    'inventory.manager',
    managerPassword,
  );
  const accountantCookie = await login(
    baseUrl,
    'inventory.accountant',
    accountantPassword,
  );
  const accountantCsrfToken = await getCsrfToken(
    baseUrl,
    accountantCookie,
    '/inventory',
  );
  const managerCsrfToken = await getCsrfToken(
    baseUrl,
    managerCookie,
    '/inventory',
  );
  const initialInventoryResponse = await fetch(`${baseUrl}/inventory`, {
    headers: { cookie: managerCookie },
  });
  const initialInventoryHtml = await initialInventoryResponse.text();

  assert.match(initialInventoryHtml, /<select id="inventory-category"/);
  assert.match(initialInventoryHtml, /<select id="inventory-unit"/);
  assert.doesNotMatch(initialInventoryHtml, /id="inventory-options-auto-open"/);

  for (const [type, name] of [
    ['categories', 'Phụ kiện'],
    ['units', 'Bộ'],
  ]) {
    const response = await postForm(
      baseUrl,
      `/inventory/options/${type}`,
      managerCookie,
      managerCsrfToken,
      { name },
    );

    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get('location'),
      '/inventory?manageOptions=1',
    );
  }
  const optionsModalResponse = await fetch(
    `${baseUrl}/inventory?manageOptions=1`,
    { headers: { cookie: managerCookie } },
  );
  assert.match(
    await optionsModalResponse.text(),
    /id="inventory-options-auto-open"/,
  );

  for (const [type, name] of [
    ['categories', 'Danh mục tạm'],
    ['units', 'Đơn vị tạm'],
  ]) {
    const createResponse = await postForm(
      baseUrl,
      `/inventory/options/${type}`,
      managerCookie,
      managerCsrfToken,
      { name },
    );
    assert.equal(createResponse.status, 302);
    assert.equal(
      createResponse.headers.get('location'),
      '/inventory?manageOptions=1',
    );

    const table =
      type === 'categories' ? 'inventory_categories' : 'inventory_units';
    const optionId = db
      .prepare(`SELECT id FROM ${table} WHERE name = ?`)
      .get(name).id;
    const deleteResponse = await postForm(
      baseUrl,
      `/inventory/options/${type}/${optionId}/delete`,
      managerCookie,
      managerCsrfToken,
    );
    assert.equal(deleteResponse.status, 302);
    assert.equal(
      deleteResponse.headers.get('location'),
      '/inventory?manageOptions=1',
    );
  }

  const accountantProductResponse = await postForm(
    baseUrl,
    '/inventory/products',
    accountantCookie,
    accountantCsrfToken,
    {
      sku: 'INV-ACC-001',
      name: 'Sản phẩm kế toán',
      category: 'Phụ kiện',
      unit: 'Bộ',
      costPrice: '50',
      salePrice: '100',
    },
  );

  assert.equal(accountantProductResponse.status, 302);
  const today = new Date().toISOString().slice(0, 10);
  const createProductResponse = await postForm(
    baseUrl,
    '/inventory/products',
    managerCookie,
    managerCsrfToken,
    {
      sku: 'INV-001',
      name: 'Sản phẩm kiểm tra tồn',
      category: 'Phụ kiện',
      unit: 'Bộ',
      costPrice: '1000',
      salePrice: '2000',
      promotionType: 'percent',
      promotionValue: '10',
      promotionStartDate: today,
      promotionEndDate: today,
    },
  );

  assert.equal(createProductResponse.status, 302);
  const productId = db
    .prepare("SELECT id FROM products WHERE sku = 'INV-001'")
    .get().id;
  for (const [type, name] of [
    ['categories', 'Phụ kiện'],
    ['units', 'Bộ'],
  ]) {
    const table =
      type === 'categories' ? 'inventory_categories' : 'inventory_units';
    const optionId = db
      .prepare(`SELECT id FROM ${table} WHERE name = ?`)
      .get(name).id;
    const deleteResponse = await postForm(
      baseUrl,
      `/inventory/options/${type}/${optionId}/delete`,
      managerCookie,
      managerCsrfToken,
    );
    assert.equal(deleteResponse.status, 409);
  }

  const rejectedPurchaseResponse = await postForm(
    baseUrl,
    '/inventory/documents',
    managerCookie,
    managerCsrfToken,
    {
      type: 'PURCHASE',
      date: today,
      partyName: 'Nhà cung cấp từ chối',
      paymentStatus: 'Đã thanh toán',
      productId: String(productId),
      quantity: '10',
      unitPrice: '1000',
    },
  );
  const rejectedPurchase = db
    .prepare(
      `SELECT d.id, t.id AS transaction_id
       FROM inventory_documents d
       JOIN transactions t ON t.id = d.transaction_id
       WHERE d.document_type = 'PURCHASE'
         AND d.party_name = 'Nhà cung cấp từ chối'`,
    )
    .get();

  assert.equal(rejectedPurchaseResponse.status, 302);
  const rejectPurchaseResponse = await postForm(
    baseUrl,
    `/transactions/${rejectedPurchase.transaction_id}/reject`,
    managerCookie,
    managerCsrfToken,
    { reason: 'Chứng từ nhập sai' },
  );
  assert.equal(rejectPurchaseResponse.status, 302);
  assert.equal(
    db.prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get(productId).stock_quantity,
    0,
  );

  const purchaseResponse = await postForm(
    baseUrl,
    '/inventory/documents',
    managerCookie,
    managerCsrfToken,
    {
      type: 'PURCHASE',
      date: today,
      partyName: 'Nhà cung cấp kiểm thử',
      paymentStatus: 'Đã thanh toán',
      productId: String(productId),
      quantity: '10',
      unitPrice: '1000',
    },
  );
  const purchaseDocument = db
    .prepare(
      `SELECT d.id, d.approval_status, t.id AS transaction_id,
        t.type, t.amount, t.approval_status AS transaction_status
       FROM inventory_documents d
       JOIN transactions t ON t.id = d.transaction_id
       WHERE d.document_type = 'PURCHASE'
         AND d.party_name = 'Nhà cung cấp kiểm thử'`,
    )
    .get();

  assert.equal(purchaseResponse.status, 302);
  assert.equal(purchaseDocument.approval_status, 'PENDING');
  assert.equal(purchaseDocument.type, 'CHI');
  assert.equal(purchaseDocument.amount, 10000);
  assert.equal(purchaseDocument.transaction_status, 'PENDING');
  assert.equal(
    db.prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get(productId).stock_quantity,
    0,
  );

  const approvePurchaseResponse = await postForm(
    baseUrl,
    `/transactions/${purchaseDocument.transaction_id}/approve`,
    managerCookie,
    managerCsrfToken,
  );

  assert.equal(approvePurchaseResponse.status, 302);
  assert.deepEqual(
    db.prepare('SELECT stock_quantity, cost_price FROM products WHERE id = ?')
      .get(productId),
    { stock_quantity: 10, cost_price: 1000 },
  );

  const saleResponse = await postForm(
    baseUrl,
    '/inventory/documents',
    managerCookie,
    managerCsrfToken,
    {
      type: 'SALE',
      date: today,
      partyName: 'Khách mua thử',
      customerId: '',
      paymentStatus: 'Công nợ',
      productId: String(productId),
      quantity: '2',
      unitPrice: '0',
    },
  );
  const saleDocument = db
    .prepare(
      `SELECT d.id, d.approval_status, t.id AS transaction_id,
        t.type, t.amount, t.payment_status, t.approval_status AS transaction_status
       FROM inventory_documents d
       JOIN transactions t ON t.id = d.transaction_id
       WHERE d.document_type = 'SALE' AND d.party_name = 'Khách mua thử'`,
    )
    .get();

  assert.equal(saleResponse.status, 302);
  assert.equal(saleDocument.approval_status, 'PENDING');
  assert.equal(saleDocument.type, 'THU');
  assert.equal(saleDocument.amount, 3600);
  assert.equal(saleDocument.payment_status, 'Công nợ');
  assert.equal(saleDocument.transaction_status, 'PENDING');
  assert.equal(
    db.prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get(productId).stock_quantity,
    10,
  );

  const insufficientSaleResponse = await postForm(
    baseUrl,
    '/inventory/documents',
    managerCookie,
    managerCsrfToken,
    {
      type: 'SALE',
      date: today,
      partyName: 'Đơn vượt tồn',
      paymentStatus: 'Đã thanh toán',
      productId: String(productId),
      quantity: '11',
      unitPrice: '0',
    },
  );

  assert.equal(insufficientSaleResponse.status, 409);

  const cashierCookie = await login(
    baseUrl,
    'inventory.cashier',
    cashierPassword,
  );
  const cashierInventoryResponse = await fetch(`${baseUrl}/inventory`, {
    headers: { cookie: cashierCookie },
  });
  const cashierInventoryHtml = await cashierInventoryResponse.text();
  const cashierCsrfToken = extractCsrfToken(cashierInventoryHtml);
  const cashierProductResponse = await postForm(
    baseUrl,
    '/inventory/products',
    cashierCookie,
    cashierCsrfToken,
    {
      sku: 'BLOCKED-001',
      name: 'Không được tạo',
      category: 'Phụ kiện',
      unit: 'Bộ',
      costPrice: '1',
      salePrice: '2',
    },
  );
  const cashierOptionResponse = await postForm(
    baseUrl,
    '/inventory/options/categories',
    cashierCookie,
    cashierCsrfToken,
    { name: 'Danh mục không được phép' },
  );

  assert.equal(cashierInventoryResponse.status, 200);
  assert.match(cashierInventoryHtml, /Sản phẩm kiểm tra tồn/);
  assert.match(cashierInventoryHtml, /10 Bộ/);
  assert.doesNotMatch(
    cashierInventoryHtml,
    /Giá vốn|Lãi gộp|Giá trị tồn|1\.000 ₫|10\.000 ₫/,
  );
  assert.equal(cashierProductResponse.status, 403);
  assert.equal(cashierOptionResponse.status, 403);
  const cashierDocumentResponse = await postForm(
    baseUrl,
    '/inventory/documents',
    cashierCookie,
    cashierCsrfToken,
    {
      type: 'PURCHASE',
      date: today,
      partyName: 'Không được nhập kho',
      paymentStatus: 'Đã thanh toán',
      productId: String(productId),
      quantity: '1',
      unitPrice: '1',
    },
  );
  assert.equal(cashierDocumentResponse.status, 403);

  const cashierTransactionsResponse = await fetch(
    `${baseUrl}/transactions`,
    { headers: { cookie: cashierCookie } },
  );
  const cashierTransactionsHtml = await cashierTransactionsResponse.text();
  const cashierCsvResponse = await fetch(
    `${baseUrl}/transactions/export.csv?type=CHI`,
    { headers: { cookie: cashierCookie } },
  );
  const cashierCsv = await cashierCsvResponse.text();
  const purchaseCsvRow = cashierCsv
    .split(/\r?\n/)
    .find((row) => row.startsWith(`"${purchaseDocument.transaction_id}"`));
  const cashierDashboardResponse = await fetch(`${baseUrl}/`, {
    headers: { cookie: cashierCookie },
  });
  const cashierDashboardHtml = await cashierDashboardResponse.text();

  assert.equal(cashierTransactionsResponse.status, 200);
  assert.doesNotMatch(cashierTransactionsHtml, /10\.000 ₫/);
  assert.match(cashierTransactionsHtml, /Bảo mật/);
  assert.ok(purchaseCsvRow);
  assert.equal(purchaseCsvRow.split('","')[2], '');
  assert.match(purchaseCsvRow, /Chi phí nhập kho/);
  assert.equal(cashierDashboardResponse.status, 200);
  assert.doesNotMatch(
    cashierDashboardHtml,
    /Lợi nhuận ròng|Tổng chi đã thanh toán/,
  );
  assert.match(cashierDashboardHtml, /data-expenses="\[\]"/);

  const accountantInventoryResponse = await fetch(`${baseUrl}/inventory`, {
    headers: { cookie: accountantCookie },
  });
  const accountantInventoryHtml = await accountantInventoryResponse.text();

  assert.equal(accountantInventoryResponse.status, 200);
  assert.match(accountantInventoryHtml, /Giá vốn/);
  assert.match(accountantInventoryHtml, /Lãi gộp/);

  const approveSaleResponse = await postForm(
    baseUrl,
    `/transactions/${saleDocument.transaction_id}/approve`,
    managerCookie,
    managerCsrfToken,
  );
  const approvedSale = db
    .prepare(
      `SELECT d.approval_status, t.approval_status AS transaction_status
       FROM inventory_documents d
       JOIN transactions t ON t.id = d.transaction_id
       WHERE d.id = ?`,
    )
    .get(saleDocument.id);

  assert.equal(approveSaleResponse.status, 302);
  assert.deepEqual(approvedSale, {
    approval_status: 'APPROVED',
    transaction_status: 'APPROVED',
  });
  assert.equal(
    db
      .prepare(
        `SELECT unit_cost FROM inventory_document_items
         WHERE document_id = ?`,
      )
      .get(saleDocument.id).unit_cost,
    1000,
  );
  assert.equal(
    db
      .prepare(
        `SELECT SUM(ROUND(
           quantity * (unit_price - discount_per_unit - unit_cost), 0
         )) AS gross_profit
         FROM inventory_document_items
         WHERE document_id = ?`,
      )
      .get(saleDocument.id).gross_profit,
    1600,
  );
  assert.equal(
    db.prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get(productId).stock_quantity,
    8,
  );

  const linkedTransactionEditResponse = await postForm(
    baseUrl,
    `/transactions/${saleDocument.transaction_id}`,
    adminCookie,
    adminCsrfToken,
    {
      type: 'THU',
      amount: '1',
      category: 'Bán hàng',
      description: 'Sửa ngoài kho',
      transactionDate: today,
      paymentStatus: 'Công nợ',
      customerId: '',
    },
  );
  const financeTransactionDeleteResponse = await postForm(
    baseUrl,
    `/transactions/${saleDocument.transaction_id}/delete`,
    adminCookie,
    adminCsrfToken,
  );

  assert.equal(linkedTransactionEditResponse.status, 403);
  assert.equal(financeTransactionDeleteResponse.status, 409);
});

test('preserves CRM records and inventory options during migrations', () => {
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

  let migratedDb = createDatabase({
    adminPass,
    adminUser,
    databasePath: temporaryDirectory,
  });

  try {
    assert.deepEqual(
      migratedDb
        .prepare(
          `SELECT u.role, t.approval_status, t.amount,
            c.name AS customer_name
           FROM users u
           JOIN transactions t ON t.customer_id = 1
           JOIN customers c ON c.id = t.customer_id`,
        )
        .get(),
      {
        role: 'admin',
        approval_status: 'APPROVED',
        amount: 2000,
        customer_name: 'Khách hàng cũ',
      },
    );
    migratedDb.prepare(
      "DELETE FROM inventory_categories WHERE name = 'Thiết bị'",
    ).run();
    migratedDb.prepare("DELETE FROM inventory_units WHERE name = 'Mét'").run();
    migratedDb.prepare(
      `INSERT INTO products
        (sku, name, category, unit, cost_price, sale_price)
       VALUES ('LEGACY-001', 'Hàng cũ', 'Nhóm cũ', 'Thùng carton', 10, 20)`,
    ).run();
    migratedDb.close();
    migratedDb = createDatabase({
      adminPass,
      adminUser,
      databasePath: temporaryDirectory,
    });

    assert.equal(
      migratedDb
        .prepare("SELECT 1 FROM inventory_categories WHERE name = 'Thiết bị'")
        .get(),
      undefined,
    );
    assert.equal(
      migratedDb
        .prepare("SELECT 1 FROM inventory_units WHERE name = 'Mét'")
        .get(),
      undefined,
    );
    assert.ok(
      migratedDb
        .prepare("SELECT 1 FROM inventory_categories WHERE name = 'Nhóm cũ'")
        .get(),
    );
    assert.ok(
      migratedDb
        .prepare("SELECT 1 FROM inventory_units WHERE name = 'Thùng carton'")
        .get(),
    );
    assert.deepEqual(
      migratedDb
        .prepare("SELECT category, unit FROM products WHERE sku = 'LEGACY-001'")
        .get(),
      { category: 'Nhóm cũ', unit: 'Thùng carton' },
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
