import React from 'react';
import { formatINR } from '../types/grn.types';
import GrnStatusBadge from '../components/GrnStatusBadge';
import { useGrnDashboard, useGrnList } from '../hooks/useGrnDashboard';

function GrnDashboard({ onNavigate, onSelectGrn, onCreateFromPo }) {
  const { stats, loading, refresh } = useGrnDashboard();
  const { grns, loading: listLoading, filters, setFilters, refresh: refreshList } = useGrnList();

  const upcomingPos = !filters.status ? (stats?.upcomingPos || []) : [];
  const showUpcomingOnly = filters.status === 'upcoming';
  const visibleGrns = showUpcomingOnly ? [] : grns;

  const kpis = stats
    ? [
        { label: 'Upcoming POs', value: stats.upcomingPoCount ?? 0, cls: 'upcoming' },
        { label: 'Total GRNs', value: stats.totalGrns, cls: '' },
        { label: 'Pending Receipt', value: stats.pendingReceipt, cls: 'warn' },
        { label: 'Completed', value: stats.completedReceipts, cls: 'ok' },
        { label: 'Partially Received', value: stats.partiallyReceived, cls: 'info' },
        { label: 'Fully Received', value: stats.fullyReceived, cls: 'ok' },
        { label: 'Rejected', value: stats.rejectedReceipts, cls: 'danger' },
        { label: 'Inventory Value Received', value: formatINR(stats.inventoryValueReceived), cls: 'primary' },
        { label: 'Monthly Received Value', value: formatINR(stats.monthlyReceivedValue), cls: 'primary' },
      ]
    : [];

  return (
    <div className="grn-dashboard">
      <div className="grn-page-header">
        <div>
          <h2>GRN Dashboard</h2>
          <p>Goods Receipt Notes — official receipt confirmation & inventory updates</p>
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

      {loading ? (
        <div className="grn-skeleton">Loading dashboard…</div>
      ) : (
        <>
          <div className="grn-kpi-grid">
            {kpis.map((k) => (
              <div key={k.label} className={`grn-kpi-card ${k.cls}`}>
                <span className="grn-kpi-label">{k.label}</span>
                <span className="grn-kpi-value">{k.value}</span>
              </div>
            ))}
          </div>

          <div className="grn-charts-row">
            <div className="grn-chart-card">
              <h4>Supplier-wise Receipts</h4>
              <ul className="grn-mini-list">
                {(stats?.supplierWise || []).slice(0, 6).map((s) => (
                  <li key={s.name}><span>{s.name}</span><strong>{s.count}</strong></li>
                ))}
              </ul>
            </div>
            <div className="grn-chart-card">
              <h4>Warehouse-wise</h4>
              <ul className="grn-mini-list">
                {(stats?.warehouseWise || []).slice(0, 6).map((w) => (
                  <li key={w.name}><span>{w.name}</span><strong>{w.count}</strong></li>
                ))}
              </ul>
            </div>
            <div className="grn-chart-card">
              <h4>Category-wise Receipts</h4>
              <ul className="grn-mini-list">
                {(stats?.categoryWise || []).slice(0, 6).map((c) => (
                  <li key={c.name}><span>{c.name}</span><strong>{c.qty} units</strong></li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}

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
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>
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
                      <tr key={g._id} className="clickable-row" onClick={() => onSelectGrn(g._id)}>
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
    </div>
  );
}

export default GrnDashboard;
