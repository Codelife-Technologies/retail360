function inr(n) {
  return `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function generateGrnPdfHtml(grn) {
  const items = grn.items || [];
  const rows = items
    .map(
      (i, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${i.sku || '—'}</td>
      <td>${i.productName || '—'}</td>
      <td>${i.hsnCode || '—'}</td>
      <td class="num">${i.orderedQty}</td>
      <td class="num">${i.receivedQty}</td>
      <td class="num">${i.acceptedQty}</td>
      <td class="num">${i.rejectedQty}</td>
      <td class="num">${i.unitCost}</td>
      <td class="num">${i.taxPercent}%</td>
      <td class="num">${inr(i.lineAmount)}</td>
    </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${grn.grnNumber}</title>
<style>
  body{font-family:Arial,sans-serif;color:#111;margin:24px;font-size: 14px}
  h1{font-size: 18px;margin:0 0 4px;color:#6B3894}
  .header{display:flex;justify-content:space-between;border-bottom:2px solid #6B3894;padding-bottom:12px;margin-bottom:16px}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
  .box{border:1px solid #ddd;border-radius:6px;padding:10px}
  .box h3{margin:0 0 8px;font-size: 14px;text-transform:uppercase;color:#666}
  table{width:100%;border-collapse:collapse;margin:12px 0}
  th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
  th{background:#f5f5f5;font-size: 14px}
  .num{text-align:right}
  .totals{float:right;width:280px;margin-top:12px}
  .totals div{display:flex;justify-content:space-between;padding:4px 0}
  .grand{font-weight:bold;font-size: 14px;border-top:2px solid #333;padding-top:6px}
  .footer{margin-top:40px;font-size: 14px;color:#666;text-align:center}
  .seal{border:1px dashed #999;height:60px;margin-top:20px;text-align:center;line-height:60px;color:#999}
</style></head><body>
  <div class="header">
    <div><h1>GOODS RECEIPT NOTE</h1><div>${grn.grnNumber}</div></div>
    <div style="text-align:right">
      <div><strong>Date:</strong> ${new Date(grn.grnDate).toLocaleDateString('en-IN')}</div>
      <div><strong>Time:</strong> ${grn.grnTime || '—'}</div>
      <div><strong>Status:</strong> ${grn.receiptStatus}</div>
    </div>
  </div>
  <div class="meta">
    <div class="box"><h3>Supplier</h3>
      <div><strong>${grn.supplierDetails?.name || grn.supplier?.name || '—'}</strong></div>
      <div>GSTIN: ${grn.supplierDetails?.gstin || '—'}</div>
      <div>PAN: ${grn.supplierDetails?.pan || '—'}</div>
      <div>${grn.supplierDetails?.address || ''}</div>
    </div>
    <div class="box"><h3>References</h3>
      <div>PO: ${grn.purchaseOrderNumber || '—'}</div>
      <div>PR: ${grn.purchaseRequisitionNumber || '—'}</div>
      <div>GIS: ${grn.gisNumber || '—'}</div>
      <div>Warehouse: ${grn.locationCode || grn.warehouse?.code || '—'}</div>
    </div>
    <div class="box"><h3>Delivery</h3>
      <div>Invoice: ${grn.deliveryInfo?.invoiceNumber || '—'}</div>
      <div>Challan: ${grn.deliveryInfo?.deliveryChallanNumber || '—'}</div>
      <div>Transporter: ${grn.deliveryInfo?.transporterName || '—'}</div>
      <div>Vehicle: ${grn.deliveryInfo?.vehicleNumber || '—'}</div>
    </div>
    <div class="box"><h3>Receiving</h3>
      <div>Officer: ${grn.receivingOfficer || '—'}</div>
      <div>Received By: ${grn.deliveryInfo?.receivedBy || '—'}</div>
      <div>Created By: ${grn.createdByName || '—'}</div>
    </div>
  </div>
  <h3>Goods Receipt Lines</h3>
  <table>
    <thead><tr>
      <th>#</th><th>SKU</th><th>Product</th><th>HSN</th>
      <th>Ordered</th><th>Received</th><th>Accepted</th><th>Rejected</th>
      <th>Unit Cost</th><th>Tax</th><th>Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${inr(grn.subtotal)}</span></div>
    <div><span>Taxable Value</span><span>${inr(grn.taxableValue)}</span></div>
    <div><span>CGST</span><span>${inr(grn.cgst)}</span></div>
    <div><span>SGST</span><span>${inr(grn.sgst)}</span></div>
    <div><span>Freight</span><span>${inr(grn.freightCharges)}</span></div>
    <div class="grand"><span>Grand Total (INR)</span><span>${inr(grn.grandTotal)}</span></div>
  </div>
  <div style="clear:both"></div>
  <div class="seal">Company Seal</div>
  <div class="footer">Generated ${new Date().toLocaleString('en-IN')} · ${grn.grnNumber}</div>
</body></html>`;
}

module.exports = { generateGrnPdfHtml, inr };
