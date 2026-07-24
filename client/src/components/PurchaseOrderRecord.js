import React, { useEffect, useMemo, useState } from 'react';
import { purchaseOrdersAPI } from '../services/api';
import DetailModal from './DetailModal';
import { formatINR } from '../utils/purchaseOrderCalculations';
import { getCurrentMonthDateRange } from '../utils/monthDateRange';
import './PurchaseOrderRecord.css';

function resolvePoLineSku(item) {
  if (!item) return '';
  return String(item.sku || item.product?.sku || '').trim();
}

function resolvePoLineTitle(item) {
  if (!item) return '';
  return String(item.itemName || item.product?.title || item.product?.name || '').trim();
}

function getPurchaseRequisitionNumber(po) {
  if (!po) return '—';
  return po.purchaseRequisite?.prNumber || po.purchaseRequisitionNumber || '—';
}

function resolveVendorName(po) {
  if (!po) return '—';
  if (po.needsVendorAssignment) return 'Assign vendor';
  return po.supplier?.name || '—';
}

function PurchaseOrderRecord() {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getCurrentMonthDateRange().fromDate);
  const [dateTo, setDateTo] = useState(() => getCurrentMonthDateRange().toDate);
  const [viewingPO, setViewingPO] = useState(null);

  useEffect(() => {
    fetchPurchaseOrders();
  }, [dateFrom, dateTo]);

  const fetchPurchaseOrders = async () => {
    try {
      setLoading(true);
      const params = {};
      if (dateFrom) params.fromDate = dateFrom;
      if (dateTo) params.toDate = dateTo;
      params.includeFullyReceived = true;
      const response = await purchaseOrdersAPI.getAll(params);
      const data = Array.isArray(response.data)
        ? response.data
        : response.data?.data || [];
      setPurchaseOrders(data);
    } catch (error) {
      console.error('Error fetching purchase order records:', error);
      alert('Failed to fetch purchase order records');
    } finally {
      setLoading(false);
    }
  };

  const orderedItems = useMemo(() => {
    const rows = [];
    purchaseOrders.forEach((po) => {
      (po.items || []).forEach((item, idx) => {
        const qty = Number(item.quantity) || 0;
        const received = Number(item.receivedQuantity) || 0;
        const unitPrice = Number(item.unitPrice) || 0;
        const amount = Number(item.total ?? item.lineTotal) || qty * unitPrice;
        rows.push({
          key: `${po._id}-${idx}`,
          po,
          poNumber: po.poNumber || '—',
          prNumber: getPurchaseRequisitionNumber(po),
          vendor: resolveVendorName(po),
          vendorId: po.supplier?._id || po.supplier || '',
          orderDate: po.orderDate,
          sku: resolvePoLineSku(item) || '—',
          title: resolvePoLineTitle(item) || '—',
          quantity: qty,
          receivedQuantity: received,
          pendingQuantity: Math.max(0, qty - received),
          unitPrice,
          amount,
          uom: item.uom || item.product?.uom || '—',
        });
      });
    });
    return rows.sort((a, b) => {
      const byDate = new Date(b.orderDate || 0) - new Date(a.orderDate || 0);
      if (byDate !== 0) return byDate;
      const byPo = String(a.poNumber).localeCompare(String(b.poNumber));
      if (byPo !== 0) return byPo;
      return String(a.sku).localeCompare(String(b.sku));
    });
  }, [purchaseOrders]);

  const vendorOptions = useMemo(() => {
    const byKey = new Map();
    purchaseOrders.forEach((po) => {
      const name = resolveVendorName(po);
      const id = String(po.supplier?._id || po.supplier || name);
      if (!name || name === '—') return;
      if (!byKey.has(id)) byKey.set(id, name);
    });
    return [...byKey.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [purchaseOrders]);

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return orderedItems.filter((row) => {
      if (vendorFilter) {
        const rowVendorKey = String(row.vendorId || row.vendor);
        if (rowVendorKey !== vendorFilter && row.vendor !== vendorFilter) {
          return false;
        }
      }
      if (!q) return true;
      return (
        String(row.sku).toLowerCase().includes(q) ||
        String(row.title).toLowerCase().includes(q) ||
        String(row.poNumber).toLowerCase().includes(q) ||
        String(row.prNumber).toLowerCase().includes(q) ||
        String(row.vendor).toLowerCase().includes(q)
      );
    });
  }, [orderedItems, searchTerm, vendorFilter]);

  const summary = useMemo(
    () => ({
      lines: filteredItems.length,
      qty: filteredItems.reduce((sum, row) => sum + row.quantity, 0),
      amount: filteredItems.reduce((sum, row) => sum + row.amount, 0),
    }),
    [filteredItems]
  );

  return (
    <div className="purchase-order-record">
      <div className="por-header">
        <div>
          <h1>Purchase Order Record</h1>
          <p className="por-subtitle">All ordered items across purchase orders</p>
        </div>
        <button type="button" className="btn-secondary" onClick={fetchPurchaseOrders}>
          Refresh
        </button>
      </div>

      <div className="por-toolbar">
        <input
          type="search"
          className="por-search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search SKU, title, PO, PR, or vendor…"
          autoComplete="off"
        />
        <select
          className="por-vendor-filter"
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          aria-label="Filter by vendor"
        >
          <option value="">All vendors</option>
          {vendorOptions.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
            </option>
          ))}
        </select>
        <label className="por-date-filter">
          <span>From</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="por-date-filter">
          <span>To</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        {(dateFrom || dateTo) ? (
          <button
            type="button"
            className="btn-clear-sku-search"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
          >
            All dates
          </button>
        ) : null}
        <div className="por-summary">
          <span>
            Lines: <strong>{summary.lines.toLocaleString('en-IN')}</strong>
          </span>
          <span>
            Qty: <strong>{summary.qty.toLocaleString('en-IN')}</strong>
          </span>
          <span>
            Amount: <strong>{formatINR(summary.amount)}</strong>
          </span>
        </div>
      </div>

      {loading ? (
        <div className="por-loading">Loading ordered items…</div>
      ) : (
        <div className="por-table-container">
          <table className="por-table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>PR Number</th>
                <th>Vendor</th>
                <th>Order Date</th>
                <th>SKU</th>
                <th>Title</th>
                <th>UOM</th>
                <th>Ordered Qty</th>
                <th>Received</th>
                <th>Pending</th>
                <th>Unit Price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="12" className="por-empty">
                    No ordered items found
                  </td>
                </tr>
              ) : (
                filteredItems.map((row) => (
                  <tr
                    key={row.key}
                    className="por-row"
                    onClick={() => setViewingPO(row.po)}
                  >
                    <td>{row.poNumber}</td>
                    <td>{row.prNumber}</td>
                    <td>{row.vendor}</td>
                    <td>
                      {row.orderDate
                        ? new Date(row.orderDate).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="por-sku">{row.sku}</td>
                    <td className="por-title" title={row.title}>
                      {row.title}
                    </td>
                    <td>{row.uom}</td>
                    <td>{row.quantity.toLocaleString('en-IN')}</td>
                    <td>{row.receivedQuantity.toLocaleString('en-IN')}</td>
                    <td>{row.pendingQuantity.toLocaleString('en-IN')}</td>
                    <td>{formatINR(row.unitPrice)}</td>
                    <td>{formatINR(row.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {viewingPO && (
        <DetailModal
          title={`Purchase Order ${viewingPO.poNumber || ''}`}
          fields={[
            { label: 'PO Number', value: viewingPO.poNumber },
            { label: 'PR Number', value: getPurchaseRequisitionNumber(viewingPO) },
            {
              label: 'Vendor',
              value: resolveVendorName(viewingPO),
            },
            {
              label: 'Order Date',
              value: viewingPO.orderDate
                ? new Date(viewingPO.orderDate).toLocaleDateString()
                : '',
            },
            {
              label: 'Expected Delivery',
              value: viewingPO.expectedDeliveryDate
                ? new Date(viewingPO.expectedDeliveryDate).toLocaleDateString()
                : '',
            },
            { label: 'Grand Total', value: formatINR(viewingPO.total) },
            { label: 'Notes', value: viewingPO.notes, full: true },
          ]}
          onClose={() => setViewingPO(null)}
        >
          {viewingPO.items?.length > 0 && (
            <div className="detail-view-section">
              <h3>Ordered Items</h3>
              <div className="por-detail-items-wrap">
                <table className="detail-view-items-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Title</th>
                      <th>Qty</th>
                      <th>Received</th>
                      <th>Pending</th>
                      <th>Unit Price</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingPO.items.map((item, idx) => {
                      const qty = Number(item.quantity) || 0;
                      const received = Number(item.receivedQuantity) || 0;
                      const unitPrice = Number(item.unitPrice) || 0;
                      const amount =
                        Number(item.total ?? item.lineTotal) || qty * unitPrice;
                      return (
                        <tr key={idx}>
                          <td>{resolvePoLineSku(item) || '—'}</td>
                          <td>{resolvePoLineTitle(item) || '—'}</td>
                          <td>{qty}</td>
                          <td>{received}</td>
                          <td>{Math.max(0, qty - received)}</td>
                          <td>{formatINR(unitPrice)}</td>
                          <td>{formatINR(amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DetailModal>
      )}
    </div>
  );
}

export default PurchaseOrderRecord;
