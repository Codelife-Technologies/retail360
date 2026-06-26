/**
 * Stock levels are maintained separately (uploads / purchases / GRN).
 * On-hand inventory already reflects completed sales — sales records are
 * for reporting only and must not change stock quantities.
 */
async function restoreSaleStockItems() {
  /* no-op */
}

async function deductSaleStockItems() {
  /* no-op */
}

module.exports = {
  restoreSaleStockItems,
  deductSaleStockItems,
};
