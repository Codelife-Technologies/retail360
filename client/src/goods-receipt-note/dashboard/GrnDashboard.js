import React, { useState } from 'react';
import { formatINR, GRN_STATUS_LABELS } from '../types/grn.types';
import GrnStatusBadge from '../components/GrnStatusBadge';
import { useGrnDashboard, useGrnList } from '../hooks/useGrnDashboard';
import { getCurrentMonthDateRange } from '../../utils/monthDateRange';
import DetailModal from '../../components/DetailModal';

function GrnDashboard({ onNavigate, onCreateFromPo }) {
  const { stats, refresh } = useGrnDashboard();
  const { grns, loading: listLoading, filters, setFilters, refresh: refreshList } = useGrnList();
  const [viewingGrn, setViewingGrn] = useState(null);

  const upcomingPos = !filters.status ? (stats?.upcomingPos || []) : [];
  const showUpcomingOnly = filters.status === 'upcoming';
  const visibleGrns = showUpcomingOnly ? [] : grns;

  return (
    <div className="grn-dashboard">
      <div className="grn-page-header">
        <div>
          <h2>Goods Receipt Notes</h2>
          <p>Official receipt confirmation & inventory updates</p>
        </div>
        <div className="grn-header-actions">
          <button type="button" className="btn-secondary" onClick={() => { refresh(); refreshList(); }}>
            Refresh
          </button>
          <button type="button" className="btn-primary" onClick={() => onNavigate('create')}>
            + Create GRN
          </button>
        </div>
      </div>

      <div className="grn-list-section">
        <div className="grn-filters">
          <input
            placeholder="Search GRN, PO, supplier, SKU, invoice…"
            value={filters.search || ''}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
          <select
            value={filters.status || ''}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">All statuses</option>
            <option value="upcoming">Upcoming</option>
            <option value="draft">Draft</option>
            <option value="partially_received">Partially Received</option>
            <option value="fully_received">Fully Received</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <label className="grn-date-filter">
            <span>From</span>
            <input
              type="date"
              value={filters.fromDate || ''}
              onChange={(e) => setFilters((f) => ({ ...f, fromDate: e.target.value }))}
            />
          </label>
          <label className="grn-date-filter">
            <span>To</span>
            <input
              type="date"
              value={filters.toDate || ''}
              onChange={(e) => setFilters((f) => ({ ...f, toDate: e.target.value }))}
            />
          </label>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const { fromDate, toDate } = getCurrentMonthDateRange();
              setFilters((f) => ({ ...f, fromDate, toDate }));
            }}
          >
            This month
          </button>
          {(filters.fromDate || filters.toDate) ? (
            <button
              type="button"
              className="btn-clear-sku-search"
              onClick={() => setFilters((f) => ({ ...f, fromDate: '', toDate: '' }))}
            >
              All dates
            </button>
          ) : null}
        </div>

        <div className="grn-table-wrap">
          <table className="grn-table">
            <thead>
              <tr>
                <th>GRN Number</th>
                <th>Date</th>
                <th>Status</th>
                <th>PO Number</th>
                <th>PR Number</th>
                <th>GIS</th>
                <th>Supplier</th>
                <th>Warehouse</th>
                <th>Grand Total</th>
              </tr>
            </thead>
            <tbody>
              {listLoading && !showUpcomingOnly ? (
                <tr><td colSpan="9" className="grn-empty">Loading…</td></tr>
              ) : (
                <>
                  {(showUpcomingOnly ? stats?.upcomingPos || [] : upcomingPos).map((po) => (
                    <tr
                      key={`upcoming-${po._id}`}
                      className="clickable-row grn-row-upcoming"
                      onClick={() => onCreateFromPo?.(po._id)}
                      title="Create GRN from this PO"
                    >
                      <td className="mono muted">—</td>
                      <td>
                        {po.orderDate
                          ? new Date(po.orderDate).toLocaleDateString('en-IN')
                          : po.expectedDeliveryDate
                            ? new Date(po.expectedDeliveryDate).toLocaleDateString('en-IN')
                            : '—'}
                      </td>
                      <td><GrnStatusBadge status="upcoming" /></td>
                      <td className="mono">{po.poNumber}</td>
                      <td className="mono">{po.purchaseRequisitionNumber || '—'}</td>
                      <td className="mono">—</td>
                      <td>{po.supplierName || '—'}</td>
                      <td>{po.warehouseCode || '—'}</td>
                      <td>{formatINR(po.total)}</td>
                    </tr>
                  ))}
                  {visibleGrns.length === 0 && (showUpcomingOnly ? (stats?.upcomingPos || []).length === 0 : upcomingPos.length === 0) ? (
                    <tr><td colSpan="9" className="grn-empty">No GRNs found</td></tr>
                  ) : (
                    visibleGrns.map((g) => (
                      <tr key={g._id} className="clickable-row" onClick={() => setViewingGrn(g)}>
                        <td className="mono">{g.grnNumber}</td>
                        <td>{g.grnDate ? new Date(g.grnDate).toLocaleDateString('en-IN') : '—'}</td>
                        <td><GrnStatusBadge status={g.receiptStatus} /></td>
                        <td className="mono">{g.purchaseOrderNumber || '—'}</td>
                        <td className="mono">{g.purchaseRequisitionNumber || '—'}</td>
                        <td className="mono">{g.gisNumber || '—'}</td>
                        <td>{g.supplierDetails?.name || g.supplier?.name || '—'}</td>
                        <td>{g.locationCode || g.warehouse?.code || '—'}</td>
                        <td>{formatINR(g.grandTotal)}</td>
                      </tr>
                    ))
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewingGrn && (
        <DetailModal
          title={`GRN ${viewingGrn.grnNumber || ''}`}
          fields={[
            { label: 'GRN Number', value: viewingGrn.grnNumber },
            {
              label: 'Date',
              value: viewingGrn.grnDate
                ? new Date(viewingGrn.grnDate).toLocaleDateString('en-IN')
                : '',
            },
            {
              label: 'Status',
              value: GRN_STATUS_LABELS[viewingGrn.receiptStatus] || viewingGrn.receiptStatus,
            },
            { label: 'PO Number', value: viewingGrn.purchaseOrderNumber },
            { label: 'PR Number', value: viewingGrn.purchaseRequisitionNumber },
            { label: 'GIS', value: viewingGrn.gisNumber },
            {
              label: 'Supplier',
              value: viewingGrn.supplierDetails?.name || viewingGrn.supplier?.name,
            },
            {
              label: 'Warehouse',
              value: viewingGrn.warehouse?.name
                || viewingGrn.locationCode
                || viewingGrn.warehouse?.code,
            },
            { label: 'Grand Total', value: formatINR(viewingGrn.grandTotal) },
          ]}
          onClose={() => setViewingGrn(null)}
        >
          {viewingGrn.items?.length > 0 && (
            <div className="detail-view-section">
              <h3>Products</h3>
              <div className="grn-detail-items-wrap">
                <table className="detail-view-items-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Product</th>
                      <th>Ordered</th>
                      <th>Received</th>
                      <th>Accepted</th>
                      <th>Rejected</th>
                      <th>Unit Cost</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingGrn.items.map((item, idx) => (
                      <tr key={item._id || idx}>
                        <td>{item.sku || item.product?.sku || '—'}</td>
                        <td>
                          {item.productName
                            || item.product?.title
                            || item.product?.name
                            || '—'}
                        </td>
                        <td>{item.orderedQty ?? 0}</td>
                        <td>{item.receivedQty ?? 0}</td>
                        <td>{item.acceptedQty ?? 0}</td>
                        <td>{item.rejectedQty ?? 0}</td>
                        <td>{formatINR(item.unitCost)}</td>
                        <td>{formatINR(item.lineAmount)}</td>
                      </tr>
                    ))}
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

export default GrnDashboard;
