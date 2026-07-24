import React, { useState, useEffect, useMemo } from 'react';
import { stockAPI, productsAPI, locationsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import logger from '../utils/logger';
import DetailModal from './DetailModal';
import ExcelUpload from './ExcelUpload';
import ProductSearchPicker, { matchProductSearch } from './ProductSearchPicker';
import {
  PRODUCT_IMAGE_PLACEHOLDER,
  getProductThumbnail,
} from '../utils/productDisplayUtils';
import './Stock.css';
import './ProductSearchPicker.css';

function StockProductCell({ product }) {
  const displayName = product?.title || product?.name || 'Unknown';
  const thumbnailSrc = getProductThumbnail(product);

  return (
    <div className="stock-product-cell">
      <img
        className="stock-product-thumbnail"
        src={thumbnailSrc || PRODUCT_IMAGE_PLACEHOLDER}
        alt={displayName}
        loading="lazy"
        onError={(e) => {
          e.target.onerror = null;
          e.target.src = PRODUCT_IMAGE_PLACEHOLDER;
        }}
      />
      <span className="stock-product-title" title={displayName}>
        {displayName}
      </span>
    </div>
  );
}

function getSoldCurrentMonth(record) {
  return record.soldCurrentMonth ?? 0;
}

function aggregateStockByProduct(stockRecords = []) {
  const grouped = new Map();

  for (const record of stockRecords) {
    const productId = String(record.product?._id || record.product || '');
    if (!productId) continue;

    if (!grouped.has(productId)) {
      grouped.set(productId, {
        productId,
        product: record.product,
        totalQuantity: 0,
        totalReserved: 0,
        soldCurrentMonth: 0,
        locationCount: 0,
        lastUpdated: record.lastUpdated,
        records: [],
      });
    }

    const row = grouped.get(productId);
    row.totalQuantity += record.quantity || 0;
    row.totalReserved += record.reservedQuantity || 0;
    row.soldCurrentMonth += getSoldCurrentMonth(record);
    row.locationCount += 1;
    row.records.push(record);
    if (record.lastUpdated && new Date(record.lastUpdated) > new Date(row.lastUpdated || 0)) {
      row.lastUpdated = record.lastUpdated;
    }
  }

  return Array.from(grouped.values()).sort((a, b) =>
    String(a.product?.title || a.product?.name || '').localeCompare(
      String(b.product?.title || b.product?.name || '')
    )
  );
}

function Stock() {
  const { canEditStockProduct } = useAuth();
  const canEdit = canEditStockProduct();
  const currentMonthLabel = new Date().toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
  });
  const [stock, setStock] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('all'); // 'all', 'product'
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustingStock, setAdjustingStock] = useState(null);
  const [adjustQuantity, setAdjustQuantity] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [viewingStock, setViewingStock] = useState(null);
  const [viewingProductStock, setViewingProductStock] = useState(null);
  const [newStockFormData, setNewStockFormData] = useState({
    product: '',
    location: '',
    quantity: 0,
  });
  const [lowStockAlerts, setLowStockAlerts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchStock();
    fetchLowStockAlerts();
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchLocations();
  }, []);

  const fetchStock = async () => {
    try {
      setLoading(true);
      const response = await stockAPI.getAll();
      setStock(response.data);
    } catch (error) {
      logger.error('Error fetching stock', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      alert('Failed to fetch stock');
    } finally {
      setLoading(false);
    }
  };

  const refreshStock = () => {
    fetchStock();
    fetchLowStockAlerts();
  };

  const fetchProducts = async () => {
    try {
      const response = await productsAPI.getAll();
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
    }
  };

  const fetchLocations = async () => {
    try {
      const response = await locationsAPI.getAll({ isActive: 'true' });
      setLocations(response.data);
    } catch (error) {
      console.error('Error fetching locations:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
    }
  };

  const fetchLowStockAlerts = async () => {
    try {
      const response = await stockAPI.getLowStock();
      setLowStockAlerts(response.data);
    } catch (error) {
      console.error('Error fetching low stock alerts:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
    }
  };

  const handleExcelUploadComplete = (result) => {
    refreshStock();

    const imported = result?.imported || 0;
    const updated = result?.updated || 0;
    const failed = result?.failed || 0;
    const notUploaded = failed + (result?.skipped || 0);

    if (notUploaded === 0 && (imported > 0 || updated > 0)) {
      setShowExcelUpload(false);
    }
  };

  const handleAdjustStock = (stockRecord) => {
    setAdjustingStock(stockRecord);
    setAdjustQuantity(stockRecord.quantity);
    setShowAdjustModal(true);
  };

  const handleAddStock = () => {
    setNewStockFormData({
      product: '',
      location: '',
      quantity: 0,
    });
    setShowAddModal(true);
  };

  const handleNewStockInputChange = (e) => {
    const { name, value } = e.target;
    setNewStockFormData((prev) => ({
      ...prev,
      [name]: name === 'quantity' ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSaveNewStock = async () => {
    try {
      // Validate required fields
      if (!newStockFormData.product || !newStockFormData.location) {
        alert('Please select both Product and Location');
        return;
      }

      if (newStockFormData.quantity < 0) {
        alert('Quantity cannot be negative');
        return;
      }

      // Check if stock already exists
      try {
        const existingStock = await stockAPI.getSpecific(
          newStockFormData.product,
          newStockFormData.location
        );
        if (existingStock.data) {
          const confirmUpdate = window.confirm(
            `Stock already exists for this product and location. Current quantity: ${existingStock.data.quantity}. Do you want to update it?`
          );
          if (!confirmUpdate) {
            return;
          }
        }
      } catch (error) {
        // Stock doesn't exist, which is fine - we'll create it
      }

      // Create or update stock
      await stockAPI.create({
        product: newStockFormData.product,
        location: newStockFormData.location,
        quantity: newStockFormData.quantity,
      });

      setShowAddModal(false);
      setNewStockFormData({
        product: '',
        location: '',
        quantity: 0,
      });
      refreshStock();
      alert('Stock added successfully');
    } catch (error) {
      logger.error('Error adding stock', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        formData: newStockFormData
      });
      alert(error.response?.data?.error || 'Failed to add stock');
    }
  };

  const handleDeleteStock = async (id) => {
    if (!window.confirm('Are you sure you want to remove this stock record?')) {
      return;
    }
    try {
      await stockAPI.delete(id);
      refreshStock();
    } catch (error) {
      logger.error('Error deleting stock', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        stockId: id
      });
      alert(error.response?.data?.error || 'Failed to delete stock');
    }
  };

  const getClearStockLabel = () => 'Remove all stock data';

  const handleClearStockData = async () => {
    const label = getClearStockLabel();
    const count = stock.length;
    if (count === 0) {
      alert('No stock records to remove.');
      return;
    }

    const confirmed = window.confirm(
      `${label}?\n\nThis will permanently delete ${count} stock record(s). Products and locations will not be affected.`
    );
    if (!confirmed) return;

    const doubleConfirm = window.confirm(
      'This cannot be undone. Type OK in the next step to proceed.\n\nClick OK to permanently remove the stock data.'
    );
    if (!doubleConfirm) return;

    try {
      const response = await stockAPI.deleteAll({});
      alert(`Removed ${response.data.deletedCount} stock record(s).`);
      refreshStock();
    } catch (error) {
      logger.error('Error clearing stock data', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      alert(error.response?.data?.error || 'Failed to remove stock data');
    }
  };

  const handleSaveAdjustment = async () => {
    try {
      await stockAPI.update(adjustingStock._id, {
        quantity: adjustQuantity,
      });
      setShowAdjustModal(false);
      setAdjustingStock(null);
      refreshStock();
    } catch (error) {
      logger.error('Error updating stock', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        stockId: adjustingStock?._id,
        adjustQuantity: adjustQuantity
      });
      alert('Failed to update stock');
    }
  };

  const isProductView = viewMode === 'product';

  const filteredLocationStock = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return stock;

    return stock.filter((record) => {
      const product = record.product;
      const location = record.location;
      const locTerm = term.toLowerCase();
      return (
        matchProductSearch(product, term) ||
        (location?.name && location.name.toLowerCase().includes(locTerm)) ||
        (location?.code && location.code.toLowerCase().includes(locTerm))
      );
    });
  }, [stock, searchTerm]);

  const productStockRows = useMemo(() => {
    const aggregated = aggregateStockByProduct(stock);
    const term = searchTerm.trim();
    if (!term) return aggregated;

    return aggregated.filter((row) => matchProductSearch(row.product, term));
  }, [stock, searchTerm]);

  const displayRows = isProductView ? productStockRows : filteredLocationStock;

  const stockSummary = useMemo(() => {
    if (isProductView) {
      const recordCount = productStockRows.length;
      const totalSoldCurrentMonth = productStockRows.reduce(
        (sum, row) => sum + (row.soldCurrentMonth || 0),
        0
      );
      const totalQuantity = productStockRows.reduce((sum, row) => sum + (row.totalQuantity || 0), 0);
      const totalReserved = productStockRows.reduce((sum, row) => sum + (row.totalReserved || 0), 0);
      const outOfStockCount = productStockRows.filter(
        (row) => (row.totalQuantity || 0) === 0
      ).length;

      return { recordCount, totalSoldCurrentMonth, totalQuantity, totalReserved, outOfStockCount };
    }

    const recordCount = filteredLocationStock.length;
    const totalSoldCurrentMonth = filteredLocationStock.reduce(
      (sum, record) => sum + getSoldCurrentMonth(record),
      0
    );
    const totalQuantity = filteredLocationStock.reduce((sum, record) => sum + (record.quantity || 0), 0);
    const totalReserved = filteredLocationStock.reduce((sum, record) => sum + (record.reservedQuantity || 0), 0);
    const outOfStockCount = filteredLocationStock.filter(
      (record) => (record.quantity || 0) === 0
    ).length;

    return { recordCount, totalSoldCurrentMonth, totalQuantity, totalReserved, outOfStockCount };
  }, [isProductView, productStockRows, filteredLocationStock]);

  const getSummaryScopeLabel = () => (
    isProductView ? 'By product (all locations)' : 'All stock by location'
  );

  const handleExport = async () => {
    if (!displayRows.length) {
      alert('No stock data to export for the current view');
      return;
    }

    try {
      setExporting(true);
      const params = {
        search: searchTerm.trim() || undefined,
        ...(isProductView ? { groupBy: 'product' } : {}),
      };

      const response = await stockAPI.exportReport(params);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `${isProductView ? 'stock_by_product' : 'stock_report'}_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('Error exporting stock report', error);
      alert(error.response?.data?.error || 'Failed to export stock report');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="stock-container">
      <div className="stock-header">
        <h1>Stock Management</h1>
        <div className="stock-header-actions">
          <button
            className="btn-export"
            onClick={handleExport}
            disabled={loading || exporting || displayRows.length === 0}
          >
            {exporting ? 'Exporting…' : '📤 Export Excel'}
          </button>
          {canEdit && (
            <>
          <button className="btn-secondary" onClick={() => setShowExcelUpload(true)}>
            ⬆ Upload Excel
          </button>
          <button
            className="btn-danger-outline"
            onClick={handleClearStockData}
            title={getClearStockLabel()}
          >
            🗑 Remove Stock Data
          </button>
          <button className="btn-primary" onClick={handleAddStock}>
            + Add Stock Manually
          </button>
            </>
          )}
        </div>
      </div>

      <div className="stock-scroll-area">
      {/* View Mode Selector */}
      <div className="view-selector">
        <button
          className={viewMode === 'all' ? 'active' : ''}
          onClick={() => setViewMode('all')}
        >
          All Stock
        </button>
        <button
          className={viewMode === 'product' ? 'active' : ''}
          onClick={() => setViewMode('product')}
        >
          By Product
        </button>
      </div>

      <div className="stock-search-bar">
        <input
          type="text"
          placeholder={isProductView ? 'Search by title or SKU…' : 'Search by title, SKU, or location…'}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="stock-status-bar">
        <div className="stock-status-scope">
          <span className="stock-status-scope-label">View</span>
          <span className="stock-status-scope-value">{getSummaryScopeLabel()}</span>
        </div>
        <div className="stock-status-stats">
          <div className="stock-stat stock-stat-primary">
            <span className="stock-stat-value">
              {loading ? '—' : stockSummary.totalSoldCurrentMonth.toLocaleString()}
            </span>
            <span className="stock-stat-label">Sold ({currentMonthLabel})</span>
          </div>
          <div className="stock-stat">
            <span className="stock-stat-value">
              {loading ? '—' : stockSummary.recordCount.toLocaleString()}
            </span>
            <span className="stock-stat-label">{isProductView ? 'Products' : 'Stock Records'}</span>
          </div>
          <div className="stock-stat">
            <span className="stock-stat-value">
              {loading ? '—' : stockSummary.totalQuantity.toLocaleString()}
            </span>
            <span className="stock-stat-label">Total On Hand</span>
          </div>
          {stockSummary.totalReserved > 0 && (
            <div className="stock-stat">
              <span className="stock-stat-value">
                {loading ? '—' : stockSummary.totalReserved.toLocaleString()}
              </span>
              <span className="stock-stat-label">Reserved</span>
            </div>
          )}
          <div className={`stock-stat${stockSummary.outOfStockCount > 0 ? ' stock-stat-warning' : ''}`}>
            <span className="stock-stat-value">
              {loading ? '—' : stockSummary.outOfStockCount.toLocaleString()}
            </span>
            <span className="stock-stat-label">Out of Stock</span>
          </div>
        </div>
      </div>

      {/* Low Stock Alerts */}
      {lowStockAlerts.length > 0 && (
        <div className="low-stock-alerts">
          <h3>⚠️ Out of Stock Alerts</h3>
          <div className="alerts-list">
            {lowStockAlerts.slice(0, 5).map((alert) => (
              <div key={alert._id} className="alert-item">
                <span>
                  {alert.product?.name || alert.product?.title} - {alert.location?.name}
                </span>
                <span>Stock: {alert.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stock Table */}
      {loading ? (
        <div className="loading">Loading stock...</div>
      ) : (
        <div className="stock-table-container">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                {isProductView ? (
                  <>
                    <th>Locations</th>
                    <th>Total Available</th>
                    <th>Sold ({currentMonthLabel})</th>
                    <th>Last Updated</th>
                  </>
                ) : (
                  <>
                    <th>Location</th>
                    <th>Quantity</th>
                    <th>Sold ({currentMonthLabel})</th>
                    <th>Last Updated</th>
                    <th>Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={isProductView ? 6 : 7} className="no-data">
                    {searchTerm.trim()
                      ? 'No stock records match your search.'
                      : 'No stock records found'}
                  </td>
                </tr>
              ) : isProductView ? (
                productStockRows.map((row) => (
                  <tr
                    key={row.productId}
                    className={`clickable-row${
                      row.totalQuantity === 0 ? ' low-stock' : ''
                    }`}
                    onClick={() => setViewingProductStock(row)}
                  >
                    <td>
                      <StockProductCell product={row.product} />
                    </td>
                    <td className="stock-sku-cell">
                      <span
                        className={`stock-sku-value${
                          row.product?.sku ? '' : ' stock-sku-empty'
                        }`}
                      >
                        {row.product?.sku || '—'}
                      </span>
                    </td>
                    <td>{row.locationCount}</td>
                    <td>{row.totalQuantity}</td>
                    <td className="stock-sold-current-month">{row.soldCurrentMonth}</td>
                    <td>
                      {row.lastUpdated
                        ? new Date(row.lastUpdated).toLocaleDateString()
                        : '—'}
                    </td>
                  </tr>
                ))
              ) : (
                filteredLocationStock.map((stockRecord) => (
                  <tr
                    key={stockRecord._id}
                    className={`clickable-row${
                      stockRecord.quantity === 0 ? ' low-stock' : ''
                    }`}
                    onClick={() => setViewingStock(stockRecord)}
                  >
                    <td>
                      <StockProductCell product={stockRecord.product} />
                    </td>
                    <td className="stock-sku-cell">
                      <span
                        className={`stock-sku-value${
                          stockRecord.product?.sku ? '' : ' stock-sku-empty'
                        }`}
                      >
                        {stockRecord.product?.sku || '—'}
                      </span>
                    </td>
                    <td>
                      {stockRecord.location?.name || 'Unknown'}
                      {stockRecord.location?.code && (
                        <span className="code"> ({stockRecord.location.code})</span>
                      )}
                    </td>
                    <td>{stockRecord.quantity}</td>
                    <td className="stock-sold-current-month">{getSoldCurrentMonth(stockRecord)}</td>
                    <td>
                      {new Date(stockRecord.lastUpdated).toLocaleDateString()}
                    </td>
                    <td onClick={(e) => e.stopPropagation()} className="stock-actions-cell">
                      {canEdit && (
                        <>
                      <button
                        className="btn-adjust"
                        onClick={() => handleAdjustStock(stockRecord)}
                      >
                        Adjust
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDeleteStock(stockRecord._id)}
                      >
                        Remove
                      </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      </div>

      {showExcelUpload && (
        <ExcelUpload
          moduleName="stock"
          templateEndpoint="/stock/template"
          onUploadComplete={handleExcelUploadComplete}
          onClose={() => setShowExcelUpload(false)}
        />
      )}

      {/* Stock Detail Modal */}
      {viewingStock && (
        <DetailModal
          title={
            viewingStock.product?.title ||
            viewingStock.product?.name ||
            'Stock Details'
          }
          headerActions={
            getProductThumbnail(viewingStock.product) ? (
              <img
                className="stock-detail-thumbnail"
                src={getProductThumbnail(viewingStock.product)}
                alt={viewingStock.product?.title || viewingStock.product?.name || 'Product'}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = PRODUCT_IMAGE_PLACEHOLDER;
                }}
              />
            ) : null
          }
          fields={[
            { label: 'Product', value: viewingStock.product?.title || viewingStock.product?.name },
            { label: 'SKU', value: viewingStock.product?.sku || '—' },
            { label: 'Location', value: viewingStock.location?.name },
            { label: 'Location Code', value: viewingStock.location?.code },
            { label: 'Quantity', value: viewingStock.quantity },
            {
              label: `Sold (${currentMonthLabel})`,
              value: getSoldCurrentMonth(viewingStock),
            },
            {
              label: 'Last Updated',
              value: viewingStock.lastUpdated
                ? new Date(viewingStock.lastUpdated).toLocaleString()
                : '',
            },
          ]}
          onClose={() => setViewingStock(null)}
          onEdit={canEdit ? () => {
            const record = viewingStock;
            setViewingStock(null);
            handleAdjustStock(record);
          } : undefined}
          onDelete={canEdit ? () => {
            const id = viewingStock._id;
            setViewingStock(null);
            handleDeleteStock(id);
          } : undefined}
        />
      )}

      {viewingProductStock && (
        <div className="modal-overlay" onClick={() => setViewingProductStock(null)}>
          <div className="modal-content stock-product-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stock-product-detail-header">
              <h2>
                {viewingProductStock.product?.title ||
                  viewingProductStock.product?.name ||
                  'Product Stock'}
              </h2>
              <button type="button" className="btn-secondary" onClick={() => setViewingProductStock(null)}>
                Close
              </button>
            </div>
            <div className="stock-product-detail-summary">
              <div><strong>Total Available:</strong> {viewingProductStock.totalQuantity}</div>
              <div><strong>Locations:</strong> {viewingProductStock.locationCount}</div>
              <div><strong>Sold ({currentMonthLabel}):</strong> {viewingProductStock.soldCurrentMonth}</div>
            </div>
            <div className="stock-product-detail-table-wrap">
              <table className="stock-table stock-product-breakdown-table">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>Quantity</th>
                    <th>Sold ({currentMonthLabel})</th>
                    {canEdit && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {(viewingProductStock.records || []).map((record) => (
                    <tr key={record._id}>
                      <td>
                        {record.location?.name || 'Unknown'}
                        {record.location?.code && (
                          <span className="code"> ({record.location.code})</span>
                        )}
                      </td>
                      <td>{record.quantity}</td>
                      <td>{getSoldCurrentMonth(record)}</td>
                      {canEdit && (
                        <td className="stock-actions-cell">
                          <button
                            type="button"
                            className="btn-adjust"
                            onClick={() => {
                              setViewingProductStock(null);
                              handleAdjustStock(record);
                            }}
                          >
                            Adjust
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {showAdjustModal && adjustingStock && (
        <div className="modal-overlay" onClick={() => setShowAdjustModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Adjust Stock</h2>
            <div className="adjust-form">
              <div className="form-group">
                <label>Product</label>
                <input
                  type="text"
                  value={
                    adjustingStock.product?.title ||
                    adjustingStock.product?.name ||
                    'Unknown'
                  }
                  disabled
                />
              </div>
              <div className="form-group">
                <label>Location</label>
                <input
                  type="text"
                  value={adjustingStock.location?.name || 'Unknown'}
                  disabled
                />
              </div>
              <div className="form-group">
                <label>Current Quantity</label>
                <input
                  type="number"
                  value={adjustingStock.quantity}
                  disabled
                />
              </div>
              <div className="form-group">
                <label>New Quantity *</label>
                <input
                  type="number"
                  min="0"
                  value={adjustQuantity}
                  onChange={(e) => setAdjustQuantity(parseFloat(e.target.value) || 0)}
                  required
                />
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdjustModal(false);
                    setAdjustingStock(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSaveAdjustment}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Stock Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Add Stock Manually</h2>
            <p className="form-hint" style={{ marginTop: 0 }}>
              Choose a product and location, then enter the quantity on hand.
            </p>
            <div className="adjust-form">
              <div className="form-group">
                <label>Product *</label>
                <ProductSearchPicker
                  products={products}
                  value={newStockFormData.product}
                  onChange={(productId) =>
                    setNewStockFormData((prev) => ({
                      ...prev,
                      product: productId,
                    }))
                  }
                  placeholder="Type title or SKU…"
                  required
                />
              </div>
              <div className="form-group">
                <label>Location *</label>
                <select
                  name="location"
                  value={newStockFormData.location}
                  onChange={handleNewStockInputChange}
                  required
                >
                  <option value="">Select Location</option>
                  {locations.map((location) => (
                    <option key={location._id} value={location._id}>
                      {location.name} ({location.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Quantity *</label>
                <input
                  type="number"
                  min="0"
                  name="quantity"
                  value={newStockFormData.quantity}
                  onChange={handleNewStockInputChange}
                  required
                />
                <small className="form-hint">Sets the stock quantity for this product at the location.</small>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setNewStockFormData({
                      product: '',
                      location: '',
                      quantity: 0,
                    });
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSaveNewStock}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Stock;

