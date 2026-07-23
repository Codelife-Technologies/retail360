import React, { useState, useEffect, useMemo } from 'react';
import { reportsAPI, suppliersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import ExcelUpload from './ExcelUpload';
import logger from '../utils/logger';
import { getFinPeriodRange } from '../finance/utils/financeUtils';
import { FinancePeriodToggle } from '../finance/components/FinanceShared';
import './PurchaseReport.css';
import './ExcelUpload.css';
import './Purchases.css';

function itemLabel(item) {
  const product = item?.product;
  if (!product) return item?.sku || 'Unknown product';
  const name = product.name || product.title || 'Product';
  return product.sku ? `${name} (${product.sku})` : name;
}

/** Vendor location from supplier master (state / address), not warehouse. */
function formatVendorLocation(supplier) {
  if (!supplier) return '';
  const parts = [supplier.state, supplier.address]
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  return parts.join(' — ');
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '₹0.00';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PurchaseReport() {
  const { hasPermission } = useAuth();
  const canImport =
    hasPermission('admin.all') ||
    hasPermission('finance.full') ||
    hasPermission('purchases.create');

  const [view, setView] = useState('detailed'); // detail is default; summary is optional
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [detailedData, setDetailedData] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [vendorLocations, setVendorLocations] = useState([]);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [showImport, setShowImport] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const defaultRange = useMemo(() => getFinPeriodRange('month'), []);
  const [filters, setFilters] = useState({
    period: 'month',
    startDate: defaultRange.dateFrom,
    endDate: defaultRange.dateTo,
    supplier: '',
    vendorLocation: '',
    paymentStatus: '',
    groupBy: 'date',
  });

  useEffect(() => {
    fetchSuppliers();
  }, []);

  useEffect(() => {
    fetchData();
  }, [view, filters]);

  const fetchSuppliers = async () => {
    try {
      const response = await suppliersAPI.getAll();
      const list = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setSuppliers(list);
      const states = [
        ...new Set(
          list
            .map((s) => String(s.state || '').trim())
            .filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b));
      setVendorLocations(states);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      logger.error('Error fetching suppliers', error);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const apiFilters = {
        ...filters,
        location: undefined,
        vendorLocation: filters.vendorLocation || undefined,
      };
      if (view === 'summary') {
        const response = await reportsAPI.getPurchasesSummary(apiFilters);
        setSummaryData(response.data);
      } else {
        const response = await reportsAPI.getPurchasesDetailed(apiFilters);
        const rows = Array.isArray(response.data) ? response.data : [];
        setDetailedData(rows);
        setExpandedIds(new Set(rows.map((p) => String(p._id))));
      }
    } catch (error) {
      console.error('Error fetching report data:', error);
      logger.error('Error fetching report data', error);
      alert('Failed to fetch report data');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'startDate' || name === 'endDate' ? { period: 'custom' } : {}),
    }));
  };

  const handlePeriodChange = (periodId) => {
    if (periodId === 'custom') {
      setFilters((f) => ({ ...f, period: 'custom' }));
      return;
    }
    const range = getFinPeriodRange(periodId);
    setFilters((f) => ({
      ...f,
      period: periodId,
      startDate: range.dateFrom,
      endDate: range.dateTo,
    }));
  };

  const handleCustomDateChange = (patch) => {
    setFilters((f) => ({
      ...f,
      period: 'custom',
      ...(patch.dateFrom !== undefined ? { startDate: patch.dateFrom } : {}),
      ...(patch.dateTo !== undefined ? { endDate: patch.dateTo } : {}),
    }));
  };

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(detailedData.map((p) => String(p._id))));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  const handleExport = async () => {
    const hasData = view === 'summary' ? Boolean(summaryData) : detailedData.length > 0;
    if (!hasData) {
      alert('No data to export for the selected filters');
      return;
    }

    try {
      setExporting(true);
      const response = await reportsAPI.exportPurchases({
        ...filters,
        view,
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `purchase_report_${view}_${filters.endDate || new Date().toISOString().slice(0, 10)}.xlsx`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting report:', error);
      alert(error.response?.data?.error || 'Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  const detailTotals = useMemo(() => {
    if (!detailedData.length) {
      return { count: 0, expenditure: 0, items: 0 };
    }
    return detailedData.reduce(
      (acc, purchase) => {
        acc.count += 1;
        acc.expenditure += Number(purchase.total) || 0;
        acc.items += (purchase.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
        return acc;
      },
      { count: 0, expenditure: 0, items: 0 }
    );
  }, [detailedData]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.supplier) count += 1;
    if (filters.vendorLocation) count += 1;
    if (filters.paymentStatus) count += 1;
    if (view === 'summary' && filters.groupBy && filters.groupBy !== 'date') count += 1;
    if (filters.period === 'custom') count += 1;
    else if (filters.period && filters.period !== 'month') count += 1;
    return count;
  }, [filters, view]);

  return (
    <div className="purchase-report">
      <div className="purchase-report-intro">
        <h2>Purchase Report</h2>
        <p>
          Purchase records from received goods. Detail view lists every purchase; switch to Summary for grouped totals.
        </p>
      </div>

      <div className="report-actions">
        <div className="view-toggle" role="tablist" aria-label="Purchase report view">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'detailed'}
            className={view === 'detailed' ? 'active' : ''}
            onClick={() => setView('detailed')}
          >
            Detail
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'summary'}
            className={view === 'summary' ? 'active' : ''}
            onClick={() => setView('summary')}
          >
            Summary
          </button>
        </div>
        <div className="export-buttons">
          <button
            type="button"
            className={`btn-filters${showFilters ? ' active' : ''}`}
            onClick={() => setShowFilters((prev) => !prev)}
            aria-expanded={showFilters}
          >
            Filters
            {activeFilterCount > 0 ? (
              <span className="filter-count-badge">{activeFilterCount}</span>
            ) : null}
          </button>
          {canImport ? (
            <button type="button" className="btn-import" onClick={() => setShowImport(true)}>
              Import Excel
            </button>
          ) : null}
          <button
            type="button"
            className="btn-export"
            onClick={handleExport}
            disabled={loading || exporting}
          >
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </div>

      {showFilters ? (
        <div className="report-filters">
          <div className="report-filters-header">
            <h3>Filters</h3>
            <button
              type="button"
              className="btn-linkish"
              onClick={() => setShowFilters(false)}
            >
              Hide
            </button>
          </div>

          <FinancePeriodToggle
            period={filters.period || 'custom'}
            dateFrom={filters.startDate}
            dateTo={filters.endDate}
            onPeriodChange={handlePeriodChange}
            onCustomDateChange={handleCustomDateChange}
          />

          <div className="filters-grid">
            <div className="filter-group">
              <label>Supplier</label>
              <select
                name="supplier"
                value={filters.supplier}
                onChange={handleFilterChange}
              >
                <option value="">All Suppliers</option>
                {suppliers.map((supplier) => (
                  <option key={supplier._id} value={supplier._id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>Vendor Location</label>
              <select
                name="vendorLocation"
                value={filters.vendorLocation}
                onChange={handleFilterChange}
              >
                <option value="">All Vendor Locations</option>
                {vendorLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>Payment Status</label>
              <select
                name="paymentStatus"
                value={filters.paymentStatus}
                onChange={handleFilterChange}
              >
                <option value="">All Statuses</option>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            {view === 'summary' && (
              <div className="filter-group">
                <label>Group By</label>
                <select
                  name="groupBy"
                  value={filters.groupBy}
                  onChange={handleFilterChange}
                >
                  <option value="date">Date</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="product">Product</option>
                  <option value="supplier">Supplier</option>
                  <option value="vendorLocation">Vendor Location</option>
                </select>
              </div>
            )}
          </div>
          <div className="filter-actions">
            <button type="button" className="btn-primary" onClick={fetchData}>
              Apply Filters
            </button>
            <button
              type="button"
              className="btn-import"
              onClick={() => {
                const range = getFinPeriodRange('month');
                setFilters({
                  period: 'month',
                  startDate: range.dateFrom,
                  endDate: range.dateTo,
                  supplier: '',
                  vendorLocation: '',
                  paymentStatus: '',
                  groupBy: 'date',
                });
              }}
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="loading">Loading purchase records…</div>
      ) : view === 'detailed' ? (
        <div className="detailed-view purchase-records-view">
          <div className="purchase-records-header">
            <div>
              <h3>Purchase Records</h3>
              <p className="purchase-records-meta">
                {detailTotals.count} purchase{detailTotals.count === 1 ? '' : 's'}
                {' · '}
                {detailTotals.items} item{detailTotals.items === 1 ? '' : 's'}
                {' · '}
                {formatMoney(detailTotals.expenditure)} total
              </p>
            </div>
            {detailedData.length > 0 ? (
              <div className="purchase-records-expand-actions">
                <button type="button" className="btn-linkish" onClick={expandAll}>Expand all</button>
                <button type="button" className="btn-linkish" onClick={collapseAll}>Collapse all</button>
              </div>
            ) : null}
          </div>

          {detailedData.length === 0 ? (
            <div className="no-data">No purchase records for the selected filters.</div>
          ) : (
            <div className="purchase-records-list">
              {detailedData.map((purchase) => {
                const id = String(purchase._id);
                const expanded = expandedIds.has(id);
                const items = purchase.items || [];
                return (
                  <article key={id} className={`purchase-record-card${expanded ? ' is-expanded' : ''}`}>
                    <button
                      type="button"
                      className="purchase-record-summary"
                      onClick={() => toggleExpanded(id)}
                      aria-expanded={expanded}
                    >
                      <span className="purchase-record-caret">{expanded ? '▾' : '▸'}</span>
                      <div className="purchase-record-main">
                        <strong className="purchase-record-number">
                          {purchase.purchaseNumber || '—'}
                        </strong>
                        <span className="purchase-record-date">
                          {purchase.purchaseDate
                            ? new Date(purchase.purchaseDate).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'}
                        </span>
                      </div>
                      <div className="purchase-record-parties">
                        <span>{purchase.supplier?.name || 'No supplier'}</span>
                        <span className="purchase-record-sep">·</span>
                        <span>
                          {formatVendorLocation(purchase.supplier) || 'No vendor location'}
                        </span>
                      </div>
                      <div className="purchase-record-figures">
                        <span>{items.length} line{items.length === 1 ? '' : 's'}</span>
                        <span className="purchase-record-total">{formatMoney(purchase.total)}</span>
                        <span className={`status-badge status-${purchase.paymentStatus === 'paid' ? 'paid' : 'unpaid'}`}>
                          {purchase.paymentStatus === 'paid' ? 'paid' : 'unpaid'}
                        </span>
                      </div>
                    </button>

                    {expanded ? (
                      <div className="purchase-record-detail">
                        <div className="purchase-record-totals-row">
                          <span>Subtotal {formatMoney(purchase.subtotal)}</span>
                          <span>Tax {formatMoney(purchase.tax)}</span>
                          <span>Total {formatMoney(purchase.total)}</span>
                        </div>
                        {items.length === 0 ? (
                          <p className="purchase-record-empty-items">No line items on this purchase.</p>
                        ) : (
                          <table className="report-table purchase-line-items-table">
                            <thead>
                              <tr>
                                <th>Product / SKU</th>
                                <th>Qty</th>
                                <th>Unit price</th>
                                <th>Line total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((item, idx) => (
                                <tr key={`${id}-item-${idx}`}>
                                  <td>{itemLabel(item)}</td>
                                  <td>{item.quantity ?? 0}</td>
                                  <td>{formatMoney(item.unitPrice)}</td>
                                  <td>{formatMoney(item.total ?? (item.quantity || 0) * (item.unitPrice || 0))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : view === 'summary' && summaryData ? (
        <div className="summary-view">
          <h3>Purchase Summary</h3>
          {summaryData.groupedData && summaryData.groupedData.length > 0 && (
            <div className="grouped-data-section">
              <h4>Grouped Data</h4>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Count</th>
                    <th>Expenditure</th>
                    <th>Items Purchased</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryData.groupedData.map((group, idx) => (
                    <tr key={idx}>
                      <td>{group.group}</td>
                      <td>{group.count}</td>
                      <td>{formatMoney(group.revenue)}</td>
                      <td>{group.itemsSold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {summaryData.statistics && (
            <div className="statistics-section">
              <div className="stats-grid">
                <div className="stat-box">
                  <h4>Top Products</h4>
                  <ul>
                    {summaryData.statistics.topProducts.slice(0, 5).map((item, idx) => (
                      <li key={idx}>
                        {item.product?.name || 'Unknown'}: {formatMoney(item.expenditure)} ({item.quantity} units)
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="stat-box">
                  <h4>Top Suppliers</h4>
                  <ul>
                    {summaryData.statistics.topSuppliers.slice(0, 5).map((item, idx) => (
                      <li key={idx}>
                        {item.supplier?.name || 'Unknown'}: {formatMoney(item.expenditure)} ({item.count} orders)
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="stat-box">
                  <h4>Payment Status</h4>
                  <ul>
                    <li>Unpaid: {summaryData.statistics.paymentStatusBreakdown.unpaid || 0}</li>
                    <li>Paid: {summaryData.statistics.paymentStatusBreakdown.paid || 0}</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="no-data">No summary data available for the selected filters.</div>
      )}

      {showImport ? (
        <ExcelUpload
          moduleName="purchases"
          templateEndpoint="/purchases/template"
          hideImportMode
          mandatoryFieldsHelp={(
            <ul>
              <li>Purchase Reference, Supplier Name, Location Code, Product SKU, Quantity, Unit Price</li>
              <li>One row per SKU; same Purchase Reference groups rows into one purchase</li>
            </ul>
          )}
          onUploadComplete={() => {
            setShowImport(false);
            fetchData();
          }}
          onClose={() => setShowImport(false)}
        />
      ) : null}
    </div>
  );
}

export default PurchaseReport;
