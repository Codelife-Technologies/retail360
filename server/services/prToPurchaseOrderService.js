const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const CompanyProfile = require('../models/CompanyProfile');
const { getDefaultCompanyProfile } = require('../utils/defaultCompanyProfile');
const { resolveLineSupplier } = require('../utils/prSupplierUtils');
const { linkPurchaseOrderProductsToSupplier } = require('../utils/productSuppliers');

const UNASSIGNED_KEY = '__unassigned__';

async function generatePONumber() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `PO-${dateStr}-`;

  const lastPO = await PurchaseOrder.findOne({
    poNumber: { $regex: `^${prefix}` },
  }).sort({ poNumber: -1 });

  let sequence = 1;
  if (lastPO) {
    const parts = lastPO.poNumber.split('-');
    const lastSequence = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(lastSequence)) sequence = lastSequence + 1;
  }

  return `${prefix}${String(sequence).padStart(3, '0')}`;
}

async function loadCompanyDefaults() {
  const profile = await CompanyProfile.findOne({ singletonKey: 'master' }).lean();
  return profile || getDefaultCompanyProfile();
}

function supplierToPartyDetails(supplier) {
  if (!supplier) {
    return {
      companyName: '',
      registeredAddress: '',
      gstin: '',
      pan: '',
      state: '',
      contactPerson: '',
      contactNumber: '',
      email: '',
    };
  }
  return {
    companyName: supplier.name || '',
    registeredAddress: supplier.address || '',
    gstin: supplier.gstin || '',
    pan: supplier.pan || '',
    state: supplier.state || '',
    contactPerson: supplier.contactPerson || '',
    contactNumber: supplier.phone || '',
    email: supplier.email || '',
  };
}

async function mergePrLinesByVendor(prItems = []) {
  const vendorGroups = new Map();

  for (const line of prItems) {
    const productId = (line.product?._id || line.product)?.toString();
    if (!productId) continue;

    let supplierId = line.supplier?._id || line.supplier || null;
    let supplierName = line.supplierName || line.supplier?.name || '';

    if (!supplierId && !supplierName) {
      const resolved = await resolveLineSupplier(productId);
      supplierId = resolved.supplier;
      supplierName = resolved.supplierName;
    }

    const groupKey = supplierId ? String(supplierId) : UNASSIGNED_KEY;
    if (!vendorGroups.has(groupKey)) {
      vendorGroups.set(groupKey, {
        supplierId: supplierId || null,
        supplierName: supplierName || (supplierId ? '' : 'Vendor not assigned'),
        needsVendorAssignment: !supplierId,
        productLines: new Map(),
      });
    }

    const group = vendorGroups.get(groupKey);
    if (supplierName && !group.supplierName) group.supplierName = supplierName;

    const existing = group.productLines.get(productId);
    const qty = Math.max(1, line.requestedQty || 1);
    if (existing) {
      existing.quantity += qty;
    } else {
      group.productLines.set(productId, {
        product: productId,
        quantity: qty,
        unitPrice: line.unitPrice || 0,
        sku: line.sku || '',
      });
    }
  }

  return [...vendorGroups.values()].sort((a, b) => {
    if (a.needsVendorAssignment) return 1;
    if (b.needsVendorAssignment) return -1;
    return (a.supplierName || '').localeCompare(b.supplierName || '');
  });
}

function buildPoItems(productLines) {
  return [...productLines.values()].map((line) => ({
    product: line.product,
    quantity: line.quantity,
    unitPrice: line.unitPrice || 0,
    total: line.quantity * (line.unitPrice || 0),
    discountPercent: 0,
    unitOfMeasure: 'PCS',
    sku: line.sku || '',
    receivedQuantity: 0,
    pendingQuantity: line.quantity,
  }));
}

function computePoTotals(items, extras = {}) {
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const freight = extras.freightCharges || 0;
  const packing = extras.packingCharges || 0;
  const tax = extras.tax || 0;
  const total = subtotal + tax + freight + packing;
  return {
    subtotal,
    discountTotal: 0,
    taxableValue: subtotal,
    tax,
    cgst: extras.cgst || 0,
    sgst: extras.sgst || 0,
    igst: extras.igst || 0,
    freightCharges: freight,
    packingCharges: packing,
    roundOff: 0,
    total,
  };
}

/**
 * Create vendor-wise purchase orders from an approved purchase requisition.
 * @returns {Promise<{ purchaseOrders: object[], poNumbers: string[] }>}
 */
async function createPurchaseOrdersFromPr(pr) {
  const company = await loadCompanyDefaults();
  const locations = [...new Set((pr.items || []).map((i) => i.locationName).filter(Boolean))];
  const vendorGroups = await mergePrLinesByVendor(pr.items || []);

  if (vendorGroups.length === 0) {
    throw new Error('No valid line items to create purchase orders');
  }

  const created = [];
  let applyCharges = true;

  for (const group of vendorGroups) {
    const items = buildPoItems(group.productLines);
    const totals = computePoTotals(items, {
      freightCharges: applyCharges ? 0 : 0,
      packingCharges: applyCharges ? 0 : 0,
    });
    applyCharges = false;

    let supplierDoc = null;
    if (group.supplierId) {
      supplierDoc = await Supplier.findById(group.supplierId).lean();
    }

    const poPayload = {
      poNumber: await generatePONumber(),
      supplier: group.supplierId || undefined,
      needsVendorAssignment: group.needsVendorAssignment,
      purchaseRequisite: pr._id,
      orderDate: new Date(),
      status: group.needsVendorAssignment ? 'draft' : 'pending',
      purchaseRequisitionNumber: pr.prNumber,
      deliveryLocation: locations.join(', '),
      notes: pr.notes || `Generated from Purchase Requisition ${pr.prNumber}`,
      currency: 'INR',
      buyer: company.buyer || {},
      billingAddress: company.billingAddress || {},
      shippingAddress: company.shippingAddress || {},
      jurisdiction: company.jurisdiction || '',
      termsAndConditions: company.termsAndConditions || [],
      advancePercent: supplierDoc?.advancePercent ?? company.advancePercent ?? 0,
      creditDays: supplierDoc?.creditDays ?? company.creditDays ?? 0,
      deliveryMode: supplierDoc?.deliveryMode || company.deliveryMode || '',
      incoterms: supplierDoc?.incoterms || company.incoterms || '',
      supplierDetails: supplierToPartyDetails(supplierDoc),
      items,
      ...totals,
    };

    const po = new PurchaseOrder(poPayload);
    await po.save();
    if (group.supplierId) {
      await linkPurchaseOrderProductsToSupplier(po).catch(() => {});
    }

    const populated = await PurchaseOrder.findById(po._id)
      .populate('supplier', 'name contactPerson email phone address gstin pan state')
      .populate('items.product', 'name title sku hsnCode unit');

    created.push({
      ...populated.toObject(),
      supplierName: group.supplierName,
      needsVendorAssignment: group.needsVendorAssignment,
    });
  }

  return {
    purchaseOrders: created,
    poNumbers: created.map((po) => po.poNumber),
  };
}

function applySupplierTermsToPoDoc(poDoc, supplier) {
  poDoc.supplier = supplier._id;
  poDoc.needsVendorAssignment = false;
  poDoc.status = poDoc.status === 'draft' ? 'pending' : poDoc.status;
  poDoc.supplierDetails = supplierToPartyDetails(supplier);
  poDoc.advancePercent = supplier.advancePercent ?? poDoc.advancePercent ?? 0;
  poDoc.creditDays = supplier.creditDays ?? poDoc.creditDays ?? 0;
  poDoc.deliveryMode = supplier.deliveryMode || poDoc.deliveryMode || '';
  poDoc.incoterms = supplier.incoterms || poDoc.incoterms || '';
}

async function recalculatePoTotals(po) {
  const items = buildPoItems(
    new Map(
      (po.items || []).map((item) => {
        const productId = String(item.product?._id || item.product);
        return [
          productId,
          {
            product: productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice || 0,
            sku: item.sku || '',
          },
        ];
      })
    )
  );
  po.items = items;
  const totals = computePoTotals(items);
  Object.assign(po, totals);
}

function mergeItemsIntoPoDoc(poDoc, incomingItems) {
  const productLines = new Map();

  const addItem = (item) => {
    const productId = String(item.product?._id || item.product);
    if (!productId) return;
    const qty = item.quantity || 0;
    if (productLines.has(productId)) {
      productLines.get(productId).quantity += qty;
    } else {
      productLines.set(productId, {
        product: productId,
        quantity: qty,
        unitPrice: item.unitPrice || 0,
        sku: item.sku || '',
      });
    }
  };

  (poDoc.items || []).forEach(addItem);
  incomingItems.forEach(addItem);
  poDoc.items = buildPoItems(productLines);
}

async function populateAssignedPo(poId, supplierName) {
  const populated = await PurchaseOrder.findById(poId)
    .populate('supplier', 'name contactPerson email phone address gstin pan state')
    .populate('items.product', 'name title sku hsnCode unit');

  return {
    ...populated.toObject(),
    supplierName: supplierName || populated.supplier?.name || '',
    needsVendorAssignment: false,
  };
}

async function findExistingVendorPoForPr(purchaseRequisiteId, vendorId, excludePoId) {
  if (!purchaseRequisiteId || !vendorId) return null;

  return PurchaseOrder.findOne({
    purchaseRequisite: purchaseRequisiteId,
    supplier: vendorId,
    needsVendorAssignment: { $ne: true },
    _id: { $ne: excludePoId },
    status: { $nin: ['cancelled', 'closed'] },
  });
}

async function syncPurchaseRequisitePoLinks(purchaseRequisiteId) {
  if (!purchaseRequisiteId) return;

  const PurchaseRequisite = require('../models/PurchaseRequisite');
  const linkedPos = await PurchaseOrder.find({ purchaseRequisite: purchaseRequisiteId })
    .select('_id poNumber')
    .sort({ createdAt: 1 });

  await PurchaseRequisite.findByIdAndUpdate(purchaseRequisiteId, {
    purchaseOrders: linkedPos.map((p) => p._id),
    purchaseOrder: linkedPos[0]?._id || null,
    purchaseOrderNumber: linkedPos.map((p) => p.poNumber).join(', '),
  });
}

/**
 * Assign vendor(s) to a PO pending vendor assignment.
 * Supports single vendor for all items or per-product assignments (may split into multiple POs).
 */
async function assignVendorsToPurchaseOrder(poId, { supplierId, assignments } = {}) {
  const po = await PurchaseOrder.findById(poId);
  if (!po) {
    throw new Error('Purchase order not found');
  }
  if (!po.needsVendorAssignment) {
    throw new Error('This purchase order already has vendors assigned');
  }
  if (!po.items?.length) {
    throw new Error('Purchase order has no items');
  }

  const productToSupplier = new Map();

  if (Array.isArray(assignments) && assignments.length > 0) {
    for (const row of assignments) {
      const productId = String(row.productId || row.product);
      const vendorId = String(row.supplierId || row.supplier);
      if (!productId || !vendorId) {
        throw new Error('Each assignment requires productId and supplierId');
      }
      productToSupplier.set(productId, vendorId);
    }
  } else if (supplierId) {
    for (const item of po.items) {
      const productId = String(item.product?._id || item.product);
      productToSupplier.set(productId, String(supplierId));
    }
  } else {
    throw new Error('supplierId or assignments array is required');
  }

  for (const item of po.items) {
    const productId = String(item.product?._id || item.product);
    if (!productToSupplier.has(productId)) {
      throw new Error('Every product must have a vendor assigned');
    }
  }

  const vendorGroups = new Map();
  for (const item of po.items) {
    const productId = String(item.product?._id || item.product);
    const vendorId = productToSupplier.get(productId);
    if (!vendorGroups.has(vendorId)) {
      vendorGroups.set(vendorId, []);
    }
    vendorGroups.get(vendorId).push(item.toObject?.() || { ...item });
  }

  const supplierCache = new Map();
  const getSupplier = async (id) => {
    if (!supplierCache.has(id)) {
      const supplier = await Supplier.findById(id);
      if (!supplier) throw new Error(`Supplier not found: ${id}`);
      supplierCache.set(id, supplier);
    }
    return supplierCache.get(id);
  };

  const resultPos = [];
  const resultPoIds = new Set();
  let convertedSourcePo = false;

  for (const [vendorId, groupItems] of vendorGroups.entries()) {
    const supplier = await getSupplier(vendorId);
    const existingPo = await findExistingVendorPoForPr(
      po.purchaseRequisite,
      vendorId,
      po._id
    );

    if (existingPo) {
      mergeItemsIntoPoDoc(existingPo, groupItems);
      await recalculatePoTotals(existingPo);
      await existingPo.save();
      await linkPurchaseOrderProductsToSupplier(existingPo).catch(() => {});

      if (!resultPoIds.has(String(existingPo._id))) {
        resultPos.push(await populateAssignedPo(existingPo._id, supplier.name));
        resultPoIds.add(String(existingPo._id));
      }
      continue;
    }

    if (!convertedSourcePo) {
      convertedSourcePo = true;
      po.items = groupItems;
      await recalculatePoTotals(po);
      applySupplierTermsToPoDoc(po, supplier);
      await po.save();
      await linkPurchaseOrderProductsToSupplier(po).catch(() => {});
      resultPos.push(await populateAssignedPo(po._id, supplier.name));
      resultPoIds.add(String(po._id));
      continue;
    }

    const base = po.toObject();
    delete base._id;
    delete base.__v;
    delete base.createdAt;
    delete base.updatedAt;

    const newPo = new PurchaseOrder({
      ...base,
      poNumber: await generatePONumber(),
      items: groupItems,
      needsVendorAssignment: false,
    });
    await recalculatePoTotals(newPo);
    applySupplierTermsToPoDoc(newPo, supplier);
    await newPo.save();
    await linkPurchaseOrderProductsToSupplier(newPo).catch(() => {});
    resultPos.push(await populateAssignedPo(newPo._id, supplier.name));
    resultPoIds.add(String(newPo._id));
  }

  if (!convertedSourcePo) {
    await PurchaseOrder.findByIdAndDelete(po._id);
  }

  await syncPurchaseRequisitePoLinks(po.purchaseRequisite);

  return resultPos;
}

module.exports = {
  createPurchaseOrdersFromPr,
  mergePrLinesByVendor,
  assignVendorsToPurchaseOrder,
  generatePONumber,
};
