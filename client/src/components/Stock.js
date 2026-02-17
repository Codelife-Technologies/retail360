import React, { useState, useEffect } from 'react';
import { stockAPI, productsAPI, locationsAPI } from '../services/api';
import logger from '../utils/logger';
import { useAuth } from '../context/AuthContext';
import ExcelUpload from './ExcelUpload';
import './Stock.css';

function Stock() {
  const { hasPermission } = useAuth();
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
  const [newStockFormData, setNewStockFormData] = useState({
    product: '',
    sku: '',
    location: '',
    quantity: 0,
    minStockLevel: 0,
  });
  const [lowStockAlerts, setLowStockAlerts] = useState([]);
  const [showExcelUpload, setShowExcelUpload] = useState(false);

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

  const handleAdjustStock = (stockRecord) => {
    setAdjustingStock(stockRecord);
    setAdjustQuantity(stockRecord.quantity);
    setShowAdjustModal(true);
  };

  const handleAddStock = () => {
    setNewStockFormData({
      product: '',
      sku: '',
      location: '',
      quantity: 0,
      minStockLevel: 0,
    });
    setShowAddModal(true);
  };

  const handleNewStockInputChange = (e) => {
    const { name, value } = e.target;
    const updates = {
      ...(name === 'quantity' || name === 'minStockLevel' 
        ? { [name]: parseFloat(value) || 0 } 
        : { [name]: value }),
    };
    if (name === 'sku') {
      const product = products.find((p) => p.sku === value);
      updates.product = product ? product._id : '';
    }
    setNewStockFormData((prev) => ({ ...prev, ...updates }));
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
        sku: '',
        location: '',
        quantity: 0,
        minStockLevel: 0,
      });
      fetchStock();
      fetchLowStockAlerts();
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

  const handleSaveAdjustment = async () => {
    try {
      await stockAPI.update(adjustingStock._id, {
        quantity: adjustQuantity,
        minStockLevel: adjustingStock.minStockLevel,
      });
      setShowAdjustModal(false);
      setAdjustingStock(null);
      fetchStock();
      fetchLowStockAlerts();
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

  return (
    <div className="stock-container">
      <div className="stock-header">
        <h1>Stock Management</h1>
        <div className="stock-header-actions">
          {hasPermission('stock.create') && (
            <>
              <button className="btn-secondary" onClick={() => setShowExcelUpload(true)}>
                📥 Upload Excel
              </button>
              <button className="btn-primary" onClick={handleAddStock}>
                + Add Stock
              </button>
            </>
          )}
        </div>
      </div>

      {showExcelUpload && (
        <ExcelUpload
          moduleName="stock"
          templateEndpoint="/stock/template"
          onUploadComplete={() => {
            fetchStock();
            fetchLowStockAlerts();
            setShowExcelUpload(false);
          }}
          onClose={() => setShowExcelUpload(false)}
        />
      )}

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
                <th>Product SKU</th>
                <th>Product Name</th>
                <th>Location</th>
                <th>Quantity</th>
                <th>Available</th>
                <th>Min Level</th>
                <th>Last Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {stock.length === 0 ? (
                <tr>
                  <td colSpan="8" className="no-data">
                    No stock records found
                  </td>
                </tr>
              ) : (
                stock.map((stockRecord) => (
                  <tr
                    key={stockRecord._id}
                    className={
                      stockRecord.quantity <= stockRecord.minStockLevel
                        ? 'low-stock'
                        : ''
                    }
                  >
                    <td>{stockRecord.product?.sku || '-'}</td>
                    <td>{stockRecord.product?.title || stockRecord.product?.name || '-'}</td>
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
                    <td>
                      {hasPermission('stock.update') && (
                        <button
                          className="btn-adjust"
                          onClick={() => handleAdjustStock(stockRecord)}
                        >
                          Adjust
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
                <label>Product SKU *</label>
                <select
                  name="sku"
                  value={newStockFormData.sku}
                  onChange={handleNewStockInputChange}
                  required
                >
                  <option value="">Select SKU</option>
                  {products
                    .filter((p) => p.sku && String(p.sku).trim())
                    .map((product) => (
                      <option key={product._id} value={product.sku}>
                        {product.sku}
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-group">
                <label>Product Title</label>
                <input
                  type="text"
                  value={
                    products.find((p) => p._id === newStockFormData.product)?.title ||
                    products.find((p) => p._id === newStockFormData.product)?.name ||
                    ''
                  }
                  readOnly
                  placeholder="Selected based on SKU"
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
                      sku: '',
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

