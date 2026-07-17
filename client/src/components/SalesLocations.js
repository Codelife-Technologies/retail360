import React, { useState, useEffect } from 'react';
import { salesLocationsAPI, salesChannelsAPI, locationsAPI } from '../services/api';
import DetailModal from './DetailModal';
import ExcelUpload from './ExcelUpload';
import './SalesLocations.css';

const COUNTRY_PRESETS = [
  { country: 'IN', currency: 'INR', label: 'India (IN / INR)' },
  { country: 'US', currency: 'USD', label: 'United States (US / USD)' },
  { country: 'GB', currency: 'GBP', label: 'United Kingdom (GB / GBP)' },
  { country: 'AE', currency: 'AED', label: 'UAE (AE / AED)' },
  { country: 'DE', currency: 'EUR', label: 'Germany (DE / EUR)' },
  { country: 'FR', currency: 'EUR', label: 'France (FR / EUR)' },
  { country: 'CA', currency: 'CAD', label: 'Canada (CA / CAD)' },
  { country: 'AU', currency: 'AUD', label: 'Australia (AU / AUD)' },
  { country: 'JP', currency: 'JPY', label: 'Japan (JP / JPY)' },
  { country: 'SA', currency: 'SAR', label: 'Saudi Arabia (SA / SAR)' },
  { country: 'SG', currency: 'SGD', label: 'Singapore (SG / SGD)' },
];

function channelNames(location) {
  const channels = location?.salesChannels || [];
  if (!channels.length) return '—';
  return channels.map((c) => c?.name || c).filter(Boolean).join(', ') || '—';
}

function channelIdsFromLocation(location) {
  const channels = location?.salesChannels || [];
  if (channels.length) {
    return channels.map((c) => c?._id || c).filter(Boolean);
  }
  // Legacy single-channel response
  if (location?.salesChannel) {
    return [location.salesChannel._id || location.salesChannel];
  }
  return [];
}

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
    salesChannels: [],
    location: '',
    code: '',
    name: '',
    address: '',
    contactPerson: '',
    phone: '',
    email: '',
    country: '',
    currency: '',
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

  const applyFirstChannelCurrency = (channelIds, prev) => {
    if (prev.country) return {};
    const firstId = channelIds[0];
    if (!firstId) return {};
    const channel = salesChannels.find((c) => c._id === firstId);
    if (!channel?.country) return {};
    return {
      country: channel.country,
      currency: channel.defaultCurrency || prev.currency,
    };
  };

  const handleChannelToggle = (channelId) => {
    setFormData((prev) => {
      const selected = new Set(prev.salesChannels || []);
      if (selected.has(channelId)) {
        selected.delete(channelId);
      } else {
        selected.add(channelId);
      }
      const salesChannelsNext = Array.from(selected);
      return {
        ...prev,
        salesChannels: salesChannelsNext,
        ...applyFirstChannelCurrency(salesChannelsNext, prev),
      };
    });
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'country') {
      const code = String(value || '').toUpperCase().slice(0, 2);
      const preset = COUNTRY_PRESETS.find((p) => p.country === code);
      setFormData((prev) => ({
        ...prev,
        country: code,
        currency: preset ? preset.currency : prev.currency,
      }));
      return;
    }
    if (name === 'currency') {
      setFormData((prev) => ({
        ...prev,
        currency: String(value || '').toUpperCase().slice(0, 3),
      }));
      return;
    }
    if (name === 'location') {
      const warehouse = warehouseLocations.find((loc) => loc._id === value);
      const warehouseCountry = String(warehouse?.country || '').trim().toUpperCase();
      let countryCode = '';
      if (warehouseCountry === 'INDIA' || warehouseCountry === 'IN') countryCode = 'IN';
      else if (
        warehouseCountry === 'UAE'
        || warehouseCountry === 'AE'
        || warehouseCountry.includes('EMIRATE')
      ) countryCode = 'AE';
      else if (warehouseCountry.length === 2) countryCode = warehouseCountry;

      const preset = COUNTRY_PRESETS.find((p) => p.country === countryCode);
      setFormData((prev) => ({
        ...prev,
        location: value,
        ...(countryCode
          ? {
            country: countryCode,
            currency: preset ? preset.currency : prev.currency,
          }
          : {}),
      }));
      return;
    }
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleCountryPresetChange = (e) => {
    const preset = COUNTRY_PRESETS.find((item) => item.country === e.target.value);
    if (!preset) return;
    setFormData((prev) => ({
      ...prev,
      country: preset.country,
      currency: preset.currency,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.salesChannels?.length) {
      alert('Select at least one sales channel.');
      return;
    }
    const country = String(formData.country || '').trim().toUpperCase();
    const currency = String(formData.currency || '').trim().toUpperCase();
    if (!country || country.length !== 2) {
      alert('Country is required (2-letter code, e.g. IN, AE).');
      return;
    }
    if (!currency || currency.length !== 3) {
      alert('Currency is required (auto-filled from country).');
      return;
    }
    const payload = {
      ...formData,
      salesChannels: formData.salesChannels,
      country,
      currency,
    };
    try {
      if (editingLocation) {
        await salesLocationsAPI.update(editingLocation._id, payload);
      } else {
        await salesLocationsAPI.create(payload);
      }
      setShowModal(false);
      setEditingLocation(null);
      resetForm();
      fetchSalesLocations();
    } catch (error) {
      console.error('Error saving sales location:', error);
      alert(error.response?.data?.error || 'Failed to save sales location');
    }
  };

  const handleEdit = (location) => {
    setEditingLocation(location);
    const firstChannel = (location.salesChannels || [])[0] || location.salesChannel;
    setFormData({
      salesChannels: channelIdsFromLocation(location),
      location: location.location._id || location.location || '',
      code: location.code || '',
      name: location.name || '',
      address: location.address || '',
      contactPerson: location.contactPerson || '',
      phone: location.phone || '',
      email: location.email || '',
      country: location.country || firstChannel?.country || '',
      currency: location.currency || firstChannel?.defaultCurrency || '',
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
      alert('Failed to delete sales location');
    }
  };

  const resetForm = () => {
    setFormData({
      salesChannels: [],
      location: '',
      code: '',
      name: '',
      address: '',
      contactPerson: '',
      phone: '',
      email: '',
      country: '',
      currency: '',
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
                <th>Sales Channels</th>
                <th>Country</th>
                <th>Currency</th>
                <th>Warehouse Location</th>
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
                    <td>{channelNames(location)}</td>
                    <td>{location.country || location.salesChannels?.[0]?.country || '—'}</td>
                    <td>{location.currency || location.salesChannels?.[0]?.defaultCurrency || '—'}</td>
                    <td>{location.location?.name || '—'}</td>
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
            { label: 'Sales Channels', value: channelNames(viewingLocation) },
            {
              label: 'Country',
              value: viewingLocation.country || viewingLocation.salesChannels?.[0]?.country || '—',
            },
            {
              label: 'Currency',
              value: viewingLocation.currency || viewingLocation.salesChannels?.[0]?.defaultCurrency || '—',
            },
            {
              label: 'Warehouse Location',
              value: viewingLocation.location
                ? `${viewingLocation.location.name || ''} (${viewingLocation.location.code || ''})`
                : '',
            },
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
              <div className="form-group">
                <label>Sales Channels *</label>
                <div className="channel-checkbox-list">
                  {salesChannels.length === 0 ? (
                    <div className="channel-checkbox-empty">No active sales channels</div>
                  ) : (
                    salesChannels.map((channel) => {
                      const checked = (formData.salesChannels || []).includes(channel._id);
                      return (
                        <label key={channel._id} className="channel-checkbox-item">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleChannelToggle(channel._id)}
                          />
                          <span>
                            {channel.name} ({channel.code})
                            {channel.country ? ` · ${channel.country}/${channel.defaultCurrency || ''}` : ''}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
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
              <div className="form-group">
                <label>Country *</label>
                <select
                  value={formData.country || ''}
                  onChange={handleCountryPresetChange}
                  required
                >
                  <option value="">Select country</option>
                  {COUNTRY_PRESETS.map((preset) => (
                    <option key={preset.country} value={preset.country}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Country code *</label>
                  <input
                    type="text"
                    name="country"
                    value={formData.country}
                    onChange={handleInputChange}
                    required
                    maxLength={2}
                    placeholder="IN, AE, US"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
                <div className="form-group">
                  <label>Currency *</label>
                  <input
                    type="text"
                    name="currency"
                    value={formData.currency}
                    onChange={handleInputChange}
                    required
                    maxLength={3}
                    placeholder="Auto from country"
                    style={{ textTransform: 'uppercase' }}
                  />
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
