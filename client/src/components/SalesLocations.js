import React, { useState, useEffect } from 'react';
import { salesLocationsAPI, salesChannelsAPI, locationsAPI } from '../services/api';
import DetailModal from './DetailModal';
import ExcelUpload from './ExcelUpload';
import './SalesLocations.css';

function SalesLocations() {
  const [salesLocations, setSalesLocations] = useState([]);
  const [salesChannels, setSalesChannels] = useState([]);
  const [warehouseLocations, setWarehouseLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [viewingLocation, setViewingLocation] = useState(null);
  const [formData, setFormData] = useState({
    salesChannel: '',
    location: '',
    code: '',
    name: '',
    address: '',
    contactPerson: '',
    phone: '',
    email: '',
    isActive: true,
  });

  useEffect(() => {
    fetchSalesLocations();
    fetchSalesChannels();
    fetchWarehouseLocations();
  }, []);

  const fetchSalesLocations = async () => {
    try {
      setLoading(true);
      const response = await salesLocationsAPI.getAll({ search: searchTerm, isActive: 'true' });
      setSalesLocations(response.data);
    } catch (error) {
      console.error('Error fetching sales locations:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      alert('Failed to fetch sales locations');
    } finally {
      setLoading(false);
    }
  };

  const fetchSalesChannels = async () => {
    try {
      const response = await salesChannelsAPI.getAll({ isActive: 'true' });
      setSalesChannels(response.data);
    } catch (error) {
      console.error('Error fetching sales channels:', error);
    }
  };

  const fetchWarehouseLocations = async () => {
    try {
      const response = await locationsAPI.getAll({ isActive: 'true' });
      setWarehouseLocations(response.data);
    } catch (error) {
      console.error('Error fetching warehouse locations:', error);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchSalesLocations();
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingLocation) {
        await salesLocationsAPI.update(editingLocation._id, formData);
      } else {
        await salesLocationsAPI.create(formData);
      }
      setShowModal(false);
      setEditingLocation(null);
      resetForm();
      fetchSalesLocations();
    } catch (error) {
      console.error('Error saving sales location:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        formData: formData
      });
      alert(error.response?.data?.error || 'Failed to save sales location');
    }
  };

  const handleEdit = (location) => {
    setEditingLocation(location);
    setFormData({
      salesChannel: location.salesChannel._id || location.salesChannel || '',
      location: location.location._id || location.location || '',
      code: location.code || '',
      name: location.name || '',
      address: location.address || '',
      contactPerson: location.contactPerson || '',
      phone: location.phone || '',
      email: location.email || '',
      isActive: location.isActive !== undefined ? location.isActive : true,
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to deactivate this sales location?')) {
      return;
    }
    try {
      await salesLocationsAPI.delete(id);
      fetchSalesLocations();
    } catch (error) {
      console.error('Error deleting sales location:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        locationId: id
      });
      alert('Failed to delete sales location');
    }
  };

  const resetForm = () => {
    setFormData({
      salesChannel: '',
      location: '',
      code: '',
      name: '',
      address: '',
      contactPerson: '',
      phone: '',
      email: '',
      isActive: true,
    });
  };

  const openAddModal = () => {
    setEditingLocation(null);
    resetForm();
    setShowModal(true);
  };

  return (
    <div className="sales-locations-container">
      <div className="sales-locations-header">
        <h1>Sales Locations</h1>
        <div className="page-header-actions">
          <button className="btn-secondary" onClick={() => setShowExcelUpload(true)}>
            ⬆ Upload Excel
          </button>
          <button className="btn-primary" onClick={openAddModal}>
            + Add Sales Location
          </button>
        </div>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search sales locations by name or code..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Loading sales locations...</div>
      ) : (
        <div className="sales-locations-table-container">
          <table className="sales-locations-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Sales Channel</th>
                <th>Warehouse Location</th>
                <th>Contact Person</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {salesLocations.length === 0 ? (
                <tr>
                  <td colSpan="8" className="no-data">
                    No sales locations found
                  </td>
                </tr>
              ) : (
                salesLocations.map((location) => (
                  <tr
                    key={location._id}
                    className="clickable-row"
                    onClick={() => setViewingLocation(location)}
                  >
                    <td>{location.code}</td>
                    <td>{location.name}</td>
                    <td>{location.salesChannel?.name || '-'}</td>
                    <td>{location.location?.name || '-'} ({location.location?.code || '-'})</td>
                    <td>{location.contactPerson || '-'}</td>
                    <td>{location.phone || '-'}</td>
                    <td>
                      <span className={`status-badge ${location.isActive ? 'active' : 'inactive'}`}>
                        {location.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(location)}
                      >
                        Edit
                      </button>
                      {location.isActive && (
                        <button
                          className="btn-delete"
                          onClick={() => handleDelete(location._id)}
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

      {showExcelUpload && (
        <ExcelUpload
          moduleName="sales-locations"
          templateEndpoint="/sales-locations/template"
          onUploadComplete={() => fetchSalesLocations()}
          onClose={() => setShowExcelUpload(false)}
        />
      )}

      {viewingLocation && (
        <DetailModal
          title={viewingLocation.name || 'Sales Location Details'}
          fields={[
            { label: 'Code', value: viewingLocation.code },
            { label: 'Name', value: viewingLocation.name },
            { label: 'Sales Channel', value: viewingLocation.salesChannel?.name },
            { label: 'Warehouse Location', value: viewingLocation.location ? `${viewingLocation.location.name || ''} (${viewingLocation.location.code || ''})` : '' },
            { label: 'Status', value: viewingLocation.isActive ? 'Active' : 'Inactive' },
            { label: 'Address', value: viewingLocation.address, full: true },
            { label: 'Contact Person', value: viewingLocation.contactPerson },
            { label: 'Phone', value: viewingLocation.phone },
            { label: 'Email', value: viewingLocation.email },
          ]}
          onClose={() => setViewingLocation(null)}
          onEdit={() => {
            const location = viewingLocation;
            setViewingLocation(null);
            handleEdit(location);
          }}
          onDelete={
            viewingLocation.isActive
              ? () => {
                  const id = viewingLocation._id;
                  setViewingLocation(null);
                  handleDelete(id);
                }
              : undefined
          }
        />
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingLocation ? 'Edit Sales Location' : 'Add Sales Location'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Sales Channel *</label>
                  <select
                    name="salesChannel"
                    value={formData.salesChannel}
                    onChange={handleInputChange}
                    required
                    disabled={!!editingLocation}
                  >
                    <option value="">Select Sales Channel</option>
                    {salesChannels.map((channel) => (
                      <option key={channel._id} value={channel._id}>
                        {channel.name} ({channel.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Warehouse Location *</label>
                  <select
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    required
                    disabled={!!editingLocation}
                  >
                    <option value="">Select Warehouse Location</option>
                    {warehouseLocations.map((loc) => (
                      <option key={loc._id} value={loc._id}>
                        {loc.name} ({loc.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Code *</label>
                  <input
                    type="text"
                    name="code"
                    value={formData.code}
                    onChange={handleInputChange}
                    required
                    disabled={!!editingLocation}
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
                  <label>Contact Person</label>
                  <input
                    type="text"
                    name="contactPerson"
                    value={formData.contactPerson}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                  />
                </div>
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
                  {editingLocation ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SalesLocations;

