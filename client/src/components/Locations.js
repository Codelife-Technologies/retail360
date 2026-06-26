import React, { useState, useEffect } from 'react';
import { locationsAPI } from '../services/api';
import DetailModal from './DetailModal';
import ExcelUpload from './ExcelUpload';
import './Locations.css';

function Locations() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [viewingLocation, setViewingLocation] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    address: '',
    city: '',
    state: '',
    country: 'India',
    pincode: '',
    contactPerson: '',
    phone: '',
    email: '',
    isActive: true,
  });

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      setLoading(true);
      const response = await locationsAPI.getAll({ search: searchTerm });
      setLocations(response.data);
    } catch (error) {
      console.error('Error fetching locations:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      alert('Failed to fetch locations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchLocations();
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
        await locationsAPI.update(editingLocation._id, formData);
      } else {
        await locationsAPI.create(formData);
      }
      setShowModal(false);
      setEditingLocation(null);
      resetForm();
      fetchLocations();
    } catch (error) {
      console.error('Error saving location:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        formData: formData
      });
      alert(error.response?.data?.error || 'Failed to save location');
    }
  };

  const handleEdit = (location) => {
    setEditingLocation(location);
    setFormData({
      code: location.code || '',
      name: location.name || '',
      address: location.address || '',
      city: location.city || '',
      state: location.state || '',
      country: location.country || 'India',
      pincode: location.pincode || '',
      contactPerson: location.contactPerson || '',
      phone: location.phone || '',
      email: location.email || '',
      isActive: location.isActive !== undefined ? location.isActive : true,
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this location?')) {
      return;
    }
    try {
      await locationsAPI.delete(id);
      fetchLocations();
    } catch (error) {
      console.error('Error deleting location:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        locationId: id
      });
      alert('Failed to delete location');
    }
  };

  const handleSetHomeBranch = async (location) => {
    if (location.isHomeBranch) return;
    try {
      await locationsAPI.setHomeBranch(location._id);
      fetchLocations();
    } catch (error) {
      console.error('Error setting home branch:', error);
      alert(error.response?.data?.error || 'Failed to set home branch');
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      address: '',
      city: '',
      state: '',
      country: 'India',
      pincode: '',
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
    <div className="locations-container">
      <div className="locations-header">
        <h1>Warehouses / Locations</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-secondary" onClick={() => setShowExcelUpload(true)}>
            ⬆ Upload Excel
          </button>
          <button className="btn-primary" onClick={openAddModal}>
            + Add Location
          </button>
        </div>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search locations by name, code, or city..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Loading locations...</div>
      ) : (
        <div className="locations-table-container">
          <table className="locations-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>City</th>
                <th>State</th>
                <th>Contact Person</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Branch</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {locations.length === 0 ? (
                <tr>
                  <td colSpan="9" className="no-data">
                    No locations found
                  </td>
                </tr>
              ) : (
                locations.map((location) => (
                  <tr
                    key={location._id}
                    className={`clickable-row${!location.isActive ? ' inactive' : ''}`}
                    onClick={() => setViewingLocation(location)}
                  >
                    <td>{location.code}</td>
                    <td>{location.name}</td>
                    <td>{location.city || '-'}</td>
                    <td>{location.state || '-'}</td>
                    <td>{location.contactPerson || '-'}</td>
                    <td>{location.phone || '-'}</td>
                    <td>
                      <span className={`status-badge ${location.isActive ? 'active' : 'inactive'}`}>
                        {location.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      {location.isHomeBranch ? (
                        <span className="home-branch-badge">Home Branch</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {!location.isHomeBranch && (
                        <button
                          className="btn-secondary-sm"
                          onClick={() => handleSetHomeBranch(location)}
                          title="Set as home branch"
                        >
                          Set Home
                        </button>
                      )}
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(location)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(location._id)}
                      >
                        Delete
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
          moduleName="locations"
          templateEndpoint="/locations/template"
          onUploadComplete={() => fetchLocations()}
          onClose={() => setShowExcelUpload(false)}
        />
      )}

      {viewingLocation && (
        <DetailModal
          title={viewingLocation.name || 'Location Details'}
          fields={[
            { label: 'Code', value: viewingLocation.code },
            { label: 'Name', value: viewingLocation.name },
            { label: 'Status', value: viewingLocation.isActive ? 'Active' : 'Inactive' },
            {
              label: 'Branch',
              value: viewingLocation.isHomeBranch ? 'Home Branch' : '—',
            },
            { label: 'Address', value: viewingLocation.address, full: true },
            { label: 'City', value: viewingLocation.city },
            { label: 'State', value: viewingLocation.state },
            { label: 'Country', value: viewingLocation.country },
            { label: 'Pincode', value: viewingLocation.pincode },
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
          onDelete={() => {
            const id = viewingLocation._id;
            setViewingLocation(null);
            handleDelete(id);
          }}
        />
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingLocation ? 'Edit Location' : 'Add Location'}</h2>
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
                  <label>Country</label>
                  <input
                    type="text"
                    name="country"
                    value={formData.country}
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
                    type="tel"
                    name="phone"
                    value={formData.phone}
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

export default Locations;

