const express = require('express');

const {
  APPROVAL_STATUSES,
  PAYMENT_STATUSES,
  TRANSACTION_CATEGORIES,
  TRANSACTION_TYPES,
} = require('../db');
const { requireRoles } = require('../middleware/auth');
const { setFlash } = require('../middleware/flash');
const { formatCurrency, formatDate } = require('../utils/format');
const { createPagination } = require('../utils/pagination');
const {
  applyInventoryDocumentApproval,
  isInventoryTransaction,
  rejectInventoryDocument,
} = require('../utils/inventory');

const createTransactionsRouter = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const canViewInventoryCosts =
      req.currentUser.isAdmin ||
      req.currentUser.role === 'accountant' ||
      req.currentUser.role === 'manager';
    const filters = readFilters(req.query);
    const { conditions, parameters } = buildConditions(filters);
    const totalItems = db
      .prepare(
        `SELECT COUNT(*) AS count FROM transactions t
         ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}`,
      )
      .get(...parameters).count;
    const pagination = createPagination({
      page: req.query.page,
      totalItems,
      basePath: '/transactions',
      filters,
    });
    const transactions = db
      .prepare(
        `SELECT t.*, c.name AS customer_name,
          creator.full_name AS creator_name,
          reviewer.full_name AS reviewer_name,
          inventory.id AS inventory_document_id,
          inventory.document_type AS inventory_document_type
         FROM transactions t
         LEFT JOIN customers c ON c.id = t.customer_id
         LEFT JOIN users creator ON creator.id = t.created_by
         LEFT JOIN users reviewer ON reviewer.id = t.reviewed_by
         LEFT JOIN inventory_documents inventory ON inventory.transaction_id = t.id
         ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
         ORDER BY t.transaction_date DESC, t.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...parameters, pagination.pageSize, pagination.offset)
      .map((transaction) => {
        const amountHidden =
          !canViewInventoryCosts &&
          transaction.inventory_document_type === 'PURCHASE';
        const formattedAmount = amountHidden
          ? 'Bảo mật'
          : formatCurrency(transaction.amount);

        return {
          ...transaction,
          amountHidden,
          formattedAmount,
          formattedDate: formatDate(transaction.transaction_date),
          detailsJson: JSON.stringify({
            id: transaction.id,
            type: transaction.type,
            ...(!amountHidden ? { amount: transaction.amount } : {}),
            category: transaction.category,
            description: transaction.description,
            transactionDate: transaction.transaction_date,
            paymentStatus: transaction.payment_status,
            approvalStatus: transaction.approval_status,
            customerId: transaction.customer_id,
            customerName: transaction.customer_name || 'Không liên kết',
            creatorName: transaction.creator_name || 'Không rõ',
            reviewerName: transaction.reviewer_name || 'Chưa duyệt',
            rejectionReason: transaction.rejection_reason,
            formattedAmount,
            formattedDate: formatDate(transaction.transaction_date),
          }),
          canEdit: canEditTransaction(req.currentUser, transaction),
        };
      });

    const customers = db
      .prepare('SELECT id, name FROM customers ORDER BY name COLLATE NOCASE')
      .all();

    res.render('transactions', {
      title: 'Thu - Chi',
      activePage: 'transactions',
      transactions,
      pagination,
      customers,
      filters,
      csvUrl: `/transactions/export.csv?${new URLSearchParams(
        Object.entries(filters).filter(([, value]) => value),
      ).toString()}`,
      transactionTypes: TRANSACTION_TYPES,
      paymentStatuses: PAYMENT_STATUSES,
      categories: TRANSACTION_CATEGORIES,
      approvalStatuses: APPROVAL_STATUSES,
      canApproveTransactions: req.currentUser.role === 'manager',
      canMarkTransactionsPaid:
        req.currentUser.isAdmin || req.currentUser.role === 'accountant',
      canDeleteTransactions: req.currentUser.isAdmin,
      canViewInventoryCosts,
    });
  });

  router.get('/export.csv', (req, res) => {
    const canViewInventoryCosts =
      req.currentUser.isAdmin ||
      req.currentUser.role === 'accountant' ||
      req.currentUser.role === 'manager';
    const filters = readFilters(req.query);
    const { conditions, parameters } = buildConditions(filters);
    const transactions = db
      .prepare(
        `SELECT t.id, t.type, t.amount, t.category, t.description,
          t.transaction_date, t.payment_status, t.approval_status,
          inventory.document_type AS inventory_document_type,
          c.name AS customer_name
         FROM transactions t
         LEFT JOIN customers c ON c.id = t.customer_id
         LEFT JOIN inventory_documents inventory ON inventory.transaction_id = t.id
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
        'Thanh toán',
        'Duyệt',
        'Khách hàng',
      ],
      ...transactions.map((transaction) => [
        transaction.id,
        transaction.type === 'THU' ? 'Thu' : 'Chi',
        !canViewInventoryCosts &&
        transaction.inventory_document_type === 'PURCHASE'
          ? ''
          : transaction.amount,
        !canViewInventoryCosts &&
        transaction.inventory_document_type === 'PURCHASE'
          ? 'Nhập hàng hóa'
          : transaction.category,
        !canViewInventoryCosts &&
        transaction.inventory_document_type === 'PURCHASE'
          ? `Chi phí nhập kho #${transaction.id}`
          : transaction.description,
        formatDate(transaction.transaction_date),
        transaction.payment_status,
        getApprovalLabel(transaction.approval_status),
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
        (type, amount, category, description, transaction_date, payment_status,
         customer_id, approval_status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    ).run(
      transaction.type,
      transaction.amount,
      transaction.category,
      transaction.description,
      transaction.transactionDate,
      transaction.paymentStatus,
      transaction.customerId,
      req.currentUser.id,
    );

    setFlash(req, 'success', 'Đã tạo phiếu và gửi chờ duyệt.');
    res.redirect('/transactions');
  });

  router.post('/:id', (req, res) => {
    const transactionId = parseRecordId(req.params.id);
    const existingTransaction = db
      .prepare(
        `SELECT t.approval_status, t.created_by,
          inventory.id AS inventory_document_id
         FROM transactions t
         LEFT JOIN inventory_documents inventory ON inventory.transaction_id = t.id
         WHERE t.id = ?`,
      )
      .get(transactionId);

    if (!existingTransaction) {
      throw createHttpError(404, 'Không tìm thấy giao dịch cần chỉnh sửa.');
    }

    if (!canEditTransaction(req.currentUser, existingTransaction)) {
      throw createHttpError(403, 'Bạn không có quyền chỉnh sửa phiếu này.');
    }

    const transaction = readTransaction(req.body, db);
    const result = db
      .prepare(
        `UPDATE transactions
         SET type = ?, amount = ?, category = ?, description = ?,
           transaction_date = ?, payment_status = ?, customer_id = ?,
           approval_status = 'PENDING', reviewed_by = NULL, rejection_reason = ''
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

    setFlash(req, 'success', 'Đã cập nhật phiếu và chuyển về trạng thái chờ duyệt.');
    res.redirect('/transactions');
  });

  router.post(
    '/:id/approve',
    requireRoles('manager'),
    (req, res) => {
      const transactionId = parseRecordId(req.params.id);
      const approve = db.transaction(() => {
        const result = db
          .prepare(
            `UPDATE transactions
             SET approval_status = 'APPROVED', reviewed_by = ?, rejection_reason = ''
             WHERE id = ? AND approval_status = 'PENDING'`,
          )
          .run(req.currentUser.id, transactionId);

        if (result.changes === 0) {
          throw getMissingOrReviewedError(db, transactionId);
        }

        applyInventoryDocumentApproval(db, transactionId, req.currentUser.id);
      });

      approve();

      setFlash(req, 'success', 'Đã duyệt phiếu.');
      res.redirect('/transactions');
    },
  );

  router.post(
    '/:id/reject',
    requireRoles('manager'),
    (req, res) => {
      const transactionId = parseRecordId(req.params.id);
      const reason =
        typeof req.body.reason === 'string' ? req.body.reason.trim() : '';

      if (!reason || reason.length > 1000) {
        throw createHttpError(
          400,
          'Vui lòng nhập lý do từ chối, tối đa 1.000 ký tự.',
        );
      }

      const reject = db.transaction(() => {
        const result = db
          .prepare(
            `UPDATE transactions
             SET approval_status = 'REJECTED', reviewed_by = ?, rejection_reason = ?
             WHERE id = ? AND approval_status = 'PENDING'`,
          )
          .run(req.currentUser.id, reason, transactionId);

        if (result.changes === 0) {
          throw getMissingOrReviewedError(db, transactionId);
        }

        rejectInventoryDocument(
          db,
          transactionId,
          req.currentUser.id,
          reason,
        );
      });

      reject();

      setFlash(req, 'success', 'Đã từ chối phiếu.');
      res.redirect('/transactions');
    },
  );

  router.post(
    '/:id/paid',
    requireRoles('admin', 'accountant'),
    (req, res) => {
      const transactionId = parseRecordId(req.params.id);
      const result = db
        .prepare(
          `UPDATE transactions
           SET payment_status = 'Đã thanh toán'
           WHERE id = ? AND payment_status = 'Công nợ'
             AND approval_status = 'APPROVED'`,
        )
        .run(transactionId);

      if (result.changes === 0) {
        throw createHttpError(
          404,
          'Không tìm thấy giao dịch công nợ đã được duyệt.',
        );
      }

      setFlash(req, 'success', 'Đã cập nhật trạng thái thanh toán.');
      res.redirect('/transactions');
    },
  );

  router.post('/:id/delete', requireRoles('admin'), (req, res) => {
    const transactionId = parseRecordId(req.params.id);

    if (isInventoryTransaction(db, transactionId)) {
      throw createHttpError(
        409,
        'Không thể xóa phiếu thu chi được tạo từ chứng từ kho.',
      );
    }

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
  const approvalStatus =
    typeof query.approvalStatus === 'string' &&
    APPROVAL_STATUSES.includes(query.approvalStatus)
      ? query.approvalStatus
      : '';
  const from = typeof query.from === 'string' ? query.from : '';
  const to = typeof query.to === 'string' ? query.to : '';

  if ((from && !isValidDate(from)) || (to && !isValidDate(to))) {
    throw createHttpError(400, 'Khoảng ngày lọc chưa hợp lệ.');
  }

  if (from && to && from > to) {
    throw createHttpError(400, 'Ngày bắt đầu không thể sau ngày kết thúc.');
  }

  return { approvalStatus, from, paymentStatus, to, type };
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

  if (filters.approvalStatus) {
    conditions.push('t.approval_status = ?');
    parameters.push(filters.approvalStatus);
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

const getApprovalLabel = (status) => {
  if (status === 'PENDING') {
    return 'Chờ duyệt';
  }

  if (status === 'REJECTED') {
    return 'Từ chối';
  }

  return 'Đã duyệt';
};

const canEditTransaction = (user, transaction) =>
  !transaction.inventory_document_id &&
  (user.isAdmin ||
    transaction.created_by === user.id ||
    (user.role === 'accountant' && transaction.approval_status === 'PENDING'));

const getMissingOrReviewedError = (db, transactionId) => {
  const transaction = db
    .prepare('SELECT 1 FROM transactions WHERE id = ?')
    .get(transactionId);

  return transaction
    ? createHttpError(409, 'Phiếu này không còn ở trạng thái chờ duyệt.')
    : createHttpError(404, 'Không tìm thấy phiếu cần duyệt.');
};

const createHttpError = (status, message) =>
  Object.assign(new Error(message), { status });

module.exports = { createTransactionsRouter, escapeCsvCell, isValidDate };
