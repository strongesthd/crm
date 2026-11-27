const applyInventoryDocumentApproval = (db, transactionId, userId) => {
  const document = db
    .prepare(
      `SELECT id, document_type
       FROM inventory_documents
       WHERE transaction_id = ? AND approval_status = 'PENDING'`,
    )
    .get(transactionId);

  if (!document) {
    return false;
  }

  const items = db
    .prepare(
      `SELECT id, product_id, quantity, unit_price
       FROM inventory_document_items
       WHERE document_id = ?`,
    )
    .all(document.id);

  if (document.document_type === 'SALE') {
    const productsById = new Map(
      items.map((item) => {
        const product = db
          .prepare('SELECT stock_quantity, cost_price FROM products WHERE id = ?')
          .get(item.product_id);

        return [item.product_id, product];
      }),
    );
    const insufficientStock = items.find((item) => {
      const product = productsById.get(item.product_id);

      return !product || product.stock_quantity + 0.000001 < item.quantity;
    });

    if (insufficientStock) {
      throw createHttpError(
        409,
        'Không đủ tồn kho để duyệt đơn hàng. Hãy kiểm tra số lượng tồn trước khi duyệt.',
      );
    }

    const decreaseStock = db.prepare(
      `UPDATE products
       SET stock_quantity = ROUND(stock_quantity - ?, 3),
         updated_at = datetime('now')
       WHERE id = ?`,
    );
    const snapshotCost = db.prepare(
      'UPDATE inventory_document_items SET unit_cost = ? WHERE id = ?',
    );

    for (const item of items) {
      const product = productsById.get(item.product_id);

      decreaseStock.run(item.quantity, item.product_id);
      snapshotCost.run(product.cost_price, item.id);
    }
  } else {
    const increaseStock = db.prepare(
      `UPDATE products
       SET cost_price = CASE
           WHEN stock_quantity + ? = 0 THEN cost_price
           ELSE CAST(ROUND(
             (stock_quantity * cost_price + ? * ?) / (stock_quantity + ?)
           ) AS INTEGER)
         END,
         stock_quantity = ROUND(stock_quantity + ?, 3),
         updated_at = datetime('now')
       WHERE id = ?`,
    );

    for (const item of items) {
      increaseStock.run(
        item.quantity,
        item.quantity,
        item.unit_price,
        item.quantity,
        item.quantity,
        item.product_id,
      );
    }
  }

  db.prepare(
    `UPDATE inventory_documents
     SET approval_status = 'APPROVED', reviewed_by = ?, rejection_reason = ''
     WHERE id = ?`,
  ).run(userId, document.id);

  return true;
};

const rejectInventoryDocument = (db, transactionId, userId, reason) => {
  db.prepare(
    `UPDATE inventory_documents
     SET approval_status = 'REJECTED', reviewed_by = ?, rejection_reason = ?
     WHERE transaction_id = ? AND approval_status = 'PENDING'`,
  ).run(userId, reason, transactionId);
};

const isInventoryTransaction = (db, transactionId) =>
  Boolean(
    db
      .prepare('SELECT 1 FROM inventory_documents WHERE transaction_id = ?')
      .get(transactionId),
  );

const createHttpError = (status, message) =>
  Object.assign(new Error(message), { status });

module.exports = {
  applyInventoryDocumentApproval,
  isInventoryTransaction,
  rejectInventoryDocument,
};
