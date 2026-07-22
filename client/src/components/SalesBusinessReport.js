import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { reportsAPI, salesChannelsAPI } from '../services/api';
import { formatMoney, getCurrencyForSalesChannelId } from '../utils/locationCurrency';
import { useCurrency } from '../currency/CurrencyContext';
import { DualKpiValue } from '../currency/CurrencyUI';
import './SalesBusinessReport.css';
import '../currency/currency.css';

const GROUP_BY_OPTIONS = [
  { id: 'day', label: 'By Day' },
  { id: 'week', label: 'By Week' },
  { id: 'month', label: 'By Month' },
];

const REPORT_COLUMNS = [
  { key: 'date', label: 'Date', type: 'text' },
  { key: 'orderedProductSales', label: 'Ordered Product Sales', type: 'currency' },
  { key: 'unitsOrdered', label: 'Units Ordered', type: 'number' },
  { key: 'totalOrderItems', label: 'Order Items (Excel rows)', type: 'number', highlight: 'teal' },
  { key: 'avgSalesPerOrderItem', label: 'Average Sales per Order Item', type: 'currency' },
  { key: 'avgUnitsPerOrderItem', label: 'Average Units per Order Item', type: 'number' },
  { key: 'avgSellingPrice', label: 'Average Selling Price', type: 'currency' },
];

const CURRENCY_INR_KEYS = {
  orderedProductSales: 'orderedProductSalesInr',
  avgSalesPerOrderItem: 'avgSalesPerOrderItemInr',
  avgSellingPrice: 'avgSellingPriceInr',
};

function toDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function defaultReportFilters(shared = {}) {
  const today = toDateInput(new Date());
  const monthStart = toDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  return {
    groupBy: 'month',
    customStart: shared.startDate || monthStart,
    customEnd: shared.endDate || today,
    salesChannel: shared.salesChannel || '',
    dashboardView: 'default',
  };
}

function buildReportParams(applied) {
  return {
    startDate: applied.customStart,
    endDate: applied.customEnd,
    salesChannel: applied.salesChannel || undefined,
    reportGroupBy: applied.groupBy,
  };
}

function formatDisplayDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function formatCellValue(value, type, currency = 'INR', amountInInr) {
  if (value == null || value === '') return '—';
  if (type === 'currency') {
    if (amountInInr != null) {
      return <DualKpiValue amountInInr={amountInInr} loading={false} />;
    }
    return formatMoney(value, currency);
  }
  if (type === 'percent') return `${Number(value).toFixed(2)}%`;
  if (type === 'number') return Number(value).toLocaleString();
  return value;
}

function isToday(isoDate) {
  return isoDate === toDateInput(new Date());
}

function sortReportRows(rows, sortKey, sortDir) {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const col = REPORT_COLUMNS.find((c) => c.key === sortKey);
    const aVal = a[sortKey];
    const bVal = b[sortKey];

    if (col?.type === 'text') {
      return String(aVal || '').localeCompare(String(bVal || '')) * dir;
    }

    const aNum = aVal == null ? -Infinity : Number(aVal);
    const bNum = bVal == null ? -Infinity : Number(bVal);
    return (aNum - bNum) * dir;
  });
}

function downloadBusinessReportCsv(rows) {
  const headers = REPORT_COLUMNS.map((col) => col.label);
  const csvRows = rows.map((row) =>
    REPORT_COLUMNS.map((col) => {
      const raw = row[col.key];
      if (raw == null) return '';
      return `"${String(raw).replace(/"/g, '""')}"`;
    }).join(',')
  );
  const csv = [headers.join(','), ...csvRows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sales-business-report-${toDateInput(new Date())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const SalesBusinessReport = forwardRef(function SalesBusinessReport({
  onViewSkuPerformance,
  sharedStartDate,
  sharedEndDate,
  sharedSalesChannel,
}, ref) {
  const { fromOriginal } = useCurrency();
  const [appliedFilters, setAppliedFilters] = useState(() =>
    defaultReportFilters({
      startDate: sharedStartDate,
      endDate: sharedEndDate,
      salesChannel: sharedSalesChannel,
    })
  );
  const [channels, setChannels] = useState([]);
  const [reportRows, setReportRows] = useState([]);
  const [periodTotals, setPeriodTotals] = useState(null);
  const [orderCount, setOrderCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedRows, setSelectedRows] = useState({});
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    salesChannelsAPI.getAll({ isActive: 'true' }).then((res) => {
      setChannels(res.data || []);
    }).catch(() => setChannels([]));
  }, []);

  // Keep in sync when parent period bar changes shared date or channel
  useEffect(() => {
    if (!sharedStartDate || !sharedEndDate) return;
    setAppliedFilters((prev) => {
      if (
        prev.customStart === sharedStartDate &&
        prev.customEnd === sharedEndDate &&
        prev.salesChannel === (sharedSalesChannel || '')
      ) {
        return prev;
      }
      return {
        ...prev,
        customStart: sharedStartDate,
        customEnd: sharedEndDate,
        salesChannel: sharedSalesChannel || '',
      };
    });
  }, [sharedStartDate, sharedEndDate, sharedSalesChannel]);

  const reportCurrency = useMemo(
    () => getCurrencyForSalesChannelId(appliedFilters.salesChannel, channels),
    [appliedFilters.salesChannel, channels]
  );

  const resolveCellInr = useCallback(
    (row, col) => {
      const inrKey = CURRENCY_INR_KEYS[col.key];
      if (inrKey && row[inrKey] != null) return row[inrKey];
      if (col.type === 'currency') {
        return fromOriginal(row[col.key], reportCurrency, 'INR');
      }
      return null;
    },
    [fromOriginal, reportCurrency]
  );

  const loadReport = useCallback(async () => {
    if (!appliedFilters.customStart || !appliedFilters.customEnd) return;

    try {
      setLoading(true);
      const response = await reportsAPI.getSalesBusinessReport(buildReportParams(appliedFilters));
      setReportRows(response.data?.rows || []);
      setPeriodTotals(response.data?.periodTotals || null);
      setOrderCount(response.data?.orderCount || 0);
      setSelectedRows({});
    } catch (error) {
      console.error('Error fetching sales business report:', error);
      setReportRows([]);
      setPeriodTotals(null);
      setOrderCount(0);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleGroupByChange = (groupBy) => {
    setAppliedFilters((prev) => ({ ...prev, groupBy }));
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('desc');
  };

  const sortedRows = useMemo(
    () => sortReportRows(reportRows, sortKey, sortDir),
    [reportRows, sortKey, sortDir]
  );

  useImperativeHandle(ref, () => ({
    getExportParams: () => buildReportParams(appliedFilters),
    hasData: () => sortedRows.length > 0,
    downloadCsv: () => downloadBusinessReportCsv(sortedRows),
    refresh: () => loadReport(),
  }), [appliedFilters, sortedRows, loadReport]);

  const allSelected = sortedRows.length > 0 && sortedRows.every((row) => selectedRows[row.periodKey]);
  const showDataNotice = isToday(appliedFilters.customEnd);

  const toggleAllRows = () => {
    if (allSelected) {
      setSelectedRows({});
      return;
    }
    const next = {};
    sortedRows.forEach((row) => {
      next[row.periodKey] = true;
    });
    setSelectedRows(next);
  };

  const toggleRow = (periodKey) => {
    setSelectedRows((prev) => ({
      ...prev,
      [periodKey]: !prev[periodKey],
    }));
  };

  return (
    <div className="sales-business-report">
      <section className="sales-br-controls">
        <div className="sales-br-controls-row sales-br-controls-main">
          <div className="sales-br-group-toggle">
            {GROUP_BY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={appliedFilters.groupBy === opt.id ? 'active' : ''}
                onClick={() => handleGroupByChange(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {showDataNotice && (
            <div className="sales-br-info-banner" role="status">
              <span className="sales-br-info-icon" aria-hidden="true">i</span>
              Data from {formatDisplayDate(appliedFilters.customEnd)} may not be fully available yet
            </div>
          )}
        </div>
      </section>

      <section className="sales-br-actions">
        {typeof onViewSkuPerformance === 'function' && (
          <button type="button" className="sales-br-link-btn" onClick={onViewSkuPerformance}>
            View SKU performance
          </button>
        )}
      </section>

      {!loading && periodTotals && (
        <div className="sales-period-match-kpis">
          <div className="sales-period-match-kpi">
            <span className="sales-period-match-label">Ordered Product Sales</span>
            <strong>
              <DualKpiValue amountInInr={periodTotals.orderedProductSalesInr} loading={false} />
            </strong>
          </div>
          <div className="sales-period-match-kpi">
            <span className="sales-period-match-label">Units Ordered</span>
            <strong>{Number(periodTotals.unitsOrdered || 0).toLocaleString()}</strong>
          </div>
          <div className="sales-period-match-kpi">
            <span className="sales-period-match-label">Order Items (Excel rows)</span>
            <strong>{Number(periodTotals.totalOrderItems || 0).toLocaleString()}</strong>
          </div>
          <div className="sales-period-match-kpi">
            <span className="sales-period-match-label">Unique Orders</span>
            <strong>{Number(orderCount || 0).toLocaleString()}</strong>
          </div>
        </div>
      )}

      <p className="sales-br-compare-hint">
        Period totals above match By Sale for the same dates/channel. Table rows are that period split by{' '}
        {appliedFilters.groupBy === 'month' ? 'month' : appliedFilters.groupBy === 'week' ? 'week' : 'day'}.
      </p>

      <section className="sales-br-table-section">
        {loading ? (
          <div className="sales-dash-loading">Loading sales data…</div>
        ) : sortedRows.length === 0 ? (
          <div className="sales-dash-empty">No sales data for the selected filters.</div>
        ) : (
          <div className="sales-br-table-wrap">
            <table className="sales-br-table">
              <thead>
                <tr>
                  <th className="sales-br-check-col">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAllRows}
                      aria-label="Select all rows"
                    />
                  </th>
                  {REPORT_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={col.highlight ? `sales-br-highlight-${col.highlight}` : ''}
                    >
                      <button
                        type="button"
                        className="sales-br-sort-btn"
                        onClick={() => handleSort(col.key)}
                      >
                        <span>{col.label}</span>
                        <span className="sales-br-sort-icons" aria-hidden="true">
                          <span className={sortKey === col.key && sortDir === 'asc' ? 'active' : ''}>▲</span>
                          <span className={sortKey === col.key && sortDir === 'desc' ? 'active' : ''}>▼</span>
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.periodKey}>
                    <td className="sales-br-check-col">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedRows[row.periodKey])}
                        onChange={() => toggleRow(row.periodKey)}
                        aria-label={`Select ${row.date}`}
                      />
                    </td>
                    {REPORT_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={[
                          col.highlight ? `sales-br-highlight-${col.highlight}` : '',
                          col.type === 'currency' || col.type === 'number' || col.type === 'percent' ? 'num' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {formatCellValue(
                          row[col.key],
                          col.type,
                          reportCurrency,
                          resolveCellInr(row, col)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
});

export default SalesBusinessReport;
