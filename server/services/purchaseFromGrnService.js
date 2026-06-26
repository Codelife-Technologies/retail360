const Purchase = require('../models/Purchase');
const Price = require('../models/Price');
const { generatePurchaseNumber } = require('../utils/generatePurchaseNumber');

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

/**
 * Creates a Purchase record when a GRN receipt is finalized and inventory is updated.
 * Stock is not updated again — GRN already applied accepted quantities.
 */
async function createPurchaseFromGrn(grn) {
  if (!grn?.inventoryUpdated) return null;

  const grnId = grn._id;
  const existing = await Purchase.findOne({ goodsReceiptNote: grnId });
  if (existing) return existing;

  const items = (grn.items || [])
    .filter((line) => (line.acceptedQty || 0) > 0)
    .map((line) => ({
      product: line.product?._id || line.product,
      quantity: line.acceptedQty,
      unitPrice: line.unitCost || 0,
      total: (line.acceptedQty || 0) * (line.unitCost || 0),
    }));

  if (items.length === 0) return null;

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const tax = grn.taxTotal || 0;

  const purchase = new Purchase({
    purchaseNumber: await generatePurchaseNumber(),
    purchaseOrder: grn.purchaseOrder?._id || grn.purchaseOrder,
    goodsReceiptNote: grnId,
    supplier: grn.supplier?._id || grn.supplier,
    location: grn.warehouse?._id || grn.warehouse,
    purchaseDate: grn.grnDate || new Date(),
    items,
    subtotal,
    tax,
    defaultTaxRate: 0,
    total: subtotal + tax,
    paymentStatus: 'pending',
    notes: `Auto-created from GRN ${grn.grnNumber}${grn.purchaseOrderNumber ? ` (PO ${grn.purchaseOrderNumber})` : ''}`,
  });

  await purchase.save();
  await updatePricesFromPurchase(purchase);

  return purchase;
}

module.exports = { createPurchaseFromGrn };
