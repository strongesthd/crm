const express = require('express');

const { PAYMENT_STATUSES } = require('../db');
const { requireRoles } = require('../middleware/auth');
const { setFlash } = require('../middleware/flash');
const { formatCurrency, formatDate } = require('../utils/format');
const { isValidDate } = require('./transactions');

const INVENTORY_ROLES = ['admin', 'manager', 'accountant'];
const MAX_AMOUNT = 9_000_000_000_000;
const OPTION_TYPES = {
  categories: {
    label: 'Danh mục',
    productColumn: 'category',
    table: 'inventory_categories',
  },
  units: {
    label: 'Đơn vị tính',
    productColumn: 'unit',
    table: 'inventory_units',
  },
};

const createInventoryRouter = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const canManageInventory = INVENTORY_ROLES.some((role) =>
      role === 'admin'
        ? req.currentUser.isAdmin
        : req.currentUser.role === role,
    );
    const today = new Date().toISOString().slice(0, 10);
    const products = db
      .prepare(
        `SELECT id, sku, name, category, unit, cost_price, sale_price,
          promotion_type, promotion_value, promotion_start_date,
          promotion_end_date, stock_quantity, is_active
         FROM products
         WHERE is_active = 1 OR stock_quantity > 0
         ORDER BY name COLLATE NOCASE`,
      )
      .all()
      .map((product) => {
        const priceInfo = getCurrentSalePrice(product, today);
        const viewProduct = {
          ...product,
          effectiveSalePrice: priceInfo.price,
          formattedSalePrice: formatCurrency(priceInfo.price),
          formattedListPrice: formatCurrency(product.sale_price),
          formattedStock: formatQuantity(product.stock_quantity),
          promotionLabel: priceInfo.discount > 0
            ? `-${formatCurrency(priceInfo.discount)}`
            : '',
        };

        if (canManageInventory) {
          viewProduct.formattedCostPrice = formatCurrency(product.cost_price);
          viewProduct.formattedStockValue = formatCurrency(
            product.stock_quantity * product.cost_price,
          );
          viewProduct.formattedUnitMargin = formatCurrency(
            priceInfo.price - product.cost_price,
          );
          viewProduct.detailsJson = JSON.stringify({
            ...product,
            stock_quantity: undefined,
          });
        }

        return viewProduct;
      });

    const documents = db
      .prepare(
        `SELECT d.id, d.document_type, d.document_date, d.party_name,
          d.payment_status, d.approval_status, d.rejection_reason,
          u.full_name AS creator_name,
          COUNT(i.id) AS line_count,
          ${canManageInventory
            ? 'COALESCE(SUM(ROUND(i.quantity * (i.unit_price - i.discount_per_unit), 0)), 0) AS total_amount'
            : 'NULL AS total_amount'}
          ${canManageInventory
            ? ', COALESCE(SUM(ROUND(i.quantity * (i.unit_price - i.discount_per_unit - i.unit_cost), 0)), 0) AS gross_profit_amount'
            : ', NULL AS gross_profit_amount'}
         FROM inventory_documents d
         LEFT JOIN inventory_document_items i ON i.document_id = d.id
         LEFT JOIN users u ON u.id = d.created_by
         GROUP BY d.id
         ORDER BY d.document_date DESC, d.id DESC
         LIMIT 100`,
      )
      .all()
      .map((document) => ({
        ...document,
        formattedDate: formatDate(document.document_date),
        formattedAmount: canManageInventory
          ? formatCurrency(document.total_amount)
          : null,
        formattedGrossProfit: canManageInventory
          ? formatCurrency(document.gross_profit_amount)
          : null,
      }));

    const customers = canManageInventory
      ? db.prepare('SELECT id, name FROM customers ORDER BY name COLLATE NOCASE').all()
      : [];
    const categories = db
      .prepare(
        `SELECT c.id, c.name, COUNT(p.id) AS product_count
         FROM inventory_categories c
         LEFT JOIN products p ON p.category COLLATE NOCASE = c.name
         GROUP BY c.id
         ORDER BY c.name COLLATE NOCASE`,
      )
      .all();
    const units = db
      .prepare(
        `SELECT u.id, u.name, COUNT(p.id) AS product_count
         FROM inventory_units u
         LEFT JOIN products p ON p.unit COLLATE NOCASE = u.name
         GROUP BY u.id
         ORDER BY u.name COLLATE NOCASE`,
      )
      .all();

    res.render('inventory', {
      title: 'Quản lý kho',
      activePage: 'inventory',
      products,
      categories,
      units,
      productsForForms: canManageInventory
        ? products
            .filter((product) => product.is_active)
            .map((product) => ({
              id: product.id,
              sku: product.sku,
              name: product.name,
              unit: product.unit,
              stockQuantity: product.stock_quantity,
              costPrice: product.cost_price,
              salePrice: product.sale_price,
              effectiveSalePrice: product.effectiveSalePrice,
            }))
        : [],
      documents,
      customers,
      paymentStatuses: PAYMENT_STATUSES,
      canManageInventory,
      canViewCosts: canManageInventory,
    });
  });

  router.post(
    '/options/:type',
    requireRoles(...INVENTORY_ROLES),
    (req, res) => {
      const optionType = Object.prototype.hasOwnProperty.call(
        OPTION_TYPES,
        req.params.type,
      )
        ? OPTION_TYPES[req.params.type]
        : null;

      if (!optionType) {
        throw createHttpError(404, 'Không tìm thấy loại lựa chọn.');
      }

      const name = readText(
        req.body.name,
        optionType.label,
        req.params.type === 'categories' ? 100 : 30,
      );

      try {
        db.prepare(`INSERT INTO ${optionType.table} (name) VALUES (?)`).run(name);
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw createHttpError(409, `${optionType.label} này đã tồn tại.`);
        }

        throw error;
      }

      setFlash(req, 'success', `Đã thêm ${optionType.label.toLowerCase()} "${name}".`);
      res.redirect('/inventory');
    },
  );

  router.post(
    '/options/:type/:id/delete',
    requireRoles(...INVENTORY_ROLES),
    (req, res) => {
      const optionType = Object.prototype.hasOwnProperty.call(
        OPTION_TYPES,
        req.params.type,
      )
        ? OPTION_TYPES[req.params.type]
        : null;

      if (!optionType) {
        throw createHttpError(404, 'Không tìm thấy loại lựa chọn.');
      }

      const optionId = parseRecordId(req.params.id);
      const option = db
        .prepare(`SELECT id, name FROM ${optionType.table} WHERE id = ?`)
        .get(optionId);

      if (!option) {
        throw createHttpError(404, `Không tìm thấy ${optionType.label.toLowerCase()}.`);
      }

      const optionCount = db
        .prepare(`SELECT COUNT(*) AS count FROM ${optionType.table}`)
        .get();

      if (optionCount.count === 1) {
        throw createHttpError(
          409,
          `Phải giữ lại ít nhất một ${optionType.label.toLowerCase()}.`,
        );
      }

      const usage = db
        .prepare(
          `SELECT COUNT(*) AS count FROM products
           WHERE ${optionType.productColumn} COLLATE NOCASE = ?`,
        )
        .get(option.name);

      if (usage.count > 0) {
        throw createHttpError(
          409,
          `Không thể xóa ${optionType.label.toLowerCase()} "${option.name}" vì đang được ${usage.count} hàng hóa sử dụng.`,
        );
      }

      db.prepare(`DELETE FROM ${optionType.table} WHERE id = ?`).run(optionId);
      setFlash(req, 'success', `Đã xóa ${optionType.label.toLowerCase()} "${option.name}".`);
      res.redirect('/inventory');
    },
  );

  router.post(
    '/products',
    requireRoles(...INVENTORY_ROLES),
    (req, res) => {
      const product = readProduct(req.body, db);

      try {
        db.prepare(
          `INSERT INTO products
            (sku, name, category, unit, cost_price, sale_price,
             promotion_type, promotion_value, promotion_start_date,
             promotion_end_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          product.sku,
          product.name,
          product.category,
          product.unit,
          product.costPrice,
          product.salePrice,
          product.promotionType,
          product.promotionValue,
          product.promotionStartDate,
          product.promotionEndDate,
        );
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw createHttpError(409, 'Mã hàng này đã được sử dụng.');
        }

        throw error;
      }

      setFlash(req, 'success', `Đã thêm hàng hóa ${product.name}.`);
      res.redirect('/inventory');
    },
  );

  router.post(
    '/products/:id',
    requireRoles(...INVENTORY_ROLES),
    (req, res) => {
      const productId = parseRecordId(req.params.id);
      const product = readProduct(req.body, db);

      try {
        const result = db
          .prepare(
            `UPDATE products
             SET sku = ?, name = ?, category = ?, unit = ?, cost_price = ?,
               sale_price = ?, promotion_type = ?, promotion_value = ?,
               promotion_start_date = ?, promotion_end_date = ?,
               updated_at = datetime('now')
             WHERE id = ?`,
          )
          .run(
            product.sku,
            product.name,
            product.category,
            product.unit,
            product.costPrice,
            product.salePrice,
            product.promotionType,
            product.promotionValue,
            product.promotionStartDate,
            product.promotionEndDate,
            productId,
          );

        if (result.changes === 0) {
          throw createHttpError(404, 'Không tìm thấy hàng hóa.');
        }
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw createHttpError(409, 'Mã hàng này đã được sử dụng.');
        }

        throw error;
      }

      setFlash(req, 'success', `Đã cập nhật hàng hóa ${product.name}.`);
      res.redirect('/inventory');
    },
  );

  router.post(
    '/documents',
    requireRoles(...INVENTORY_ROLES),
    (req, res) => {
      const document = readDocument(req.body, db);
      const createDocument = db.transaction(() => {
        validateAvailableStock(db, document);

        const documentId = Number(
          db
            .prepare(
              `INSERT INTO inventory_documents
                (document_type, document_date, party_name, customer_id,
                 payment_status, created_by)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .run(
              document.type,
              document.date,
              document.partyName,
              document.customerId,
              document.paymentStatus,
              req.currentUser.id,
            ).lastInsertRowid,
        );
        const insertItem = db.prepare(
          `INSERT INTO inventory_document_items
            (document_id, product_id, product_name, sku, unit, quantity,
             unit_price, unit_cost, discount_per_unit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        let totalAmount = 0;

        for (const item of document.items) {
          insertItem.run(
            documentId,
            item.product.id,
            item.product.name,
            item.product.sku,
            item.product.unit,
            item.quantity,
            item.unitPrice,
            item.unitCost,
            item.discountPerUnit,
          );
          totalAmount += Math.round(
            item.quantity * (item.unitPrice - item.discountPerUnit),
          );
        }

        if (!Number.isSafeInteger(totalAmount) || totalAmount < 1 || totalAmount > MAX_AMOUNT) {
          throw createHttpError(400, 'Tổng tiền chứng từ phải là số nguyên dương hợp lệ.');
        }

        const description =
          `${document.type === 'PURCHASE' ? 'Nhập kho' : 'Bán hàng'} #${documentId}` +
          (document.partyName ? ` - ${document.partyName}` : '');
        const transactionId = Number(
          db
            .prepare(
              `INSERT INTO transactions
                (type, amount, category, description, transaction_date,
                 payment_status, customer_id, approval_status, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
            )
            .run(
              document.type === 'PURCHASE' ? 'CHI' : 'THU',
              totalAmount,
              document.type === 'PURCHASE' ? 'Nhập hàng' : 'Bán hàng',
              description,
              document.date,
              document.paymentStatus,
              document.customerId,
              req.currentUser.id,
            ).lastInsertRowid,
        );

        db.prepare(
          'UPDATE inventory_documents SET transaction_id = ? WHERE id = ?',
        ).run(transactionId, documentId);

        return documentId;
      });

      const documentId = createDocument();

      setFlash(
        req,
        'success',
        `Đã tạo chứng từ kho #${documentId} và phiếu thu chi chờ Quản lý duyệt.`,
      );
      res.redirect('/inventory');
    },
  );

  return router;
};

const readProduct = (body, db) => {
  const sku = readText(body.sku, 'Mã hàng', 80);
  const name = readText(body.name, 'Tên hàng hóa', 160);
  const category = readText(body.category, 'Danh mục', 100);
  const unit = readText(body.unit, 'Đơn vị tính', 30);
  const costPrice = readInteger(body.costPrice, 'Giá vốn', 0);
  const salePrice = readInteger(body.salePrice, 'Giá bán', 1);
  const promotionType =
    body.promotionType === 'percent' || body.promotionType === 'fixed'
      ? body.promotionType
      : null;
  const promotionValue =
    promotionType === null
      ? 0
      : readInteger(body.promotionValue, 'Mức khuyến mại', 0);
  const promotionStartDate = readOptionalDate(body.promotionStartDate);
  const promotionEndDate = readOptionalDate(body.promotionEndDate);

  if (!sku || !name || !category || !unit) {
    throw createHttpError(400, 'Vui lòng nhập đầy đủ thông tin hàng hóa.');
  }

  if (
    !db.prepare('SELECT 1 FROM inventory_categories WHERE name = ?').get(category)
  ) {
    throw createHttpError(400, 'Danh mục được chọn không hợp lệ.');
  }

  if (!db.prepare('SELECT 1 FROM inventory_units WHERE name = ?').get(unit)) {
    throw createHttpError(400, 'Đơn vị tính được chọn không hợp lệ.');
  }

  if (
    promotionType === 'percent' &&
    (promotionValue < 1 || promotionValue > 100)
  ) {
    throw createHttpError(400, 'Khuyến mại phần trăm phải từ 1 đến 100%.');
  }

  if (promotionType === 'fixed' && promotionValue > salePrice) {
    throw createHttpError(400, 'Mức giảm giá không thể lớn hơn giá bán.');
  }

  if (
    promotionStartDate &&
    promotionEndDate &&
    promotionStartDate > promotionEndDate
  ) {
    throw createHttpError(400, 'Ngày bắt đầu khuyến mại không thể sau ngày kết thúc.');
  }

  return {
    category,
    costPrice,
    name,
    promotionEndDate,
    promotionStartDate,
    promotionType,
    promotionValue,
    salePrice,
    sku,
    unit,
  };
};

const readDocument = (body, db) => {
  const type = body.type === 'PURCHASE' || body.type === 'SALE' ? body.type : '';
  const date = typeof body.date === 'string' ? body.date : '';
  let partyName =
    typeof body.partyName === 'string' ? body.partyName.trim().slice(0, 160) : '';
  const paymentStatus =
    typeof body.paymentStatus === 'string' ? body.paymentStatus : '';
  const customerIdText =
    typeof body.customerId === 'string' ? body.customerId.trim() : '';
  const customerId = customerIdText ? Number(customerIdText) : null;
  const productIds = toArray(body.productId);
  const quantities = toArray(body.quantity);
  const unitPrices = toArray(body.unitPrice);

  if (!type) {
    throw createHttpError(400, 'Loại chứng từ kho không hợp lệ.');
  }

  if (!isValidDate(date)) {
    throw createHttpError(400, 'Ngày chứng từ chưa đúng định dạng.');
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

  if (type === 'SALE' && customerId !== null && !partyName) {
    partyName = db
      .prepare('SELECT name FROM customers WHERE id = ?')
      .get(customerId).name;
  }

  if (productIds.length < 1 || productIds.length > 50 ||
      quantities.length !== productIds.length ||
      unitPrices.length !== productIds.length) {
    throw createHttpError(400, 'Chứng từ phải có từ 1 đến 50 dòng hàng hợp lệ.');
  }

  const seenProductIds = new Set();
  const items = productIds.map((idText, index) => {
    const productId = Number(idText);
    const quantity = Number(quantities[index]);
    const unitPriceInput = Number(unitPrices[index]);

    if (
      !Number.isSafeInteger(productId) ||
      productId < 1 ||
      seenProductIds.has(productId)
    ) {
      throw createHttpError(400, 'Mỗi hàng hóa chỉ được xuất hiện một lần trong chứng từ.');
    }

    seenProductIds.add(productId);

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > 1_000_000_000 ||
      !Number.isInteger(quantity * 1000)
    ) {
      throw createHttpError(400, 'Số lượng phải dương và tối đa 3 chữ số thập phân.');
    }

    const product = db
      .prepare(
        `SELECT id, sku, name, unit, cost_price, sale_price,
          promotion_type, promotion_value, promotion_start_date,
          promotion_end_date
         FROM products WHERE id = ? AND is_active = 1`,
      )
      .get(productId);

    if (!product) {
      throw createHttpError(400, 'Không tìm thấy hàng hóa đang hoạt động.');
    }

    if (type === 'PURCHASE') {
      const unitPrice = readInteger(String(unitPriceInput), 'Giá nhập', 0);

      return {
        discountPerUnit: 0,
        product,
        quantity,
        unitCost: unitPrice,
        unitPrice,
      };
    }

    const discountPerUnit = getCurrentSalePrice(product, date).discount;

    return {
      discountPerUnit,
      product,
      quantity,
      unitCost: product.cost_price,
      unitPrice: product.sale_price,
    };
  });

  return {
    customerId: type === 'SALE' ? customerId : null,
    date,
    items,
    partyName,
    paymentStatus,
    type,
  };
};

const validateAvailableStock = (db, document) => {
  if (document.type !== 'SALE') {
    return;
  }

  const pendingSales = db
    .prepare(
      `SELECT i.product_id, SUM(i.quantity) AS quantity
       FROM inventory_document_items i
       JOIN inventory_documents d ON d.id = i.document_id
       WHERE d.document_type = 'SALE' AND d.approval_status = 'PENDING'
       GROUP BY i.product_id`,
    )
    .all();
  const pendingByProductId = new Map(
    pendingSales.map((item) => [item.product_id, item.quantity]),
  );

  for (const item of document.items) {
    const stock = db
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get(item.product.id).stock_quantity;
    const available =
      stock - (pendingByProductId.get(item.product.id) || 0);

    if (available + 0.000001 < item.quantity) {
      throw createHttpError(
        409,
        `Không đủ tồn kho cho ${item.product.name}. Tồn khả dụng: ${formatQuantity(Math.max(0, available))} ${item.product.unit}.`,
      );
    }
  }
};

const getCurrentSalePrice = (product, date) => {
  const isPromotionActive =
    product.promotion_type &&
    (!product.promotion_start_date || date >= product.promotion_start_date) &&
    (!product.promotion_end_date || date <= product.promotion_end_date);

  if (!isPromotionActive) {
    return { discount: 0, price: product.sale_price };
  }

  const discount =
    product.promotion_type === 'percent'
      ? Math.round((product.sale_price * product.promotion_value) / 100)
      : Math.min(product.sale_price, product.promotion_value);

  return {
    discount,
    price: product.sale_price - discount,
  };
};

const readText = (value, label, maxLength) => {
  const text = typeof value === 'string' ? value.trim() : '';

  if (!text || text.length > maxLength) {
    throw createHttpError(400, `${label} là bắt buộc và tối đa ${maxLength} ký tự.`);
  }

  return text;
};

const readInteger = (value, label, minimum) => {
  const text = typeof value === 'string' ? value.trim() : '';
  const number = Number(text);

  if (
    !text ||
    !Number.isSafeInteger(number) ||
    number < minimum ||
    number > MAX_AMOUNT
  ) {
    throw createHttpError(400, `${label} phải là số nguyên hợp lệ.`);
  }

  return number;
};

const readOptionalDate = (value) => {
  if (typeof value !== 'string' || value === '') {
    return null;
  }

  if (!isValidDate(value)) {
    throw createHttpError(400, 'Ngày khuyến mại chưa đúng định dạng.');
  }

  return value;
};

const toArray = (value) => (Array.isArray(value) ? value : [value]);

const formatQuantity = (quantity) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(quantity);

const parseRecordId = (value) => {
  const id = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(id) || id < 1) {
    throw createHttpError(404, 'Không tìm thấy hàng hóa hoặc chứng từ.');
  }

  return id;
};

const createHttpError = (status, message) =>
  Object.assign(new Error(message), { status });

module.exports = createInventoryRouter;
