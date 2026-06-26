import React, { useState, useEffect } from 'react';
import { companyProfileAPI } from '../services/api';
import { validateGSTIN, validatePAN } from '../utils/indianGstValidation';
import {
  profileToCompanyForm,
  companyFormToProfilePayload,
} from '../utils/companyProfileUtils';
import './CompanyProfile.css';

function CompanyProfile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [form, setForm] = useState(() => profileToCompanyForm(null));

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await companyProfileAPI.get();
      setForm(profileToCompanyForm(response.data));
      if (response.data?.updatedAt) {
        setSavedAt(new Date(response.data.updatedAt));
      }
    } catch (error) {
      console.error('Error fetching company profile:', error);
      alert('Failed to load company master');
    } finally {
      setLoading(false);
    }
  };

  const handleNestedChange = (section, field, value) => {
    setForm((prev) => ({
      ...prev,
      [section]: { ...(prev[section] || {}), [field]: value },
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.includes('.')) {
      const [section, field] = name.split('.');
      handleNestedChange(section, field, value);
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const gstin = validateGSTIN(form.buyer?.gstin);
    const pan = validatePAN(form.buyer?.pan);
    if (!gstin.valid) {
      alert(gstin.message);
      return;
    }
    if (!pan.valid) {
      alert(pan.message);
      return;
    }

    try {
      setSaving(true);
      const response = await companyProfileAPI.update(companyFormToProfilePayload(form));
      setSavedAt(response.data?.updatedAt ? new Date(response.data.updatedAt) : new Date());
      alert('Company master saved. New purchase orders will use these details automatically.');
    } catch (error) {
      console.error('Error saving company profile:', error);
      alert(error.response?.data?.error || 'Failed to save company master');
    } finally {
      setSaving(false);
    }
  };

  const buyerGstin = validateGSTIN(form.buyer?.gstin);
  const buyerPan = validatePAN(form.buyer?.pan);

  if (loading) {
    return <div className="company-profile-container"><div className="loading">Loading company master…</div></div>;
  }

  return (
    <div className="company-profile-container">
      <div className="company-profile-header">
        <div>
          <h1>Company Master</h1>
          <p className="company-profile-subtitle">
            Set your organisation details once. They auto-fill on every new purchase order.
          </p>
          {savedAt && (
            <p className="company-profile-saved">Last saved: {savedAt.toLocaleString('en-IN')}</p>
          )}
        </div>
      </div>

      <form className="company-profile-form" onSubmit={handleSubmit}>
        <fieldset className="master-section">
          <legend>Company / Buyer Information</legend>
          <div className="form-row">
            <div className="form-group">
              <label>Company Name *</label>
              <input
                name="buyer.companyName"
                value={form.buyer.companyName}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label>GSTIN</label>
              <input
                name="buyer.gstin"
                value={form.buyer.gstin}
                onChange={handleChange}
                className={!buyerGstin.valid ? 'input-error' : ''}
              />
              {!buyerGstin.valid && <small className="field-error">{buyerGstin.message}</small>}
            </div>
            <div className="form-group">
              <label>PAN</label>
              <input
                name="buyer.pan"
                value={form.buyer.pan}
                onChange={handleChange}
                className={!buyerPan.valid ? 'input-error' : ''}
              />
              {!buyerPan.valid && <small className="field-error">{buyerPan.message}</small>}
            </div>
            <div className="form-group">
              <label>State</label>
              <input name="buyer.state" value={form.buyer.state} onChange={handleChange} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group full-width">
              <label>Registered Address</label>
              <textarea
                name="buyer.registeredAddress"
                value={form.buyer.registeredAddress}
                onChange={handleChange}
                rows="2"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Contact Person</label>
              <input name="buyer.contactPerson" value={form.buyer.contactPerson} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Contact Number</label>
              <input name="buyer.contactNumber" value={form.buyer.contactNumber} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" name="buyer.email" value={form.buyer.email} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Jurisdiction</label>
              <input name="jurisdiction" value={form.jurisdiction} onChange={handleChange} />
            </div>
          </div>
        </fieldset>

        <fieldset className="master-section">
          <legend>Default Billing Address</legend>
          <div className="form-row">
            <div className="form-group">
              <label>Billing Company</label>
              <input
                name="billingAddress.companyName"
                value={form.billingAddress.companyName}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label>Billing GSTIN</label>
              <input name="billingAddress.gstin" value={form.billingAddress.gstin} onChange={handleChange} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group full-width">
              <label>Billing Address</label>
              <textarea
                name="billingAddress.address"
                value={form.billingAddress.address}
                onChange={handleChange}
                rows="2"
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="master-section">
          <legend>Default Shipping Address</legend>
          <div className="form-row">
            <div className="form-group">
              <label>Warehouse / Store Name</label>
              <input
                name="shippingAddress.warehouseName"
                value={form.shippingAddress.warehouseName}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label>Shipping Contact</label>
              <input
                name="shippingAddress.contactPerson"
                value={form.shippingAddress.contactPerson}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label>Shipping Phone</label>
              <input
                name="shippingAddress.contactNumber"
                value={form.shippingAddress.contactNumber}
                onChange={handleChange}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group full-width">
              <label>Shipping Address</label>
              <textarea
                name="shippingAddress.address"
                value={form.shippingAddress.address}
                onChange={handleChange}
                rows="2"
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="master-section">
          <legend>Default PO Payment &amp; Delivery Terms</legend>
          <div className="form-row">
            <div className="form-group">
              <label>Advance %</label>
              <input
                type="number"
                name="advancePercent"
                value={form.advancePercent}
                onChange={handleChange}
                min="0"
                max="100"
              />
            </div>
            <div className="form-group">
              <label>Credit Days</label>
              <input
                type="number"
                name="creditDays"
                value={form.creditDays}
                onChange={handleChange}
                min="0"
              />
            </div>
            <div className="form-group">
              <label>Delivery Mode</label>
              <input name="deliveryMode" value={form.deliveryMode} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Incoterms</label>
              <input name="incoterms" value={form.incoterms} onChange={handleChange} />
            </div>
          </div>
          <div className="form-group">
            <label>Default Terms &amp; Conditions (one per line)</label>
            <textarea name="termsText" value={form.termsText} onChange={handleChange} rows="5" />
          </div>
        </fieldset>

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Company Master'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CompanyProfile;
