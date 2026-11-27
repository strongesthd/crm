const express = require('express');

const { formatCurrency, formatDate } = require('../utils/format');

const getMonthRange = (year, month) => {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = new Date(year, month, 1);
  const end = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;

  return { end, start };
};

const createDashboardRouter = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const canViewCosts =
      req.currentUser.isAdmin ||
      req.currentUser.role === 'accountant' ||
      req.currentUser.role === 'manager';
    const now = new Date();
    const currentYear = now.getFullYear();
    const selectedMonth = Number.parseInt(req.query.month, 10);
    const selectedYear = Number.parseInt(req.query.year, 10);
    const month =
      Number.isInteger(selectedMonth) && selectedMonth >= 1 && selectedMonth <= 12
        ? selectedMonth
        : now.getMonth() + 1;
    const year =
      Number.isInteger(selectedYear) &&
      selectedYear >= currentYear - 10 &&
      selectedYear <= currentYear + 1
        ? selectedYear
        : currentYear;
    const { end, start } = getMonthRange(year, month);

    const paidTotals = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN type = 'THU' THEN amount ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN type = 'CHI' THEN amount ELSE 0 END), 0) AS expenses
         FROM transactions
         WHERE approval_status = 'APPROVED'
           AND payment_status = 'Đã thanh toán'
           AND transaction_date >= ? AND transaction_date < ?`,
      )
      .get(start, end);

    const outstanding = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS amount
         FROM transactions
         WHERE approval_status = 'APPROVED'
           AND payment_status = 'Công nợ'`,
      )
      .get();

    const visibleOutstanding = canViewCosts
      ? outstanding.amount
      : db
          .prepare(
            `SELECT COALESCE(SUM(amount), 0) AS amount
             FROM transactions
             WHERE approval_status = 'APPROVED'
               AND payment_status = 'Công nợ' AND type = 'THU'`,
          )
          .get().amount;

    const pendingApprovalCount =
      req.currentUser.role === 'manager'
        ? db
            .prepare(
              "SELECT COUNT(*) AS count FROM transactions WHERE approval_status = 'PENDING'",
            )
            .get().count
        : 0;

    const monthStarts = Array.from({ length: 6 }, (_value, index) => {
      const date = new Date(year, month - 1 - (5 - index), 1);

      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: new Intl.DateTimeFormat('vi-VN', { month: 'short' }).format(date),
      };
    });

    const chartTotals = db
      .prepare(
        `SELECT
          substr(transaction_date, 1, 7) AS month_key,
          type,
          SUM(amount) AS total
         FROM transactions
         WHERE approval_status = 'APPROVED'
           AND payment_status = 'Đã thanh toán'
           AND transaction_date >= ? AND transaction_date < ?
         GROUP BY month_key, type`,
      )
      .all(
        `${monthStarts[0].key}-01`,
        (() => {
          const lastDate = new Date(
            Number.parseInt(monthStarts[5].key.slice(0, 4), 10),
            Number.parseInt(monthStarts[5].key.slice(5, 7), 10),
            1,
          );

          return `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}-01`;
        })(),
      );
    const chartTotalsByMonth = new Map(
      monthStarts.map(({ key }) => [key, { income: 0, expenses: 0 }]),
    );

    for (const total of chartTotals) {
      const monthTotal = chartTotalsByMonth.get(total.month_key);

      if (monthTotal) {
        monthTotal[total.type === 'THU' ? 'income' : 'expenses'] = total.total;
      }
    }

    const recentTransactions = db
      .prepare(
        `SELECT t.*, c.name AS customer_name,
          inventory.document_type AS inventory_document_type
         FROM transactions t
         LEFT JOIN customers c ON c.id = t.customer_id
         LEFT JOIN inventory_documents inventory ON inventory.transaction_id = t.id
         ORDER BY t.transaction_date DESC, t.id DESC
         LIMIT 5`,
      )
      .all()
      .map((transaction) => ({
        ...transaction,
        amountHidden:
          !canViewCosts &&
          transaction.inventory_document_type === 'PURCHASE',
        formattedAmount:
          !canViewCosts && transaction.inventory_document_type === 'PURCHASE'
            ? 'Bảo mật'
            : formatCurrency(transaction.amount),
        formattedDate: formatDate(transaction.transaction_date),
      }));

    res.render('dashboard', {
      title: 'Tổng quan',
      activePage: 'dashboard',
      selectedMonth: month,
      selectedYear: year,
      years: Array.from(
        { length: 5 },
        (_value, index) => currentYear - 2 + index,
      ),
      totals: {
        income: paidTotals.income,
        expenses: paidTotals.expenses,
        profit: paidTotals.income - paidTotals.expenses,
        outstanding: visibleOutstanding,
      },
      chartData: {
        labels: monthStarts.map(({ label }) => label),
        income: monthStarts.map(
          ({ key }) => chartTotalsByMonth.get(key).income,
        ),
        expenses: canViewCosts
          ? monthStarts.map(({ key }) => chartTotalsByMonth.get(key).expenses)
          : [],
      },
      recentTransactions,
      canApproveTransactions: req.currentUser.role === 'manager',
      pendingApprovalCount,
      canViewCosts,
    });
  });

  return router;
};

module.exports = createDashboardRouter;
