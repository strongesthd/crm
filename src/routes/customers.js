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
    const isSale = req.currentUser.role === 'sale';

    if (isSale) {
      conditions.push(
        "(c.is_public = 1 OR c.owner_id = ? OR EXISTS (SELECT 1 FROM customer_shares cs WHERE cs.customer_id = c.id AND cs.user_id = ?))",
      );
      parameters.push(req.currentUser.id, req.currentUser.id);
    }

    if (search) {
      const searchTerm = `%${search.replace(/[\\%_]/g, '\\$&')}%`;

      conditions.push("(c.name LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\')");
      parameters.push(searchTerm, searchTerm);
    }

    if (selectedStatus) {
      conditions.push('c.status = ?');
      parameters.push(selectedStatus);
    }

    const totalItems = db
      .prepare(
        `SELECT COUNT(*) AS count FROM customers c
         ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}`,
      )
      .get(...parameters).count;
    const pagination = createPagination({
      page: req.query.page,
      totalItems,
      basePath: '/customers',
      filters: { q: search, status: selectedStatus },
    });
    const sharedUserIdsByCustomer = new Map();
    for (const share of db
      .prepare('SELECT customer_id, user_id FROM customer_shares')
      .all()) {
      const sharedUserIds = sharedUserIdsByCustomer.get(share.customer_id) || [];
      sharedUserIds.push(share.user_id);
      sharedUserIdsByCustomer.set(share.customer_id, sharedUserIds);
    }
    const customers = db
      .prepare(
        `SELECT c.*,
          COALESCE(SUM(CASE WHEN t.approval_status = 'APPROVED' AND t.payment_status = 'Đã thanh toán' AND t.type = 'THU' THEN t.amount ELSE 0 END), 0) AS paid_income,
          COALESCE(SUM(CASE WHEN t.approval_status = 'APPROVED' AND t.payment_status = 'Công nợ' THEN t.amount ELSE 0 END), 0) AS outstanding
         FROM customers c
         LEFT JOIN transactions t ON t.customer_id = c.id
           ${isSale ? 'AND t.created_by = ?' : ''}
         ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
         GROUP BY c.id
         ORDER BY c.created_at DESC, c.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(
        ...(isSale
          ? [req.currentUser.id, ...parameters]
          : parameters),
        pagination.pageSize,
        pagination.offset,
      )
      .map((customer) => ({
        ...customer,
        initials: getInitials(customer.name),
        formattedPaidIncome: formatCurrency(customer.paid_income),
        formattedOutstanding: formatCurrency(customer.outstanding),
        canEdit: !isSale || customer.owner_id === req.currentUser.id,
        canDelete: req.currentUser.isAdmin || req.currentUser.role === 'accountant',
        canShare:
          req.currentUser.isAdmin ||
          ['accountant', 'manager'].includes(req.currentUser.role) ||
          customer.owner_id === req.currentUser.id,
        detailsJson: JSON.stringify({
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          status: customer.status,
          notes: customer.notes,
          isPublic: Boolean(customer.is_public),
          sharedUserIds: sharedUserIdsByCustomer.get(customer.id) || [],
        }),
      }));

    const statusCountConditions = isSale
      ? [
          "(is_public = 1 OR owner_id = ? OR EXISTS (SELECT 1 FROM customer_shares cs WHERE cs.customer_id = customers.id AND cs.user_id = ?))",
        ]
      : [];
    const statusCounts = db
      .prepare(
        `SELECT status, COUNT(*) AS count FROM customers
         ${statusCountConditions.length > 0 ? `WHERE ${statusCountConditions.join(' AND ')}` : ''}
         GROUP BY status`,
      )
      .all(...(isSale ? [req.currentUser.id, req.currentUser.id] : []));

    res.render('customers', {
      title: 'Khách hàng',
      activePage: 'customers',
      customers,
      pagination,
      search,
      selectedStatus,
      customerStatuses: CUSTOMER_STATUSES,
      canManageCustomers:
        req.currentUser.isAdmin ||
        req.currentUser.role === 'accountant' ||
        req.currentUser.role === 'sale',
      canSetPublic:
        req.currentUser.isAdmin || req.currentUser.role === 'accountant',
      saleUsers:
        req.currentUser.isAdmin ||
        ['accountant', 'manager', 'sale'].includes(req.currentUser.role)
          ? db
              .prepare(
                "SELECT id, full_name AS fullName FROM users WHERE role = 'sale' AND is_active = 1 ORDER BY full_name COLLATE NOCASE",
              )
              .all()
          : [],
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
        `SELECT id, name, phone, email, status, notes, owner_id, is_public
         FROM customers
         WHERE id = ?`,
      )
      .get(customerId);

    if (!customer) {
      res.status(404).json({ error: 'Không tìm thấy khách hàng.' });

      return;
    }

    if (
      req.currentUser.role === 'sale' &&
      !customer.is_public &&
      customer.owner_id !== req.currentUser.id &&
      !db
        .prepare(
          'SELECT 1 FROM customer_shares WHERE customer_id = ? AND user_id = ?',
        )
        .get(customerId, req.currentUser.id)
    ) {
      res.status(403).json({ error: 'Bạn không có quyền xem khách hàng này.' });

      return;
    }

    const saleTransactionCondition =
      req.currentUser.role === 'sale' ? ' AND created_by = ?' : '';
    const totals = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN approval_status = 'APPROVED' AND type = 'THU' AND payment_status = 'Đã thanh toán' THEN amount ELSE 0 END), 0) AS paid_income,
          COALESCE(SUM(CASE WHEN approval_status = 'APPROVED' AND payment_status = 'Công nợ' THEN amount ELSE 0 END), 0) AS outstanding
         FROM transactions
         WHERE customer_id = ?${saleTransactionCondition}`,
      )
      .get(...(req.currentUser.role === 'sale'
        ? [customerId, req.currentUser.id]
        : [customerId]));

    const transactions = db
      .prepare(
        `SELECT id, type, amount, category, description, transaction_date,
          payment_status, approval_status, rejection_reason
         FROM transactions
         WHERE customer_id = ?${saleTransactionCondition}
         ORDER BY transaction_date DESC, id DESC`,
      )
      .all(...(req.currentUser.role === 'sale'
        ? [customerId, req.currentUser.id]
        : [customerId]))
      .map((transaction) => ({
        ...transaction,
        formattedAmount: formatCurrency(transaction.amount),
        formattedDate: formatDate(transaction.transaction_date),
      }));

    res.json({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        status: customer.status,
        notes: customer.notes,
      },
      totals: {
        paidIncome: formatCurrency(totals.paid_income),
        outstanding: formatCurrency(totals.outstanding),
      },
      transactions,
    });
  });

  router.post('/', requireRoles('admin', 'accountant', 'sale'), (req, res) => {
    const customer = readCustomer(req.body);

    db.prepare(
      `INSERT INTO customers (name, phone, email, status, notes, owner_id, is_public)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      customer.name,
      customer.phone,
      customer.email,
      customer.status,
      customer.notes,
      req.currentUser.role === 'sale' ? req.currentUser.id : null,
      req.currentUser.role === 'sale' ? 0 : customer.isPublic ? 1 : 0,
    );

    setFlash(req, 'success', 'Đã thêm khách hàng mới.');
    res.redirect('/customers');
  });

  router.post('/:id', requireRoles('admin', 'accountant', 'sale'), (req, res) => {
    const customerId = parseRecordId(req.params.id);
    const customer = readCustomer(req.body);
    if (req.currentUser.role === 'sale') {
      const existing = db
        .prepare('SELECT owner_id FROM customers WHERE id = ?')
        .get(customerId);
      if (!existing || existing.owner_id !== req.currentUser.id) {
        throw createHttpError(403, 'Bạn chỉ có thể sửa khách hàng do chính bạn nhập.');
      }
    }
    const result = req.currentUser.role === 'sale'
      ? db
          .prepare(
            `UPDATE customers
             SET name = ?, phone = ?, email = ?, status = ?, notes = ?
             WHERE id = ? AND owner_id = ?`,
          )
          .run(
            customer.name,
            customer.phone,
            customer.email,
            customer.status,
            customer.notes,
            customerId,
            req.currentUser.id,
          )
      : db
          .prepare(
            `UPDATE customers
             SET name = ?, phone = ?, email = ?, status = ?, notes = ?, is_public = ?
             WHERE id = ?`,
          )
          .run(
            customer.name,
            customer.phone,
            customer.email,
            customer.status,
            customer.notes,
            customer.isPublic ? 1 : 0,
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

  router.post('/:id/share', (req, res) => {
    const customerId = parseRecordId(req.params.id);
    const existing = db
      .prepare('SELECT id, owner_id FROM customers WHERE id = ?')
      .get(customerId);
    if (!existing) {
      throw createHttpError(404, 'Không tìm thấy khách hàng.');
    }
    const canShare =
      req.currentUser.isAdmin ||
      ['accountant', 'manager'].includes(req.currentUser.role) ||
      (req.currentUser.role === 'sale' &&
        existing.owner_id === req.currentUser.id);
    if (!canShare) {
      throw createHttpError(403, 'Bạn không có quyền chia sẻ khách hàng này.');
    }
    const rawUserIds = toArray(req.body.userId);
    const userIds = rawUserIds.map((value) =>
      typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN,
    );
    if (userIds.some((userId) => !Number.isSafeInteger(userId) || userId < 1)) {
      throw createHttpError(400, 'Danh sách người dùng được chia sẻ không hợp lệ.');
    }
    const uniqueUserIds = [...new Set(userIds)];
    const validSaleUserCount = uniqueUserIds.length
      ? db
          .prepare(
            `SELECT COUNT(*) AS count FROM users
             WHERE id IN (${uniqueUserIds.map(() => '?').join(', ')})
               AND role = 'sale' AND is_active = 1`,
          )
          .get(...uniqueUserIds).count
      : 0;
    if (validSaleUserCount !== uniqueUserIds.length) {
      throw createHttpError(400, 'Chỉ có thể chia sẻ với tài khoản Sale đang hoạt động.');
    }
    const updateShares = db.transaction(() => {
      db.prepare('DELETE FROM customer_shares WHERE customer_id = ?').run(customerId);
      const insertShare = db.prepare(
        'INSERT INTO customer_shares (customer_id, user_id) VALUES (?, ?)',
      );
      for (const userId of uniqueUserIds) {
        insertShare.run(customerId, userId);
      }
    });
    updateShares();
    setFlash(req, 'success', 'Đã cập nhật quyền chia sẻ khách hàng.');
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
  const isPublic =
    body.isPublic === '1' ||
    body.isPublic === 'true' ||
    body.isPublic === 'on';

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

  return { email, name, notes, phone, status, isPublic };
};

const toArray = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];

const createHttpError = (status, message) =>
  Object.assign(new Error(message), { status });

module.exports = createCustomersRouter;
