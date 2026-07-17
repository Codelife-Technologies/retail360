import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { reportsAPI, salesChannelsAPI } from '../services/api';
import { formatMoney } from '../utils/locationCurrency';
import './SalesBusinessReport.css';

const formatAed = (amount) => formatMoney(amount, 'AED');

const GROUP_BY_OPTIONS = [
  { id: 'day', label: 'By Day' },
  { id: 'week', label: 'By Week' },
  { id: 'month', label: 'By Month' },
];

const ZOOM_OPTIONS = [
  { id: '7D', label: '7D', days: 6 },
  { id: '1M', label: '1M', months: 1 },
  { id: '3M', label: '3M', months: 3 },
  { id: '6M', label: '6M', months: 6 },
  { id: '1Y', label: '1Y', years: 1 },
  { id: '2Y', label: '2Y', years: 2 },
];

const REPORT_COLUMNS = [
  { key: 'date', label: 'Date', type: 'text' },
  { key: 'orderedProductSales', label: 'Ordered Product Sales', type: 'currency' },
  { key: 'unitsOrdered', label: 'Units Ordered', type: 'number' },
  { key: 'totalOrderItems', label: 'Total Order Items', type: 'number', highlight: 'teal' },
  { key: 'avgSalesPerOrderItem', label: 'Average Sales per Order Item', type: 'currency' },
  { key: 'avgUnitsPerOrderItem', label: 'Average Units per Order Item', type: 'number' },
  { key: 'avgSellingPrice', label: 'Average Selling Price', type: 'currency' },
];

function toDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getZoomDateRange(zoomId) {
  const option = ZOOM_OPTIONS.find((opt) => opt.id === zoomId);
  if (!option) return null;

  const end = new Date();
  const start = new Date(end);

  if (option.days != null) {
    start.setDate(end.getDate() - option.days);
  } else if (option.months != null) {
    start.setMonth(end.getMonth() - option.months);
  } else if (option.years != null) {
    start.setFullYear(end.getFullYear() - option.years);
  }

  return { start: toDateInput(start), end: toDateInput(end) };
}

function defaultReportFilters() {
  const range = getZoomDateRange('7D');
  return {
    groupBy: 'day',
    zoom: '7D',
    customStart: range.start,
    customEnd: range.end,
    salesChannel: '',
    dashboardView: 'default',
  };
}

function buildReportParams(applied) {
  return {
    period: 'custom',
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

function formatCellValue(value, type) {
  if (value == null || value === '') return '—';
  if (type === 'currency') return formatAed(value);
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

const SalesBusinessReport = forwardRef(function SalesBusinessReport({ onViewSkuPerformance }, ref) {
  const [filters, setFilters] = useState(defaultReportFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultReportFilters);
  const [channels, setChannels] = useState([]);
  const [reportRows, setReportRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRows, setSelectedRows] = useState({});
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    salesChannelsAPI.getAll({ isActive: 'true' }).then((res) => {
      setChannels(res.data || []);
    }).catch(() => setChannels([]));
  }, []);

  const loadReport = useCallback(async () => {
    if (!appliedFilters.customStart || !appliedFilters.customEnd) return;

    try {
      setLoading(true);
      const response = await reportsAPI.getSalesDashboard(buildReportParams(appliedFilters));
      setReportRows(response.data?.businessReport || []);
      setSelectedRows({});
    } catch (error) {
      console.error('Error fetching sales business report:', error);
      setReportRows([]);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const applyFilters = useCallback((next) => {
    setAppliedFilters(next);
    setFilters(next);
  }, []);

  const handleGroupByChange = (groupBy) => {
    applyFilters({ ...appliedFilters, groupBy });
  };

  const handleZoomChange = (zoom) => {
    const range = getZoomDateRange(zoom);
    if (!range) return;
    applyFilters({
      ...appliedFilters,
      zoom,
      customStart: range.start,
      customEnd: range.end,
    });
  };

  const handleDateChange = (field, value) => {
    const next = {
      ...filters,
      [field]: value,
      zoom: 'custom',
    };
    setFilters(next);
    if (next.customStart && next.customEnd) {
      applyFilters(next);
    }
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
        <div className="sales-br-controls-row">
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

          <div className="sales-br-zoom-toggle">
            {ZOOM_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={appliedFilters.zoom === opt.id ? 'active' : ''}
                onClick={() => handleZoomChange(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="sales-br-controls-row sales-br-filters-row">
          <div className="sales-br-filter-block">
            <span className="sales-br-filter-label">Date</span>
            <select className="sales-br-select" value="custom" disabled aria-label="Date preset">
              <option value="custom">Custom</option>
            </select>
            <div className="sales-br-date-range">
              <input
                type="date"
                value={filters.customStart}
                onChange={(e) => handleDateChange('customStart', e.target.value)}
                aria-label="Start date"
              />
              <span className="sales-br-date-sep">to</span>
              <input
                type="date"
                value={filters.customEnd}
                onChange={(e) => handleDateChange('customEnd', e.target.value)}
                aria-label="End date"
              />
            </div>
          </div>

          <div className="sales-br-filter-block">
            <span className="sales-br-filter-label">Dashboard Views</span>
            <select
              className="sales-br-select"
              value={filters.dashboardView}
              onChange={(e) => {
                const next = { ...filters, dashboardView: e.target.value };
                setFilters(next);
                applyFilters(next);
              }}
            >
              <option value="default">Default</option>
            </select>
          </div>

          <div className="sales-br-filter-block">
            <span className="sales-br-filter-label">Channel</span>
            <select
              className="sales-br-select"
              value={filters.salesChannel}
              onChange={(e) => {
                const next = { ...filters, salesChannel: e.target.value };
                setFilters(next);
                applyFilters(next);
              }}
            >
              <option value="">All channels</option>
              {channels.map((ch) => (
                <option key={ch._id} value={ch._id}>{ch.name}</option>
              ))}
            </select>
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
                        {formatCellValue(row[col.key], col.type)}
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
