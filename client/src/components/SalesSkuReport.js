import React, { useState, useEffect, useCallback } from 'react';
import { reportsAPI, salesChannelsAPI, salesLocationsAPI } from '../services/api';
import { formatMoney } from '../utils/locationCurrency';
import './SalesSkuReport.css';

const formatAed = (amount) => formatMoney(amount, 'AED');
const defaultFilters = () => ({
  startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
  endDate: new Date().toISOString().split('T')[0],
  salesChannel: '',
  salesLocation: '',
  paymentStatus: '',
  orderStatus: '',
  search: '',
  view: 'orders',
  sortBy: 'salesDate',
  sortDir: 'desc',
});

const SKU_SORT_OPTIONS = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'quantity', label: 'Quantity Sold' },
  { value: 'sku', label: 'SKU' },
  { value: 'productName', label: 'Product Name' },
];

const ORDER_SORT_OPTIONS = [
  { value: 'salesDate', label: 'Sale Date' },
  { value: 'channel', label: 'Channel' },
  { value: 'total', label: 'Order Total' },
  { value: 'amazonOrderId', label: 'Amazon Order ID' },
];

function SalesSkuReport({ onClose }) {
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [salesChannels, setSalesChannels] = useState([]);
  const [salesLocations, setSalesLocations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [skuRows, setSkuRows] = useState([]);
  const [orderRows, setOrderRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const isSkuView = appliedFilters.view === 'sku';
  const sortOptions = isSkuView ? SKU_SORT_OPTIONS : ORDER_SORT_OPTIONS;

  useEffect(() => {
    salesChannelsAPI.getAll({ isActive: 'true' }).then((res) => {
      setSalesChannels(res.data || []);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (filters.salesChannel) {
      salesLocationsAPI.getByChannel(filters.salesChannel).then((res) => {
        setSalesLocations(res.data || []);
      }).catch(console.error);
    } else {
      setSalesLocations([]);
    }
  }, [filters.salesChannel]);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const params = { ...appliedFilters };
      if (!params.search) delete params.search;

      if (appliedFilters.view === 'sku') {
        const response = await reportsAPI.getSalesBySku(params);
        setSummary(response.data.summary);
        setSkuRows(response.data.rows || []);
        setOrderRows([]);
      } else {
        const response = await reportsAPI.getSalesDetailed(params);
        const orders = Array.isArray(response.data) ? response.data : response.data?.data || [];
        setOrderRows(orders);
        setSkuRows([]);
        setSummary({
          totalSkus: null,
          totalSales: orders.length,
          totalQuantitySold: orders.reduce(
            (sum, sale) =>
              sum + (sale.items || []).reduce((itemSum, item) => itemSum + (item.quantity || 0), 0),
            0
          ),
          totalRevenue: Math.round(orders.reduce((sum, sale) => sum + (sale.total || 0), 0) * 100) / 100,
          totalOrders: orders.length,
        });
      }
    } catch (error) {
      console.error('Error fetching sales report:', error);
      alert(error.response?.data?.error || 'Failed to load sales report');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'salesChannel' ? { salesLocation: '' } : {}),
    }));
  };

  const handleViewChange = (view) => {
    setFilters((prev) => ({
      ...prev,
      view,
      sortBy: view === 'sku' ? 'revenue' : 'salesDate',
      sortDir: 'desc',
    }));
    setAppliedFilters((prev) => ({
      ...prev,
      view,
      sortBy: view === 'sku' ? 'revenue' : 'salesDate',
      sortDir: 'desc',
    }));
  };

  const handleExport = async () => {
    if (!isSkuView) {
      alert('Excel export is available for the By SKU view');
      return;
    }
    try {
      setExporting(true);
      const params = { ...appliedFilters };
      if (!params.search) delete params.search;
      const response = await reportsAPI.exportSalesBySku(params);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `sales_by_sku_${appliedFilters.endDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting sales report:', error);
      alert('Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  const sortDirLabel = (sortBy = appliedFilters.sortBy, sortDir = appliedFilters.sortDir) => {
    if (sortBy === 'salesDate') {
      return sortDir === 'desc' ? 'Newest first' : 'Oldest first';
    }
    if (sortBy === 'channel') {
      return sortDir === 'asc' ? 'A → Z' : 'Z → A';
    }
    return sortDir === 'desc' ? 'High to low' : 'Low to high';
  };

  const hasRows = isSkuView ? skuRows.length > 0 : orderRows.length > 0;

  return (
    <div className="sales-sku-report">
      <div className="sales-sku-report-header">
        <div>
          <h2>Sales Report</h2>
          <p className="sales-sku-report-subtitle">
            {isSkuView
              ? 'Aggregated sales data for every SKU in the selected period'
              : 'Individual sales sorted by date, channel, or order total'}
          </p>
        </div>
        <div className="sales-sku-report-header-actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={exporting || !isSkuView || skuRows.length === 0}
            onClick={handleExport}
          >
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
          {onClose && (
            <button type="button" className="btn-close-report" onClick={onClose}>
              ×
            </button>
          )}
        </div>
      </div>

      <div className="sales-sku-view-toggle">
        <button
          type="button"
          className={filters.view === 'orders' ? 'active' : ''}
          onClick={() => handleViewChange('orders')}
        >
          By Sale
        </button>
        <button
          type="button"
          className={filters.view === 'sku' ? 'active' : ''}
          onClick={() => handleViewChange('sku')}
        >
          By SKU
        </button>
      </div>

      <div className="sales-sku-filters">
        <div className="filter-group">
          <label>Start Date</label>
          <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
        </div>
        <div className="filter-group">
          <label>End Date</label>
          <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
        </div>
        <div className="filter-group">
          <label>Channel</label>
          <select name="salesChannel" value={filters.salesChannel} onChange={handleFilterChange}>
            <option value="">All Channels</option>
            {salesChannels.map((channel) => (
              <option key={channel._id} value={channel._id}>
                {channel.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Location</label>
          <select
            name="salesLocation"
            value={filters.salesLocation}
            onChange={handleFilterChange}
            disabled={!filters.salesChannel}
          >
            <option value="">All Locations</option>
            {salesLocations.map((location) => (
              <option key={location._id} value={location._id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Payment Status</label>
          <select name="paymentStatus" value={filters.paymentStatus} onChange={handleFilterChange}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Order Status</label>
          <select name="orderStatus" value={filters.orderStatus} onChange={handleFilterChange}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        {isSkuView && (
          <div className="filter-group filter-search">
            <label>Search SKU / Product</label>
            <input
              type="text"
              name="search"
              value={filters.search}
              onChange={handleFilterChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setAppliedFilters({ ...filters });
              }}
              placeholder="Search by SKU or product name"
            />
          </div>
        )}
        <div className="filter-group">
          <label>Sort By</label>
          <select name="sortBy" value={filters.sortBy} onChange={handleFilterChange}>
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Sort Order</label>
          <select name="sortDir" value={filters.sortDir} onChange={handleFilterChange}>
            <option value="desc">
              {filters.sortBy === 'salesDate'
                ? 'Newest first'
                : filters.sortBy === 'channel'
                  ? 'Z → A'
                  : 'Descending'}
            </option>
            <option value="asc">
              {filters.sortBy === 'salesDate'
                ? 'Oldest first'
                : filters.sortBy === 'channel'
                  ? 'A → Z'
                  : 'Ascending'}
            </option>
          </select>
        </div>
        <div className="filter-group filter-apply">
          <label>&nbsp;</label>
          <button type="button" className="btn-primary" onClick={() => setAppliedFilters({ ...filters })}>
            Apply
          </button>
        </div>
      </div>

      {appliedFilters.sortBy && (
        <p className="sales-sku-sort-hint">
          Sorted by <strong>{sortOptions.find((o) => o.value === appliedFilters.sortBy)?.label}</strong>
          {' '}({sortDirLabel()})
        </p>
      )}

      {summary && (
        <div className="sales-sku-summary">
          {isSkuView ? (
            <div className="summary-card">
              <span>SKUs Sold</span>
              <strong>{summary.totalSkus}</strong>
            </div>
          ) : (
            <div className="summary-card">
              <span>Total Sales</span>
              <strong>{summary.totalSales}</strong>
            </div>
          )}
          <div className="summary-card">
            <span>Total Qty Sold</span>
            <strong>{summary.totalQuantitySold}</strong>
          </div>
          <div className="summary-card">
            <span>Total Revenue</span>
            <strong>{formatAed(summary.totalRevenue)}</strong>
          </div>
          {!isSkuView && (
            <div className="summary-card">
              <span>Orders Shown</span>
              <strong>{summary.totalOrders}</strong>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="sales-sku-loading">Loading report…</div>
      ) : !hasRows ? (
        <div className="sales-sku-empty">No sales data found for the selected filters.</div>
      ) : isSkuView ? (
        <div className="sales-sku-table-wrap">
          <table className="sales-sku-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th>Category</th>
                <th>Sub Category</th>
                <th>HSN</th>
                <th>Qty Sold</th>
                <th>Avg Price</th>
                <th>Revenue</th>
                <th>Orders</th>
              </tr>
            </thead>
            <tbody>
              {skuRows.map((row) => (
                <tr key={row.productId || row.sku}>
                  <td className="mono">{row.sku}</td>
                  <td>{row.productName}</td>
                  <td>{row.category}</td>
                  <td>{row.subCategory}</td>
                  <td>{row.hsnCode}</td>
                  <td className="num">{row.totalQuantity}</td>
                  <td className="num">{formatAed(row.averageUnitPrice)}</td>
                  <td className="num">{formatAed(row.totalRevenue)}</td>
                  <td className="num">{row.orderCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="sales-sku-table-wrap">
          <table className="sales-sku-table">
            <thead>
              <tr>
                <th>Amazon Order ID</th>
                <th>Sale Date</th>
                <th>Channel</th>
                <th>Location</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Subtotal</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Order Status</th>
              </tr>
            </thead>
            <tbody>
              {orderRows.map((sale) => (
                <tr key={sale._id}>
                  <td className="mono">{sale.amazonOrderId || '—'}</td>
                  <td>{new Date(sale.salesDate).toLocaleDateString('en-IN')}</td>
                  <td>{sale.salesChannel?.name || '—'}</td>
                  <td>{sale.salesLocation?.name || '—'}</td>
                  <td>{sale.customer?.name || '—'}</td>
                  <td className="num">{sale.items?.length || 0}</td>
                  <td className="num">{formatAed(sale.subtotal)}</td>
                  <td className="num">{formatAed(sale.total)}</td>
                  <td>
                    <span className={`status-badge status-${sale.paymentStatus}`}>
                      {sale.paymentStatus}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge status-${sale.orderStatus}`}>
                      {sale.orderStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default SalesSkuReport;
