import React from 'react';
import { formatINR, emptyDeliveryInfo } from '../types/grn.types';

export function buildDraftLinesFromPo(po) {
  if (!po?.items?.length) return [];
  return po.items.map((line) => {
    const product = line.product;
    const orderedQty = line.quantity || 0;
    const alreadyReceived = line.receivedQuantity || 0;
    const pending = Math.max(0, orderedQty - alreadyReceived);
    const qty = pending || orderedQty;
    return {
      product: product?._id || line.product,
      sku: line.sku || product?.sku || '',
      productName: product?.title || product?.name || '',
      category: typeof product?.category === 'object' ? product.category?.name : '',
      hsnCode: line.hsnCode || product?.hsnCode || '',
      unitOfMeasure: line.unitOfMeasure || product?.unit || 'PCS',
      orderedQty: qty,
      receivedQty: qty,
      acceptedQty: qty,
      rejectedQty: 0,
      pendingQty: 0,
      unitCost: line.unitPrice || 0,
      taxPercent: line.taxRate || 0,
      poLineQty: orderedQty,
      poReceivedQty: alreadyReceived,
    };
  });
}

function DetailCell({ label, value }) {
  return (
    <div>
      <label>{label}</label>
      <span>{value ?? '—'}</span>
    </div>
  );
}

function GrnPoDetailPanel({
  po,
  lineItems = [],
  onLineChange,
  deliveryInfo,
  onDeliveryChange,
  editable = true,
}) {
  if (!po) return null;

  const supplier = po.supplierDetails || {};
  const buyer = po.buyer || {};
  const delivery = deliveryInfo || emptyDeliveryInfo();

  const deliveryFields = [
    ['Invoice Number', 'invoiceNumber', 'text'],
    ['Invoice Date', 'invoiceDate', 'date'],
    ['Delivery Challan', 'deliveryChallanNumber', 'text'],
    ['Challan Date', 'deliveryChallanDate', 'date'],
    ['Transporter', 'transporterName', 'text'],
    ['Vehicle Number', 'vehicleNumber', 'text'],
    ['LR Number', 'lrNumber', 'text'],
    ['E-Way Bill', 'ewayBillNumber', 'text'],
    ['Received By', 'receivedBy', 'text'],
    ['Received Date', 'receivedDate', 'date'],
  ];

  return (
    <div className="grn-po-detail-panel">
      <section className="grn-section">
        <h3>Purchase Order Details</h3>
        <div className="grn-detail-grid">
          <DetailCell label="PO Number" value={po.poNumber} />
          <DetailCell label="Status" value={po.status} />
          <DetailCell label="PR Number" value={po.purchaseRequisitionNumber} />
          <DetailCell label="Cost Center" value={po.costCenter} />
          <DetailCell label="Department" value={po.department} />
          <DetailCell
            label="Order Date"
            value={po.orderDate ? new Date(po.orderDate).toLocaleDateString('en-IN') : '—'}
          />
          <DetailCell
            label="Expected Delivery"
            value={
              po.expectedDeliveryDate
                ? new Date(po.expectedDeliveryDate).toLocaleDateString('en-IN')
                : '—'
            }
          />
          <DetailCell label="Currency" value={po.currency || 'INR'} />
          <DetailCell label="Delivery Location" value={po.deliveryLocation} />
          <DetailCell label="Notes" value={po.notes} />
        </div>
      </section>

      <section className="grn-section">
        <h3>Supplier Information</h3>
        <div className="grn-detail-grid">
          <DetailCell label="Name" value={supplier.companyName || po.supplier?.name} />
          <DetailCell label="GSTIN" value={supplier.gstin} />
          <DetailCell label="PAN" value={supplier.pan} />
          <DetailCell label="State" value={supplier.state} />
          <DetailCell label="Address" value={supplier.registeredAddress || supplier.address} />
          <DetailCell label="Contact" value={supplier.contactPerson || supplier.contactNumber} />
          <DetailCell label="Email" value={supplier.email} />
        </div>
      </section>

      <section className="grn-section">
        <h3>Buyer Information</h3>
        <div className="grn-detail-grid">
          <DetailCell label="Company" value={buyer.companyName} />
          <DetailCell label="GSTIN" value={buyer.gstin} />
          <DetailCell label="PAN" value={buyer.pan} />
          <DetailCell label="State" value={buyer.state} />
          <DetailCell label="Address" value={buyer.registeredAddress} />
          <DetailCell label="Contact" value={buyer.contactPerson || buyer.contactNumber} />
        </div>
      </section>

      <section className="grn-section">
        <h3>PO Financial Summary</h3>
        <div className="grn-financial-summary grn-po-financial">
          <div><span>Subtotal</span><strong>{formatINR(po.subtotal)}</strong></div>
          <div><span>Discount</span><strong>{formatINR(po.discountTotal)}</strong></div>
          <div><span>Taxable Value</span><strong>{formatINR(po.taxableValue)}</strong></div>
          <div><span>CGST</span><strong>{formatINR(po.cgst)}</strong></div>
          <div><span>SGST</span><strong>{formatINR(po.sgst)}</strong></div>
          <div><span>IGST</span><strong>{formatINR(po.igst)}</strong></div>
          <div><span>Freight</span><strong>{formatINR(po.freightCharges)}</strong></div>
          <div className="grand"><span>Grand Total</span><strong>{formatINR(po.total)}</strong></div>
        </div>
      </section>

      <section className="grn-section grn-lines-section">
        <h3>PO Line Items — Receipt Quantities</h3>
        <p className="grn-field-hint">Edit received, accepted, and rejected quantities directly before creating the GRN.</p>
        <div className="grn-table-wrap">
          <table className="grn-table grn-lines-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th>HSN</th>
                <th>PO Qty</th>
                <th>Already Rcvd</th>
                <th>Pending</th>
                <th>Received</th>
                <th>Accepted</th>
                <th>Rejected</th>
                <th>UOM</th>
                <th>Unit Cost</th>
                <th>Tax %</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line, idx) => (
                <tr key={line.product || idx}>
                  <td className="mono">{line.sku}</td>
                  <td>{line.productName}</td>
                  <td>{line.hsnCode || '—'}</td>
                  <td>{line.poLineQty ?? line.orderedQty}</td>
                  <td>{line.poReceivedQty ?? 0}</td>
                  <td>{line.orderedQty}</td>
                  <td>
                    {editable ? (
                      <input
                        type="number"
                        min="0"
                        className="grn-inline-input"
                        value={line.receivedQty}
                        onChange={(e) => onLineChange?.(idx, 'receivedQty', e.target.value)}
                      />
                    ) : (
                      line.receivedQty
                    )}
                  </td>
                  <td>
                    {editable ? (
                      <input
                        type="number"
                        min="0"
                        className="grn-inline-input"
                        value={line.acceptedQty}
                        onChange={(e) => onLineChange?.(idx, 'acceptedQty', e.target.value)}
                      />
                    ) : (
                      line.acceptedQty
                    )}
                  </td>
                  <td>
                    {editable ? (
                      <input
                        type="number"
                        min="0"
                        className="grn-inline-input"
                        value={line.rejectedQty}
                        onChange={(e) => onLineChange?.(idx, 'rejectedQty', e.target.value)}
                      />
                    ) : (
                      line.rejectedQty
                    )}
                  </td>
                  <td>{line.unitOfMeasure}</td>
                  <td>{formatINR(line.unitCost)}</td>
                  <td>{line.taxPercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grn-section">
        <h3>Delivery Information</h3>
        <div className="grn-detail-grid">
          {deliveryFields.map(([label, field, type]) => (
            <div key={field}>
              <label>{label}</label>
              {editable ? (
                <input
                  type={type}
                  className="grn-inline-field"
                  value={
                    delivery[field]
                      ? type === 'date'
                        ? new Date(delivery[field]).toISOString().slice(0, 10)
                        : delivery[field]
                      : ''
                  }
                  onChange={(e) => onDeliveryChange?.(field, e.target.value)}
                />
              ) : (
                <span>
                  {delivery[field]
                    ? type === 'date'
                      ? new Date(delivery[field]).toLocaleDateString('en-IN')
                      : delivery[field]
                    : '—'}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default GrnPoDetailPanel;
