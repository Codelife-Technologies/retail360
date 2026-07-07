import React, { useState, useEffect } from 'react';
import { salesChannelsAPI } from '../services/api';
import DetailModal from './DetailModal';
import ExcelUpload from './ExcelUpload';
import './SalesChannels.css';

const MARKETPLACE_PRESETS = [
  { country: 'IN', defaultCurrency: 'INR', label: 'India (IN / INR)' },
  { country: 'US', defaultCurrency: 'USD', label: 'United States (US / USD)' },
  { country: 'GB', defaultCurrency: 'GBP', label: 'United Kingdom (GB / GBP)' },
  { country: 'AE', defaultCurrency: 'AED', label: 'UAE (AE / AED)' },
  { country: 'DE', defaultCurrency: 'EUR', label: 'Germany (DE / EUR)' },
  { country: 'FR', defaultCurrency: 'EUR', label: 'France (FR / EUR)' },
  { country: 'CA', defaultCurrency: 'CAD', label: 'Canada (CA / CAD)' },
  { country: 'AU', defaultCurrency: 'AUD', label: 'Australia (AU / AUD)' },
  { country: 'JP', defaultCurrency: 'JPY', label: 'Japan (JP / JPY)' },
];

function SalesChannels() {
  const [salesChannels, setSalesChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);
  const [viewingChannel, setViewingChannel] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    type: 'other',
    commissionRate: 0,
    paymentTerms: '',
    isActive: true,
    country: '',
    defaultCurrency: '',
  });

  useEffect(() => {
    fetchSalesChannels();
  }, []);

  const fetchSalesChannels = async () => {
    try {
      setLoading(true);
      const response = await salesChannelsAPI.getAll({ search: searchTerm, isActive: 'true' });
      setSalesChannels(response.data);
    } catch (error) {
      console.error('Error fetching sales channels:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
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
    } else if (name === 'defaultCurrency') {
      nextValue = value.toUpperCase().slice(0, 3);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }));
  };

  const handleMarketplacePresetChange = (e) => {
    const preset = MARKETPLACE_PRESETS.find((item) => item.country === e.target.value);
    if (!preset) return;
    setFormData((prev) => ({
      ...prev,
      country: preset.country,
      defaultCurrency: preset.defaultCurrency,
    }));
  };

  const buildPayload = () => {
    const payload = { ...formData };
    if (payload.type === 'marketplace') {
      payload.country = String(payload.country || '').trim().toUpperCase();
      payload.defaultCurrency = String(payload.defaultCurrency || '').trim().toUpperCase();
    } else {
      delete payload.country;
      delete payload.defaultCurrency;
    }
    return payload;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.type === 'marketplace') {
      const country = String(formData.country || '').trim().toUpperCase();
      const defaultCurrency = String(formData.defaultCurrency || '').trim().toUpperCase();
      if (country.length !== 2) {
        alert('Country is required for marketplace channels (2-letter code, e.g. IN, US, AE).');
        return;
      }
      if (defaultCurrency.length !== 3) {
        alert('Default currency is required for marketplace channels (3-letter code, e.g. INR, USD, AED).');
        return;
      }
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
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        formData: formData
      });
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
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        channelId: id
      });
      alert('Failed to delete sales channel');
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      type: 'other',
      commissionRate: 0,
      paymentTerms: '',
      isActive: true,
      country: '',
      defaultCurrency: '',
    });
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
        <div style={{ display: 'flex', gap: '0.5rem' }}>
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
                <th>Commission Rate</th>
                <th>Payment Terms</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {salesChannels.length === 0 ? (
                <tr>
                  <td colSpan="7" className="no-data">
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
                      <span className="type-badge type-{channel.type}">
                        {channel.type}
                      </span>
                    </td>
                    <td>{channel.commissionRate}%</td>
                    <td>{channel.paymentTerms || '-'}</td>
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
            { label: 'Commission Rate', value: `${viewingChannel.commissionRate || 0}%` },
            { label: 'Payment Terms', value: viewingChannel.paymentTerms },
            ...(viewingChannel.type === 'marketplace'
              ? [
                  { label: 'Country', value: viewingChannel.country },
                  { label: 'Default Currency', value: viewingChannel.defaultCurrency },
                ]
              : []),
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
              {formData.type === 'marketplace' && (
                <>
                  <div className="form-group">
                    <label>Marketplace preset</label>
                    <select
                      value={formData.country || ''}
                      onChange={handleMarketplacePresetChange}
                    >
                      <option value="">Select a common marketplace</option>
                      {MARKETPLACE_PRESETS.map((preset) => (
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
                      <label>Default currency *</label>
                      <input
                        type="text"
                        name="defaultCurrency"
                        value={formData.defaultCurrency}
                        onChange={handleInputChange}
                        required
                        maxLength={3}
                        placeholder="INR, USD, AED"
                        style={{ textTransform: 'uppercase' }}
                      />
                    </div>
                  </div>
                </>
              )}
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

