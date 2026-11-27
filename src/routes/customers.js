const express = require('express');

const { CUSTOMER_STATUSES } = require('../db');
const { requireRoles } = require('../middleware/auth');
const { setFlash } = require('../middleware/flash');
const { formatCurrency, formatDate, getInitials } = require('../utils/format');
const { createPagination } = require('../utils/pagination');

const createCustomersRouter = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const search =
      typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const selectedStatus =
      typeof req.query.status === 'string' &&
      CUSTOMER_STATUSES.includes(req.query.status)
        ? req.query.status
        : '';
    const conditions = [];
    const parameters = [];

    if (search) {
      const searchTerm = `%${search.replace(/[\\%_]/g, '\\$&')}%`;

      conditions.push("(name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')");
      parameters.push(searchTerm, searchTerm);
    }

    if (selectedStatus) {
      conditions.push('status = ?');
      parameters.push(selectedStatus);
    }

    const totalItems = db
      .prepare(
        `SELECT COUNT(*) AS count FROM customers
         ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}`,
      )
      .get(...parameters).count;
    const pagination = createPagination({
      page: req.query.page,
      totalItems,
      basePath: '/customers',
      filters: { q: search, status: selectedStatus },
    });
    const customers = db
      .prepare(
        `SELECT c.*,
          COALESCE(SUM(CASE WHEN t.approval_status = 'APPROVED' AND t.payment_status = 'Đã thanh toán' AND t.type = 'THU' THEN t.amount ELSE 0 END), 0) AS paid_income,
          COALESCE(SUM(CASE WHEN t.approval_status = 'APPROVED' AND t.payment_status = 'Công nợ' THEN t.amount ELSE 0 END), 0) AS outstanding
         FROM customers c
         LEFT JOIN transactions t ON t.customer_id = c.id
         ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
         GROUP BY c.id
         ORDER BY c.created_at DESC, c.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...parameters, pagination.pageSize, pagination.offset)
      .map((customer) => ({
        ...customer,
        initials: getInitials(customer.name),
        formattedPaidIncome: formatCurrency(customer.paid_income),
        formattedOutstanding: formatCurrency(customer.outstanding),
        detailsJson: JSON.stringify({
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          status: customer.status,
          notes: customer.notes,
        }),
      }));

    const statusCounts = db
      .prepare('SELECT status, COUNT(*) AS count FROM customers GROUP BY status')
      .all();

    res.render('customers', {
      title: 'Khách hàng',
      activePage: 'customers',
      customers,
      pagination,
      search,
      selectedStatus,
      customerStatuses: CUSTOMER_STATUSES,
      canManageCustomers:
        req.currentUser.isAdmin || req.currentUser.role === 'accountant',
      statusCounts: Object.fromEntries(
        statusCounts.map(({ status, count }) => [status, count]),
      ),
    });
  });

  router.get('/:id/details', (req, res, next) => {
    const customerId = Number.parseInt(req.params.id, 10);

    if (!Number.isSafeInteger(customerId) || customerId < 1) {
      res.status(404).json({ error: 'Không tìm thấy khách hàng.' });

      return;
    }

    const customer = db
      .prepare(
        `SELECT id, name, phone, email, status, notes
         FROM customers
         WHERE id = ?`,
      )
      .get(customerId);

    if (!customer) {
      res.status(404).json({ error: 'Không tìm thấy khách hàng.' });

      return;
    }

    const totals = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN approval_status = 'APPROVED' AND type = 'THU' AND payment_status = 'Đã thanh toán' THEN amount ELSE 0 END), 0) AS paid_income,
          COALESCE(SUM(CASE WHEN approval_status = 'APPROVED' AND payment_status = 'Công nợ' THEN amount ELSE 0 END), 0) AS outstanding
         FROM transactions
         WHERE customer_id = ?`,
      )
      .get(customerId);

    const transactions = db
      .prepare(
        `SELECT id, type, amount, category, description, transaction_date,
          payment_status, approval_status, rejection_reason
         FROM transactions
         WHERE customer_id = ?
         ORDER BY transaction_date DESC, id DESC`,
      )
      .all(customerId)
      .map((transaction) => ({
        ...transaction,
        formattedAmount: formatCurrency(transaction.amount),
        formattedDate: formatDate(transaction.transaction_date),
      }));

    res.json({
      customer,
      totals: {
        paidIncome: formatCurrency(totals.paid_income),
        outstanding: formatCurrency(totals.outstanding),
      },
      transactions,
    });
  });

  router.post('/', requireRoles('admin', 'accountant'), (req, res) => {
    const customer = readCustomer(req.body);

    db.prepare(
      `INSERT INTO customers (name, phone, email, status, notes)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      customer.name,
      customer.phone,
      customer.email,
      customer.status,
      customer.notes,
    );

    setFlash(req, 'success', 'Đã thêm khách hàng mới.');
    res.redirect('/customers');
  });

  router.post('/:id', requireRoles('admin', 'accountant'), (req, res) => {
    const customerId = parseRecordId(req.params.id);
    const customer = readCustomer(req.body);
    const result = db
      .prepare(
        `UPDATE customers
         SET name = ?, phone = ?, email = ?, status = ?, notes = ?
         WHERE id = ?`,
      )
      .run(
        customer.name,
        customer.phone,
        customer.email,
        customer.status,
        customer.notes,
        customerId,
      );

    if (result.changes === 0) {
      throw createHttpError(404, 'Không tìm thấy khách hàng cần chỉnh sửa.');
    }

    setFlash(req, 'success', 'Đã cập nhật thông tin khách hàng.');
    res.redirect('/customers');
  });

  router.post('/:id/delete', requireRoles('admin', 'accountant'), (req, res) => {
    const customerId = parseRecordId(req.params.id);
    const result = db
      .prepare('DELETE FROM customers WHERE id = ?')
      .run(customerId);

    if (result.changes === 0) {
      throw createHttpError(404, 'Không tìm thấy khách hàng cần xóa.');
    }

    setFlash(
      req,
      'success',
      'Đã xóa khách hàng. Các giao dịch vẫn được giữ lại.',
    );
    res.redirect('/customers');
  });

  return router;
};

const parseRecordId = (value) => {
  const id = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(id) || id < 1) {
    throw createHttpError(404, 'Không tìm thấy dữ liệu yêu cầu.');
  }

  return id;
};

const readCustomer = (body) => {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const status =
    typeof body.status === 'string' ? body.status : CUSTOMER_STATUSES[0];
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';

  if (!name || name.length > 160) {
    throw createHttpError(400, 'Tên khách hàng là bắt buộc và tối đa 160 ký tự.');
  }

  if (phone.length > 40 || email.length > 254 || notes.length > 5000) {
    throw createHttpError(400, 'Thông tin khách hàng vượt quá độ dài cho phép.');
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createHttpError(400, 'Địa chỉ email chưa đúng định dạng.');
  }

  if (!CUSTOMER_STATUSES.includes(status)) {
    throw createHttpError(400, 'Trạng thái khách hàng không hợp lệ.');
  }

  return { email, name, notes, phone, status };
};

const createHttpError = (status, message) =>
  Object.assign(new Error(message), { status });

module.exports = createCustomersRouter;
