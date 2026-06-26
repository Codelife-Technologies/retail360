import React, { useState, useEffect } from 'react';
import { shipmentVendorsAPI } from '../services/api';
import logger from '../utils/logger';
import DetailModal from './DetailModal';
import './ShipmentVendors.css';

function ShipmentVendors() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [viewingVendor, setViewingVendor] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    country: 'India',
    pincode: '',
    serviceTypes: [],
    isActive: true,
    notes: ''
  });
  const [serviceTypeInput, setServiceTypeInput] = useState('');

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    try {
      setLoading(true);
      const response = await shipmentVendorsAPI.getAll({ search: searchTerm });
      setVendors(response.data);
    } catch (error) {
      console.error('Error fetching shipment vendors:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      logger.error('Error fetching shipment vendors', error);
      alert('Failed to fetch shipment vendors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchVendors();
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleAddServiceType = () => {
    if (serviceTypeInput.trim() && !formData.serviceTypes.includes(serviceTypeInput.trim())) {
      setFormData((prev) => ({
        ...prev,
        serviceTypes: [...prev.serviceTypes, serviceTypeInput.trim()]
      }));
      setServiceTypeInput('');
    }
  };

  const handleRemoveServiceType = (serviceType) => {
    setFormData((prev) => ({
      ...prev,
      serviceTypes: prev.serviceTypes.filter(st => st !== serviceType)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingVendor) {
        await shipmentVendorsAPI.update(editingVendor._id, formData);
      } else {
        await shipmentVendorsAPI.create(formData);
      }
      setShowModal(false);
      setEditingVendor(null);
      resetForm();
      fetchVendors();
    } catch (error) {
      console.error('Error saving shipment vendor:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        formData: formData
      });
      logger.error('Error saving shipment vendor', error);
      alert(error.response?.data?.error || 'Failed to save shipment vendor');
    }
  };

  const handleEdit = (vendor) => {
    setEditingVendor(vendor);
    setFormData({
      code: vendor.code || '',
      name: vendor.name || '',
      contactPerson: vendor.contactPerson || '',
      email: vendor.email || '',
      phone: vendor.phone || '',
      address: vendor.address || '',
      city: vendor.city || '',
      state: vendor.state || '',
      country: vendor.country || 'India',
      pincode: vendor.pincode || '',
      serviceTypes: vendor.serviceTypes || [],
      isActive: vendor.isActive !== undefined ? vendor.isActive : true,
      notes: vendor.notes || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to deactivate this shipment vendor?')) {
      return;
    }
    try {
      await shipmentVendorsAPI.delete(id);
      fetchVendors();
    } catch (error) {
      console.error('Error deleting shipment vendor:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      logger.error('Error deleting shipment vendor', error);
      alert('Failed to delete shipment vendor');
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      contactPerson: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      country: 'India',
      pincode: '',
      serviceTypes: [],
      isActive: true,
      notes: ''
    });
    setServiceTypeInput('');
  };

  const openAddModal = () => {
    setEditingVendor(null);
    resetForm();
    setShowModal(true);
  };

  return (
    <div className="shipment-vendors-container">
      <div className="shipment-vendors-header">
        <h1>Shipment Vendors</h1>
        <button className="btn-primary" onClick={openAddModal}>
          + Add Shipment Vendor
        </button>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search vendors by name, code, or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Loading shipment vendors...</div>
      ) : (
        <div className="shipment-vendors-table-container">
          <table className="shipment-vendors-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Contact Person</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Service Types</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendors.length === 0 ? (
                <tr>
                  <td colSpan="8" className="no-data">
                    No shipment vendors found
                  </td>
                </tr>
              ) : (
                vendors.map((vendor) => (
                  <tr
                    key={vendor._id}
                    className="clickable-row"
                    onClick={() => setViewingVendor(vendor)}
                  >
                    <td>{vendor.code}</td>
                    <td>{vendor.name}</td>
                    <td>{vendor.contactPerson || '-'}</td>
                    <td>{vendor.email || '-'}</td>
                    <td>{vendor.phone || '-'}</td>
                    <td>
                      {vendor.serviceTypes && vendor.serviceTypes.length > 0
                        ? vendor.serviceTypes.join(', ')
                        : '-'}
                    </td>
                    <td>
                      <span className={`status-badge ${vendor.isActive ? 'active' : 'inactive'}`}>
                        {vendor.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(vendor)}
                      >
                        Edit
                      </button>
                      {vendor.isActive && (
                        <button
                          className="btn-delete"
                          onClick={() => handleDelete(vendor._id)}
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

      {viewingVendor && (
        <DetailModal
          title={viewingVendor.name || 'Shipment Vendor Details'}
          fields={[
            { label: 'Code', value: viewingVendor.code },
            { label: 'Name', value: viewingVendor.name },
            { label: 'Status', value: viewingVendor.isActive ? 'Active' : 'Inactive' },
            { label: 'Contact Person', value: viewingVendor.contactPerson },
            { label: 'Email', value: viewingVendor.email },
            { label: 'Phone', value: viewingVendor.phone },
            { label: 'Address', value: viewingVendor.address, full: true },
            { label: 'City', value: viewingVendor.city },
            { label: 'State', value: viewingVendor.state },
            { label: 'Country', value: viewingVendor.country },
            { label: 'Pincode', value: viewingVendor.pincode },
            { label: 'Service Types', value: (viewingVendor.serviceTypes || []).join(', '), full: true },
            { label: 'Notes', value: viewingVendor.notes, full: true },
          ]}
          onClose={() => setViewingVendor(null)}
          onEdit={() => {
            const vendor = viewingVendor;
            setViewingVendor(null);
            handleEdit(vendor);
          }}
          onDelete={
            viewingVendor.isActive
              ? () => {
                  const id = viewingVendor._id;
                  setViewingVendor(null);
                  handleDelete(id);
                }
              : undefined
          }
        />
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingVendor ? 'Edit Shipment Vendor' : 'Add Shipment Vendor'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Code *</label>
                  <input
                    type="text"
                    name="code"
                    value={formData.code}
                    onChange={handleInputChange}
                    required
                    disabled={!!editingVendor}
                    style={{ textTransform: 'uppercase' }}
                  />
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
              <div className="form-row">
                <div className="form-group">
                  <label>Contact Person</label>
                  <input
                    type="text"
                    name="contactPerson"
                    value={formData.contactPerson}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="form-group">
                  <label>Country</label>
                  <input
                    type="text"
                    name="country"
                    value={formData.country}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Address</label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  rows="2"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>City</label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="form-group">
                  <label>State</label>
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="form-group">
                  <label>Pincode</label>
                  <input
                    type="text"
                    name="pincode"
                    value={formData.pincode}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Service Types</label>
                <div className="service-types-input">
                  <input
                    type="text"
                    placeholder="e.g., express, standard, overnight"
                    value={serviceTypeInput}
                    onChange={(e) => setServiceTypeInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddServiceType();
                      }
                    }}
                  />
                  <button type="button" onClick={handleAddServiceType}>Add</button>
                </div>
                {formData.serviceTypes.length > 0 && (
                  <div className="service-types-list">
                    {formData.serviceTypes.map((st, idx) => (
                      <span key={idx} className="service-type-tag">
                        {st}
                        <button
                          type="button"
                          onClick={() => handleRemoveServiceType(st)}
                          className="remove-tag"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows="3"
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
              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingVendor ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ShipmentVendors;

