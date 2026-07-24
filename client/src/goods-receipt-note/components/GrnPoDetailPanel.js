import React from 'react';
import { formatINR } from '../types/grn.types';
import { truncateProductName } from '../../utils/productDisplayUtils';

export function buildDraftLinesFromPo(po) {
  if (!po?.items?.length) return [];
  return po.items
    .map((line) => {
      const product = line.product;
      const orderedQty = line.quantity || 0;
      const alreadyReceived = line.receivedQuantity || 0;
      const pending = Math.max(0, orderedQty - alreadyReceived);
      if (pending <= 0) return null;
      return {
        product: product?._id || line.product,
        sku: line.sku || product?.sku || '',
        productName: product?.title || product?.name || '',
        category: typeof product?.category === 'object' ? product.category?.name : '',
        hsnCode: line.hsnCode || product?.hsnCode || '',
        unitOfMeasure: line.unitOfMeasure || product?.unit || 'PCS',
        orderedQty: pending,
        receivedQty: pending,
        acceptedQty: pending,
        rejectedQty: 0,
        pendingQty: 0,
        unitCost: line.unitPrice || 0,
        taxPercent: line.taxRate || 0,
        poLineQty: orderedQty,
        poReceivedQty: alreadyReceived,
      };
    })
    .filter(Boolean);
}

function GrnPoDetailPanel({
  po,
  lineItems = [],
  onLineChange,
  editable = true,
}) {
  if (!po) return null;

  return (
    <div className="grn-po-detail-panel">
      <section className="grn-section grn-lines-section">
        <h3>Product Details</h3>
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
                <th>Defective</th>
                <th>UOM</th>
                <th>Unit Cost</th>
                <th>Tax %</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0 ? (
                <tr>
                  <td colSpan="12" className="grn-empty">No pending products for this PO</td>
                </tr>
              ) : (
                lineItems.map((line, idx) => {
                  const isDefective = (Number(line.rejectedQty) || 0) > 0;
                  return (
                  <tr
                    key={line.product || idx}
                    className={isDefective ? 'grn-line-defective' : undefined}
                  >
                    <td className="mono">{line.sku}</td>
                    <td className="grn-product-name" title={line.productName || undefined}>
                      {truncateProductName(line.productName)}
                    </td>
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
                          title="Defective quantity"
                          aria-label={`Defective quantity for ${line.productName || line.sku}`}
                        />
                      ) : (
                        line.rejectedQty
                      )}
                    </td>
                    <td>{line.unitOfMeasure}</td>
                    <td>{formatINR(line.unitCost)}</td>
                    <td>{line.taxPercent}%</td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default GrnPoDetailPanel;
