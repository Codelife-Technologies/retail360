import { DEFAULT_BUYER, DEFAULT_PO_TERMS } from '../config/buyerCompany';
import { companyProfileToPoDefaults } from './companyProfileUtils';

/** Empty nested object helpers for PO form */
const emptyParty = () => ({
  companyName: '',
  registeredAddress: '',
  gstin: '',
  pan: '',
  state: '',
  contactPerson: '',
  contactNumber: '',
  email: '',
});

const emptyAddress = () => ({
  companyName: '',
  warehouseName: '',
  address: '',
  gstin: '',
  contactPerson: '',
  contactNumber: '',
});

/**
 * Build default form state for create/edit PO modals.
 * @param {object|null} companyProfile - Saved company master from API
 */
export function createEmptyPurchaseOrderForm(companyProfile = null) {
  const fromMaster = companyProfileToPoDefaults(companyProfile);
  const buyerSource = fromMaster?.buyer || {
    companyName: DEFAULT_BUYER.companyName,
    registeredAddress: DEFAULT_BUYER.registeredAddress,
    gstin: DEFAULT_BUYER.gstin,
    pan: DEFAULT_BUYER.pan,
    state: DEFAULT_BUYER.state,
    contactNumber: DEFAULT_BUYER.contactNumber,
    email: DEFAULT_BUYER.email,
  };

  return {
    supplier: '',
    orderDate: new Date().toISOString().split('T')[0],
    expectedDeliveryDate: '',
    status: 'pending',
    items: [],
    tax: 0,
    defaultTaxRate: 0,
    total: 0,
    notes: '',
    revisionNumber: '0',
    currency: 'INR',
    purchaseRequisitionNumber: '',
    department: '',
    costCenter: '',
    createdBy: '',
    buyer: {
      ...emptyParty(),
      ...buyerSource,
    },
    supplierDetails: emptyParty(),
    billingAddress: {
      ...emptyAddress(),
      ...(fromMaster?.billingAddress || {
        companyName: DEFAULT_BUYER.companyName,
        address: DEFAULT_BUYER.registeredAddress,
        gstin: DEFAULT_BUYER.gstin,
      }),
    },
    shippingAddress: {
      ...emptyAddress(),
      ...(fromMaster?.shippingAddress || {}),
    },
    discountTotal: 0,
    taxableValue: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    freightCharges: 0,
    packingCharges: 0,
    roundOff: 0,
    advancePercent: fromMaster?.advancePercent ?? 0,
    creditDays: fromMaster?.creditDays ?? 0,
    paymentDueDate: '',
    deliveryMode: fromMaster?.deliveryMode || '',
    incoterms: fromMaster?.incoterms || '',
    deliveryLocation: '',
    jurisdiction: fromMaster?.jurisdiction || DEFAULT_BUYER.jurisdiction,
    termsAndConditions: fromMaster?.termsAndConditions || [...DEFAULT_PO_TERMS],
  };
}

/** Map API document → form state (dates as YYYY-MM-DD strings). */
export function purchaseOrderToFormData(po) {
  const base = createEmptyPurchaseOrderForm();
  if (!po) return base;

  const dateStr = (d) => (d ? new Date(d).toISOString().split('T')[0] : '');

  return {
    ...base,
    supplier: po.supplier?._id || po.supplier || '',
    orderDate: dateStr(po.orderDate) || base.orderDate,
    expectedDeliveryDate: dateStr(po.expectedDeliveryDate),
    status: po.status || 'pending',
    items: po.items || [],
    tax: po.tax || 0,
    defaultTaxRate: po.defaultTaxRate || 0,
    total: po.total || 0,
    notes: po.notes || '',
    revisionNumber: po.revisionNumber || '0',
    currency: po.currency || 'INR',
    purchaseRequisitionNumber: po.purchaseRequisitionNumber || '',
    department: po.department || '',
    costCenter: po.costCenter || '',
    createdBy: po.createdBy || '',
    buyer: { ...base.buyer, ...(po.buyer || {}) },
    supplierDetails: { ...base.supplierDetails, ...(po.supplierDetails || {}) },
    billingAddress: { ...base.billingAddress, ...(po.billingAddress || {}) },
    shippingAddress: { ...base.shippingAddress, ...(po.shippingAddress || {}) },
    discountTotal: po.discountTotal || 0,
    taxableValue: po.taxableValue || 0,
    cgst: po.cgst || 0,
    sgst: po.sgst || 0,
    igst: po.igst || 0,
    freightCharges: po.freightCharges || 0,
    packingCharges: po.packingCharges || 0,
    roundOff: po.roundOff || 0,
    advancePercent: po.advancePercent || 0,
    creditDays: po.creditDays || 0,
    paymentDueDate: dateStr(po.paymentDueDate),
    deliveryMode: po.deliveryMode || '',
    incoterms: po.incoterms || '',
    deliveryLocation: po.deliveryLocation || '',
    jurisdiction: po.jurisdiction || base.jurisdiction,
    termsAndConditions: po.termsAndConditions?.length ? po.termsAndConditions : base.termsAndConditions,
  };
}

/** Strip empty date strings so MongoDB Date fields don't fail casting on save. */
function cleanSignatory(sig) {
  if (!sig) return undefined;
  const cleaned = { ...sig };
  if (!cleaned.approvalDate) delete cleaned.approvalDate;
  if (!cleaned.name && !cleaned.designation) return undefined;
  return cleaned;
}

export function sanitizePurchaseOrderPayload(data) {
  const payload = { ...data };
  const dateFields = ['expectedDeliveryDate', 'paymentDueDate'];
  dateFields.forEach((f) => {
    if (!payload[f]) delete payload[f];
  });
  ['preparedBy', 'checkedBy', 'approvedBy'].forEach((f) => {
    const cleaned = cleanSignatory(payload[f]);
    if (cleaned) payload[f] = cleaned;
    else delete payload[f];
  });
  return payload;
}

/** Prefill supplier party block when supplier is selected. */
export function supplierToPartyDetails(supplier) {
  if (!supplier) return emptyParty();
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

/** Default payment/delivery terms stored on the supplier master. */
export function supplierToPaymentTerms(supplier) {
  if (!supplier) {
    return {
      advancePercent: 0,
      creditDays: 0,
      deliveryMode: '',
      incoterms: '',
    };
  }
  return {
    advancePercent: supplier.advancePercent ?? 0,
    creditDays: supplier.creditDays ?? 0,
    deliveryMode: supplier.deliveryMode || '',
    incoterms: supplier.incoterms || '',
  };
}
