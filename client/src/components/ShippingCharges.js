import React, { useState, useEffect } from 'react';
import { shippingChargesAPI, shipmentVendorsAPI } from '../services/api';
import logger from '../utils/logger';
import './ShippingCharges.css';

function ShippingCharges() {
  const [charges, setCharges] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCharge, setEditingCharge] = useState(null);
  const [formData, setFormData] = useState({
    shipmentVendor: '',
    name: '',
    description: '',
    type: 'outward',
    chargeType: 'perKg',
    perKgRate: '',
    flatRate: '',
    minCharge: 0,
    weightRanges: [],
    isActive: true,
    effectiveDate: new Date().toISOString().split('T')[0]
  });
  const [weightRangeInput, setWeightRangeInput] = useState({
    minWeight: '',
    maxWeight: '',
    rate: ''
  });

  useEffect(() => {
    fetchVendors();
    fetchCharges();
  }, []);

  const fetchCharges = async () => {
    try {
      setLoading(true);
      const response = await shippingChargesAPI.getAll({ isActive: 'true' });
      setCharges(response.data);
    } catch (error) {
      console.error('Error fetching shipping charges:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      logger.error('Error fetching shipping charges', error);
      alert('Failed to fetch shipping charges');
    } finally {
      setLoading(false);
    }
  };

  const fetchVendors = async () => {
    try {
      const response = await shipmentVendorsAPI.getAll({ isActive: 'true' });
      setVendors(response.data);
    } catch (error) {
      console.error('Error fetching vendors:', error);
      logger.error('Error fetching vendors', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    const numFields = ['perKgRate', 'flatRate', 'minCharge'];
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : numFields.includes(name) ? parseFloat(value) || '' : value,
    }));
  };

  const handleWeightRangeInputChange = (e) => {
    const { name, value } = e.target;
    setWeightRangeInput((prev) => ({
      ...prev,
      [name]: parseFloat(value) || ''
    }));
  };

  const handleAddWeightRange = () => {
    if (weightRangeInput.minWeight !== '' && weightRangeInput.rate !== '') {
      const newRange = {
        minWeight: weightRangeInput.minWeight,
        maxWeight: weightRangeInput.maxWeight || null,
        rate: weightRangeInput.rate
      };
      setFormData((prev) => ({
        ...prev,
        weightRanges: [...prev.weightRanges, newRange].sort((a, b) => a.minWeight - b.minWeight)
      }));
      setWeightRangeInput({ minWeight: '', maxWeight: '', rate: '' });
    }
  };

  const handleRemoveWeightRange = (index) => {
    setFormData((prev) => ({
      ...prev,
      weightRanges: prev.weightRanges.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Validate based on charge type
      if (formData.chargeType === 'perKg' && !formData.perKgRate) {
        alert('Please enter per kg rate');
        return;
      }
      if (formData.chargeType === 'flat' && !formData.flatRate) {
        alert('Please enter flat rate');
        return;
      }
      if (formData.chargeType === 'weightRange' && formData.weightRanges.length === 0) {
        alert('Please add at least one weight range');
        return;
      }

      if (editingCharge) {
        await shippingChargesAPI.update(editingCharge._id, formData);
      } else {
        await shippingChargesAPI.create(formData);
      }
      setShowModal(false);
      setEditingCharge(null);
      resetForm();
      fetchCharges();
    } catch (error) {
      console.error('Error saving shipping charge:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        formData: formData
      });
      logger.error('Error saving shipping charge', error);
      alert(error.response?.data?.error || 'Failed to save shipping charge');
    }
  };

  const handleEdit = (charge) => {
    setEditingCharge(charge);
    setFormData({
      shipmentVendor: charge.shipmentVendor?._id || charge.shipmentVendor || '',
      name: charge.name || '',
      description: charge.description || '',
      type: charge.type || 'outward',
      chargeType: charge.chargeType || 'perKg',
      perKgRate: charge.perKgRate || '',
      flatRate: charge.flatRate || '',
      minCharge: charge.minCharge || 0,
      weightRanges: charge.weightRanges || [],
      isActive: charge.isActive !== undefined ? charge.isActive : true,
      effectiveDate: charge.effectiveDate ? new Date(charge.effectiveDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to deactivate this shipping charge?')) {
      return;
    }
    try {
      await shippingChargesAPI.delete(id);
      fetchCharges();
    } catch (error) {
      console.error('Error deleting shipping charge:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      logger.error('Error deleting shipping charge', error);
      alert('Failed to delete shipping charge');
    }
  };

  const resetForm = () => {
    setFormData({
      shipmentVendor: '',
      name: '',
      description: '',
      type: 'outward',
      chargeType: 'perKg',
      perKgRate: '',
      flatRate: '',
      minCharge: 0,
      weightRanges: [],
      isActive: true,
      effectiveDate: new Date().toISOString().split('T')[0]
    });
    setWeightRangeInput({ minWeight: '', maxWeight: '', rate: '' });
  };

  const openAddModal = () => {
    setEditingCharge(null);
    resetForm();
    setShowModal(true);
  };

  return (
    <div className="shipping-charges-container">
      <div className="shipping-charges-header">
        <h1>Shipping Charges</h1>
        <button className="btn-primary" onClick={openAddModal}>
          + Add Shipping Charge
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading shipping charges...</div>
      ) : (
        <div className="shipping-charges-table-container">
          <table className="shipping-charges-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Name</th>
                <th>Type</th>
                <th>Charge Type</th>
                <th>Rate</th>
                <th>Min Charge</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {charges.length === 0 ? (
                <tr>
                  <td colSpan="8" className="no-data">
                    No shipping charges found
                  </td>
                </tr>
              ) : (
                charges.map((charge) => (
                  <tr key={charge._id}>
                    <td>{charge.shipmentVendor?.name || '-'}</td>
                    <td>{charge.name}</td>
                    <td>
                      <span className={`type-badge type-${charge.type || 'outward'}`}>
                        {charge.type === 'inward' ? 'Inward' : 'Outward'}
                      </span>
                    </td>
                    <td>
                      <span className="charge-type-badge">{charge.chargeType}</span>
                    </td>
                    <td>
                      {charge.chargeType === 'perKg' && `₹${charge.perKgRate}/kg`}
                      {charge.chargeType === 'flat' && `₹${charge.flatRate}`}
                      {charge.chargeType === 'weightRange' && `${charge.weightRanges?.length || 0} ranges`}
                    </td>
                    <td>₹{charge.minCharge || 0}</td>
                    <td>
                      <span className={`status-badge ${charge.isActive ? 'active' : 'inactive'}`}>
                        {charge.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(charge)}
                      >
                        Edit
                      </button>
                      {charge.isActive && (
                        <button
                          className="btn-delete"
                          onClick={() => handleDelete(charge._id)}
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
            <h2>{editingCharge ? 'Edit Shipping Charge' : 'Add Shipping Charge'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Shipment Vendor *</label>
                  <select
                    name="shipmentVendor"
                    value={formData.shipmentVendor}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Select Vendor</option>
                    {vendors.map((vendor) => (
                      <option key={vendor._id} value={vendor._id}>
                        {vendor.name} ({vendor.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows="2"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Type *</label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="outward">Outward</option>
                    <option value="inward">Inward</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Charge Type *</label>
                  <select
                    name="chargeType"
                    value={formData.chargeType}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="perKg">Per Kilogram</option>
                    <option value="weightRange">Weight Range</option>
                    <option value="flat">Flat Rate</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Minimum Charge (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="minCharge"
                    value={formData.minCharge}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              {formData.chargeType === 'perKg' && (
                <div className="form-group">
                  <label>Rate per Kilogram (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="perKgRate"
                    value={formData.perKgRate}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              )}

              {formData.chargeType === 'flat' && (
                <div className="form-group">
                  <label>Flat Rate (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="flatRate"
                    value={formData.flatRate}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              )}

              {formData.chargeType === 'weightRange' && (
                <div className="form-group">
                  <label>Weight Ranges *</label>
                  <div className="weight-ranges-input">
                    <div className="form-row">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Min Weight (kg)"
                        name="minWeight"
                        value={weightRangeInput.minWeight}
                        onChange={handleWeightRangeInputChange}
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Max Weight (kg, optional)"
                        name="maxWeight"
                        value={weightRangeInput.maxWeight}
                        onChange={handleWeightRangeInputChange}
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Rate (₹)"
                        name="rate"
                        value={weightRangeInput.rate}
                        onChange={handleWeightRangeInputChange}
                      />
                      <button type="button" onClick={handleAddWeightRange}>
                        Add Range
                      </button>
                    </div>
                  </div>
                  {formData.weightRanges.length > 0 && (
                    <div className="weight-ranges-list">
                      {formData.weightRanges.map((range, idx) => (
                        <div key={idx} className="weight-range-item">
                          <span>
                            {range.minWeight}kg - {range.maxWeight !== null ? `${range.maxWeight}kg` : '∞'} : ₹{range.rate}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveWeightRange(idx)}
                            className="remove-range"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
                    <input
                      type="checkbox"
                      name="isActive"
                      checked={formData.isActive}
                      onChange={handleInputChange}
                    />
                    Active
                  </label>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingCharge ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ShippingCharges;

