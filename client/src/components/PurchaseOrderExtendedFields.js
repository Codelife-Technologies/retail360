import React from 'react';
import { UOM_OPTIONS } from '../types/purchaseOrderTypes';
import { validateGSTIN } from '../utils/indianGstValidation';

/**
 * Company / supplier metadata for Purchase Order edit.
 * Buyer Information and Status are intentionally not shown.
 * Ship To is handled separately after the products section.
 */
function PurchaseOrderExtendedFields({
  formData,
  onChange,
  onNestedChange,
  onSupplierChange,
  suppliers,
  autoVendorSplit = false,
}) {
  const supGstinError = validateGSTIN(formData.supplierDetails?.gstin);

  return (
    <>
      <fieldset className="po-form-section">
        <legend>Company Information</legend>
        <div className="form-row">
          <div className="form-group">
            <label>Company</label>
            <input
              name="billingAddress.companyName"
              value={formData.billingAddress?.companyName || ''}
              onChange={onNestedChange}
              readOnly
            />
          </div>
          <div className="form-group">
            <label>Company GSTIN</label>
            <input
              name="billingAddress.gstin"
              value={formData.billingAddress?.gstin || ''}
              onChange={onNestedChange}
              readOnly
            />
          </div>
          <div className="form-group">
            <label>Order Date *</label>
            <input type="date" name="orderDate" value={formData.orderDate} onChange={onChange} required />
          </div>
          <div className="form-group">
            <label>Currency</label>
            <input name="currency" value={formData.currency || 'INR'} onChange={onChange} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group full-width">
            <label>Company Address</label>
            <textarea
              name="billingAddress.address"
              value={formData.billingAddress?.address || ''}
              onChange={onNestedChange}
              rows="2"
              readOnly
            />
          </div>
        </div>
        <p className="form-hint">
          Company details come from Company Master. Buyer information is not collected on this form.
        </p>
      </fieldset>

      {!autoVendorSplit && (
        <fieldset className="po-form-section">
          <legend>Supplier</legend>
          <div className="form-row">
            <div className="form-group">
              <label>Vendor Name *</label>
              <select name="supplier" value={formData.supplier} onChange={onSupplierChange} required>
                <option value="">Select Vendor</option>
                {suppliers.map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Vendor GSTIN</label>
              <input
                name="supplierDetails.gstin"
                value={formData.supplierDetails?.gstin || ''}
                onChange={onNestedChange}
                className={!supGstinError.valid ? 'input-error' : ''}
              />
            </div>
            <div className="form-group">
              <label>Vendor Location (State)</label>
              <input
                name="supplierDetails.state"
                value={formData.supplierDetails?.state || ''}
                onChange={onNestedChange}
              />
            </div>
            <div className="form-group">
              <label>PR Number</label>
              <input
                name="purchaseRequisitionNumber"
                value={formData.purchaseRequisitionNumber || ''}
                onChange={onChange}
              />
            </div>
          </div>
        </fieldset>
      )}

      <fieldset className="po-form-section">
        <legend>Payment &amp; Delivery Terms</legend>
        <div className="form-row">
          <div className="form-group">
            <label>Advance %</label>
            <input
              type="number"
              name="advancePercent"
              value={formData.advancePercent || 0}
              onChange={onChange}
              min="0"
              max="100"
            />
          </div>
          <div className="form-group">
            <label>Credit Days</label>
            <input
              type="number"
              name="creditDays"
              value={formData.creditDays || 0}
              onChange={onChange}
              min="0"
            />
          </div>
          <div className="form-group">
            <label>Expected Delivery</label>
            <input
              type="date"
              name="expectedDeliveryDate"
              value={formData.expectedDeliveryDate || ''}
              onChange={onChange}
            />
          </div>
          <div className="form-group">
            <label>Delivery Mode</label>
            <input
              name="deliveryMode"
              value={formData.deliveryMode || ''}
              onChange={onChange}
              placeholder="Road / Air / Courier"
            />
          </div>
        </div>
      </fieldset>

      <input type="hidden" data-uom-options={UOM_OPTIONS.join(',')} readOnly />
    </>
  );
}

export default PurchaseOrderExtendedFields;
