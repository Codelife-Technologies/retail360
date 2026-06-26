/**
 * @typedef {'draft'|'pending_inspection'|'partially_received'|'fully_received'|'approved'|'closed'|'cancelled'} GrnReceiptStatus
 */

export const GRN_STATUS_LABELS = {
  upcoming: 'Upcoming',
  draft: 'Draft',
  pending_inspection: 'Pending Inspection',
  partially_received: 'Partially Received',
  fully_received: 'Fully Received',
  approved: 'Approved',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export const GRN_STATUS_OPTIONS = Object.entries(GRN_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const ATTACHMENT_CATEGORIES = [
  { value: 'supplier_invoice', label: 'Supplier Invoice' },
  { value: 'delivery_challan', label: 'Delivery Challan' },
  { value: 'eway_bill', label: 'E-Way Bill' },
  { value: 'inspection_image', label: 'Inspection Image' },
  { value: 'damage_photo', label: 'Damage Photo' },
  { value: 'transport_document', label: 'Transport Document' },
  { value: 'quality_report', label: 'Quality Report' },
  { value: 'pdf', label: 'PDF Document' },
  { value: 'excel', label: 'Excel File' },
  { value: 'other', label: 'Other' },
];

export const GRN_ELIGIBLE_PO_STATUSES = [
  'draft',
  'pending',
  'pending_approval',
  'approved',
  'partially_received',
  'received',
];

export const PO_BLOCKED_FOR_GRN = ['closed', 'cancelled', 'fully_received'];

export function getPoLinePendingQty(line) {
  if (line?.pendingQuantity != null) return Math.max(0, line.pendingQuantity);
  return Math.max(0, (line?.quantity || 0) - (line?.receivedQuantity || 0));
}

/** @param {object} po Purchase order document */
export function isPoEligibleForGrn(po) {
  if (!po) return false;
  if (PO_BLOCKED_FOR_GRN.includes(po.status)) return false;
  if (!GRN_ELIGIBLE_PO_STATUSES.includes(po.status)) return false;
  return (po.items || []).some((line) => getPoLinePendingQty(line) > 0);
}

export function formatINR(amount) {
  return `₹${(Number(amount) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function emptyDeliveryInfo() {
  return {
    invoiceNumber: '',
    invoiceDate: '',
    deliveryChallanNumber: '',
    deliveryChallanDate: '',
    transporterName: '',
    vehicleNumber: '',
    lrNumber: '',
    ewayBillNumber: '',
    receivedBy: '',
    receivedDate: '',
  };
}

export function emptyFollowUp() {
  return {
    replacementRequired: false,
    returnToVendor: false,
    creditNoteRequired: false,
    reinspectionRequired: false,
    remarks: '',
  };
}
