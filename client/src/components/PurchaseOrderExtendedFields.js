import React from 'react';
import { PO_STATUS_OPTIONS, UOM_OPTIONS } from '../types/purchaseOrderTypes';
import { validateGSTIN, validatePAN } from '../utils/indianGstValidation';

/**
 * GST-compliant extended fields for Purchase Order create/edit modal.
 * Preserves existing item/tax UI — adds buyer, supplier, billing, terms, approval sections.
 */
function PurchaseOrderExtendedFields({
  formData,
  onChange,
  onNestedChange,
  onSupplierChange,
  suppliers,
  autoVendorSplit = false,
}) {
  const gstinError = validateGSTIN(formData.buyer?.gstin);
  const panError = validatePAN(formData.buyer?.pan);
  const supGstinError = validateGSTIN(formData.supplierDetails?.gstin);

  return (
    <>
      <fieldset className="po-form-section">
        <legend>Buyer Information</legend>
        {!autoVendorSplit && (
          <p className="po-master-hint">Pre-filled from Company Master. Edit here only if this PO needs different buyer details.</p>
        )}
        {autoVendorSplit && (
          <p className="po-master-hint">Pre-filled from Company Master for all vendor POs created on save.</p>
        )}
        <div className="form-row">
          <div className="form-group">
            <label>Company Name</label>
            <input name="buyer.companyName" value={formData.buyer?.companyName || ''} onChange={onNestedChange} />
          </div>
          <div className="form-group">
            <label>GSTIN</label>
            <input name="buyer.gstin" value={formData.buyer?.gstin || ''} onChange={onNestedChange} className={!gstinError.valid ? 'input-error' : ''} />
            {!gstinError.valid && <small className="field-error">{gstinError.message}</small>}
          </div>
          <div className="form-group">
            <label>PAN</label>
            <input name="buyer.pan" value={formData.buyer?.pan || ''} onChange={onNestedChange} className={!panError.valid ? 'input-error' : ''} />
            {!panError.valid && <small className="field-error">{panError.message}</small>}
          </div>
          <div className="form-group">
            <label>State</label>
            <input name="buyer.state" value={formData.buyer?.state || ''} onChange={onNestedChange} placeholder="For CGST/SGST vs IGST" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group full-width">
            <label>Registered Address</label>
            <textarea name="buyer.registeredAddress" value={formData.buyer?.registeredAddress || ''} onChange={onNestedChange} rows="2" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Contact Number</label>
            <input name="buyer.contactNumber" value={formData.buyer?.contactNumber || ''} onChange={onNestedChange} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" name="buyer.email" value={formData.buyer?.email || ''} onChange={onNestedChange} />
          </div>
        </div>
      </fieldset>

      <fieldset className="po-form-section">
        <legend>Supplier &amp; PO Metadata</legend>
        <div className="form-row">
          {autoVendorSplit ? (
            <div className="form-group full-width">
              <label>Supplier</label>
              <p className="po-auto-vendor-hint">
                Suppliers are assigned automatically from each product&apos;s designated supplier.
                One purchase order will be created per vendor when you save.
              </p>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label>Supplier *</label>
                <select name="supplier" value={formData.supplier} onChange={onSupplierChange} required>
                  <option value="">Select Supplier</option>
                  {suppliers.map((s) => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </select>
                <small className="form-hint">Contact, GST and payment terms load from the supplier master.</small>
              </div>
              <div className="form-group">
                <label>Supplier GSTIN</label>
                <input name="supplierDetails.gstin" value={formData.supplierDetails?.gstin || ''} onChange={onNestedChange} className={!supGstinError.valid ? 'input-error' : ''} />
              </div>
              <div className="form-group">
                <label>Supplier State</label>
                <input name="supplierDetails.state" value={formData.supplierDetails?.state || ''} onChange={onNestedChange} />
              </div>
            </>
          )}
          <div className="form-group">
            <label>Status</label>
            <select name="status" value={formData.status} onChange={onChange}>
              {PO_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Order Date *</label>
            <input type="date" name="orderDate" value={formData.orderDate} onChange={onChange} required />
          </div>
          <div className="form-group">
            <label>Revision Number</label>
            <input name="revisionNumber" value={formData.revisionNumber || '0'} onChange={onChange} />
          </div>
          <div className="form-group">
            <label>Currency</label>
            <input name="currency" value={formData.currency || 'INR'} onChange={onChange} />
          </div>
          <div className="form-group">
            <label>PR Number</label>
            <input name="purchaseRequisitionNumber" value={formData.purchaseRequisitionNumber || ''} onChange={onChange} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Department</label>
            <input name="department" value={formData.department || ''} onChange={onChange} />
          </div>
          <div className="form-group">
            <label>Cost Center</label>
            <input name="costCenter" value={formData.costCenter || ''} onChange={onChange} />
          </div>
          <div className="form-group">
            <label>Created By</label>
            <input name="createdBy" value={formData.createdBy || ''} onChange={onChange} />
          </div>
        </div>
      </fieldset>

      <fieldset className="po-form-section">
        <legend>Billing &amp; Shipping</legend>
        <div className="form-row">
          <div className="form-group">
            <label>Billing — Company</label>
            <input name="billingAddress.companyName" value={formData.billingAddress?.companyName || ''} onChange={onNestedChange} />
          </div>
          <div className="form-group">
            <label>Billing GSTIN</label>
            <input name="billingAddress.gstin" value={formData.billingAddress?.gstin || ''} onChange={onNestedChange} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group full-width">
            <label>Billing Address</label>
            <textarea name="billingAddress.address" value={formData.billingAddress?.address || ''} onChange={onNestedChange} rows="2" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Ship To — Warehouse/Store</label>
            <input name="shippingAddress.warehouseName" value={formData.shippingAddress?.warehouseName || ''} onChange={onNestedChange} />
          </div>
          <div className="form-group">
            <label>Shipping Contact</label>
            <input name="shippingAddress.contactPerson" value={formData.shippingAddress?.contactPerson || ''} onChange={onNestedChange} />
          </div>
          <div className="form-group">
            <label>Shipping Phone</label>
            <input name="shippingAddress.contactNumber" value={formData.shippingAddress?.contactNumber || ''} onChange={onNestedChange} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group full-width">
            <label>Shipping Address</label>
            <textarea name="shippingAddress.address" value={formData.shippingAddress?.address || ''} onChange={onNestedChange} rows="2" />
          </div>
        </div>
      </fieldset>

      <fieldset className="po-form-section">
        <legend>Payment &amp; Delivery Terms</legend>
        <div className="form-row">
          <div className="form-group">
            <label>Advance %</label>
            <input type="number" name="advancePercent" value={formData.advancePercent || 0} onChange={onChange} min="0" max="100" />
          </div>
          <div className="form-group">
            <label>Credit Days</label>
            <input type="number" name="creditDays" value={formData.creditDays || 0} onChange={onChange} min="0" />
          </div>
          <div className="form-group">
            <label>Payment Due Date</label>
            <input type="date" name="paymentDueDate" value={formData.paymentDueDate || ''} onChange={onChange} />
          </div>
          <div className="form-group">
            <label>Expected Delivery</label>
            <input type="date" name="expectedDeliveryDate" value={formData.expectedDeliveryDate || ''} onChange={onChange} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Delivery Mode</label>
            <input name="deliveryMode" value={formData.deliveryMode || ''} onChange={onChange} placeholder="Road / Air / Courier" />
          </div>
          <div className="form-group">
            <label>Incoterms</label>
            <input name="incoterms" value={formData.incoterms || ''} onChange={onChange} placeholder="EXW / FOB / CIF" />
          </div>
          <div className="form-group">
            <label>Delivery Location</label>
            <input name="deliveryLocation" value={formData.deliveryLocation || ''} onChange={onChange} />
          </div>
          <div className="form-group">
            <label>Jurisdiction</label>
            <input name="jurisdiction" value={formData.jurisdiction || ''} onChange={onChange} />
          </div>
        </div>
      </fieldset>

      {/* UOM options exposed for item add row via data attribute — used in parent */}
      <input type="hidden" data-uom-options={UOM_OPTIONS.join(',')} readOnly />
    </>
  );
}

export default PurchaseOrderExtendedFields;
