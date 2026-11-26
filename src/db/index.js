const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const PAYMENT_STATUSES = ['Đã thanh toán', 'Công nợ'];
const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
const TRANSACTION_TYPES = ['THU', 'CHI'];
const CUSTOMER_STATUSES = [
  'Tiềm năng',
  'Đang chăm sóc',
  'Đã chốt',
  'Tạm dừng',
];
const TRANSACTION_CATEGORIES = [
  'Bán hàng',
  'Dịch vụ',
  'Lương thưởng',
  'Văn phòng',
  'Marketing',
  'Khác',
];
const USER_ROLES = ['accountant', 'cashier', 'manager'];
const PRIVILEGED_USER_ROLES = ['admin', 'manager'];

const ensureColumn = (db, tableName, columnName, definition) => {
  const columns = db.pragma(`table_info(${tableName})`);

  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
};

const createDatabase = ({ adminPass, adminUser, databasePath }) => {
  fs.mkdirSync(databasePath, { recursive: true });

  const filePath = path.join(databasePath, 'database.sqlite');
  const isNewDatabase = !fs.existsSync(filePath);
  const db = new Database(filePath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      can_approve INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Tiềm năng'
        CHECK (status IN ('Tiềm năng', 'Đang chăm sóc', 'Đã chốt', 'Tạm dừng')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('THU', 'CHI')),
      amount INTEGER NOT NULL CHECK (amount > 0),
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      transaction_date TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'Đã thanh toán'
        CHECK (payment_status IN ('Đã thanh toán', 'Công nợ')),
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      approval_status TEXT NOT NULL DEFAULT 'APPROVED'
        CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      rejection_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_transactions_date
      ON transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_transactions_status
      ON transactions(payment_status, type);
    CREATE INDEX IF NOT EXISTS idx_transactions_customer
      ON transactions(customer_id, transaction_date);

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
  `);

  ensureColumn(db, 'users', 'role', "TEXT NOT NULL DEFAULT 'admin'");
  ensureColumn(db, 'users', 'can_approve', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'users', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(
    db,
    'transactions',
    'approval_status',
    "TEXT NOT NULL DEFAULT 'APPROVED'",
  );
  ensureColumn(
    db,
    'transactions',
    'created_by',
    'INTEGER REFERENCES users(id) ON DELETE SET NULL',
  );
  ensureColumn(
    db,
    'transactions',
    'reviewed_by',
    'INTEGER REFERENCES users(id) ON DELETE SET NULL',
  );
  ensureColumn(
    db,
    'transactions',
    'rejection_reason',
    "TEXT NOT NULL DEFAULT ''",
  );
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_approval
      ON transactions(approval_status, transaction_date);
    CREATE INDEX IF NOT EXISTS idx_transactions_created_by
      ON transactions(created_by, approval_status);
  `);

  const seed = db.transaction(() => {
    const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;

    if (userCount === 0) {
      db.prepare(
        `INSERT INTO users
          (username, password_hash, full_name, role, can_approve, is_active)
         VALUES (?, ?, ?, 'admin', 1, 1)`,
      ).run(adminUser, bcrypt.hashSync(adminPass, 12), 'Quản trị viên');
    }

    db.prepare(
      `UPDATE users
       SET role = 'admin', can_approve = 1
       WHERE username = ? COLLATE NOCASE`,
    ).run(adminUser);

    if (!isNewDatabase) {
      return;
    }

    const insertCustomer = db.prepare(
      `INSERT INTO customers (name, phone, email, status, notes)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const customerA = insertCustomer.run(
      'Công ty Minh An',
      '0901 234 567',
      'lienhe@minhan.example',
      'Đang chăm sóc',
      'Quan tâm gói dịch vụ tư vấn.',
    ).lastInsertRowid;
    const customerB = insertCustomer.run(
      'Nguyễn Thu Hà',
      '0987 654 321',
      'ha.nguyen@example.com',
      'Đã chốt',
      'Khách hàng giới thiệu từ đối tác.',
    ).lastInsertRowid;

    const today = new Date().toISOString().slice(0, 10);
    const insertTransaction = db.prepare(
      `INSERT INTO transactions
        (type, amount, category, description, transaction_date, payment_status, customer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    insertTransaction.run(
      'THU',
      15000000,
      'Dịch vụ',
      'Phí triển khai dịch vụ tháng này',
      today,
      'Đã thanh toán',
      customerB,
    );
    insertTransaction.run(
      'CHI',
      4200000,
      'Văn phòng',
      'Chi phí vận hành văn phòng',
      today,
      'Đã thanh toán',
      null,
    );
    insertTransaction.run(
      'THU',
      8000000,
      'Bán hàng',
      'Đơn hàng đang chờ thanh toán',
      today,
      'Công nợ',
      customerA,
    );
  });

  seed();
  db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());

  return db;
};

module.exports = {
  APPROVAL_STATUSES,
  CUSTOMER_STATUSES,
  PAYMENT_STATUSES,
  PRIVILEGED_USER_ROLES,
  TRANSACTION_CATEGORIES,
  TRANSACTION_TYPES,
  USER_ROLES,
  createDatabase,
};
