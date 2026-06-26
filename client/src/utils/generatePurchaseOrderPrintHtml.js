import { DEFAULT_BUYER, DEFAULT_PO_TERMS } from '../config/buyerCompany';
import { computePurchaseOrderTotals, formatINR, resolveProduct } from './purchaseOrderCalculations';

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN');
}

function partyBlock(title, fields) {
  const rows = fields
    .filter((f) => f.value)
    .map((f) => `<div><span class="label">${f.label}</span><div>${esc(f.value)}</div></div>`)
    .join('');
  return `<div class="party-box"><h3>${title}</h3>${rows || '<div>-</div>'}</div>`;
}

/**
 * Generate full GST-compliant Purchase Order print HTML.
 * @param {object} po - Purchase order document
 * @param {object[]} products - Product catalogue for image/SKU/HSN resolution
 * @param {object} helpers - { getProductThumbnail, productImagePlaceholder, uploadsBase }
 */
export function generatePurchaseOrderPrintHtml(po, products, helpers) {
  const { getProductThumbnail, productImagePlaceholder } = helpers;
  const buyer = { ...DEFAULT_BUYER, ...(po.buyer || {}) };
  const poMerged = { ...po, buyer };
  const totals = computePurchaseOrderTotals(poMerged, products);
  const supplier = poMerged.supplierDetails || {};
  const supplierName = supplier.companyName || poMerged.supplier?.name || '-';
  const billing = poMerged.billingAddress || {};
  const shipping = poMerged.shippingAddress || {};
  const terms = poMerged.termsAndConditions?.length ? poMerged.termsAndConditions : DEFAULT_PO_TERMS;
  const jurisdiction = poMerged.jurisdiction || buyer.jurisdiction || 'As per agreement';
  const generatedOn = new Date().toLocaleString('en-IN');

  const itemRows = totals.items
    .map((item) => {
      const fullProduct = resolveProduct(item, products);
      const productName = fullProduct.title || fullProduct.name || 'Unknown';
      const sku = item.sku || fullProduct.sku || '-';
      const hsn = item.hsnCode || '-';
      const uom = item.unitOfMeasure || 'PCS';
      const imageUrl = getProductThumbnail(fullProduct) || productImagePlaceholder;
      const productUrl = fullProduct.productUrl || '';
      const nameCell = productUrl
        ? `<a href="${esc(productUrl)}" target="_blank" rel="noopener">${esc(productName)}</a>`
        : esc(productName);

      return `
        <tr>
          <td><img class="po-thumb" src="${imageUrl}" alt="${esc(productName)}" /></td>
          <td>${esc(sku)}</td>
          <td>${nameCell}</td>
          <td>${esc(hsn)}</td>
          <td style="text-align:center;">${item.quantity}</td>
          <td style="text-align:center;">${esc(uom)}</td>
          <td style="text-align:right;">${formatINR(item.unitPrice)}</td>
          <td style="text-align:center;">${item.discountPercent || 0}%</td>
          <td style="text-align:center;">${item.taxRate || 0}%</td>
          <td style="text-align:right;">${formatINR(item.taxAmount)}</td>
          <td style="text-align:right;">${formatINR(item.lineTotal)}</td>
        </tr>`;
    })
    .join('');

  const taxRows = totals.isIntraState
    ? `<tr><td>CGST</td><td style="text-align:right;">${formatINR(totals.cgst)}</td></tr>
       <tr><td>SGST</td><td style="text-align:right;">${formatINR(totals.sgst)}</td></tr>`
    : `<tr><td>IGST</td><td style="text-align:right;">${formatINR(totals.igst)}</td></tr>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Purchase Order ${esc(po.poNumber || '')}</title>
  <style>
    * { box-sizing: border-box; }
    @page { margin: 18mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; padding: 24px; font-size: 12px; }
    h1 { margin: 0 0 4px; color: #6B3894; font-size: 22px; }
    h3 { margin: 0 0 8px; color: #6B3894; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; }
    .po-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #6B3894; padding-bottom: 12px; margin-bottom: 16px; }
    .po-title-sub { font-size: 13px; color: #6b7280; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .party-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #fafafa; }
    .party-box .label { display: block; color: #6b7280; font-size: 10px; text-transform: uppercase; margin-top: 6px; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
    .meta-cell { border: 1px solid #e5e7eb; padding: 8px; border-radius: 6px; }
    .meta-cell .label { color: #6b7280; font-size: 10px; text-transform: uppercase; }
    .address-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .address-box { border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { padding: 6px 8px; border: 1px solid #e5e7eb; font-size: 11px; vertical-align: middle; }
    th { background: #f8f5fb; color: #4b5563; font-weight: 600; }
    .totals { margin-top: 12px; margin-left: auto; width: 320px; }
    .totals tr td { border: none; padding: 4px 8px; }
    .totals tr td:first-child { color: #4b5563; }
    .section { margin-top: 16px; }
    .terms ol { margin: 8px 0 0 18px; padding: 0; line-height: 1.6; }
    .terms li { margin-bottom: 4px; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: flex-end; font-size: 10px; color: #6b7280; }
    .seal { width: 80px; height: 80px; border: 2px dashed #d1d5db; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; text-align: center; color: #9ca3af; }
    .status { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #ede7f3; color: #6B3894; font-size: 11px; text-transform: capitalize; }
    .po-thumb { width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e7eb; }
    a { color: #6B3894; text-decoration: none; }
    @media print {
      body { padding: 0; }
      .po-thumb { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="po-header">
    <div>
      <h1>PURCHASE ORDER</h1>
      <div class="po-title-sub">Tax Invoice / Procurement Document</div>
    </div>
    <div style="text-align:right;">
      <div><strong>${esc(po.poNumber || '')}</strong></div>
      <div class="status">${esc(po.status || 'pending')}</div>
    </div>
  </div>

  <div class="parties">
    ${partyBlock('Buyer Information', [
      { label: 'Company Name', value: buyer.companyName },
      { label: 'Registered Address', value: buyer.registeredAddress },
      { label: 'GSTIN', value: buyer.gstin },
      { label: 'PAN', value: buyer.pan },
      { label: 'Contact', value: buyer.contactNumber },
      { label: 'Email', value: buyer.email },
    ])}
    ${partyBlock('Supplier Information', [
      { label: 'Company Name', value: supplierName },
      { label: 'Address', value: supplier.registeredAddress || supplier.address || po.supplier?.address },
      { label: 'GSTIN', value: supplier.gstin },
      { label: 'PAN', value: supplier.pan },
      { label: 'Contact Person', value: supplier.contactPerson || po.supplier?.contactPerson },
      { label: 'Mobile', value: supplier.contactNumber || po.supplier?.phone },
      { label: 'Email', value: supplier.email || po.supplier?.email },
    ])}
  </div>

  <div class="meta-grid">
    <div class="meta-cell"><div class="label">PO Date</div><div>${fmtDate(po.orderDate)}</div></div>
    <div class="meta-cell"><div class="label">Revision</div><div>${esc(po.revisionNumber) || '0'}</div></div>
    <div class="meta-cell"><div class="label">Currency</div><div>${esc(po.currency) || 'INR'}</div></div>
    <div class="meta-cell"><div class="label">PR Number</div><div>${esc(po.purchaseRequisitionNumber) || '-'}</div></div>
    <div class="meta-cell"><div class="label">Department</div><div>${esc(po.department) || '-'}</div></div>
    <div class="meta-cell"><div class="label">Cost Center</div><div>${esc(po.costCenter) || '-'}</div></div>
    <div class="meta-cell"><div class="label">Created By</div><div>${esc(po.createdBy) || '-'}</div></div>
  </div>

  <div class="address-row">
    <div class="address-box">
      <h3>Billing Address</h3>
      <div>${esc(billing.companyName || buyer.companyName) || '-'}</div>
      <div>${esc(billing.address || buyer.registeredAddress) || ''}</div>
      <div><span class="label">GSTIN</span> ${esc(billing.gstin || buyer.gstin) || '-'}</div>
    </div>
    <div class="address-box">
      <h3>Shipping Address</h3>
      <div>${esc(shipping.warehouseName || shipping.companyName) || '-'}</div>
      <div>${esc(shipping.address) || '-'}</div>
      <div>${esc(shipping.contactPerson) ? `Contact: ${esc(shipping.contactPerson)}` : ''}</div>
      <div>${esc(shipping.contactNumber) ? `Phone: ${esc(shipping.contactNumber)}` : ''}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Image</th>
        <th>SKU</th>
        <th>Product Name</th>
        <th>HSN</th>
        <th>Qty</th>
        <th>UOM</th>
        <th>Unit Price</th>
        <th>Disc %</th>
        <th>Tax %</th>
        <th>Tax Amt</th>
        <th>Line Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || '<tr><td colspan="11" style="text-align:center;color:#9ca3af;">No items</td></tr>'}
    </tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td style="text-align:right;">${formatINR(totals.subtotal)}</td></tr>
    <tr><td>Discount</td><td style="text-align:right;">${formatINR(totals.discountTotal)}</td></tr>
    <tr><td>Taxable Value</td><td style="text-align:right;">${formatINR(totals.taxableValue)}</td></tr>
    ${taxRows}
    <tr><td>Freight Charges</td><td style="text-align:right;">${formatINR(totals.freightCharges)}</td></tr>
    <tr><td>Packing Charges</td><td style="text-align:right;">${formatINR(totals.packingCharges)}</td></tr>
    <tr><td>Round Off</td><td style="text-align:right;">${formatINR(totals.roundOff)}</td></tr>
    <tr><td><strong>Grand Total</strong></td><td style="text-align:right;"><strong>${formatINR(totals.total)}</strong></td></tr>
  </table>

  <div class="section">
    <h3>Payment Terms</h3>
    <div>Advance: ${po.advancePercent ?? 0}% | Credit Days: ${po.creditDays ?? 0} | Due Date: ${fmtDate(po.paymentDueDate)}</div>
  </div>
  <div class="section">
    <h3>Delivery Terms</h3>
    <div>Expected Delivery: ${fmtDate(po.expectedDeliveryDate)} | Mode: ${esc(po.deliveryMode) || '-'} | Incoterms: ${esc(po.incoterms) || '-'} | Location: ${esc(po.deliveryLocation) || '-'}</div>
  </div>

  <div class="section terms">
    <h3>Terms &amp; Conditions</h3>
    <ol>${terms.map((t, i) => `<li>${esc(t)}${i === terms.length - 1 ? ` Jurisdiction: ${esc(jurisdiction)}.` : ''}</li>`).join('')}</ol>
  </div>

  ${po.notes ? `<div class="section"><h3>Notes</h3><div>${esc(po.notes)}</div></div>` : ''}

  <div class="footer">
    <div class="seal">Company<br/>Seal</div>
    <div style="text-align:center;">
      <div>System Generated Purchase Order</div>
      <div>Generated On: ${generatedOn}</div>
    </div>
    <div>Page 1 of 1</div>
  </div>
</body>
</html>`;
}

export function downloadPurchaseOrderHtml(html, poNumber = 'purchase-order') {
  const safeName = String(poNumber || 'purchase-order').replace(/[^\w.-]+/g, '_');
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeName}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function openPurchaseOrderPrintWindow(html) {
  const printWindow = window.open('', '_blank', 'width=1100,height=800');
  if (!printWindow) {
    alert('Please allow pop-ups to print or download the purchase order.');
    return null;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  const triggerPrint = () => {
    let hasPrinted = false;
    const doPrint = () => {
      if (hasPrinted) return;
      hasPrinted = true;
      printWindow.print();
    };
    const images = Array.from(printWindow.document.images || []);
    const pending = images.filter((img) => !img.complete);
    if (pending.length === 0) {
      doPrint();
      return;
    }
    let remaining = pending.length;
    const done = () => {
      remaining -= 1;
      if (remaining <= 0) doPrint();
    };
    pending.forEach((img) => {
      img.addEventListener('load', done);
      img.addEventListener('error', done);
    });
    setTimeout(doPrint, 2000);
  };

  setTimeout(triggerPrint, 300);
  return printWindow;
}
