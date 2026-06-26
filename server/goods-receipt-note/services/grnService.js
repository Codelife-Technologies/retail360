const GoodsReceiptNote = require('../../models/GoodsReceiptNote');
const GoodsInspectionSheet = require('../../models/GoodsInspectionSheet');
const PurchaseOrder = require('../../models/PurchaseOrder');
const PurchaseRequisite = require('../../models/PurchaseRequisite');
const Supplier = require('../../models/Supplier');
const Location = require('../../models/Location');
const Product = require('../../models/Product');
const {
  computeFinancialSummary,
  deriveReceiptStatus,
  validateGrnPayload,
  isPoEligibleForGrn,
} = require('../validations/grnValidation');
const { enrichItemsWithStock, applyInventoryUpdate, updatePurchaseOrderReceipt } = require('./grnInventoryService');
const { createPurchaseFromGrn } = require('../../services/purchaseFromGrnService');
const { runThreeWayMatch, loadPoTotalForMatch } = require('./grnThreeWayMatchService');
const { logGrnAudit } = require('./grnAuditService');

const POPULATE = [
  { path: 'warehouse', select: 'name code city address' },
  { path: 'supplier', select: 'name supplierCode supplierId gstin pan address phone email contactPerson' },
  { path: 'purchaseOrder', select: 'poNumber status total purchaseRequisitionNumber costCenter items' },
  { path: 'purchaseRequisite', select: 'prNumber status' },
  { path: 'goodsInspectionSheet', select: 'gisNumber status overallResult' },
  { path: 'items.product', select: 'name title sku hsnCode images category' },
];

async function generateGrnNumber() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `GRN-${dateStr}-`;
  const last = await GoodsReceiptNote.findOne({ grnNumber: { $regex: `^${prefix}` } })
    .sort({ grnNumber: -1 })
    .lean();
  let seq = 1;
  if (last) {
    const parts = last.grnNumber.split('-');
    const n = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

async function generateGisNumber() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `GIS-${dateStr}-`;
  const last = await GoodsInspectionSheet.findOne({ gisNumber: { $regex: `^${prefix}` } })
    .sort({ gisNumber: -1 })
    .lean();
  let seq = 1;
  if (last?.gisNumber) {
    const n = parseInt(last.gisNumber.split('-').pop(), 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

function formatGrnTime(date = new Date()) {
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

async function buildSupplierDetails(supplierId) {
  const s = await Supplier.findById(supplierId).lean();
  if (!s) return {};
  return {
    name: s.name,
    supplierCode: s.supplierCode || '',
    gstin: s.gstin || '',
    pan: s.pan || '',
    address: s.address || '',
    contactPerson: s.contactPerson || '',
    phone: s.phone || '',
    email: s.email || '',
    vendorRating: s.vendorRating,
  };
}

async function buildItemsFromPO(po, warehouseId) {
  const items = [];
  for (const line of po.items || []) {
    const productId = line.product?._id || line.product;
    const product = await Product.findById(productId)
      .populate('category', 'name')
      .lean();
    if (!product) continue;

    const orderedQty = line.quantity || 0;
    const alreadyReceived = line.receivedQuantity || 0;
    const pendingFromPo = Math.max(0, orderedQty - alreadyReceived);

    items.push({
      product: productId,
      sku: line.sku || product.sku || '',
      productName: product.title || product.name || '',
      category: product.category?.name || '',
      hsnCode: line.hsnCode || product.hsnCode || '',
      unitOfMeasure: line.unitOfMeasure || 'PCS',
      orderedQty: pendingFromPo || orderedQty,
      receivedQty: pendingFromPo || orderedQty,
      acceptedQty: pendingFromPo || orderedQty,
      rejectedQty: 0,
      pendingQty: 0,
      unitCost: line.unitPrice || 0,
      taxPercent: line.taxRate || 0,
      inspectionStatus: 'pending',
    });
  }
  return enrichItemsWithStock(items, warehouseId);
}

async function createGrnFromPO(poId, body = {}) {
  const po = await PurchaseOrder.findById(poId)
    .populate('items.product', 'name title sku hsnCode category')
    .populate('supplier');
  if (!po) throw new Error('Purchase Order not found');
  if (!isPoEligibleForGrn(po)) {
    throw new Error(
      'GRN can only be created for POs with pending items (not closed, cancelled, or fully received)'
    );
  }

  const warehouseId = body.warehouse || po.shippingAddress?.warehouseId;
  const location = warehouseId
    ? await Location.findById(warehouseId)
    : await Location.findOne({ isActive: true }).sort({ name: 1 });
  if (!location) throw new Error('Warehouse/location is required');

  let pr = null;
  if (po.purchaseRequisitionNumber) {
    pr = await PurchaseRequisite.findOne({ prNumber: po.purchaseRequisitionNumber });
  }

  const items = body.items?.length
    ? await enrichItemsWithStock(body.items, location._id)
    : await buildItemsFromPO(po, location._id);

  const supplierId = body.supplier || po.supplier?._id || po.supplier;
  const supplierDetails = body.supplierDetails || (await buildSupplierDetails(supplierId));

  const draft = {
    ...body,
    grnNumber: await generateGrnNumber(),
    grnDate: body.grnDate || new Date(),
    grnTime: formatGrnTime(),
    receiptStatus: 'draft',
    warehouse: location._id,
    locationCode: location.code || '',
    supplier: supplierId,
    supplierDetails,
    purchaseOrder: po._id,
    purchaseOrderNumber: po.poNumber,
    purchaseRequisitionNumber: po.purchaseRequisitionNumber || pr?.prNumber || '',
    purchaseRequisite: pr?._id,
    costCenter: body.costCenter || po.costCenter || '',
    items,
    currency: po.currency || 'INR',
    freightCharges: body.freightCharges ?? po.freightCharges ?? 0,
    packingCharges: body.packingCharges ?? po.packingCharges ?? 0,
  };

  const errors = validateGrnPayload(draft);
  if (errors.length) throw new Error(errors.join('; '));

  const financials = computeFinancialSummary(draft);
  Object.assign(draft, financials);
  draft.receiptStatus = deriveReceiptStatus(draft.items);

  const poTotal = await loadPoTotalForMatch(po._id);
  draft.threeWayMatch = runThreeWayMatch({ ...draft, threeWayMatch: { poTotal } });

  const grn = await GoodsReceiptNote.create(draft);
  await logGrnAudit({
    grnId: grn._id,
    grnNumber: grn.grnNumber,
    action: 'created',
    performedBy: body.createdByName || 'System',
    newStatus: grn.receiptStatus,
  });

  return GoodsReceiptNote.findById(grn._id).populate(POPULATE);
}

async function updateGrn(id, body, performedBy = 'System') {
  const grn = await GoodsReceiptNote.findById(id);
  if (!grn) throw new Error('GRN not found');
  if (grn.inventoryUpdated || ['closed', 'cancelled'].includes(grn.receiptStatus)) {
    throw new Error('Cannot edit GRN after receipt is finalized');
  }

  const prevStatus = grn.receiptStatus;
  const allowed = [
    'grnDate', 'receivingOfficer', 'deliveryInfo', 'followUp', 'notes',
    'allowExcessReceipt', 'freightCharges', 'packingCharges', 'otherCharges',
    'contractNumber', 'projectCode', 'costCenter', 'items', 'receiptStatus',
  ];
  allowed.forEach((key) => {
    if (body[key] !== undefined) grn[key] = body[key];
  });

  if (body.items) {
    grn.items = await enrichItemsWithStock(body.items, grn.warehouse);
  }

  const errors = validateGrnPayload(grn.toObject(), { isUpdate: true });
  if (errors.length) throw new Error(errors.join('; '));

  const financials = computeFinancialSummary(grn.toObject());
  grn.items = financials.items;
  grn.subtotal = financials.subtotal;
  grn.discountTotal = financials.discountTotal;
  grn.taxableValue = financials.taxableValue;
  grn.cgst = financials.cgst;
  grn.sgst = financials.sgst;
  grn.taxTotal = financials.taxTotal;
  grn.roundOff = financials.roundOff;
  grn.grandTotal = financials.grandTotal;

  if (!body.receiptStatus) {
    grn.receiptStatus = deriveReceiptStatus(grn.items);
  }

  const poTotal = await loadPoTotalForMatch(grn.purchaseOrder);
  grn.threeWayMatch = runThreeWayMatch({ ...grn.toObject(), threeWayMatch: { poTotal } });

  await grn.save();
  await logGrnAudit({
    grnId: grn._id,
    grnNumber: grn.grnNumber,
    action: 'updated',
    performedBy,
    previousStatus: prevStatus,
    newStatus: grn.receiptStatus,
  });

  return GoodsReceiptNote.findById(id).populate(POPULATE);
}

async function submitForInspection(id, performedBy) {
  const grn = await GoodsReceiptNote.findById(id);
  if (!grn) throw new Error('GRN not found');
  if (grn.inventoryUpdated) throw new Error('GRN receipt already finalized');
  if (['closed', 'cancelled'].includes(grn.receiptStatus)) {
    throw new Error(`Cannot finalize GRN in ${grn.receiptStatus} status`);
  }

  const errors = validateGrnPayload(grn.toObject(), { isUpdate: true });
  if (errors.length) throw new Error(errors.join('; '));

  let gis = grn.goodsInspectionSheet
    ? await GoodsInspectionSheet.findById(grn.goodsInspectionSheet)
    : null;

  if (!gis) {
    gis = await GoodsInspectionSheet.create({
      gisNumber: await generateGisNumber(),
      purchaseOrder: grn.purchaseOrder,
      purchaseRequisitionNumber: grn.purchaseRequisitionNumber,
      supplier: grn.supplier,
      warehouse: grn.warehouse,
      status: 'pass',
      items: grn.items.map((i) => ({
        product: i.product,
        sku: i.sku,
        productName: i.productName,
        orderedQty: i.orderedQty,
        inspectedQty: i.receivedQty,
        acceptedQty: i.acceptedQty,
        rejectedQty: i.rejectedQty,
        inspectionStatus: i.inspectionStatus || 'pass',
        defects: i.defects,
        correctiveAction: i.correctiveAction,
        replacementRequired: i.replacementRequired,
      })),
      goodsReceiptNote: grn._id,
    });
    grn.goodsInspectionSheet = gis._id;
    grn.gisNumber = gis.gisNumber;
  }

  grn.receiptStatus = deriveReceiptStatus(grn.items);
  await grn.save();

  await applyInventoryUpdate(grn);
  await updatePurchaseOrderReceipt(grn);
  await createPurchaseFromGrn(grn);

  await logGrnAudit({
    grnId: grn._id,
    grnNumber: grn.grnNumber,
    action: 'finalized',
    performedBy,
    newStatus: grn.receiptStatus,
  });

  await logGrnAudit({
    grnId: grn._id,
    grnNumber: grn.grnNumber,
    action: 'inventory_updated',
    performedBy,
    newStatus: grn.receiptStatus,
  });

  return GoodsReceiptNote.findById(id).populate(POPULATE);
}

async function getUpcomingPos() {
  const pos = await PurchaseOrder.find()
    .populate('supplier', 'name supplierCode')
    .sort({ createdAt: -1 })
    .lean();

  const activeGrns = await GoodsReceiptNote.find(
    { receiptStatus: { $ne: 'cancelled' } },
    'purchaseOrder'
  ).lean();

  const poIdsWithGrn = new Set(
    activeGrns
      .map((g) => (g.purchaseOrder?._id || g.purchaseOrder)?.toString())
      .filter(Boolean)
  );

  return pos
    .filter((po) => isPoEligibleForGrn(po) && !poIdsWithGrn.has(po._id.toString()))
    .map((po) => ({
      _id: po._id,
      poNumber: po.poNumber,
      purchaseRequisitionNumber: po.purchaseRequisitionNumber || '',
      supplierName: po.supplier?.name || po.supplierDetails?.companyName || '',
      orderDate: po.orderDate,
      expectedDeliveryDate: po.expectedDeliveryDate,
      total: po.total,
      poStatus: po.status,
      itemCount: (po.items || []).length,
      warehouseCode: po.shippingAddress?.warehouseCode || po.costCenter || '',
    }));
}

async function getDashboardStats() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const all = await GoodsReceiptNote.find().lean();
  const monthGrns = all.filter((g) => new Date(g.grnDate) >= monthStart);
  const upcomingPos = await getUpcomingPos();

  return {
    totalGrns: all.length,
    pendingReceipt: all.filter((g) => !g.inventoryUpdated && g.receiptStatus === 'draft').length,
    completedReceipts: all.filter((g) => g.inventoryUpdated).length,
    partiallyReceived: all.filter((g) => g.receiptStatus === 'partially_received').length,
    fullyReceived: all.filter((g) => g.receiptStatus === 'fully_received').length,
    rejectedReceipts: all.filter((g) => g.receiptStatus === 'cancelled').length,
    upcomingPoCount: upcomingPos.length,
    upcomingPos,
    inventoryValueReceived: all
      .filter((g) => g.inventoryUpdated)
      .reduce((s, g) => s + (g.grandTotal || 0), 0),
    monthlyReceivedValue: monthGrns.reduce((s, g) => s + (g.grandTotal || 0), 0),
    monthlyTrend: buildMonthlyTrend(all),
    supplierWise: buildGroupSum(all, 'supplierDetails.name'),
    warehouseWise: buildGroupSum(all, 'locationCode'),
    categoryWise: buildCategorySum(all),
  };
}

function buildMonthlyTrend(grns) {
  const map = {};
  grns.forEach((g) => {
    const d = new Date(g.grnDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!map[key]) map[key] = { month: key, count: 0, value: 0 };
    map[key].count += 1;
    map[key].value += g.grandTotal || 0;
  });
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
}

function buildGroupSum(grns, field) {
  const map = {};
  grns.forEach((g) => {
    const key = field.split('.').reduce((o, k) => o?.[k], g) || 'Unknown';
    map[key] = (map[key] || 0) + 1;
  });
  return Object.entries(map).map(([name, count]) => ({ name, count }));
}

function buildCategorySum(grns) {
  const map = {};
  grns.forEach((g) => {
    (g.items || []).forEach((i) => {
      const cat = i.category || 'Uncategorized';
      map[cat] = (map[cat] || 0) + (i.acceptedQty || 0);
    });
  });
  return Object.entries(map).map(([name, qty]) => ({ name, qty }));
}

module.exports = {
  POPULATE,
  generateGrnNumber,
  createGrnFromPO,
  updateGrn,
  submitForInspection,
  getDashboardStats,
  getUpcomingPos,
  computeFinancialSummary,
};
