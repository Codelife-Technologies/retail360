import React, { useState, useEffect, useMemo } from 'react';
import { stockAPI, productsAPI, locationsAPI } from '../services/api';
import logger from '../utils/logger';
import DetailModal from './DetailModal';
import ExcelUpload from './ExcelUpload';
import './Stock.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const UPLOADS_BASE = API_BASE_URL.replace('/api', '');

const PRODUCT_IMAGE_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 50 50">
      <rect width="50" height="50" fill="#e5e7eb" rx="8"/>
      <path d="M16 32l6-8 5 6 4-5 9 11H16z" fill="#9ca3af"/>
      <circle cx="20" cy="19" r="3" fill="#9ca3af"/>
    </svg>`
  );

function resolveProductImageUrl(image) {
  if (!image) return null;
  if (image.startsWith('http://') || image.startsWith('https://')) {
    return image;
  }
  if (image.startsWith('products/')) {
    return `${UPLOADS_BASE}/uploads/${image}`;
  }
  return image;
}

function getProductThumbnail(product) {
  if (!product) return null;
  const images = product.images || [];
  const first = images.find((img) => img && img.trim() !== '');
  return first ? resolveProductImageUrl(first) : null;
}

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

function Stock() {
  const [stock, setStock] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('all'); // 'all', 'product', 'location'
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustingStock, setAdjustingStock] = useState(null);
  const [adjustQuantity, setAdjustQuantity] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [viewingStock, setViewingStock] = useState(null);
  const [newStockFormData, setNewStockFormData] = useState({
    product: '',
    location: '',
    quantity: 0,
    minStockLevel: 0,
  });
  const [lowStockAlerts, setLowStockAlerts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchProducts();
    fetchLocations();
    fetchStock();
    fetchLowStockAlerts();
  }, []);

  useEffect(() => {
    if (viewMode === 'product' && selectedProduct) {
      fetchStockByProduct(selectedProduct);
    } else if (viewMode === 'location' && selectedLocation) {
      fetchStockByLocation(selectedLocation);
    } else {
      fetchStock();
    }
  }, [viewMode, selectedProduct, selectedLocation]);

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

  const fetchStockByProduct = async (productId) => {
    try {
      setLoading(true);
      const response = await stockAPI.getByProduct(productId);
      setStock(response.data);
    } catch (error) {
      console.error('Error fetching stock by product:', error);
      alert('Failed to fetch stock');
    } finally {
      setLoading(false);
    }
  };

  const fetchStockByLocation = async (locationId) => {
    try {
      setLoading(true);
      const response = await stockAPI.getByLocation(locationId);
      setStock(response.data);
    } catch (error) {
      console.error('Error fetching stock by location:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        locationId: locationId
      });
      alert('Failed to fetch stock');
    } finally {
      setLoading(false);
    }
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

  const refreshStock = () => {
    if (viewMode === 'product' && selectedProduct) {
      fetchStockByProduct(selectedProduct);
    } else if (viewMode === 'location' && selectedLocation) {
      fetchStockByLocation(selectedLocation);
    } else {
      fetchStock();
    }
    fetchLowStockAlerts();
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
      minStockLevel: 0,
    });
    setShowAddModal(true);
  };

  const handleNewStockInputChange = (e) => {
    const { name, value } = e.target;
    setNewStockFormData((prev) => ({
      ...prev,
      [name]: name === 'quantity' || name === 'minStockLevel' 
        ? parseFloat(value) || 0 
        : value,
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
        minStockLevel: newStockFormData.minStockLevel || 0,
      });

      setShowAddModal(false);
      setNewStockFormData({
        product: '',
        location: '',
        quantity: 0,
        minStockLevel: 0,
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

  const getClearStockLabel = () => {
    if (viewMode === 'product' && selectedProduct) {
      const product = products.find((p) => p._id === selectedProduct);
      const name = product?.title || product?.name || 'selected product';
      return `Remove stock for ${name}`;
    }
    if (viewMode === 'location' && selectedLocation) {
      const location = locations.find((l) => l._id === selectedLocation);
      const name = location?.name || 'selected location';
      return `Remove stock at ${name}`;
    }
    return 'Remove all stock data';
  };

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
      const params = {};
      if (viewMode === 'product' && selectedProduct) {
        params.product = selectedProduct;
      } else if (viewMode === 'location' && selectedLocation) {
        params.location = selectedLocation;
      }

      const response = await stockAPI.deleteAll(params);
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
        minStockLevel: adjustingStock.minStockLevel,
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

  const getAvailableUnits = (record) => {
    if (record.availableQuantity != null) return record.availableQuantity;
    return Math.max(0, (record.quantity || 0) - (record.reservedQuantity || 0));
  };

  const filteredStock = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return stock;

    return stock.filter((record) => {
      const product = record.product;
      const location = record.location;
      return (
        (product?.title && product.title.toLowerCase().includes(term)) ||
        (product?.name && product.name.toLowerCase().includes(term)) ||
        (product?.sku && product.sku.toLowerCase().includes(term)) ||
        (location?.name && location.name.toLowerCase().includes(term)) ||
        (location?.code && location.code.toLowerCase().includes(term))
      );
    });
  }, [stock, searchTerm]);

  const stockSummary = useMemo(() => {
    const recordCount = filteredStock.length;
    const totalAvailable = filteredStock.reduce((sum, record) => sum + getAvailableUnits(record), 0);
    const totalQuantity = filteredStock.reduce((sum, record) => sum + (record.quantity || 0), 0);
    const totalReserved = filteredStock.reduce((sum, record) => sum + (record.reservedQuantity || 0), 0);
    const lowStockCount = filteredStock.filter(
      (record) => (record.quantity || 0) <= (record.minStockLevel || 0)
    ).length;

    return { recordCount, totalAvailable, totalQuantity, totalReserved, lowStockCount };
  }, [filteredStock]);

  const getSummaryScopeLabel = () => {
    if (viewMode === 'product' && selectedProduct) {
      const product = products.find((p) => p._id === selectedProduct);
      return product?.title || product?.name || 'Selected product';
    }
    if (viewMode === 'location' && selectedLocation) {
      const location = locations.find((l) => l._id === selectedLocation);
      return location?.name || 'Selected location';
    }
    return 'All stock';
  };

  return (
    <div className="stock-container">
      <div className="stock-header">
        <h1>Stock Management</h1>
        <div className="stock-header-actions">
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
            + Add Stock
          </button>
        </div>
      </div>

      {/* View Mode Selector */}
      <div className="view-selector">
        <button
          className={viewMode === 'all' ? 'active' : ''}
          onClick={() => {
            setViewMode('all');
            setSelectedProduct('');
            setSelectedLocation('');
          }}
        >
          All Stock
        </button>
        <button
          className={viewMode === 'product' ? 'active' : ''}
          onClick={() => setViewMode('product')}
        >
          By Product
        </button>
        <button
          className={viewMode === 'location' ? 'active' : ''}
          onClick={() => setViewMode('location')}
        >
          By Location
        </button>
      </div>

      {/* Filters */}
      {viewMode === 'product' && (
        <div className="filter-section">
          <label>Select Product:</label>
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
          >
            <option value="">All Products</option>
            {products.map((product) => (
              <option key={product._id} value={product._id}>
                {product.title || product.name} ({product.sku || 'No SKU'})
              </option>
            ))}
          </select>
        </div>
      )}

      {viewMode === 'location' && (
        <div className="filter-section">
          <label>Select Location:</label>
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
          >
            <option value="">All Locations</option>
            {locations.map((location) => (
              <option key={location._id} value={location._id}>
                {location.name} ({location.code})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="stock-search-bar">
        <input
          type="text"
          placeholder="Search product, SKU, location…"
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
              {loading ? '—' : stockSummary.totalAvailable.toLocaleString()}
            </span>
            <span className="stock-stat-label">Total Available Units</span>
          </div>
          <div className="stock-stat">
            <span className="stock-stat-value">
              {loading ? '—' : stockSummary.recordCount.toLocaleString()}
            </span>
            <span className="stock-stat-label">Stock Records</span>
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
          <div className={`stock-stat${stockSummary.lowStockCount > 0 ? ' stock-stat-warning' : ''}`}>
            <span className="stock-stat-value">
              {loading ? '—' : stockSummary.lowStockCount.toLocaleString()}
            </span>
            <span className="stock-stat-label">Low Stock Items</span>
          </div>
        </div>
      </div>

      {/* Low Stock Alerts */}
      {lowStockAlerts.length > 0 && (
        <div className="low-stock-alerts">
          <h3>⚠️ Low Stock Alerts</h3>
          <div className="alerts-list">
            {lowStockAlerts.slice(0, 5).map((alert) => (
              <div key={alert._id} className="alert-item">
                <span>
                  {alert.product?.name || alert.product?.title} - {alert.location?.name}
                </span>
                <span>
                  Stock: {alert.quantity} / Min: {alert.minStockLevel}
                </span>
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
                <th>Location</th>
                <th>Quantity</th>
                <th>Available</th>
                <th>Min Level</th>
                <th>Last Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStock.length === 0 ? (
                <tr>
                  <td colSpan="8" className="no-data">
                    {searchTerm.trim()
                      ? 'No stock records match your search.'
                      : 'No stock records found'}
                  </td>
                </tr>
              ) : (
                filteredStock.map((stockRecord) => (
                  <tr
                    key={stockRecord._id}
                    className={`clickable-row${
                      stockRecord.quantity <= stockRecord.minStockLevel
                        ? ' low-stock'
                        : ''
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
                    <td>{stockRecord.availableQuantity || stockRecord.quantity}</td>
                    <td>{stockRecord.minStockLevel}</td>
                    <td>
                      {new Date(stockRecord.lastUpdated).toLocaleDateString()}
                    </td>
                    <td onClick={(e) => e.stopPropagation()} className="stock-actions-cell">
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
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showExcelUpload && (
        <ExcelUpload
          moduleName="stock"
          templateEndpoint="/stock/template"
          onUploadComplete={() => refreshStock()}
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
            { label: 'Available', value: viewingStock.availableQuantity ?? viewingStock.quantity },
            { label: 'Min Stock Level', value: viewingStock.minStockLevel },
            {
              label: 'Last Updated',
              value: viewingStock.lastUpdated
                ? new Date(viewingStock.lastUpdated).toLocaleString()
                : '',
            },
          ]}
          onClose={() => setViewingStock(null)}
          onEdit={() => {
            const record = viewingStock;
            setViewingStock(null);
            handleAdjustStock(record);
          }}
          onDelete={() => {
            const id = viewingStock._id;
            setViewingStock(null);
            handleDeleteStock(id);
          }}
        />
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
              <div className="form-group">
                <label>Min Stock Level</label>
                <input
                  type="number"
                  min="0"
                  value={adjustingStock.minStockLevel}
                  onChange={(e) =>
                    setAdjustingStock({
                      ...adjustingStock,
                      minStockLevel: parseFloat(e.target.value) || 0,
                    })
                  }
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
            <h2>Add Stock</h2>
            <div className="adjust-form">
              <div className="form-group">
                <label>Product *</label>
                <select
                  name="product"
                  value={newStockFormData.product}
                  onChange={handleNewStockInputChange}
                  required
                >
                  <option value="">Select Product</option>
                  {products.map((product) => (
                    <option key={product._id} value={product._id}>
                      {product.title || product.name} ({product.sku || 'No SKU'})
                    </option>
                  ))}
                </select>
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
              </div>
              <div className="form-group">
                <label>Min Stock Level</label>
                <input
                  type="number"
                  min="0"
                  name="minStockLevel"
                  value={newStockFormData.minStockLevel}
                  onChange={handleNewStockInputChange}
                />
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
                      minStockLevel: 0,
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

