const Purchase = require('../models/Purchase');
const Price = require('../models/Price');
const GoodsReceiptNote = require('../models/GoodsReceiptNote');
const { generatePurchaseNumber } = require('../utils/generatePurchaseNumber');
const { normalizePaymentStatus } = require('../utils/paymentStatusSync');
const PurchaseOrder = require('../models/PurchaseOrder');

async function updatePricesFromPurchase(purchase) {
  for (const item of purchase.items) {
    try {
      const existingPrice = await Price.findOne({
        product: item.product,
        isActive: true,
      });

      if (existingPrice && existingPrice.purchasePrice !== item.unitPrice) {
        await Price.updateMany(
          { product: item.product, isActive: true },
          { isActive: false }
        );

        await Price.create({
          product: item.product,
          purchasePrice: item.unitPrice,
          salesPrice: existingPrice.salesPrice,
          currency: 'INR',
          effectiveDate: new Date(),
          isActive: true,
          notes: `Purchase price updated from purchase ${purchase.purchaseNumber}`,
        });
      }
    } catch (error) {
      console.error(`Error updating price for product ${item.product}:`, error);
    }
  }
}

function buildPurchaseItemsFromGrn(grn) {
  return (grn.items || [])
    .filter((line) => (Number(line.acceptedQty) || 0) > 0)
    .map((line) => {
      const quantity = Number(line.acceptedQty) || 0;
      const unitPrice = Number(line.unitCost) || 0;
      return {
        product: line.product?._id || line.product,
        quantity,
        unitPrice,
        total: Math.round(quantity * unitPrice * 100) / 100,
      };
    })
    .filter((line) => line.product && line.quantity > 0);
}

/**
 * Creates a Purchase record when a GRN receipt is finalized and inventory is updated.
 * Stock is not updated again — GRN already applied accepted quantities.
 * Idempotent: returns the existing purchase if one already exists for this GRN.
 */
async function createPurchaseFromGrn(grnInput) {
  if (!grnInput) return null;

  const grnId = grnInput._id || grnInput;
  const grn =
    grnInput.items && grnInput.supplier
      ? grnInput
      : await GoodsReceiptNote.findById(grnId);

  if (!grn) return null;
  if (!grn.inventoryUpdated) return null;

  const existing = await Purchase.findOne({ goodsReceiptNote: grn._id });
  if (existing) return existing;

  const items = buildPurchaseItemsFromGrn(grn);
  if (items.length === 0) return null;

  if (!grn.supplier) {
    throw new Error(`Cannot create purchase from GRN ${grn.grnNumber || grn._id}: supplier is missing`);
  }
  if (!grn.warehouse) {
    throw new Error(`Cannot create purchase from GRN ${grn.grnNumber || grn._id}: warehouse/location is missing`);
  }

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const tax = Number(grn.taxTotal) || 0;

  const poId = grn.purchaseOrder?._id || grn.purchaseOrder || undefined;
  let paymentStatus = normalizePaymentStatus(grn.paymentStatus);
  if (poId) {
    const po = await PurchaseOrder.findById(poId).select('paymentStatus').lean();
    if (po?.paymentStatus) {
      paymentStatus = normalizePaymentStatus(po.paymentStatus);
    }
  }

  const purchase = new Purchase({
    purchaseNumber: await generatePurchaseNumber(),
    purchaseOrder: poId,
    goodsReceiptNote: grn._id,
    supplier: grn.supplier?._id || grn.supplier,
    location: grn.warehouse?._id || grn.warehouse,
    purchaseDate: grn.grnDate || grn.inventoryUpdatedAt || new Date(),
    items,
    subtotal,
    tax,
    defaultTaxRate: 0,
    total: subtotal + tax,
    paymentStatus,
    notes: `Auto-created from GRN ${grn.grnNumber || grn._id}${
      grn.purchaseOrderNumber ? ` (PO ${grn.purchaseOrderNumber})` : ''
    }`,
  });

  try {
    await purchase.save();
  } catch (error) {
    // Concurrent finalize — another request may have created the purchase first.
    if (error?.code === 11000) {
      const raced = await Purchase.findOne({ goodsReceiptNote: grn._id });
      if (raced) return raced;
    }
    throw error;
  }

  await updatePricesFromPurchase(purchase);
  return purchase;
}

/**
 * Backfill Purchase rows for finalized GRNs that never got a purchase record
 * (e.g. older finalize flow, or purchase create failed after inventory update).
 */
async function backfillPurchasesFromFinalizedGrns({ limit = 200 } = {}) {
  const existingGrnIds = await Purchase.distinct('goodsReceiptNote', {
    goodsReceiptNote: { $ne: null },
  });
  const existingSet = new Set(existingGrnIds.map((id) => String(id)));

  const finalized = await GoodsReceiptNote.find({ inventoryUpdated: true })
    .sort({ inventoryUpdatedAt: -1, updatedAt: -1 })
    .limit(limit);

  let created = 0;
  let skipped = 0;
  const errors = [];

  for (const grn of finalized) {
    if (existingSet.has(String(grn._id))) {
      skipped += 1;
      continue;
    }
    try {
      const purchase = await createPurchaseFromGrn(grn);
      if (purchase) {
        created += 1;
        existingSet.add(String(grn._id));
      } else {
        skipped += 1;
      }
    } catch (error) {
      errors.push({
        grnId: String(grn._id),
        grnNumber: grn.grnNumber,
        error: error.message,
      });
    }
  }

  return { created, skipped, errors, scanned: finalized.length };
}

module.exports = {
  createPurchaseFromGrn,
  backfillPurchasesFromFinalizedGrns,
};
