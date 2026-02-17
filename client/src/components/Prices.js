import React, { useState, useEffect } from 'react';
import { pricesAPI, productsAPI, salesChannelsAPI } from '../services/api';
import './Prices.css';

function Prices() {
  const [prices, setPrices] = useState([]);
  const [products, setProducts] = useState([]);
  const [salesChannels, setSalesChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('all'); // 'all', 'product'
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedSalesChannel, setSelectedSalesChannel] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPrice, setEditingPrice] = useState(null);
  const [formData, setFormData] = useState({
    product: '',
    purchasePrice: '',
    salesPrice: '',
    mrp: '',
    currency: 'INR',
    effectiveDate: new Date().toISOString().split('T')[0],
    isActive: true,
    notes: '',
    salesChannel: '',
  });

  useEffect(() => {
    fetchProducts();
    fetchSalesChannels();
  }, []);

  useEffect(() => {
    if (viewMode === 'product' && selectedProduct) {
      fetchPriceHistory(selectedProduct);
    } else {
      fetchPrices();
    }
  }, [viewMode, selectedProduct, selectedSalesChannel]);

  const fetchSalesChannels = async () => {
    try {
      const response = await salesChannelsAPI.getAll({ isActive: 'true' });
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setSalesChannels(data);
    } catch (error) {
      console.error('Error fetching sales channels:', error);
    }
  };

  const fetchPrices = async () => {
    try {
      setLoading(true);
      const params = { isActive: 'true' };
      if (selectedSalesChannel !== '') params.salesChannel = selectedSalesChannel;
      const response = await pricesAPI.getAll(params);
      const data = Array.isArray(response.data) ? response.data : response.data?.data || response.data;
      setPrices(data);
    } catch (error) {
      console.error('Error fetching prices:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      alert('Failed to fetch prices');
    } finally {
      setLoading(false);
    }
  };

  const fetchPriceHistory = async (productId) => {
    try {
      setLoading(true);
      const params = {};
      if (selectedSalesChannel !== '') params.salesChannel = selectedSalesChannel;
      const response = await pricesAPI.getHistory(productId, params);
      setPrices(response.data);
    } catch (error) {
      console.error('Error fetching price history:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        productId: productId
      });
      alert('Failed to fetch price history');
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

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === 'checkbox'
          ? checked
          : name === 'purchasePrice' || name === 'salesPrice' || name === 'mrp'
          ? parseFloat(value) || ''
          : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingPrice) {
        await pricesAPI.update(editingPrice._id, formData);
      } else {
        await pricesAPI.create(formData);
      }
      setShowModal(false);
      setEditingPrice(null);
      resetForm();
      fetchPrices();
      if (selectedProduct) {
        fetchPriceHistory(selectedProduct);
      }
    } catch (error) {
      console.error('Error saving price:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        formData: formData
      });
      alert(error.response?.data?.error || 'Failed to save price');
    }
  };

  const handleEdit = (price) => {
    setEditingPrice(price);
    setFormData({
      product: price.product._id || price.product,
      purchasePrice: price.purchasePrice || '',
      salesPrice: price.salesPrice || '',
      mrp: price.mrp ?? '',
      currency: price.currency || 'INR',
      effectiveDate: price.effectiveDate
        ? new Date(price.effectiveDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      isActive: price.isActive !== undefined ? price.isActive : true,
      notes: price.notes || '',
      salesChannel: price.salesChannel?._id || price.salesChannel || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to deactivate this price?')) {
      return;
    }
    try {
      await pricesAPI.delete(id);
      fetchPrices();
      if (selectedProduct) {
        fetchPriceHistory(selectedProduct);
      }
    } catch (error) {
      console.error('Error deleting price:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        priceId: id
      });
      alert('Failed to delete price');
    }
  };

  const resetForm = () => {
    setFormData({
      product: '',
      purchasePrice: '',
      salesPrice: '',
      mrp: '',
      currency: 'INR',
      effectiveDate: new Date().toISOString().split('T')[0],
      isActive: true,
      notes: '',
      salesChannel: '',
    });
  };

  const openAddModal = () => {
    setEditingPrice(null);
    resetForm();
    setShowModal(true);
  };

  const formatCurrency = (amount) => {
    return `₹${parseFloat(amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <div className="prices-container">
      <div className="prices-header">
        <h1>Price Management</h1>
        <button className="btn-primary" onClick={openAddModal}>
          + Add Price
        </button>
      </div>

      {/* View Mode Selector */}
      <div className="view-selector">
        <button
          className={viewMode === 'all' ? 'active' : ''}
          onClick={() => {
            setViewMode('all');
            setSelectedProduct('');
          }}
        >
          All Active Prices
        </button>
        <button
          className={viewMode === 'product' ? 'active' : ''}
          onClick={() => setViewMode('product')}
        >
          By Product
        </button>
      </div>

      {/* Filters */}
      <div className="filter-section">
        <label>Sales Channel:</label>
        <select
          value={selectedSalesChannel}
          onChange={(e) => setSelectedSalesChannel(e.target.value)}
        >
          <option value="">All (incl. Default)</option>
          <option value="null">Default only</option>
          {salesChannels.map((ch) => (
            <option key={ch._id} value={ch._id}>
              {ch.name} {ch.country && `(${ch.country})`}
            </option>
          ))}
        </select>
      </div>
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

      {loading ? (
        <div className="loading">Loading prices...</div>
      ) : (
        <div className="prices-table-container">
          <table className="prices-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Channel</th>
                <th>Purchase Price</th>
                <th>Sales Price</th>
                <th>MRP</th>
                <th>Currency</th>
                <th>Effective Date</th>
                <th>Status</th>
                {viewMode === 'product' && <th>History</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {prices.length === 0 ? (
                <tr>
                  <td colSpan={viewMode === 'product' ? 10 : 9} className="no-data">
                    No prices found
                  </td>
                </tr>
              ) : (
                prices.map((price) => (
                  <tr key={price._id} className={!price.isActive ? 'inactive' : ''}>
                    <td>
                      {price.product?.title || price.product?.name || 'Unknown'}
                      {price.product?.sku && (
                        <span className="sku"> ({price.product.sku})</span>
                      )}
                    </td>
                    <td>{price.salesChannel?.name || 'Default'}</td>
                    <td>{formatCurrency(price.purchasePrice)}</td>
                    <td>{formatCurrency(price.salesPrice)}</td>
                    <td>{price.mrp != null ? formatCurrency(price.mrp) : '-'}</td>
                    <td>{price.currency}</td>
                    <td>{new Date(price.effectiveDate).toLocaleDateString()}</td>
                    <td>
                      <span className={`status-badge ${price.isActive ? 'active' : 'inactive'}`}>
                        {price.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {viewMode === 'product' && (
                      <td>
                        {price.notes && (
                          <span className="notes" title={price.notes}>
                            📝
                          </span>
                        )}
                      </td>
                    )}
                    <td>
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(price)}
                      >
                        Edit
                      </button>
                      {price.isActive && (
                        <button
                          className="btn-delete"
                          onClick={() => handleDelete(price._id)}
                        >
                          Deactivate
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

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingPrice ? 'Edit Price' : 'Add Price'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Product *</label>
                <select
                  name="product"
                  value={formData.product}
                  onChange={handleInputChange}
                  required
                  disabled={!!editingPrice}
                >
                  <option value="">Select Product</option>
                  {products.map((product) => (
                    <option key={product._id} value={product._id}>
                      {product.title || product.name} ({product.sku || 'No SKU'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Purchase Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="purchasePrice"
                    value={formData.purchasePrice}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Sales Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="salesPrice"
                    value={formData.salesPrice}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>MRP (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="mrp"
                    value={formData.mrp}
                    onChange={handleInputChange}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Sales Channel</label>
                <select
                  name="salesChannel"
                  value={formData.salesChannel}
                  onChange={handleInputChange}
                >
                  <option value="">Default</option>
                  {salesChannels.map((ch) => (
                    <option key={ch._id} value={ch._id}>
                      {ch.name} {ch.country && `(${ch.defaultCurrency || ch.country})`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Currency</label>
                  <select
                    name="currency"
                    value={formData.currency}
                    onChange={handleInputChange}
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="CAD">CAD</option>
                    <option value="AUD">AUD</option>
                    <option value="JPY">JPY</option>
                    <option value="MXN">MXN</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Effective Date</label>
                  <input
                    type="date"
                    name="effectiveDate"
                    value={formData.effectiveDate}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleInputChange}
                  />
                  Active (will deactivate other active prices for this product+channel)
                </label>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows="3"
                  placeholder="Optional notes about this price change..."
                />
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingPrice ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Prices;

