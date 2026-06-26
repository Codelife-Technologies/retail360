/**
 * @typedef {Object} PartyInfo
 * @property {string} [companyName]
 * @property {string} [registeredAddress]
 * @property {string} [gstin]
 * @property {string} [pan]
 * @property {string} [state]
 * @property {string} [contactPerson]
 * @property {string} [contactNumber]
 * @property {string} [email]
 */

/**
 * @typedef {Object} AddressBlock
 * @property {string} [companyName]
 * @property {string} [address]
 * @property {string} [gstin]
 * @property {string} [warehouseName]
 * @property {string} [contactPerson]
 * @property {string} [contactNumber]
 */

/**
 * @typedef {Object} ApprovalSignatory
 * @property {string} [name]
 * @property {string} [designation]
 * @property {string} [approvalDate]
 */

/**
 * @typedef {Object} PurchaseOrderItem
 * @property {string} product
 * @property {number} quantity
 * @property {number} unitPrice
 * @property {number} total
 * @property {number} [discountPercent]
 * @property {number} [taxRate]
 * @property {number} [taxAmount]
 * @property {number} [lineTotal]
 * @property {string} [unitOfMeasure]
 * @property {string} [hsnCode]
 * @property {string} [sku]
 * @property {number} [receivedQuantity]
 * @property {number} [pendingQuantity]
 */

/**
 * @typedef {Object} PurchaseOrderFormData
 * @property {string} supplier
 * @property {string} orderDate
 * @property {string} expectedDeliveryDate
 * @property {string} status
 * @property {PurchaseOrderItem[]} items
 * @property {number} tax
 * @property {number} defaultTaxRate
 * @property {number} total
 * @property {string} notes
 * @property {PartyInfo} buyer
 * @property {PartyInfo} supplierDetails
 * @property {string} revisionNumber
 * @property {string} currency
 * @property {string} purchaseRequisitionNumber
 * @property {string} department
 * @property {string} costCenter
 * @property {string} createdBy
 * @property {string} approvedByName
 * @property {AddressBlock} billingAddress
 * @property {AddressBlock} shippingAddress
 * @property {number} discountTotal
 * @property {number} taxableValue
 * @property {number} cgst
 * @property {number} sgst
 * @property {number} igst
 * @property {number} freightCharges
 * @property {number} packingCharges
 * @property {number} roundOff
 * @property {number} advancePercent
 * @property {number} creditDays
 * @property {string} paymentDueDate
 * @property {string} deliveryMode
 * @property {string} incoterms
 * @property {string} deliveryLocation
 * @property {string} jurisdiction
 * @property {ApprovalSignatory} preparedBy
 * @property {ApprovalSignatory} checkedBy
 * @property {ApprovalSignatory} approvedBy
 * @property {string[]} termsAndConditions
 */

/** ERP-compatible purchase order statuses */
export const PO_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'partially_received', label: 'Partially Received' },
  { value: 'fully_received', label: 'Fully Received' },
  { value: 'received', label: 'Received (Legacy)' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const UOM_OPTIONS = ['PCS', 'KG', 'BOX', 'SET', 'PAIR', 'MTR', 'LTR', 'NOS'];
