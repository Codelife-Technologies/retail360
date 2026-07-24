import React, { useMemo, useState } from 'react';
import { formatINR, GRN_STATUS_LABELS } from '../types/grn.types';
import GrnStatusBadge from '../components/GrnStatusBadge';
import { useGrnDashboard } from '../hooks/useGrnDashboard';
import { purchaseOrdersAPI } from '../../services/api';

function GrnDashboard({ onNavigate, onCreateFromPo }) {
  const { stats, loading, refresh, setStats } = useGrnDashboard();
  const [search, setSearch] = useState('');
  const [updatingPaymentId, setUpdatingPaymentId] = useState('');

  const upcomingPos = stats?.upcomingPos || [];

  const filteredPos = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return upcomingPos;
    return upcomingPos.filter((po) => {
      const haystack = [
        po.poNumber,
        po.purchaseRequisitionNumber,
        po.supplierName,
        po.warehouseCode,
        po.paymentStatus,
        po.receiptStage,
        GRN_STATUS_LABELS[po.receiptStage],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [upcomingPos, search]);

  const handlePaymentStatusChange = async (po, paymentStatus) => {
    const next = paymentStatus === 'paid' ? 'paid' : 'unpaid';
    if ((po.paymentStatus === 'paid' ? 'paid' : 'unpaid') === next) return;
    try {
      setUpdatingPaymentId(String(po._id));
      await purchaseOrdersAPI.update(po._id, { paymentStatus: next });
      if (typeof setStats === 'function') {
        setStats((prev) => {
          if (!prev?.upcomingPos) return prev;
          return {
            ...prev,
            upcomingPos: prev.upcomingPos.map((row) =>
              String(row._id) === String(po._id) ? { ...row, paymentStatus: next } : row
            ),
          };
        });
      } else {
        refresh();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update payment status');
    } finally {
      setUpdatingPaymentId('');
    }
  };

  return (
    <div className="grn-dashboard">
      <div className="grn-page-header">
        <div>
          <h2>Goods Receipt Notes</h2>
        </div>
        <div className="grn-header-actions">
          <button type="button" className="btn-secondary" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="btn-primary" onClick={() => onNavigate('create')}>
            + Create GRN
          </button>
        </div>
      </div>

      <div className="grn-list-section">
        <div className="grn-filters">
          <input
            placeholder="Search PO, PR, supplier, warehouse…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="grn-table-wrap">
          <table className="grn-table">
            <thead>
              <tr>
                <th>Order Date</th>
                <th>Receipt Status</th>
                <th>Payment</th>
                <th>PO Number</th>
                <th>PR Number</th>
                <th>Supplier</th>
                <th>Warehouse</th>
                <th>Items</th>
                <th>Grand Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" className="grn-empty">Loading…</td></tr>
              ) : filteredPos.length === 0 ? (
                <tr>
                  <td colSpan="9" className="grn-empty">
                    No purchase orders ready for receipt
                  </td>
                </tr>
              ) : (
                filteredPos.map((po) => {
                  const paymentStatus = po.paymentStatus === 'paid' ? 'paid' : 'unpaid';
                  const receiptStage = ['partially_received', 'defective'].includes(po.receiptStage)
                    ? po.receiptStage
                    : 'upcoming';
                  const itemsDisplay = receiptStage === 'defective'
                    ? (po.defectiveQty ?? po.itemCount ?? 0)
                    : (po.itemCount ?? '—');
                  return (
                    <tr
                      key={`upcoming-${po._id}`}
                      className="clickable-row grn-row-upcoming"
                      onClick={() => onCreateFromPo?.(po._id)}
                      title={
                        receiptStage === 'defective'
                          ? `${itemsDisplay} defective item(s) — continue receipt for remaining qty`
                          : receiptStage === 'partially_received'
                            ? 'Continue receipt — receive remaining items'
                            : 'Create GRN from this PO'
                      }
                    >
                      <td>
                        {po.orderDate
                          ? new Date(po.orderDate).toLocaleDateString('en-IN')
                          : po.expectedDeliveryDate
                            ? new Date(po.expectedDeliveryDate).toLocaleDateString('en-IN')
                            : '—'}
                      </td>
                      <td><GrnStatusBadge status={receiptStage} /></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <select
                          className={`grn-payment-select status-${paymentStatus}`}
                          value={paymentStatus}
                          disabled={updatingPaymentId === String(po._id)}
                          onChange={(e) => handlePaymentStatusChange(po, e.target.value)}
                          aria-label={`Payment status for ${po.poNumber}`}
                        >
                          <option value="unpaid">Unpaid</option>
                          <option value="paid">Paid</option>
                        </select>
                      </td>
                      <td className="mono">{po.poNumber}</td>
                      <td className="mono">{po.purchaseRequisitionNumber || '—'}</td>
                      <td>{po.supplierName || '—'}</td>
                      <td>{po.warehouseCode || '—'}</td>
                      <td className="text-center">{itemsDisplay}</td>
                      <td>{formatINR(po.total)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default GrnDashboard;
