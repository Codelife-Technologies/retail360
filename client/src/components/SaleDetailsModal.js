import React from 'react';
import { formatMoney, resolveSaleDisplayCurrency } from '../utils/locationCurrency';
import { getCatalogSku, getProductThumbnail, PRODUCT_IMAGE_PLACEHOLDER } from '../utils/productDisplayUtils';
import { useCurrency } from '../currency/CurrencyContext';
import './Products.css';
import './SalesSkuReport.css';

function SaleDetailField({ label, value, mono }) {
  const display = value == null || value === '' ? '—' : value;
  return (
    <div className="detail-field">
      <span className="detail-field-label">{label}</span>
      <span className={`detail-field-value${mono ? ' mono' : ''}`}>{display}</span>
    </div>
  );
}

function formatSaleDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getProductLabel(item) {
  return item.product?.name || item.product?.title || item.productName || 'Unknown';
}

function getProductSku(item) {
  const sku = getCatalogSku(item.product) || item.sku;
  return sku || '—';
}

function SaleDetailsModal({ sale, loading, onClose }) {
  const { formatOverall, fromOriginal } = useCurrency();
  if (!sale && !loading) return null;

  const currency = resolveSaleDisplayCurrency(sale, 'INR');
  const formatSaleMoney = (amount) => formatMoney(amount, currency);
  const originalTotal = sale?.originalAmount != null ? sale.originalAmount : sale?.total;
  const totalInr = fromOriginal(originalTotal, currency, 'INR');
  const title = sale?.amazonOrderId
    ? `Sale · ${sale.amazonOrderId}`
    : sale?.salesNumber
      ? `Sale · ${sale.salesNumber}`
      : 'Sale Details';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content large-modal sale-details-modal" onClick={(e) => e.stopPropagation()}>
        <div className="detail-modal-header">
          <h2>{title}</h2>
          <div className="detail-modal-header-actions">
            <button className="btn-secondary" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {loading ? (
          <p className="sales-order-detail-loading">Loading order details…</p>
        ) : (
          <>
            <div className="detail-section">
              <h4>Order Information</h4>
              <div className="detail-grid">
                <SaleDetailField label="Sales Number" value={sale.salesNumber} mono />
                <SaleDetailField label="Amazon Order ID" value={sale.amazonOrderId} mono />
                <SaleDetailField label="Sale Date" value={formatSaleDateTime(sale.salesDate)} />
                <SaleDetailField label="Channel" value={sale.salesChannel?.name} />
                <SaleDetailField label="Channel Code" value={sale.salesChannel?.code} mono />
                <SaleDetailField label="Currency" value={currency} />
              </div>
            </div>

            <div className="detail-section">
              <h4>Customer</h4>
              <div className="detail-grid">
                <SaleDetailField label="Email" value={sale.customer?.email} />
                <SaleDetailField label="Phone" value={sale.customer?.phone} />
                <SaleDetailField label="Address" value={sale.customer?.address} />
              </div>
            </div>

            <div className="detail-section">
              <h4>Amounts</h4>
              <div className="detail-grid">
                <SaleDetailField label="Subtotal" value={formatSaleMoney(sale.subtotal)} />
                <SaleDetailField label="Discount" value={formatSaleMoney(sale.discount)} />
                <SaleDetailField label="Tax" value={formatSaleMoney(sale.tax)} />
                <SaleDetailField
                  label="Tax Rate"
                  value={sale.defaultTaxRate != null ? `${sale.defaultTaxRate}%` : null}
                />
                <SaleDetailField label="Total (original)" value={formatSaleMoney(sale.total)} />
                <SaleDetailField label="Total (INR / USD)" value={formatOverall(totalInr)} />
                {sale.exchangeRateToInr ? (
                  <SaleDetailField
                    label="FX rate used"
                    value={`1 ${currency} = ${Number(sale.exchangeRateToInr).toFixed(4)} INR`}
                  />
                ) : null}
              </div>
            </div>

            {sale.notes?.trim() && (
              <div className="detail-section">
                <h4>Notes</h4>
                <p className="detail-description">{sale.notes}</p>
              </div>
            )}

            <div className="detail-section">
              <h4>Line Items ({sale.items?.length || 0})</h4>
              {!sale.items?.length ? (
                <p className="sales-detail-items-empty">No line items for this sale.</p>
              ) : (
                <div className="sales-sku-table-wrap">
                  <table className="sales-detail-items-table">
                    <thead>
                      <tr>
                        <th className="sale-line-image-col">Image</th>
                        <th>SKU</th>
                        <th>Product</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sale.items.map((item, idx) => {
                        const thumbnail = getProductThumbnail(item.product) || PRODUCT_IMAGE_PLACEHOLDER;
                        return (
                          <tr key={`${sale._id}-item-${idx}`}>
                            <td className="sale-line-image-col">
                              <img
                                className="sale-line-item-image"
                                src={thumbnail}
                                alt={getProductLabel(item)}
                                loading="lazy"
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.src = PRODUCT_IMAGE_PLACEHOLDER;
                                }}
                              />
                            </td>
                            <td className="mono">{getProductSku(item)}</td>
                            <td>{getProductLabel(item)}</td>
                            <td className="num">{item.quantity ?? '—'}</td>
                            <td className="num">{formatSaleMoney(item.unitPrice)}</td>
                            <td className="num">{formatSaleMoney(item.total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SaleDetailsModal;
