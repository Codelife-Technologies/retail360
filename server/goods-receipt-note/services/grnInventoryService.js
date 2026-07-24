const Stock = require('../../models/Stock');
const PurchaseOrder = require('../../models/PurchaseOrder');
const PurchaseRequisite = require('../../models/PurchaseRequisite');
const GoodsReceiptNote = require('../../models/GoodsReceiptNote');
const { computeLineItem } = require('../validations/grnValidation');

function isPoFullyReceived(po) {
  if (!po?.items?.length) return false;
  return po.items.every((line) => (line.receivedQuantity || 0) >= line.quantity);
}

async function areAllGrnsCompleteForPo(poId) {
  const grns = await GoodsReceiptNote.find({
    purchaseOrder: poId,
    receiptStatus: { $ne: 'cancelled' },
  }).lean();

  if (grns.length === 0) return false;

  return grns.every((grn) => grn.inventoryUpdated === true);
}

async function tryCloseLinkedPurchaseRequisition(poId) {
  const po = await PurchaseOrder.findById(poId);
  if (!po || !isPoFullyReceived(po)) return null;

  const grnsComplete = await areAllGrnsCompleteForPo(poId);
  if (!grnsComplete) return null;

  const query = {
    status: { $nin: ['closed', 'cancelled'] },
    $or: [{ purchaseOrder: po._id }],
  };
  if (po.purchaseRequisitionNumber) {
    query.$or.push({ prNumber: po.purchaseRequisitionNumber });
  }

  const pr = await PurchaseRequisite.findOne(query);
  if (!pr) return null;

  pr.status = 'closed';
  await pr.save();
  return pr;
}

async function loadStockSnapshot(productId, locationId) {
  const stock = await Stock.findOne({ product: productId, location: locationId }).lean();
  const quantity = stock?.quantity || 0;
  const reserved = stock?.reservedQuantity || 0;
  return {
    stockBefore: quantity,
    reservedStock: reserved,
    availableStock: Math.max(0, quantity - reserved),
    incomingStock: 0,
  };
}

async function enrichItemsWithStock(items, warehouseId) {
  return Promise.all(
    items.map(async (item) => {
      const snap = await loadStockSnapshot(item.product, warehouseId);
      const computed = computeLineItem({ ...item, ...snap });
      return computed;
    })
  );
}

async function applyInventoryUpdate(grn) {
  if (grn.inventoryUpdated) {
    throw new Error('Inventory has already been updated for this GRN');
  }

  for (const item of grn.items) {
    const acceptedQty = item.acceptedQty || 0;
    if (acceptedQty <= 0) continue;

    const before = await Stock.findOne({
      product: item.product,
      location: grn.warehouse,
    }).lean();
    const stockBefore = before?.quantity || 0;

    await Stock.findOneAndUpdate(
      { product: item.product, location: grn.warehouse },
      {
        $inc: { quantity: acceptedQty },
        $set: { lastUpdated: new Date() },
      },
      { upsert: true, new: true }
    );

    item.stockBefore = stockBefore;
    item.stockAfter = stockBefore + acceptedQty;
  }

  grn.inventoryUpdated = true;
  grn.inventoryUpdatedAt = new Date();
  await grn.save();
}

async function updatePurchaseOrderReceipt(grn) {
  const po = await PurchaseOrder.findById(grn.purchaseOrder).populate(
    'items.product',
    'title name sku'
  );
  if (!po) return;

  for (const grnItem of grn.items) {
    const grnProductId = String(grnItem.product?._id || grnItem.product || '');
    const poLine = po.items.find((li) => {
      const lineProductId = String(li.product?._id || li.product || '');
      return lineProductId && lineProductId === grnProductId;
    });
    if (!poLine) continue;
    poLine.receivedQuantity = (poLine.receivedQuantity || 0) + (grnItem.acceptedQty || 0);
    poLine.pendingQuantity = Math.max(0, poLine.quantity - poLine.receivedQuantity);
  }

  // Older POs may lack itemName; backfill so validate doesn't fail on save.
  for (const poLine of po.items) {
    if (String(poLine.itemName || '').trim()) continue;
    const product = poLine.product && typeof poLine.product === 'object' ? poLine.product : null;
    const lineProductId = String(product?._id || poLine.product || '');
    const grnMatch = grn.items.find(
      (gi) => String(gi.product?._id || gi.product || '') === lineProductId
    );
    poLine.itemName = String(
      product?.title
      || product?.name
      || grnMatch?.productName
      || poLine.sku
      || 'Item'
    ).trim();
  }

  const allReceived = po.items.every(
    (li) => (li.receivedQuantity || 0) >= li.quantity
  );
  // PO workflow statuses are only pending / approved — do not change status on receipt.
  if (allReceived && po.status === 'pending') {
    po.status = 'approved';
  }

  await po.save();

  // When the PO is fully received, promote earlier partial GRNs to fully received.
  if (allReceived) {
    await promotePartialGrnsToFullyReceived(po._id);
  }

  await tryCloseLinkedPurchaseRequisition(po._id);
}

/**
 * Once all PO lines are received, mark prior partially_received GRNs for that PO
 * as fully_received so the receipt history reflects a completed order.
 */
async function promotePartialGrnsToFullyReceived(poId) {
  if (!poId) return;

  const partialGrns = await GoodsReceiptNote.find({
    purchaseOrder: poId,
    receiptStatus: 'partially_received',
    inventoryUpdated: true,
  }).select('_id grnNumber receiptStatus');

  if (!partialGrns.length) return;

  await GoodsReceiptNote.updateMany(
    {
      _id: { $in: partialGrns.map((g) => g._id) },
    },
    { $set: { receiptStatus: 'fully_received' } }
  );
}

module.exports = {
  loadStockSnapshot,
  enrichItemsWithStock,
  applyInventoryUpdate,
  updatePurchaseOrderReceipt,
  promotePartialGrnsToFullyReceived,
  tryCloseLinkedPurchaseRequisition,
  isPoFullyReceived,
  areAllGrnsCompleteForPo,
};
