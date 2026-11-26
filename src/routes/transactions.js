const express = require('express');

const {
  PAYMENT_STATUSES,
  TRANSACTION_CATEGORIES,
  TRANSACTION_TYPES,
} = require('../db');
const { setFlash } = require('../middleware/flash');
const { formatCurrency, formatDate } = require('../utils/format');

const createTransactionsRouter = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const filters = readFilters(req.query);
    const { conditions, parameters } = buildConditions(filters);
    const transactions = db
      .prepare(
        `SELECT t.*, c.name AS customer_name
         FROM transactions t
         LEFT JOIN customers c ON c.id = t.customer_id
         ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
         ORDER BY t.transaction_date DESC, t.id DESC`,
      )
      .all(...parameters)
      .map((transaction) => ({
        ...transaction,
        formattedAmount: formatCurrency(transaction.amount),
        formattedDate: formatDate(transaction.transaction_date),
        detailsJson: JSON.stringify({
          id: transaction.id,
          type: transaction.type,
          amount: transaction.amount,
          category: transaction.category,
          description: transaction.description,
          transactionDate: transaction.transaction_date,
          paymentStatus: transaction.payment_status,
          customerId: transaction.customer_id,
        }),
      }));

    const customers = db
      .prepare('SELECT id, name FROM customers ORDER BY name COLLATE NOCASE')
      .all();

    res.render('transactions', {
      title: 'Thu - Chi',
      activePage: 'transactions',
      transactions,
      customers,
      filters,
      csvUrl: `/transactions/export.csv?${new URLSearchParams(
        Object.entries(filters).filter(([, value]) => value),
      ).toString()}`,
      transactionTypes: TRANSACTION_TYPES,
      paymentStatuses: PAYMENT_STATUSES,
      categories: TRANSACTION_CATEGORIES,
    });
  });

  router.get('/export.csv', (req, res) => {
    const filters = readFilters(req.query);
    const { conditions, parameters } = buildConditions(filters);
    const transactions = db
      .prepare(
        `SELECT t.id, t.type, t.amount, t.category, t.description,
          t.transaction_date, t.payment_status, c.name AS customer_name
         FROM transactions t
         LEFT JOIN customers c ON c.id = t.customer_id
         ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
         ORDER BY t.transaction_date DESC, t.id DESC`,
      )
      .all(...parameters);
    const rows = [
      [
        'Mã giao dịch',
        'Loại',
        'Số tiền (VNĐ)',
        'Danh mục',
        'Diễn giải',
        'Ngày giao dịch',
        'Trạng thái',
        'Khách hàng',
      ],
      ...transactions.map((transaction) => [
        transaction.id,
        transaction.type === 'THU' ? 'Thu' : 'Chi',
        transaction.amount,
        transaction.category,
        transaction.description,
        formatDate(transaction.transaction_date),
        transaction.payment_status,
        transaction.customer_name ?? '',
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}`;

    res
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="so-thu-chi.csv"',
        'Cache-Control': 'no-store',
      })
      .send(csv);
  });

  router.post('/', (req, res) => {
    const transaction = readTransaction(req.body, db);

    db.prepare(
      `INSERT INTO transactions
        (type, amount, category, description, transaction_date, payment_status, customer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      transaction.type,
      transaction.amount,
      transaction.category,
      transaction.description,
      transaction.transactionDate,
      transaction.paymentStatus,
      transaction.customerId,
    );

    setFlash(req, 'success', 'Đã thêm giao dịch mới.');
    res.redirect('/transactions');
  });

  router.post('/:id', (req, res) => {
    const transactionId = parseRecordId(req.params.id);
    const transaction = readTransaction(req.body, db);
    const result = db
      .prepare(
        `UPDATE transactions
         SET type = ?, amount = ?, category = ?, description = ?,
           transaction_date = ?, payment_status = ?, customer_id = ?
         WHERE id = ?`,
      )
      .run(
        transaction.type,
        transaction.amount,
        transaction.category,
        transaction.description,
        transaction.transactionDate,
        transaction.paymentStatus,
        transaction.customerId,
        transactionId,
      );

    if (result.changes === 0) {
      throw createHttpError(404, 'Không tìm thấy giao dịch cần chỉnh sửa.');
    }

    setFlash(req, 'success', 'Đã cập nhật giao dịch.');
    res.redirect('/transactions');
  });

  router.post('/:id/paid', (req, res) => {
    const transactionId = parseRecordId(req.params.id);
    const result = db
      .prepare(
        `UPDATE transactions
         SET payment_status = 'Đã thanh toán'
         WHERE id = ? AND payment_status = 'Công nợ'`,
      )
      .run(transactionId);

    if (result.changes === 0) {
      throw createHttpError(
        404,
        'Không tìm thấy giao dịch công nợ cần cập nhật.',
      );
    }

    setFlash(req, 'success', 'Đã cập nhật trạng thái thanh toán.');
    res.redirect('/transactions');
  });

  router.post('/:id/delete', (req, res) => {
    const transactionId = parseRecordId(req.params.id);
    const result = db
      .prepare('DELETE FROM transactions WHERE id = ?')
      .run(transactionId);

    if (result.changes === 0) {
      throw createHttpError(404, 'Không tìm thấy giao dịch cần xóa.');
    }

    setFlash(req, 'success', 'Đã xóa giao dịch.');
    res.redirect('/transactions');
  });

  return router;
};

const readFilters = (query) => {
  const type =
    typeof query.type === 'string' && TRANSACTION_TYPES.includes(query.type)
      ? query.type
      : '';
  const paymentStatus =
    typeof query.paymentStatus === 'string' &&
    PAYMENT_STATUSES.includes(query.paymentStatus)
      ? query.paymentStatus
      : '';
  const from = typeof query.from === 'string' ? query.from : '';
  const to = typeof query.to === 'string' ? query.to : '';

  if ((from && !isValidDate(from)) || (to && !isValidDate(to))) {
    throw createHttpError(400, 'Khoảng ngày lọc chưa hợp lệ.');
  }

  if (from && to && from > to) {
    throw createHttpError(400, 'Ngày bắt đầu không thể sau ngày kết thúc.');
  }

  return { from, paymentStatus, to, type };
};

const buildConditions = (filters) => {
  const conditions = [];
  const parameters = [];

  if (filters.type) {
    conditions.push('t.type = ?');
    parameters.push(filters.type);
  }

  if (filters.paymentStatus) {
    conditions.push('t.payment_status = ?');
    parameters.push(filters.paymentStatus);
  }

  if (filters.from) {
    conditions.push('t.transaction_date >= ?');
    parameters.push(filters.from);
  }

  if (filters.to) {
    conditions.push('t.transaction_date <= ?');
    parameters.push(filters.to);
  }

  return { conditions, parameters };
};

const readTransaction = (body, db) => {
  const type = typeof body.type === 'string' ? body.type : '';
  const amountText = typeof body.amount === 'string' ? body.amount.trim() : '';
  const amount = Number(amountText);
  const category = typeof body.category === 'string' ? body.category : '';
  const description =
    typeof body.description === 'string' ? body.description.trim() : '';
  const transactionDate =
    typeof body.transactionDate === 'string' ? body.transactionDate : '';
  const paymentStatus =
    typeof body.paymentStatus === 'string' ? body.paymentStatus : '';
  const customerIdText =
    typeof body.customerId === 'string' ? body.customerId.trim() : '';
  const customerId = customerIdText ? Number(customerIdText) : null;

  if (!TRANSACTION_TYPES.includes(type)) {
    throw createHttpError(400, 'Loại giao dịch không hợp lệ.');
  }

  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > 9_000_000_000_000
  ) {
    throw createHttpError(400, 'Số tiền phải là số nguyên dương hợp lệ.');
  }

  if (!TRANSACTION_CATEGORIES.includes(category)) {
    throw createHttpError(400, 'Danh mục giao dịch không hợp lệ.');
  }

  if (description.length > 2000) {
    throw createHttpError(400, 'Diễn giải tối đa 2.000 ký tự.');
  }

  if (!isValidDate(transactionDate)) {
    throw createHttpError(400, 'Ngày giao dịch chưa đúng định dạng.');
  }

  if (!PAYMENT_STATUSES.includes(paymentStatus)) {
    throw createHttpError(400, 'Trạng thái thanh toán không hợp lệ.');
  }

  if (
    customerId !== null &&
    (!Number.isSafeInteger(customerId) ||
      customerId < 1 ||
      !db.prepare('SELECT 1 FROM customers WHERE id = ?').get(customerId))
  ) {
    throw createHttpError(400, 'Khách hàng được chọn không tồn tại.');
  }

  return {
    amount,
    category,
    customerId,
    description,
    paymentStatus,
    transactionDate,
    type,
  };
};

const isValidDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const escapeCsvCell = (value) => {
  let text = String(value ?? '');

  if (/^[\t\r\n ]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
};

const parseRecordId = (value) => {
  const id = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(id) || id < 1) {
    throw createHttpError(404, 'Không tìm thấy dữ liệu yêu cầu.');
  }

  return id;
};

const createHttpError = (status, message) =>
  Object.assign(new Error(message), { status });

module.exports = { createTransactionsRouter, escapeCsvCell, isValidDate };
