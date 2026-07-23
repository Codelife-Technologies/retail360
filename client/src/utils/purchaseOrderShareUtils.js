import { formatINR } from './purchaseOrderCalculations';
import { normalizePoStatus } from '../types/purchaseOrderTypes';

function resolveProductName(item, products = []) {
  const productId = item.product?._id || item.product;
  const fromList = products.find((p) => p._id === productId);
  const product = fromList || item.product;
  return product?.title || product?.name || item.itemName || item.sku || 'Product';
}

export function buildPurchaseOrderShareMessage(po, products = []) {
  const supplierName =
    po.supplierDetails?.companyName || po.supplier?.name || po.supplierName || 'Vendor';

  const lines = [
    `Purchase Order: ${po.poNumber}`,
    `Supplier: ${supplierName}`,
    `Order Date: ${po.orderDate ? new Date(po.orderDate).toLocaleDateString('en-IN') : '—'}`,
    `Status: ${normalizePoStatus(po.status)}`,
    '',
    'Items:',
  ];

  (po.items || []).forEach((item, index) => {
    const name = resolveProductName(item, products);
    lines.push(
      `${index + 1}. ${item.sku || '—'} — ${name} × ${item.quantity} @ ${formatINR(item.unitPrice || 0)}`
    );
  });

  lines.push('');
  lines.push(`Subtotal: ${formatINR(po.subtotal || 0)}`);
  lines.push(`Grand Total: ${formatINR(po.total || 0)}`);
  if (po.expectedDeliveryDate) {
    lines.push(
      `Expected Delivery: ${new Date(po.expectedDeliveryDate).toLocaleDateString('en-IN')}`
    );
  }
  if (po.notes) {
    lines.push('', `Notes: ${po.notes}`);
  }
  lines.push('', 'Please confirm receipt of this purchase order.');
  return lines.join('\n');
}

export function getSupplierWhatsAppPhone(po) {
  const phone = po.supplierDetails?.contactNumber || po.supplier?.phone || '';
  return phone.replace(/\D/g, '');
}

export function getSupplierEmail(po) {
  return po.supplierDetails?.email || po.supplier?.email || '';
}

export function openWhatsAppShare(po, products = []) {
  const text = buildPurchaseOrderShareMessage(po, products);
  const phone = getSupplierWhatsAppPhone(po);
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openGmailShare(po, products = []) {
  const supplierName =
    po.supplierDetails?.companyName || po.supplier?.name || po.supplierName || '';
  const subject = `Purchase Order ${po.poNumber}${supplierName ? ` — ${supplierName}` : ''}`;
  const body = buildPurchaseOrderShareMessage(po, products);
  const email = getSupplierEmail(po);
  const mailto = email
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
}
