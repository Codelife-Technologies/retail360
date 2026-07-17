import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { reportsAPI, salesAPI, salesChannelsAPI, productsAPI, pricesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  formatMoney,
  formatSaleMoney,
  getCurrencyForSalesChannelId,
} from '../utils/locationCurrency';
import { getCatalogSku, getProductDisplayName, getProductThumbnail, PRODUCT_IMAGE_PLACEHOLDER } from '../utils/productDisplayUtils';
import SalesMonthlyTrendCharts from './SalesMonthlyTrendCharts';
import SaleDetailsModal from './SaleDetailsModal';
import ProductDetailsModal from './ProductDetailsModal';
import ExcelUpload from './ExcelUpload';
import './SalesSkuReport.css';

const SalesBusinessReport = lazy(() => import('./SalesBusinessReport'));

const defaultFilters = () => ({
  startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
  endDate: new Date().toISOString().split('T')[0],
  salesChannel: '',
  paymentStatus: '',
  orderStatus: '',
  search: '',
  view: 'business',
  sortBy: 'salesDate',
  sortDir: 'desc',
});

function resolveDateRange(start, end) {
  if (!start) return null;
  if (!end) return { startDate: start, endDate: start };
  if (start > end) return null;
  return { startDate: start, endDate: end };
}

function formatDateLabel(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function buildOrderQueryParams(appliedFilters) {
  const dateRange = resolveDateRange(appliedFilters.startDate, appliedFilters.endDate);
  const params = {
    salesChannel: appliedFilters.salesChannel || undefined,
    paymentStatus: appliedFilters.paymentStatus || undefined,
    orderStatus: appliedFilters.orderStatus || undefined,
    sortBy: appliedFilters.sortBy || 'salesDate',
    sortDir: appliedFilters.sortDir || 'desc',
  };
  if (dateRange) {
    params.startDate = dateRange.startDate;
    params.endDate = dateRange.endDate;
  }
  return params;
}

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

function truncateWords(text, maxWords = 5) {
  if (!text) return '';
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return String(text).trim();
  return `${words.slice(0, maxWords).join(' ')}…`;
}

function ProductSkuSummary({ product, compact = false, onClick, maxNameWords }) {
  const displayName = getProductDisplayName(product) || product?.productName || 'Unknown Product';
  const visibleName = maxNameWords ? truncateWords(displayName, maxNameWords) : displayName;
  const isTruncated = visibleName !== displayName;
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
      title={clickable ? (isTruncated ? displayName : 'View product details') : (isTruncated ? displayName : undefined)}
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
        <span className="product-sku-summary-name" title={isTruncated ? displayName : undefined}>
          {visibleName}
        </span>
        <span className="product-sku-summary-sku mono">{sku}</span>
      </div>
    </div>
  );
}

function ProductExtremeCarousel({ label, products, variant, onOpenProduct, formatCurrency }) {
  const [index, setIndex] = useState(0);
  const money = formatCurrency || ((amount) => formatMoney(amount, 'INR'));

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
          <ProductSkuSummary product={product} compact />
          <span className="product-extreme-stats">
            {product.totalQuantity} units · {money(product.totalRevenue)}
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
  const { hasPermission } = useAuth();
  const isAdmin = hasPermission('admin.all');
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
  const [deletingAllSales, setDeletingAllSales] = useState(false);
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [viewingSale, setViewingSale] = useState(null);
  const [viewingSaleLoading, setViewingSaleLoading] = useState(false);
  const [viewingProduct, setViewingProduct] = useState(null);
  const [viewingProductPrice, setViewingProductPrice] = useState(null);
  const [productDetailLoading, setProductDetailLoading] = useState(false);
  const businessReportRef = useRef(null);

  const isBusinessView = appliedFilters.view === 'business';
  const isSkuView = appliedFilters.view === 'sku';
  const isOrdersView = appliedFilters.view === 'orders';
  const sortOptions = isSkuView ? SKU_SORT_OPTIONS : ORDER_SORT_OPTIONS;
  const activeFilterCount = countActiveAppliedFilters(appliedFilters);
  const appliedDateRange = resolveDateRange(appliedFilters.startDate, appliedFilters.endDate);

  const reportCurrency = useMemo(
    () => getCurrencyForSalesChannelId(appliedFilters.salesChannel, salesChannels),
    [appliedFilters.salesChannel, salesChannels]
  );
  const formatReportMoney = useCallback(
    (amount) => formatMoney(amount, reportCurrency),
    [reportCurrency]
  );

  useEffect(() => {
    salesChannelsAPI.getAll({ isActive: 'true' }).then((res) => {
      setSalesChannels(res.data || []);
    }).catch(console.error);
  }, []);

  const fetchReport = useCallback(async () => {
    if (appliedFilters.view === 'business') {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const params = { ...appliedFilters };
      if (!params.search) delete params.search;

      const trendParams = { ...params };
      delete trendParams.view;
      delete trendParams.sortBy;
      delete trendParams.sortDir;
      delete trendParams.search;

      if (appliedFilters.view === 'sku') {
        const [response, trendRes] = await Promise.all([
          reportsAPI.getSalesBySku(params),
          reportsAPI.getSalesSummary({ ...trendParams, groupBy: 'month' }),
        ]);
        setSummary(response.data.summary);
        setSkuRows(response.data.rows || []);
        setOrderRows([]);
        setMonthlyTrend(trendRes.data?.groupedData || []);
      } else {
        const dateRange = resolveDateRange(appliedFilters.startDate, appliedFilters.endDate);
        if (!dateRange) {
          setSkuRows([]);
          setOrderRows([]);
          setMonthlyTrend([]);
          setSummary(null);
          setLoading(false);
          return;
        }

        const orderParams = buildOrderQueryParams(appliedFilters);
        const orderTrendParams = {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          salesChannel: appliedFilters.salesChannel || undefined,
          paymentStatus: appliedFilters.paymentStatus || undefined,
          orderStatus: appliedFilters.orderStatus || undefined,
        };
        const skuParams = { ...orderTrendParams, sortBy: 'quantity', sortDir: 'desc' };

        const [ordersRes, trendRes, skuRes] = await Promise.all([
          reportsAPI.getSalesDetailed(orderParams),
          reportsAPI.getSalesSummary({ ...orderTrendParams, groupBy: 'month' }),
          reportsAPI.getSalesBySku(skuParams),
        ]);
        const orders = Array.isArray(ordersRes.data) ? ordersRes.data : ordersRes.data?.data || [];
        const skuSummary = skuRes.data?.summary || {};

        setOrderRows(orders);
        setSkuRows([]);
        setMonthlyTrend(trendRes.data?.groupedData || []);
        setSummary({
          totalSkus: skuSummary.totalSkus ?? null,
          totalSales: orders.length,
          totalQuantitySold:
            skuSummary.totalQuantitySold ??
            orders.reduce(
              (sum, sale) =>
                sum + (sale.items || []).reduce((itemSum, item) => itemSum + (item.quantity || 0), 0),
              0
            ),
          totalRevenue:
            skuSummary.totalRevenue ??
            Math.round(orders.reduce((sum, sale) => sum + (sale.total || 0), 0) * 100) / 100,
          totalOrders: skuSummary.totalOrders ?? orders.length,
          lineItemRevenue: skuSummary.lineItemRevenue,
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

  const handleApplyFilters = () => {
    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
      alert('Start date must be on or before end date.');
      return;
    }
    if ((filters.view === 'orders' || filters.view === 'sku') && !filters.startDate) {
      alert('Select a start date for the sales report.');
      return;
    }
    setAppliedFilters({ ...filters });
  };

  const handleViewChange = (view) => {
    const sortBy = view === 'sku' ? 'revenue' : view === 'orders' ? 'salesDate' : undefined;
    setFilters((prev) => ({
      ...prev,
      view,
      ...(sortBy ? { sortBy, sortDir: 'desc' } : {}),
    }));
    setAppliedFilters((prev) => ({
      ...prev,
      view,
      ...(sortBy ? { sortBy, sortDir: 'desc' } : {}),
    }));
  };

  const handleExport = async () => {
    const hasData = isSkuView ? skuRows.length > 0 : orderRows.length > 0;
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
        const orderParams = buildOrderQueryParams(appliedFilters);
        response = await reportsAPI.exportSalesDetailed(orderParams);
        filename = `sales_report_by_sale_${orderParams.endDate || appliedFilters.endDate}.xlsx`;
      }

      downloadBlob(response.data, filename);
    } catch (error) {
      console.error('Error exporting sales report:', error);
      alert(error.response?.data?.error || 'Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  const downloadBlob = (blobData, filename) => {
    const url = window.URL.createObjectURL(new Blob([blobData]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadReport = async () => {
    if (isBusinessView) {
      if (!businessReportRef.current?.hasData?.()) {
        alert('No data to download for the selected filters');
        return;
      }
      try {
        setExporting(true);
        const params = businessReportRef.current.getExportParams();
        const response = await reportsAPI.exportSalesBusinessReport(params);
        downloadBlob(response.data, `sales_business_report_${params.startDate}_${params.endDate}.xlsx`);
      } catch (error) {
        console.error('Error downloading business report:', error);
        alert(error.response?.data?.error || 'Failed to download report');
      } finally {
        setExporting(false);
      }
      return;
    }
    await handleExport();
  };

  const handleDownloadCsv = () => {
    if (!businessReportRef.current?.hasData?.()) {
      alert('No data to download for the selected filters');
      return;
    }
    businessReportRef.current.downloadCsv();
  };

  const handleDeleteAllSales = async () => {
    const confirmed = window.confirm(
      'Delete ALL sales data?\n\nThis will permanently remove every sales record in the database (not just the current filter). Stock quantities will be restored for each deleted sale.'
    );
    if (!confirmed) return;

    const doubleConfirm = window.confirm(
      'This cannot be undone. Click OK to permanently delete all sales data.'
    );
    if (!doubleConfirm) return;

    try {
      setDeletingAllSales(true);
      const response = await salesAPI.deleteAll();
      alert(`Deleted ${response.data.deletedCount} sales record(s).`);
      fetchReport();
    } catch (error) {
      console.error('Error deleting all sales:', error);
      alert(error.response?.data?.error || 'Failed to delete all sales');
    } finally {
      setDeletingAllSales(false);
    }
  };

  const handleExcelUploadComplete = (result) => {
    fetchReport();
    if (businessReportRef.current?.refresh) {
      businessReportRef.current.refresh();
    }

    const imported = result?.imported || 0;
    const updated = result?.updated || 0;
    const failed = result?.failed || 0;
    const lineItemsSkipped = result?.lineItemsSkipped || 0;
    const productsCreated = result?.productsCreated || 0;
    const notUploaded = failed + (result?.skipped || 0);

    if (lineItemsSkipped > 0 || productsCreated > 0) {
      const parts = [];
      if (productsCreated > 0) {
        parts.push(`${productsCreated} new product(s) were auto-created from missing SKUs`);
      }
      if (lineItemsSkipped > 0) {
        parts.push(`${lineItemsSkipped} line item(s) were skipped — check the import summary for details`);
      }
      parts.push('If totals still look low, widen the Sales Report date filter to include your import dates');
      alert(parts.join('. ') + '.');
    }

    if (notUploaded === 0 && (imported > 0 || updated > 0)) {
      setShowExcelUpload(false);
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

  const hasSkuRows = skuRows.length > 0;
  const hasOrderRows = orderRows.length > 0;
  const canExport = isSkuView ? hasSkuRows : hasOrderRows;

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

  const getSaleQuantityOrdered = (sale) =>
    (sale.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);

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

  const renderOrdersTable = () => {
    if (!isOrdersView) return null;

    return (
      <div className="sales-report-aligned sales-report-detail-block">
        {appliedDateRange && (
          <p className="sales-sku-period-hint">
            Showing sales from{' '}
            <strong>{formatDateLabel(appliedDateRange.startDate)}</strong>
            {' '}to{' '}
            <strong>{formatDateLabel(appliedDateRange.endDate)}</strong>
          </p>
        )}
        {loading ? (
          <div className="sales-sku-loading">Loading sales…</div>
        ) : !hasOrderRows ? (
          <div className="sales-sku-empty">
            No sales found for the selected date range.
          </div>
        ) : (
          <>
            <h3 className="sales-detail-heading">Sales Detail</h3>
            <div className="sales-sku-table-wrap">
            <table className="sales-sku-table sales-detail-table">
              <colgroup>
                <col className="sales-by-sale-col-sku" />
                <col className="sales-by-sale-col-order" />
                <col className="sales-by-sale-col-date" />
                <col className="sales-by-sale-col-channel" />
                <col className="sales-by-sale-col-num" />
                <col className="sales-by-sale-col-num" />
                <col className="sales-by-sale-col-money" />
              </colgroup>
              <thead>
                <tr>
                  <th className="sales-by-sale-col-sku">Product SKU</th>
                  <th className="sales-by-sale-col-order">Amazon Order ID</th>
                  <th className="sales-by-sale-col-date">Sale Date</th>
                  <th className="sales-by-sale-col-channel">Channel</th>
                  <th className="sales-by-sale-col-num">Items</th>
                  <th className="sales-by-sale-col-num">Qty</th>
                  <th className="sales-by-sale-col-money">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {orderRows.map((sale) => {
                  const itemCount = sale.items?.length || 0;
                  const qtyOrdered = getSaleQuantityOrdered(sale);
                  return (
                    <tr
                      key={sale._id}
                      className="sales-detail-row"
                      onClick={() => openSaleDetail(sale)}
                    >
                      <td className="mono sales-by-sale-col-sku">{getSaleProductSkus(sale)}</td>
                      <td className="mono sales-by-sale-col-order">{sale.amazonOrderId || '—'}</td>
                      <td className="sales-by-sale-col-date">
                        {new Date(sale.salesDate).toLocaleDateString('en-IN')}
                      </td>
                      <td className="sales-by-sale-col-channel">{sale.salesChannel?.name || '—'}</td>
                      <td className="num sales-by-sale-col-num">{itemCount}</td>
                      <td className="num sales-by-sale-col-num">{qtyOrdered}</td>
                      <td className="num sales-by-sale-col-money">
                        {formatSaleMoney(sale, sale.subtotal, reportCurrency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="sales-sku-report">
      <div className="sales-sku-report-header">
        <div>
          <h2>Sales</h2>
          <p className="sales-sku-report-subtitle">
            {isBusinessView
              ? 'Ordered product sales by day, week, or month'
              : isSkuView
              ? 'SKU performance for the selected date range'
              : 'Sales orders for the selected date range — click a row for details'}
          </p>
        </div>
        <div className="sales-sku-report-header-actions">
          <button
            type="button"
            className="btn-export"
            disabled={exporting || (!isBusinessView && !canExport)}
            onClick={handleDownloadReport}
            title={
              isBusinessView
                ? 'Download business report as Excel'
                : isSkuView
                  ? 'Download Excel with By SKU sheet'
                  : 'Download Excel with sales orders for selected dates'
            }
          >
            {exporting ? 'Downloading…' : 'Download Report'}
          </button>
          {isBusinessView && (
            <button
              type="button"
              className="btn-export-outline"
              disabled={exporting}
              onClick={handleDownloadCsv}
              title="Download business report as CSV"
            >
              Download CSV
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowExcelUpload(true)}
            title="Import sales from Excel template"
          >
            ⬆ Import Excel
          </button>
          {!isBusinessView && (
            <>
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
          {isAdmin && (
            <button
              type="button"
              className="btn-danger-outline"
              disabled={deletingAllSales}
              onClick={handleDeleteAllSales}
              title="Permanently delete all sales records (admin only)"
            >
              {deletingAllSales ? 'Deleting…' : '🗑 Delete All Sales'}
            </button>
          )}
            </>
          )}
          {onClose && (
            <button type="button" className="btn-close-report" onClick={onClose}>
              ×
            </button>
          )}
        </div>
      </div>

      <div className="sales-sku-report-body">
      <div className="sales-sku-view-toggle">
        <button
          type="button"
          className={filters.view === 'business' ? 'active' : ''}
          onClick={() => handleViewChange('business')}
        >
          Business Report
        </button>
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

      {isBusinessView ? (
        <Suspense fallback={<div className="sales-sku-loading">Loading business report…</div>}>
          <SalesBusinessReport
            ref={businessReportRef}
            onViewSkuPerformance={() => handleViewChange('sku')}
          />
        </Suspense>
      ) : (
        <>
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
                if (e.key === 'Enter') handleApplyFilters();
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
          <button type="button" className="btn-primary" onClick={handleApplyFilters}>
            Apply
          </button>
        </div>
        </div>
      </div>
      )}

      {appliedFilters.sortBy && isSkuView && (
        <p className="sales-sku-sort-hint">
          Sorted by <strong>{sortOptions.find((o) => o.value === appliedFilters.sortBy)?.label}</strong>
          {' '}({sortDirLabel()})
        </p>
      )}

      <div className="sales-report-overview sales-report-aligned">
        {summary && (summary.topSellingProducts?.length > 0 || summary.leastSellingProducts?.length > 0) && (
          <div className="sales-product-extremes">
            <ProductExtremeCarousel
              label="Top Selling Product"
              products={summary.topSellingProducts}
              variant="top"
              onOpenProduct={handleOpenProductDetail}
              formatCurrency={formatReportMoney}
            />
            <ProductExtremeCarousel
              label="Least Selling Product"
              products={summary.leastSellingProducts}
              variant="least"
              onOpenProduct={handleOpenProductDetail}
              formatCurrency={formatReportMoney}
            />
          </div>
        )}

        <SalesMonthlyTrendCharts groupedData={monthlyTrend} formatCurrency={formatReportMoney} />
      </div>

      {isSkuView && loading ? (
        <div className="sales-sku-loading">Loading report…</div>
      ) : (
        isSkuView && hasSkuRows && (
          <div className="sales-report-aligned sales-report-detail-block">
            <h3 className="sales-detail-heading">By SKU</h3>
            <div className="sales-sku-table-wrap">
              <table className="sales-sku-table sales-by-sku-table">
                <colgroup>
                  <col className="sku-col-product" />
                  <col className="sku-col-category" />
                  <col className="sku-col-subcategory" />
                  <col className="sku-col-hsn" />
                  <col className="sku-col-qty" />
                  <col className="sku-col-price" />
                  <col className="sku-col-revenue" />
                  <col className="sku-col-orders" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="sku-col-product">Product</th>
                    <th className="sku-col-category">Category</th>
                    <th className="sku-col-subcategory">Sub Category</th>
                    <th className="sku-col-hsn">HSN</th>
                    <th className="sku-col-qty num">Qty Sold</th>
                    <th className="sku-col-price num">Avg Price</th>
                    <th className="sku-col-revenue num">Line Revenue</th>
                    <th className="sku-col-orders num">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {skuRows.map((row) => (
                    <tr key={row.productId || row.sku}>
                      <td className="product-sku-summary-cell sku-col-product">
                        <ProductSkuSummary
                          product={row}
                          compact
                          maxNameWords={5}
                          onClick={handleOpenProductDetail}
                        />
                      </td>
                      <td className="sku-col-category">{row.category}</td>
                      <td className="sku-col-subcategory">{row.subCategory}</td>
                      <td className="sku-col-hsn">{row.hsnCode}</td>
                      <td className="num sku-col-qty">{row.totalQuantity}</td>
                      <td className="num sku-col-price">{formatReportMoney(row.averageUnitPrice)}</td>
                      <td className="num sku-col-revenue">{formatReportMoney(row.totalRevenue)}</td>
                      <td className="num sku-col-orders">{row.orderCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {renderOrdersTable()}

        </>
      )}

      </div>

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
          mandatoryFieldsHelp={[
            'Sale Reference * (or Amazon Order ID) — same value groups rows into one sale',
            'Channel Code *',
            'Location Code *',
            'SKU *',
            'Quantity *',
            'Unit Price *',
          ]}
        />
      )}
    </div>
  );
}

export default SalesSkuReport;
