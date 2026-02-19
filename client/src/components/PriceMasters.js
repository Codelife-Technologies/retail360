import React, { useState, useEffect } from 'react';
import { priceMastersAPI, locationsAPI } from '../services/api';
import logger from '../utils/logger';
import { useAuth } from '../context/AuthContext';
import './PriceMasters.css';

function PriceMasters() {
  const { hasPermission } = useAuth();
  const [masters, setMasters] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingMaster, setEditingMaster] = useState(null);
  const [formData, setFormData] = useState({
    minPrice: '',
    maxPrice: '',
    location: '',
    inwardShippingCostPerKg: '',
    outwardShippingCostPerKg: '',
    operationCostPercentage: '',
    packagingCost: '',
    operatingProfitType: 'percent',
    operatingProfit: '',
    isActive: true,
    effectiveDate: new Date().toISOString().split('T')[0],
    notes: ''
  });

  useEffect(() => {
    fetchLocations();
    fetchMasters();
  }, []);

  const fetchMasters = async () => {
    try {
      setLoading(true);
      const response = await priceMastersAPI.getAll({ isActive: 'true' });
      const data = Array.isArray(response.data) ? response.data : response.data?.data || response.data || [];
      setMasters(data);
    } catch (error) {
      console.error('Error fetching price masters:', error);
      logger.error('Error fetching price masters', error);
      alert('Failed to fetch price masters');
    } finally {
      setLoading(false);
    }
  };

  const fetchLocations = async () => {
    try {
      const response = await locationsAPI.getAll({ isActive: 'true' });
      setLocations(response.data || []);
    } catch (error) {
      console.error('Error fetching locations:', error);
      logger.error('Error fetching locations', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    const numFields = [
      'minPrice', 'maxPrice', 'inwardShippingCostPerKg', 'outwardShippingCostPerKg',
      'operationCostPercentage', 'packagingCost', 'operatingProfit'
    ];
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : numFields.includes(name) ? (value === '' ? '' : parseFloat(value) || '') : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (formData.minPrice === '' || formData.minPrice == null) {
        alert('Please enter minimum price');
        return;
      }
      const minP = parseFloat(formData.minPrice);
      const maxP = formData.maxPrice !== '' ? parseFloat(formData.maxPrice) : null;
      if (maxP != null && maxP <= minP) {
        alert('Maximum price must be greater than minimum price');
        return;
      }
      if (formData.inwardShippingCostPerKg === '' || formData.outwardShippingCostPerKg === '') {
        alert('Please enter inward and outward shipping cost per kg');
        return;
      }
      if (formData.operationCostPercentage === '' || formData.packagingCost === '' || formData.operatingProfit === '') {
        alert('Please enter operation cost %, packaging cost, and operating profit');
        return;
      }

      const payload = {
        ...formData,
        minPrice: minP,
        maxPrice: maxP,
        location: formData.location || null,
        inwardShippingCostPerKg: parseFloat(formData.inwardShippingCostPerKg),
        outwardShippingCostPerKg: parseFloat(formData.outwardShippingCostPerKg),
        operationCostPercentage: parseFloat(formData.operationCostPercentage),
        packagingCost: parseFloat(formData.packagingCost),
        operatingProfit: parseFloat(formData.operatingProfit),
      };

      if (editingMaster) {
        await priceMastersAPI.update(editingMaster._id, payload);
      } else {
        await priceMastersAPI.create(payload);
      }
      setShowModal(false);
      setEditingMaster(null);
      resetForm();
      fetchMasters();
    } catch (error) {
      console.error('Error saving price master:', error);
      logger.error('Error saving price master', error);
      alert(error.response?.data?.error || 'Failed to save price master');
    }
  };

  const handleEdit = (master) => {
    setEditingMaster(master);
    setFormData({
      minPrice: master.minPrice ?? '',
      maxPrice: master.maxPrice ?? '',
      location: master.location?._id || master.location || '',
      inwardShippingCostPerKg: master.inwardShippingCostPerKg ?? '',
      outwardShippingCostPerKg: master.outwardShippingCostPerKg ?? '',
      operationCostPercentage: master.operationCostPercentage ?? '',
      packagingCost: master.packagingCost ?? '',
      operatingProfitType: master.operatingProfitType || 'percent',
      operatingProfit: master.operatingProfit ?? '',
      isActive: master.isActive !== undefined ? master.isActive : true,
      effectiveDate: master.effectiveDate ? new Date(master.effectiveDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      notes: master.notes || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to deactivate this price master?')) {
      return;
    }
    try {
      await priceMastersAPI.delete(id);
      fetchMasters();
    } catch (error) {
      console.error('Error deleting price master:', error);
      logger.error('Error deleting price master', error);
      alert(error.response?.data?.error || 'Failed to deactivate price master');
    }
  };

  const resetForm = () => {
    setFormData({
      minPrice: '',
      maxPrice: '',
      location: '',
      inwardShippingCostPerKg: '',
      outwardShippingCostPerKg: '',
      operationCostPercentage: '',
      packagingCost: '',
      operatingProfitType: 'percent',
      operatingProfit: '',
      isActive: true,
      effectiveDate: new Date().toISOString().split('T')[0],
      notes: ''
    });
  };

  const openAddModal = () => {
    setEditingMaster(null);
    resetForm();
    setShowModal(true);
  };

  const formatPriceRange = (min, max) => {
    if (max == null) return `₹${min}+`;
    return `₹${min} - ₹${max}`;
  };

  const formatOperatingProfit = (master) => {
    if (master.operatingProfitType === 'percent') {
      return `${master.operatingProfit}%`;
    }
    return `₹${master.operatingProfit}`;
  };

  if (!hasPermission('priceMasters.view')) {
    return <div className="price-masters-container"><p>You do not have permission to view price masters.</p></div>;
  }

  return (
    <div className="price-masters-container">
      <div className="price-masters-header">
        <h1>Price Master</h1>
        {hasPermission('priceMasters.create') && (
          <button className="btn-primary" onClick={openAddModal}>
            + Add Price Master
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading price masters...</div>
      ) : (
        <div className="price-masters-table-container">
          <table className="price-masters-table">
            <thead>
              <tr>
                <th>Price Range</th>
                <th>Location</th>
                <th>Inward ₹/kg</th>
                <th>Outward ₹/kg</th>
                <th>Op Cost %</th>
                <th>Packaging</th>
                <th>Operating Profit</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {masters.length === 0 ? (
                <tr>
                  <td colSpan="9" className="no-data">
                    No price masters found
                  </td>
                </tr>
              ) : (
                masters.map((master) => (
                  <tr key={master._id}>
                    <td>{formatPriceRange(master.minPrice, master.maxPrice)}</td>
                    <td>{master.location?.name || 'Default (all)'}</td>
                    <td>₹{master.inwardShippingCostPerKg?.toFixed(2)}</td>
                    <td>₹{master.outwardShippingCostPerKg?.toFixed(2)}</td>
                    <td>{master.operationCostPercentage}%</td>
                    <td>₹{master.packagingCost?.toFixed(2)}</td>
                    <td>{formatOperatingProfit(master)}</td>
                    <td>
                      <span className={`status-badge ${master.isActive ? 'active' : 'inactive'}`}>
                        {master.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      {hasPermission('priceMasters.update') && (
                        <button className="btn-edit" onClick={() => handleEdit(master)}>Edit</button>
                      )}
                      {hasPermission('priceMasters.delete') && master.isActive && (
                        <button className="btn-delete" onClick={() => handleDelete(master._id)}>Deactivate</button>
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
            <h2>{editingMaster ? 'Edit Price Master' : 'Add Price Master'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Minimum Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="minPrice"
                    value={formData.minPrice}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Maximum Price (₹) - optional</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="maxPrice"
                    value={formData.maxPrice}
                    onChange={handleInputChange}
                    placeholder="Leave empty for no limit"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Location</label>
                <select name="location" value={formData.location} onChange={handleInputChange}>
                  <option value="">Default (all locations)</option>
                  {locations.map((loc) => (
                    <option key={loc._id} value={loc._id}>{loc.name} ({loc.code})</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Inward Shipping Cost per Kg (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="inwardShippingCostPerKg"
                    value={formData.inwardShippingCostPerKg}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Outward Shipping Cost per Kg (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="outwardShippingCostPerKg"
                    value={formData.outwardShippingCostPerKg}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Operation Cost (%) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    name="operationCostPercentage"
                    value={formData.operationCostPercentage}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Packaging Cost (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="packagingCost"
                    value={formData.packagingCost}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Operating Profit Type *</label>
                  <select name="operatingProfitType" value={formData.operatingProfitType} onChange={handleInputChange}>
                    <option value="percent">Percent (%)</option>
                    <option value="amount">Amount (₹)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Operating Profit *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="operatingProfit"
                    value={formData.operatingProfit}
                    onChange={handleInputChange}
                    placeholder={formData.operatingProfitType === 'percent' ? 'e.g. 15' : 'e.g. 50'}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea name="notes" value={formData.notes} onChange={handleInputChange} rows="2" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Effective Date</label>
                  <input
                    type="date"
                    name="effectiveDate"
                    value={formData.effectiveDate}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="form-group">
                  <label>
                    <input type="checkbox" name="isActive" checked={formData.isActive} onChange={handleInputChange} />
                    Active
                  </label>
                </div>
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editingMaster ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default PriceMasters;
