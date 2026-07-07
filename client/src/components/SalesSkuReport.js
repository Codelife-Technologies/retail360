import React, { useState, useEffect, useCallback } from 'react';
import { reportsAPI, salesAPI, salesChannelsAPI, productsAPI, pricesAPI } from '../services/api';
import { formatMoney } from '../utils/locationCurrency';
import { getCatalogSku, getProductDisplayName, getProductThumbnail, PRODUCT_IMAGE_PLACEHOLDER } from '../utils/productDisplayUtils';
import SalesMonthlyTrendCharts from './SalesMonthlyTrendCharts';
import SaleDetailsModal from './SaleDetailsModal';
import ProductDetailsModal from './ProductDetailsModal';
import ExcelUpload from './ExcelUpload';
import './SalesSkuReport.css';

const formatAed = (amount) => formatMoney(amount, 'AED');
const defaultFilters = () => ({
  startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
  endDate: new Date().toISOString().split('T')[0],
  salesChannel: '',
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

function countActiveAppliedFilters(applied) {
  const defaults = defaultFilters();
  let count = 0;
  if (applied.salesChannel) count += 1;
  if (applied.paymentStatus) count += 1;
  if (applied.orderStatus) count += 1;
  if (applied.search?.trim()) count += 1;
  if (applied.startDate !== defaults.startDate || applied.endDate !== defaults.endDate) {
    count += 1;
  }
  return count;
}

function ProductSkuSummary({ product, compact = false, onClick }) {
  const displayName = getProductDisplayName(product) || product?.productName || 'Unknown Product';
  const sku = getCatalogSku(product) || product?.sku || '—';
  const thumbnailSrc = getProductThumbnail(product) || PRODUCT_IMAGE_PLACEHOLDER;
  const clickable = typeof onClick === 'function';

  const handleActivate = (event) => {
    event?.stopPropagation?.();
    onClick?.(product);
  };

  const handleKeyDown = (event) => {
    if (!clickable) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleActivate(event);
    }
  };

  return (
    <div
      className={`product-sku-summary${compact ? ' product-sku-summary-compact' : ''}${clickable ? ' product-sku-summary-clickable' : ''}`}
      onClick={clickable ? handleActivate : undefined}
      onKeyDown={clickable ? handleKeyDown : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={clickable ? 'View product details' : undefined}
    >
      <img
        className="product-sku-summary-image"
        src={thumbnailSrc}
        alt={displayName}
        loading="lazy"
        onError={(e) => {
          e.target.onerror = null;
          e.target.src = PRODUCT_IMAGE_PLACEHOLDER;
        }}
      />
      <div className="product-sku-summary-text">
        <span className="product-sku-summary-name">{displayName}</span>
        <span className="product-sku-summary-sku mono">{sku}</span>
      </div>
    </div>
  );
}

function ProductExtremeCarousel({ label, products, variant, onOpenProduct }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [products]);

  if (!products?.length) return null;

  const product = products[index];
  const hasMultiple = products.length > 1;
  const displayLabel = hasMultiple ? label.replace(' Product', ' Products') : label;

  const showPrev = (event) => {
    event.stopPropagation();
    setIndex((current) => (current - 1 + products.length) % products.length);
  };

  const showNext = (event) => {
    event.stopPropagation();
    setIndex((current) => (current + 1) % products.length);
  };

  const showAt = (dotIndex, event) => {
    event.stopPropagation();
    setIndex(dotIndex);
  };

  return (
    <div className={`product-extreme-card product-extreme-${variant}`}>
      <div className="product-extreme-card-header">
        <span className="product-extreme-label">{displayLabel}</span>
        {hasMultiple && (
          <span className="product-extreme-counter">
            {index + 1} of {products.length}
          </span>
        )}
      </div>

      <div className="product-extreme-carousel">
        {hasMultiple && (
          <button
            type="button"
            className="product-extreme-nav product-extreme-nav-prev"
            onClick={showPrev}
            aria-label="Previous product"
          >
            ‹
          </button>
        )}

        <div
          className="product-extreme-slide product-extreme-clickable"
          onClick={() => onOpenProduct(product)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpenProduct(product);
            }
          }}
          role="button"
          tabIndex={0}
          title="View product details"
        >
          <ProductSkuSummary product={product} />
          <span className="product-extreme-stats">
            {product.totalQuantity} units · {formatAed(product.totalRevenue)}
          </span>
        </div>

        {hasMultiple && (
          <button
            type="button"
            className="product-extreme-nav product-extreme-nav-next"
            onClick={showNext}
            aria-label="Next product"
          >
            ›
          </button>
        )}
      </div>

      {hasMultiple && (
        <div className="product-extreme-dots" role="tablist" aria-label={`${label} slides`}>
          {products.map((item, dotIndex) => (
            <button
              key={item.productId || item.sku || dotIndex}
              type="button"
              className={`product-extreme-dot${dotIndex === index ? ' active' : ''}`}
              onClick={(event) => showAt(dotIndex, event)}
              aria-label={`Show product ${dotIndex + 1}`}
              aria-selected={dotIndex === index}
              role="tab"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SalesSkuReport({ onClose }) {
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [salesChannels, setSalesChannels] = useState([]);
  const [summary, setSummary] = useState(null);
  const [skuRows, setSkuRows] = useState([]);
  const [orderRows, setOrderRows] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [viewingSale, setViewingSale] = useState(null);
  const [viewingSaleLoading, setViewingSaleLoading] = useState(false);
  const [viewingProduct, setViewingProduct] = useState(null);
  const [viewingProductPrice, setViewingProductPrice] = useState(null);
  const [productDetailLoading, setProductDetailLoading] = useState(false);

  const isSkuView = appliedFilters.view === 'sku';
  const sortOptions = isSkuView ? SKU_SORT_OPTIONS : ORDER_SORT_OPTIONS;
  const activeFilterCount = countActiveAppliedFilters(appliedFilters);

  useEffect(() => {
    salesChannelsAPI.getAll({ isActive: 'true' }).then((res) => {
      setSalesChannels(res.data || []);
    }).catch(console.error);
  }, []);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const params = { ...appliedFilters };
      if (!params.search) delete params.search;

      const trendParams = { ...params };
      delete trendParams.view;
      delete trendParams.sortBy;
      delete trendParams.sortDir;
      delete trendParams.search;

      const trendPromise = reportsAPI.getSalesSummary({ ...trendParams, groupBy: 'month' });

      const detailParams = { ...params };
      delete detailParams.view;
      delete detailParams.search;
      if (appliedFilters.view === 'sku') {
        detailParams.sortBy = 'salesDate';
        detailParams.sortDir = 'desc';
      }

      const ordersPromise = reportsAPI.getSalesDetailed(detailParams);

      if (appliedFilters.view === 'sku') {
        const [response, trendRes, ordersRes] = await Promise.all([
          reportsAPI.getSalesBySku(params),
          trendPromise,
          ordersPromise,
        ]);
        const orders = Array.isArray(ordersRes.data) ? ordersRes.data : ordersRes.data?.data || [];
        setSummary(response.data.summary);
        setSkuRows(response.data.rows || []);
        setOrderRows(orders);
        setMonthlyTrend(trendRes.data?.groupedData || []);
      } else {
        const skuParams = { ...params, sortBy: 'quantity', sortDir: 'desc' };
        const [response, trendRes, skuRes] = await Promise.all([
          ordersPromise,
          trendPromise,
          reportsAPI.getSalesBySku(skuParams),
        ]);
        const orders = Array.isArray(response.data) ? response.data : response.data?.data || [];
        const skuSummary = skuRes.data?.summary || {};
        setOrderRows(orders);
        setSkuRows([]);
        setMonthlyTrend(trendRes.data?.groupedData || []);
        setSummary({
          totalSkus: skuSummary.totalSkus ?? null,
          totalSales: orders.length,
          totalQuantitySold: orders.reduce(
            (sum, sale) =>
              sum + (sale.items || []).reduce((itemSum, item) => itemSum + (item.quantity || 0), 0),
            0
          ),
          totalRevenue: Math.round(orders.reduce((sum, sale) => sum + (sale.total || 0), 0) * 100) / 100,
          totalOrders: orders.length,
          topSellingProducts: skuSummary.topSellingProducts || [],
          leastSellingProducts: skuSummary.leastSellingProducts || [],
        });
      }
      setViewingSale(null);
      setViewingProduct(null);
      setViewingProductPrice(null);
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

  useEffect(() => {
    setViewingSale(null);
    setViewingSaleLoading(false);
    setViewingProduct(null);
    setViewingProductPrice(null);
  }, [appliedFilters]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: value,
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
    const hasData = isSkuView ? skuRows.length > 0 || orderRows.length > 0 : orderRows.length > 0;
    if (!hasData) {
      alert('No data to export for the selected filters');
      return;
    }
    try {
      setExporting(true);
      const params = { ...appliedFilters };
      delete params.view;
      if (!params.search) delete params.search;

      let response;
      let filename;
      if (isSkuView) {
        response = await reportsAPI.exportSalesBySku(params);
        filename = `sales_report_${appliedFilters.endDate}.xlsx`;
      } else {
        const orderParams = { ...params };
        delete orderParams.sortBy;
        delete orderParams.sortDir;
        response = await reportsAPI.exportSalesDetailed(orderParams);
        filename = `sales_report_by_sale_${appliedFilters.endDate}.xlsx`;
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting sales report:', error);
      alert(error.response?.data?.error || 'Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  const handleExcelUploadComplete = (result) => {
    fetchReport();

    const imported = result?.imported || 0;
    const updated = result?.updated || 0;
    const failed = result?.failed || 0;
    const skipped = result?.skipped || 0;
    const totalRows = result?.totalRows || 0;

    const summary = [
      `Total Excel rows: ${totalRows}`,
      `New sales: ${imported}`,
      `Updated: ${updated}`,
      `Failed: ${failed}`,
      skipped ? `Skipped: ${skipped}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    if (result?.errors?.length > 0 && (failed > 0 || skipped > 0)) {
      const topErrors = result.errors
        .slice(0, 5)
        .map((err) => `• Row ${err.row}: ${err.message}`)
        .join('\n');
      alert(`${summary}\n\nTop issues:\n${topErrors}\n\nSee upload dialog for full details.`);
    } else if (failed > 0 && imported + updated === 0) {
      const firstError = result?.errors?.[0]?.message || 'Check column headers and required fields.';
      alert(`${summary}\n\n${firstError}`);
      return;
    } else if (failed > 0 || updated > 0 || imported > 0) {
      alert(summary);
    }

    if (failed > 0 && imported + updated === 0) {
      return;
    }

    setShowExcelUpload(false);
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

  const hasSkuRows = skuRows.length > 0;
  const hasOrderRows = orderRows.length > 0;
  const canExport = isSkuView ? hasSkuRows || hasOrderRows : hasOrderRows;

  const getProductSku = (item) => {
    const sku = getCatalogSku(item.product) || item.sku;
    return sku || '—';
  };

  const getSaleProductSkus = (sale) => {
    const skus = (sale.items || [])
      .map((item) => getProductSku(item))
      .filter((sku) => sku && sku !== '—');
    return [...new Set(skus)].join(', ') || '—';
  };

  const openSaleDetail = async (sale) => {
    setViewingSale(sale);
    setViewingSaleLoading(true);

    try {
      const response = await salesAPI.getById(sale._id);
      setViewingSale(response.data);
    } catch (error) {
      console.error('Error loading sale details:', error);
      setViewingSale(sale);
    } finally {
      setViewingSaleLoading(false);
    }
  };

  const closeSaleDetail = () => {
    setViewingSale(null);
    setViewingSaleLoading(false);
  };

  const closeProductDetail = () => {
    setViewingProduct(null);
    setViewingProductPrice(null);
  };

  const handleOpenProductDetail = async (product) => {
    const productId = product?.productId;
    if (!productId) return;

    setProductDetailLoading(true);
    setViewingProduct(null);
    setViewingProductPrice(null);

    try {
      const [productRes, pricesRes] = await Promise.all([
        productsAPI.getById(productId),
        pricesAPI.getBulkCurrent([productId], 'AED'),
      ]);
      setViewingProduct(productRes.data);
      const priceRow = (pricesRes.data || []).find(
        (row) => String(row.product?._id || row.product) === String(productId)
      );
      setViewingProductPrice(priceRow || null);
    } catch (error) {
      console.error('Error loading product details:', error);
      alert(error.response?.data?.error || 'Failed to load product details');
      closeProductDetail();
    } finally {
      setProductDetailLoading(false);
    }
  };

  const renderSalesDetailSection = () => {
    if (!hasOrderRows) return null;

    return (
      <div className="sales-detail-section">
        <h3 className="sales-detail-heading">Sales Detail</h3>
        <div className="sales-sku-table-wrap">
          <table className="sales-sku-table sales-detail-table">
            <thead>
              <tr>
                <th>Product SKU</th>
                <th>Amazon Order ID</th>
                <th>Sale Date</th>
                <th>Channel</th>
                <th>Items</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {orderRows.map((sale) => {
                const itemCount = sale.items?.length || 0;
                return (
                  <tr
                    key={sale._id}
                    className="sales-detail-row"
                    onClick={() => openSaleDetail(sale)}
                  >
                    <td className="mono">{getSaleProductSkus(sale)}</td>
                    <td className="mono">{sale.amazonOrderId || '—'}</td>
                    <td>{new Date(sale.salesDate).toLocaleDateString('en-IN')}</td>
                    <td>{sale.salesChannel?.name || '—'}</td>
                    <td className="num">{itemCount}</td>
                    <td className="num">{formatAed(sale.subtotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="sales-sku-report">
      <div className="sales-sku-report-header">
        <div>
          <h2>Sales Report</h2>
          <p className="sales-sku-report-subtitle">
            {isSkuView
              ? 'SKU summary with full sales detail below'
              : 'Sales orders — click a row to open order details'}
          </p>
        </div>
        <div className="sales-sku-report-header-actions">
          <button
            type="button"
            className={`btn-filters${showFilters ? ' active' : ''}`}
            onClick={() => setShowFilters((prev) => !prev)}
          >
            🔍 Filters
            {activeFilterCount > 0 && (
              <span className="filter-count-badge">{activeFilterCount}</span>
            )}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowExcelUpload(true)}
            title="Import sales from Excel template"
          >
            ⬆ Import Excel
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={exporting || !canExport}
            onClick={handleExport}
            title={isSkuView ? 'Download Excel with By SKU and Sales Detail sheets' : 'Download Excel with sales orders'}
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

      {showFilters && (
      <div className="sales-sku-filters">
        <h3 className="sales-sku-filters-title">Filters</h3>
        <div className="sales-sku-filters-grid">
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
      </div>
      )}

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
            {isSkuView && summary.lineItemRevenue != null && summary.lineItemRevenue !== summary.totalRevenue && (
              <span className="summary-card-note">
                Line items: {formatAed(summary.lineItemRevenue)}
              </span>
            )}
          </div>
          {isSkuView ? (
            <div className="summary-card">
              <span>Orders</span>
              <strong>{summary.totalOrders}</strong>
            </div>
          ) : (
            <div className="summary-card">
              <span>Orders Shown</span>
              <strong>{summary.totalOrders}</strong>
            </div>
          )}
        </div>
      )}

      {summary && (summary.topSellingProducts?.length > 0 || summary.leastSellingProducts?.length > 0) && (
        <div className="sales-product-extremes">
          <ProductExtremeCarousel
            label="Top Selling Product"
            products={summary.topSellingProducts}
            variant="top"
            onOpenProduct={handleOpenProductDetail}
          />
          <ProductExtremeCarousel
            label="Least Selling Product"
            products={summary.leastSellingProducts}
            variant="least"
            onOpenProduct={handleOpenProductDetail}
          />
        </div>
      )}

      <SalesMonthlyTrendCharts groupedData={monthlyTrend} formatCurrency={formatAed} />

      {loading ? (
        <div className="sales-sku-loading">Loading report…</div>
      ) : !hasSkuRows && !hasOrderRows ? (
        <div className="sales-sku-empty">No sales data found for the selected filters.</div>
      ) : (
        <>
          {isSkuView && hasSkuRows && (
            <div className="sales-sku-table-wrap">
              <h3 className="sales-detail-heading">By SKU</h3>
              <table className="sales-sku-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Sub Category</th>
                    <th>HSN</th>
                    <th>Qty Sold</th>
                    <th>Avg Price</th>
                    <th>Line Revenue</th>
                    <th>Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {skuRows.map((row) => (
                    <tr key={row.productId || row.sku}>
                      <td className="product-sku-summary-cell">
                        <ProductSkuSummary
                          product={row}
                          compact
                          onClick={handleOpenProductDetail}
                        />
                      </td>
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
          )}

          {renderSalesDetailSection()}
        </>
      )}

      {(viewingSale || viewingSaleLoading) && (
        <SaleDetailsModal
          sale={viewingSale}
          loading={viewingSaleLoading}
          onClose={closeSaleDetail}
        />
      )}

      {productDetailLoading && (
        <div className="modal-overlay sales-product-detail-loading">
          <div className="sales-product-detail-loading-box">
            <p>Loading product details…</p>
          </div>
        </div>
      )}

      {viewingProduct && (
        <ProductDetailsModal
          product={viewingProduct}
          price={viewingProductPrice}
          priceCurrency="AED"
          onClose={closeProductDetail}
        />
      )}

      {showExcelUpload && (
        <ExcelUpload
          moduleName="sales"
          templateEndpoint="/sales/template"
          onUploadComplete={handleExcelUploadComplete}
          onClose={() => setShowExcelUpload(false)}
        />
      )}
    </div>
  );
}

export default SalesSkuReport;
