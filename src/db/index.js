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
const TRANSACTION_CATEGORIES_BY_TYPE = {
  THU: ['Bán hàng', 'Dịch vụ', 'Khác'],
  CHI: ['Lương thưởng', 'Văn phòng', 'Marketing', 'Khác'],
};
const TRANSACTION_CATEGORIES = [
  'Bán hàng',
  'Dịch vụ',
  'Lương thưởng',
  'Văn phòng',
  'Marketing',
  'Khác',
  'Nhập hàng',
];
const USER_ROLES = ['accountant', 'cashier', 'manager', 'sale'];
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
  const hadInventoryCategories = Boolean(
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'inventory_categories'",
      )
      .get(),
  );
  const hadInventoryUnits = Boolean(
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'inventory_units'",
      )
      .get(),
  );

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

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL COLLATE NOCASE UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Khác',
      unit TEXT NOT NULL,
      cost_price INTEGER NOT NULL CHECK (cost_price >= 0),
      sale_price INTEGER NOT NULL CHECK (sale_price > 0),
      promotion_type TEXT CHECK (promotion_type IN ('percent', 'fixed')),
      promotion_value INTEGER NOT NULL DEFAULT 0 CHECK (promotion_value >= 0),
      promotion_start_date TEXT,
      promotion_end_date TEXT,
      stock_quantity REAL NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_type TEXT NOT NULL CHECK (document_type IN ('PURCHASE', 'SALE')),
      document_date TEXT NOT NULL,
      party_name TEXT NOT NULL DEFAULT '',
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      payment_status TEXT NOT NULL CHECK (payment_status IN ('Đã thanh toán', 'Công nợ')),
      approval_status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
      transaction_id INTEGER UNIQUE REFERENCES transactions(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      rejection_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_document_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES inventory_documents(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      sku TEXT NOT NULL,
      unit TEXT NOT NULL,
      quantity REAL NOT NULL CHECK (quantity > 0),
      unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
      unit_cost INTEGER NOT NULL CHECK (unit_cost >= 0),
      discount_per_unit INTEGER NOT NULL DEFAULT 0 CHECK (discount_per_unit >= 0)
    );

    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_transactions_date
      ON transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_transactions_status
      ON transactions(payment_status, type);
    CREATE INDEX IF NOT EXISTS idx_transactions_customer
      ON transactions(customer_id, transaction_date);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_inventory_documents_date
      ON inventory_documents(document_date, id);
    CREATE INDEX IF NOT EXISTS idx_inventory_documents_status
      ON inventory_documents(approval_status, document_type);
    CREATE INDEX IF NOT EXISTS idx_inventory_document_items_product
      ON inventory_document_items(product_id, document_id);

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
  `);

  ensureColumn(db, 'users', 'role', "TEXT NOT NULL DEFAULT 'admin'");
  ensureColumn(db, 'users', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(
    db,
    'customers',
    'owner_id',
    'INTEGER REFERENCES users(id) ON DELETE SET NULL',
  );
  ensureColumn(
    db,
    'customers',
    'is_public',
    'INTEGER NOT NULL DEFAULT 1',
  );
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_shares (
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (customer_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_customers_owner ON customers(owner_id, is_public);
  `);
  const insertCategory = db.prepare(
    'INSERT OR IGNORE INTO inventory_categories (name) VALUES (?)',
  );
  const insertUnit = db.prepare(
    'INSERT OR IGNORE INTO inventory_units (name) VALUES (?)',
  );

  if (!hadInventoryCategories) {
    for (const category of [
      'Khác',
      'Đồ uống',
      'Thực phẩm',
      'Văn phòng phẩm',
      'Thiết bị',
    ]) {
      insertCategory.run(category);
    }
  }
  if (!hadInventoryUnits) {
    for (const unit of ['Cái', 'Hộp', 'Kg', 'Gói', 'Thùng', 'Chai', 'Mét']) {
      insertUnit.run(unit);
    }
  }
  db.exec(`
    INSERT OR IGNORE INTO inventory_categories (name)
    SELECT DISTINCT category FROM products WHERE TRIM(category) <> '';
    INSERT OR IGNORE INTO inventory_units (name)
    SELECT DISTINCT unit FROM products WHERE TRIM(unit) <> '';
    UPDATE products
    SET category = (
      SELECT name FROM inventory_categories
      WHERE name = products.category COLLATE NOCASE LIMIT 1
    )
    WHERE EXISTS (
      SELECT 1 FROM inventory_categories
      WHERE name = products.category COLLATE NOCASE
    );
    UPDATE products
    SET unit = (
      SELECT name FROM inventory_units
      WHERE name = products.unit COLLATE NOCASE LIMIT 1
    )
    WHERE EXISTS (
      SELECT 1 FROM inventory_units
      WHERE name = products.unit COLLATE NOCASE
    );
  `);
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
          (username, password_hash, full_name, role, is_active)
         VALUES (?, ?, ?, 'admin', 1)`,
      ).run(adminUser, bcrypt.hashSync(adminPass, 12), 'Quản trị viên');
    }

    db.prepare(
      `UPDATE users
       SET role = 'admin'
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
  TRANSACTION_CATEGORIES_BY_TYPE,
  TRANSACTION_TYPES,
  USER_ROLES,
  createDatabase,
};
