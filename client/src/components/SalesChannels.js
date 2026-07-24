import React, { useState, useEffect } from 'react';
import { salesChannelsAPI, locationsAPI } from '../services/api';
import DetailModal from './DetailModal';
import ExcelUpload from './ExcelUpload';
import './SalesChannels.css';

const COUNTRY_PRESETS = [
  { country: 'IN', defaultCurrency: 'INR', label: 'India (IN / INR)' },
  { country: 'US', defaultCurrency: 'USD', label: 'United States (US / USD)' },
  { country: 'GB', defaultCurrency: 'GBP', label: 'United Kingdom (GB / GBP)' },
  { country: 'AE', defaultCurrency: 'AED', label: 'UAE (AE / AED)' },
  { country: 'DE', defaultCurrency: 'EUR', label: 'Germany (DE / EUR)' },
  { country: 'FR', defaultCurrency: 'EUR', label: 'France (FR / EUR)' },
  { country: 'CA', defaultCurrency: 'CAD', label: 'Canada (CA / CAD)' },
  { country: 'AU', defaultCurrency: 'AUD', label: 'Australia (AU / AUD)' },
  { country: 'JP', defaultCurrency: 'JPY', label: 'Japan (JP / JPY)' },
  { country: 'SA', defaultCurrency: 'SAR', label: 'Saudi Arabia (SA / SAR)' },
  { country: 'SG', defaultCurrency: 'SGD', label: 'Singapore (SG / SGD)' },
];

const emptyForm = () => ({
  code: '',
  name: '',
  description: '',
  type: 'other',
  commissionRate: 0,
  paymentTerms: '',
  isActive: true,
  country: '',
  defaultCurrency: '',
  warehouses: [],
});

function warehouseIdsFromChannel(channel) {
  return (channel?.warehouses || [])
    .map((w) => w?._id || w)
    .filter(Boolean)
    .map(String);
}

function warehouseNames(channel) {
  const list = channel?.warehouses || [];
  if (!list.length) return '—';
  return list
    .map((w) => (w?.name ? `${w.name}${w.code ? ` (${w.code})` : ''}` : w))
    .filter(Boolean)
    .join(', ') || '—';
}

function SalesChannels() {
  const [salesChannels, setSalesChannels] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);
  const [viewingChannel, setViewingChannel] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    fetchSalesChannels();
    fetchWarehouses();
  }, []);

  const fetchWarehouses = async () => {
    try {
      const response = await locationsAPI.getAll({ isActive: 'true' });
      const list = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setWarehouses(list);
    } catch (error) {
      console.error('Error fetching warehouses:', error);
      setWarehouses([]);
    }
  };

  const fetchSalesChannels = async () => {
    try {
      setLoading(true);
      const params = {};
      if (searchTerm) params.search = searchTerm;
      const response = await salesChannelsAPI.getAll(params);
      setSalesChannels(Array.isArray(response.data) ? response.data : response.data?.data || []);
    } catch (error) {
      console.error('Error fetching sales channels:', error);
      alert('Failed to fetch sales channels');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchSalesChannels();
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    let nextValue = type === 'checkbox' ? checked : value;

    if (name === 'commissionRate') {
      nextValue = parseFloat(value) || 0;
    } else if (name === 'country') {
      nextValue = value.toUpperCase().slice(0, 2);
      const preset = COUNTRY_PRESETS.find((item) => item.country === nextValue);
      setFormData((prev) => ({
        ...prev,
        country: nextValue,
        defaultCurrency: preset ? preset.defaultCurrency : prev.defaultCurrency,
      }));
      return;
    } else if (name === 'defaultCurrency') {
      nextValue = value.toUpperCase().slice(0, 3);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }));
  };

  const handleCountryPresetChange = (e) => {
    const preset = COUNTRY_PRESETS.find((item) => item.country === e.target.value);
    if (!preset) return;
    setFormData((prev) => ({
      ...prev,
      country: preset.country,
      defaultCurrency: preset.defaultCurrency,
    }));
  };

  const handleWarehouseToggle = (warehouseId) => {
    setFormData((prev) => {
      const selected = new Set((prev.warehouses || []).map(String));
      if (selected.has(warehouseId)) selected.delete(warehouseId);
      else selected.add(warehouseId);
      return { ...prev, warehouses: [...selected] };
    });
  };

  const buildPayload = () => {
    const payload = { ...formData };
    payload.country = String(payload.country || '').trim().toUpperCase();
    payload.defaultCurrency = String(payload.defaultCurrency || '').trim().toUpperCase();
    payload.warehouses = (payload.warehouses || []).map(String).filter(Boolean);
    if (!payload.country) {
      delete payload.country;
      delete payload.defaultCurrency;
    }
    return payload;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const country = String(formData.country || '').trim().toUpperCase();
    const defaultCurrency = String(formData.defaultCurrency || '').trim().toUpperCase();
    if (!country || country.length !== 2) {
      alert('Country is required (2-letter code, e.g. IN, US, AE).');
      return;
    }
    if (!defaultCurrency || defaultCurrency.length !== 3) {
      alert('Currency is required (3-letter code, e.g. INR, USD, AED). It is set automatically from country.');
      return;
    }

    const payload = buildPayload();

    try {
      if (editingChannel) {
        await salesChannelsAPI.update(editingChannel._id, payload);
      } else {
        await salesChannelsAPI.create(payload);
      }
      setShowModal(false);
      setEditingChannel(null);
      resetForm();
      fetchSalesChannels();
    } catch (error) {
      console.error('Error saving sales channel:', error);
      alert(error.response?.data?.error || 'Failed to save sales channel');
    }
  };

  const handleEdit = (channel) => {
    setEditingChannel(channel);
    setFormData({
      code: channel.code || '',
      name: channel.name || '',
      description: channel.description || '',
      type: channel.type || 'other',
      commissionRate: channel.commissionRate || 0,
      paymentTerms: channel.paymentTerms || '',
      isActive: channel.isActive !== undefined ? channel.isActive : true,
      country: channel.country || '',
      defaultCurrency: channel.defaultCurrency || '',
      warehouses: warehouseIdsFromChannel(channel),
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to deactivate this sales channel?')) {
      return;
    }
    try {
      await salesChannelsAPI.delete(id);
      fetchSalesChannels();
    } catch (error) {
      console.error('Error deleting sales channel:', error);
      alert('Failed to delete sales channel');
    }
  };

  const resetForm = () => {
    setFormData(emptyForm());
  };

  const openAddModal = () => {
    setEditingChannel(null);
    resetForm();
    setShowModal(true);
  };

  return (
    <div className="sales-channels-container">
      <div className="sales-channels-header">
        <h1>Sales Channels</h1>
        <div className="page-header-actions">
          <button className="btn-secondary" onClick={() => setShowExcelUpload(true)}>
            ⬆ Upload Excel
          </button>
          <button className="btn-primary" onClick={openAddModal}>
            + Add Sales Channel
          </button>
        </div>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search sales channels by name, code, or description..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Loading sales channels...</div>
      ) : (
        <div className="sales-channels-table-container">
          <table className="sales-channels-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Country</th>
                <th>Currency</th>
                <th>Warehouses</th>
                <th>Commission Rate</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {salesChannels.length === 0 ? (
                <tr>
                  <td colSpan="9" className="no-data">
                    No sales channels found
                  </td>
                </tr>
              ) : (
                salesChannels.map((channel) => (
                  <tr
                    key={channel._id}
                    className="clickable-row"
                    onClick={() => setViewingChannel(channel)}
                  >
                    <td>{channel.code}</td>
                    <td>{channel.name}</td>
                    <td>
                      <span className={`type-badge type-${channel.type}`}>
                        {channel.type}
                      </span>
                    </td>
                    <td>{channel.country || '—'}</td>
                    <td>{channel.defaultCurrency || '—'}</td>
                    <td className="sc-warehouses-cell" title={warehouseNames(channel)}>
                      {warehouseNames(channel)}
                    </td>
                    <td>{channel.commissionRate}%</td>
                    <td>
                      <span className={`status-badge ${channel.isActive ? 'active' : 'inactive'}`}>
                        {channel.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(channel)}
                      >
                        Edit
                      </button>
                      {channel.isActive && (
                        <button
                          className="btn-delete"
                          onClick={() => handleDelete(channel._id)}
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
          moduleName="sales-channels"
          templateEndpoint="/sales-channels/template"
          onUploadComplete={() => fetchSalesChannels()}
          onClose={() => setShowExcelUpload(false)}
        />
      )}

      {viewingChannel && (
        <DetailModal
          title={viewingChannel.name || 'Sales Channel Details'}
          fields={[
            { label: 'Code', value: viewingChannel.code },
            { label: 'Name', value: viewingChannel.name },
            { label: 'Type', value: viewingChannel.type },
            { label: 'Country', value: viewingChannel.country || '—' },
            { label: 'Currency', value: viewingChannel.defaultCurrency || '—' },
            { label: 'Warehouses', value: warehouseNames(viewingChannel), full: true },
            { label: 'Commission Rate', value: `${viewingChannel.commissionRate || 0}%` },
            { label: 'Payment Terms', value: viewingChannel.paymentTerms },
            { label: 'Status', value: viewingChannel.isActive ? 'Active' : 'Inactive' },
            { label: 'Description', value: viewingChannel.description, full: true },
          ]}
          onClose={() => setViewingChannel(null)}
          onEdit={() => {
            const channel = viewingChannel;
            setViewingChannel(null);
            handleEdit(channel);
          }}
          onDelete={
            viewingChannel.isActive
              ? () => {
                  const id = viewingChannel._id;
                  setViewingChannel(null);
                  handleDelete(id);
                }
              : undefined
          }
        />
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingChannel ? 'Edit Sales Channel' : 'Add Sales Channel'}</h2>
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
                    disabled={!!editingChannel}
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
                <label>Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows="3"
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
                    <option value="online">Online</option>
                    <option value="retail">Retail</option>
                    <option value="wholesale">Wholesale</option>
                    <option value="marketplace">Marketplace</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Commission Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    name="commissionRate"
                    value={formData.commissionRate}
                    onChange={handleInputChange}
                  />
                </div>
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
                    placeholder="IN, US, AE"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
                <div className="form-group">
                  <label>Currency *</label>
                  <input
                    type="text"
                    name="defaultCurrency"
                    value={formData.defaultCurrency}
                    onChange={handleInputChange}
                    required
                    maxLength={3}
                    placeholder="Auto from country"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Linked Warehouses</label>
                <div className="warehouse-checkbox-list">
                  {warehouses.length === 0 ? (
                    <div className="warehouse-checkbox-empty">
                      No active warehouses found. Add locations under Masters → Locations.
                    </div>
                  ) : (
                    warehouses.map((loc) => {
                      const checked = (formData.warehouses || []).includes(String(loc._id));
                      return (
                        <label key={loc._id} className="warehouse-checkbox-item">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleWarehouseToggle(String(loc._id))}
                          />
                          <span>
                            {loc.name} ({loc.code})
                            {loc.city ? ` · ${loc.city}` : ''}
                            {loc.country ? ` · ${loc.country}` : ''}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="sc-field-hint">
                  Select warehouses that fulfill orders for this sales channel.
                </p>
              </div>
              <div className="form-group">
                <label>Payment Terms</label>
                <input
                  type="text"
                  name="paymentTerms"
                  value={formData.paymentTerms}
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
                  {editingChannel ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SalesChannels;
