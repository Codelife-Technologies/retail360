const Purchase = require('../models/Purchase');

async function generatePurchaseNumber() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `PUR-${dateStr}-`;

  const lastPurchase = await Purchase.findOne({
    purchaseNumber: { $regex: `^${prefix}` },
  }).sort({ purchaseNumber: -1 });

  let sequence = 1;
  if (lastPurchase) {
    const lastSequence = parseInt(lastPurchase.purchaseNumber.split('-')[2], 10);
    if (!Number.isNaN(lastSequence)) sequence = lastSequence + 1;
  }

  return `${prefix}${String(sequence).padStart(3, '0')}`;
}

module.exports = { generatePurchaseNumber };
